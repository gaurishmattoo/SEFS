"""
SEFS Watcher — Monitors SEFS_ROOT for file changes using watchdog.
Debounces rapid events and ignores system-triggered moves.
"""

import time
import threading
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent


SUPPORTED_EXTENSIONS = {".txt", ".pdf"}
DEBOUNCE_SECONDS = 1.5


class SEFSHandler(FileSystemEventHandler):
    """Handles filesystem events and triggers re-clustering."""

    def __init__(self, root_dir: str, lock_set: set, on_change_callback):
        super().__init__()
        self.root = Path(root_dir)
        self.lock = lock_set
        self.on_change = on_change_callback
        self._timer: threading.Timer | None = None
        self._timer_lock = threading.Lock()

    def _is_relevant(self, path: str) -> bool:
        """Check if the file event is relevant (supported type, not locked)."""
        p = Path(path)
        if p.suffix.lower() not in SUPPORTED_EXTENSIONS:
            return False
        if str(p) in self.lock:
            return False
        # Ignore hidden files
        if p.name.startswith("."):
            return False
        return True

    def _schedule(self):
        """Debounced trigger — waits for activity to settle."""
        with self._timer_lock:
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(DEBOUNCE_SECONDS, self._fire)
            self._timer.start()

    def _fire(self):
        """Actually invoke the callback."""
        print("[watcher] Change detected — triggering re-analysis...")
        try:
            self.on_change()
        except Exception as e:
            print(f"[watcher] Error in callback: {e}")

    # --- Event handlers ---

    def on_created(self, event: FileSystemEvent):
        if not event.is_directory and self._is_relevant(event.src_path):
            print(f"[watcher] File created: {Path(event.src_path).name}")
            self._schedule()

    def on_modified(self, event: FileSystemEvent):
        if not event.is_directory and self._is_relevant(event.src_path):
            print(f"[watcher] File modified: {Path(event.src_path).name}")
            self._schedule()

    def on_deleted(self, event: FileSystemEvent):
        if not event.is_directory:
            p = Path(event.src_path)
            if p.suffix.lower() in SUPPORTED_EXTENSIONS:
                print(f"[watcher] File deleted: {p.name}")
                self._schedule()

    def on_moved(self, event: FileSystemEvent):
        if not event.is_directory:
            src = Path(event.src_path)
            if str(src) in self.lock:
                return
            if src.suffix.lower() in SUPPORTED_EXTENSIONS:
                print(f"[watcher] File moved: {src.name}")
                self._schedule()


def start_watcher(root_dir: str, lock_set: set, on_change_callback) -> Observer:
    """Start the watchdog observer and return it."""
    handler = SEFSHandler(root_dir, lock_set, on_change_callback)
    observer = Observer()
    observer.schedule(handler, root_dir, recursive=True)
    observer.start()
    print(f"[watcher] Monitoring: {root_dir}")
    return observer
