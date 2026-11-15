"""Content fingerprints for the generation DAG. Never use mtimes as cache versions."""
from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SCHEMA = 1
JS_IMPORTS = re.compile(
    r"(?:\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?|\bimport\s*\(\s*)['\"](\.[^'\"]+)['\"]"
)
COMMON = ["generation_pipeline.js", "generation_cache.js", "generation_worker_bootstrap.js",
          "generation_cache_manifest.py", "generation_parallel.js", "generation_parallel_worker.js"]


def dependencies(path: Path, root: Path) -> list[Path]:
    if path.suffix not in (".js", ".mjs", ".py"):
        return []
    source = path.read_text(encoding="utf-8")
    if path.suffix in (".js", ".mjs"):
        result = [(path.parent / name.split("?", 1)[0]).resolve() for name in JS_IMPORTS.findall(source)]
    elif path.suffix == ".py":
        result = []
        for node in ast.walk(ast.parse(source)):
            modules = [node.module] if isinstance(node, ast.ImportFrom) else (
                [name.name for name in node.names] if isinstance(node, ast.Import) else [])
            for module in modules:
                if module:
                    candidate = root.joinpath(*module.split(".")).with_suffix(".py")
                    if candidate.is_file():
                        result.append(candidate.resolve())
    else:
        result = []
    for item in result:
        if not item.is_relative_to(root):
            raise ValueError(f"Generation dependency outside project: {item}")
        if not item.is_file():
            raise FileNotFoundError(item)
    return result


def source_files(entries: list[str], root: Path = ROOT) -> list[Path]:
    root = root.resolve()
    pending = [root / name for name in entries]
    found: set[Path] = set()
    while pending:
        path = pending.pop().resolve()
        if path in found:
            continue
        if not path.is_relative_to(root):
            raise ValueError(path)
        found.add(path)
        pending.extend(dependencies(path, root))
    return sorted(found)


def fingerprint(entries: list[str], root: Path = ROOT, *, transitive: bool = True) -> str:
    digest = hashlib.sha256()
    paths = source_files(entries, root) if transitive else sorted(root / name for name in entries)
    for path in paths:
        digest.update(str(path.relative_to(root)).encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def model_revision(root: Path = ROOT) -> str:
    return fingerprint(["generation_demo_chunks_templates.py", "generation_model_cache.py"], root)


def generation_manifest(mode: str, root: Path = ROOT) -> dict:
    if mode not in ("noise", "chunks"):
        raise ValueError("Unknown generation mode")
    layout = ["generation_noise_placement.js", "generation_noise_prototype.js"] if mode == "noise" else [
        "generation_demo_chunks_generator.js", "generation_demo_chunks_snakes.js",
        "generation_demo_chunks_building_long.js", "generation_demo_chunks_wide.js"]
    specs = [
        ("layout", [], layout, ["seed"]),
        ("structures", ["layout"], ["generation_demo_chunks_building_long.js", "generation_demo_chunks_wide.js"], []),
        ("pipes", ["layout", "structures"], ["generation_demo_chunks_pipe.js"], []),
        ("population", ["layout", "structures", "pipes"], ["generation_demo_chunks_population.js"], ["density", "count"]),
        ("final", ["population"], ["generation_demo_chunks_houses.js", "generation_noise_walls.js"], []),
    ]
    common = fingerprint(COMMON, root, transitive=False)
    python = model_revision(root)
    image = fingerprint(["noisemap_10000_redone_16.png"], root) if mode == "noise" else None
    stages = []
    for name, parents, entries, parameters in specs:
        version = [common, fingerprint(entries, root)]
        if name in ("structures", "population"):
            version.append(python)
        if name == "layout" and image:
            version.append(image)
        stages.append(dict(id=name, parents=parents, parameters=parameters,
                           revision=hashlib.sha256(json.dumps(version).encode()).hexdigest()))
    result = dict(schema=SCHEMA, mode=mode, stages=stages, models=python, image=image)
    result["version"] = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
    return result
