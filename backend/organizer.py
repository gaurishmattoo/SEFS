"""
SEFS Organizer — Moves files into semantic cluster folders on disk.
"""

import os
import shutil
from pathlib import Path


class Organizer:
    """Manages OS-level folder structure based on cluster assignments."""

    def __init__(self, root_dir: str, lock_set: set):
        self.root = Path(root_dir)
        self.lock = lock_set  # shared set — watcher ignores paths in here

    def reorganize(self, cluster_result: dict) -> None:
        """
        Move files into cluster-named subfolders.
        cluster_result comes from analyzer.compute_clusters().
        """
        clusters = cluster_result.get("clusters", {})
        unclustered = cluster_result.get("unclustered", [])

        # Track which folders should exist
        desired_folders = set()

        for label, filepaths in clusters.items():
            folder = self.root / label
            desired_folders.add(folder)
            folder.mkdir(exist_ok=True)

            for fp in filepaths:
                src = Path(fp)
                if not src.exists():
                    continue
                dst = folder / src.name

                # Skip if already in correct folder
                if src.parent == folder:
                    continue

                # Avoid name collision
                if dst.exists():
                    stem = dst.stem
                    suffix = dst.suffix
                    counter = 1
                    while dst.exists():
                        dst = folder / f"{stem}_{counter}{suffix}"
                        counter += 1

                # Lock paths so watcher ignores these moves
                self.lock.add(str(src))
                self.lock.add(str(dst))
                try:
                    shutil.move(str(src), str(dst))
                    print(f"[organizer] Moved {src.name} → {label}/")
                except Exception as e:
                    print(f"[organizer] Error moving {src}: {e}")
                finally:
                    # Remove from lock after short delay (handled by caller)
                    pass

        # Handle unclustered files — move back to root if in a subfolder
        for fp in unclustered:
            src = Path(fp)
            if not src.exists():
                continue
            if src.parent != self.root:
                dst = self.root / src.name
                if dst.exists() and dst != src:
                    continue
                self.lock.add(str(src))
                self.lock.add(str(dst))
                try:
                    shutil.move(str(src), str(dst))
                except Exception:
                    pass

        # Clean up empty folders
        self._cleanup_empty(desired_folders)

    def _cleanup_empty(self, desired: set) -> None:
        """Remove subfolders that are empty and no longer needed."""
        for item in self.root.iterdir():
            if item.is_dir() and not any(item.iterdir()):
                try:
                    item.rmdir()
                    print(f"[organizer] Removed empty folder: {item.name}")
                except Exception:
                    pass

    def clear_locks(self):
        """Call after a short delay to re-enable watcher events."""
        self.lock.clear()
