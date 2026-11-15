"""Bounded disk cache; misses run current Python sources in isolated fresh interpreters."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading

from generation_cache_manifest import ROOT, model_revision

CACHE_ROOT = ROOT / ".cache" / "generation-models"
MAX_FILES = 40
MAX_BYTES = 512 * 1024 * 1024
_build_slots = threading.BoundedSemaphore(3)
_locks_guard = threading.Lock()
_locks: dict[str, threading.Lock] = {}


class SourcesChanged(RuntimeError):
    pass


def model_file(kind: str, seed: int, length: int | None = None, *, expected: str | None = None,
               force: bool = False, root: Path = ROOT, cache_root: Path = CACHE_ROOT) -> Path:
    if kind not in ("walls", "building"):
        raise ValueError(kind)
    revision = model_revision(root)
    if expected is not None and revision != expected:
        raise SourcesChanged("Python structure sources changed")
    key = f"{kind}-{seed}-{length or 0}-{revision}"
    with _locks_guard:
        lock = _locks.setdefault(key, threading.Lock())
    with lock:
        cache_root.mkdir(parents=True, exist_ok=True)
        target = cache_root / f"{key}.json"
        if target.is_file() and not force:
            target.touch()
            return target
        expression = f"wall_templates({seed})" if kind == "walls" else f"building_long_template({seed},{length})"
        script = ("import json; from generation_demo_chunks_templates import wall_templates, building_long_template; "
                  f"print(json.dumps({expression},separators=(',',':')))")
        # A fresh pycache prefix also prevents stale same-size/same-second .pyc files.
        with _build_slots, tempfile.TemporaryDirectory(prefix="msmp-model-") as pycache:
            body = subprocess.check_output([sys.executable, "-c", script], cwd=root,
                                           env={**os.environ, "PYTHONPYCACHEPREFIX": pycache})
        if model_revision(root) != revision:
            raise SourcesChanged("Python structure sources changed during generation")
        with tempfile.NamedTemporaryFile(dir=cache_root, prefix=".pending-", delete=False) as output:
            pending = Path(output.name)
            try:
                output.write(body)
                output.flush()
                os.replace(pending, target)
            finally:
                pending.unlink(missing_ok=True)
        prune_models(cache_root, keep=target)
        return target


def prune_models(cache_root: Path, *, keep: Path) -> None:
    files = []
    for path in cache_root.glob("*.json"):
        try:
            files.append((path.stat().st_mtime, path))
        except FileNotFoundError:
            pass
    files.sort(reverse=True)
    total = 0
    for index, (_, path) in enumerate(files):
        try:
            total += path.stat().st_size
            if path != keep and (index >= MAX_FILES or total > MAX_BYTES):
                path.unlink(missing_ok=True)
        except FileNotFoundError:
            pass
