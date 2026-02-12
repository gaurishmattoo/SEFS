"""
SEFS Server — FastAPI app with REST endpoints and WebSocket for real-time updates.
"""

import os
import json
import asyncio
import threading
import time
from pathlib import Path
from typing import Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from analyzer import extract_text, compute_clusters
from organizer import Organizer
from watcher import start_watcher


# ---------------------------------------------------------------------------
# Global State
# ---------------------------------------------------------------------------

ROOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "SEFS_ROOT")
ROOT_DIR = os.path.normpath(ROOT_DIR)

# Ensure root exists
os.makedirs(ROOT_DIR, exist_ok=True)

# Shared lock set — paths being moved by organizer
_lock_set: set[str] = set()

# Current cluster state
_current_state: dict[str, Any] = {
    "clusters": {},
    "files": [],
    "unclustered": [],
}
_state_lock = threading.Lock()

# Connected WebSocket clients
_ws_clients: list[WebSocket] = []
_ws_lock = asyncio.Lock()

# Event loop reference for cross-thread signaling
_loop: asyncio.AbstractEventLoop | None = None


# ---------------------------------------------------------------------------
# Core Logic
# ---------------------------------------------------------------------------

def _scan_files() -> dict[str, str]:
    """Walk SEFS_ROOT and extract text from all supported files."""
    file_map = {}
    root = Path(ROOT_DIR)
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".txt", ".pdf"}:
            text = extract_text(str(path))
            file_map[str(path)] = text
    return file_map


def _build_state(cluster_result: dict) -> dict:
    """Build the state object to send to frontend."""
    clusters_out = {}
    all_files = []

    for label, filepaths in cluster_result.get("clusters", {}).items():
        file_infos = []
        for fp in filepaths:
            p = Path(fp)
            info = {
                "name": p.name,
                "path": str(p),
                "folder": label,
                "size": p.stat().st_size if p.exists() else 0,
                "ext": p.suffix.lower(),
            }
            file_infos.append(info)
            all_files.append(info)
        clusters_out[label] = file_infos

    unclustered = []
    for fp in cluster_result.get("unclustered", []):
        p = Path(fp)
        info = {
            "name": p.name,
            "path": str(p),
            "folder": None,
            "size": p.stat().st_size if p.exists() else 0,
            "ext": p.suffix.lower(),
        }
        unclustered.append(info)
        all_files.append(info)

    return {
        "clusters": clusters_out,
        "files": all_files,
        "unclustered": unclustered,
        "root": ROOT_DIR,
    }


def do_recluster():
    """Full re-scan → cluster → organize → broadcast pipeline."""
    print("[server] Running re-cluster pipeline...")

    file_map = _scan_files()

    if not file_map:
        with _state_lock:
            global _current_state
            _current_state = {"clusters": {}, "files": [], "unclustered": [], "root": ROOT_DIR}
        _schedule_broadcast()
        return

    result = compute_clusters(file_map)

    # Organize on disk
    org = Organizer(ROOT_DIR, _lock_set)
    org.reorganize(result)

    # Re-scan after organizing to get correct paths
    time.sleep(0.3)
    file_map2 = _scan_files()
    result2 = compute_clusters(file_map2) if file_map2 else result

    state = _build_state(result2)
    with _state_lock:
        _current_state = state

    # Clear locks after a moment
    threading.Timer(1.0, org.clear_locks).start()

    _schedule_broadcast()
    print(f"[server] Re-cluster done: {len(state.get('files', []))} files in {len(state.get('clusters', {}))} clusters")


def _schedule_broadcast():
    """Schedule a WebSocket broadcast on the async event loop."""
    global _loop
    if _loop is not None:
        asyncio.run_coroutine_threadsafe(_broadcast_state(), _loop)


async def _broadcast_state():
    """Send current state to all connected WebSocket clients."""
    with _state_lock:
        data = json.dumps(_current_state)
    async with _ws_lock:
        disconnected = []
        for ws in _ws_clients:
            try:
                await ws.send_text(data)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            _ws_clients.remove(ws)


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_event_loop()

    # Start watcher
    observer = start_watcher(ROOT_DIR, _lock_set, do_recluster)

    # Initial scan
    threading.Thread(target=do_recluster, daemon=True).start()

    yield

    observer.stop()
    observer.join()


app = FastAPI(title="SEFS API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- REST ---

@app.get("/api/state")
def get_state():
    with _state_lock:
        return _current_state


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    dest = Path(ROOT_DIR) / file.filename
    # Avoid overwriting
    if dest.exists():
        stem = dest.stem
        suffix = dest.suffix
        counter = 1
        while dest.exists():
            dest = Path(ROOT_DIR) / f"{stem}_{counter}{suffix}"
            counter += 1

    contents = await file.read()
    with open(dest, "wb") as f:
        f.write(contents)
    print(f"[server] Uploaded: {dest.name}")
    return {"status": "ok", "filename": dest.name}


@app.get("/api/open/{filename:path}")
def open_file(filename: str):
    """Return file for download/viewing."""
    root = Path(ROOT_DIR)
    # Search recursively
    for p in root.rglob(filename):
        if p.is_file():
            return FileResponse(p, filename=p.name)
    return {"error": "File not found"}


# --- WebSocket ---

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    async with _ws_lock:
        _ws_clients.append(ws)
    print(f"[ws] Client connected ({len(_ws_clients)} total)")

    # Send current state immediately
    with _state_lock:
        await ws.send_text(json.dumps(_current_state))

    try:
        while True:
            # Keep connection alive; client can send "ping"
            data = await ws.receive_text()
            if data == "recluster":
                threading.Thread(target=do_recluster, daemon=True).start()
    except WebSocketDisconnect:
        async with _ws_lock:
            if ws in _ws_clients:
                _ws_clients.remove(ws)
        print(f"[ws] Client disconnected ({len(_ws_clients)} total)")
