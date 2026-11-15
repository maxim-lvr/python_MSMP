from __future__ import annotations

import json
from pathlib import Path
import shutil
import tempfile
import unittest

from generation_cache_manifest import ROOT, generation_manifest
from generation_model_cache import model_file, SourcesChanged


def stage_keys(manifest: dict, **settings) -> dict:
    import hashlib
    result = {}
    for stage in manifest["stages"]:
        payload = [manifest["mode"], stage["revision"], [result[p] for p in stage["parents"]],
                   [(name, settings.get(name)) for name in stage["parameters"]]]
        result[stage["id"]] = hashlib.sha256(json.dumps(payload).encode()).hexdigest()
    return result


class CascadeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="msmp-manifest-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for pattern in ("*.py", "*.js", "*.mjs", "*.png"):
            for path in ROOT.glob(pattern):
                shutil.copyfile(path, self.root / path.name)
        self.before = self.keys()

    def keys(self, **settings):
        return stage_keys(generation_manifest("noise", self.root), **{"seed": 42, "density": 6, **settings})

    def changed(self, filename, expected):
        path = self.root / filename
        path.write_bytes(path.read_bytes() + (b"\n# changed\n" if path.suffix == ".py" else b"\n// changed\n"))
        after = self.keys()
        self.assertEqual({stage for stage in self.before if self.before[stage] != after[stage]}, set(expected))

    def test_exit_rule_only_invalidates_finishing(self):
        self.changed("generation_demo_chunks_pipe_accesses.js", ["final"])

    def test_skin_rule_cascades_to_population_and_finishing(self):
        self.changed("generation_demo_chunks_skin.js", ["population", "final"])

    def test_worker_dispatch_changes_invalidate_all_stages(self):
        self.changed("generation_parallel_worker.js", self.before.keys())

    def test_room_rule_invalidates_population_and_finishing(self):
        self.changed("generation_demo_chunks_growth.js", ["population", "final"])

    def test_room_dimensions_keep_upstream_networks(self):
        self.changed("generation_dense_rules.js", ["population", "final"])

    def test_python_structure_cascades_to_networks_and_rooms(self):
        self.changed("map_builder_building_long.py", ["structures", "pipes", "population", "final"])

    def test_world_rule_cascades_everywhere(self):
        self.changed("world_config.js", self.before.keys())

    def test_render_changes_keep_geometry(self):
        self.changed("generation_demo_chunks_viewer.js", [])

    def test_border_rule_does_not_invalidate_placement(self):
        self.changed("generation_noise_walls.js", ["final"])

    def test_density_keeps_placement_structures_and_pipes(self):
        after = self.keys(density=7)
        self.assertEqual({s for s in after if after[s] != self.before[s]}, {"population", "final"})

    def test_seed_invalidates_all_stages(self):
        after = self.keys(seed=43)
        self.assertTrue(all(after[s] != self.before[s] for s in after))

    def test_new_import_is_followed_automatically(self):
        path = self.root / "new_exit_rule.js"
        path.write_text("export const width=1;\n")
        access = self.root / "generation_demo_chunks_pipe_accesses.js"
        access.write_text(access.read_text() + "\nimport './new_exit_rule.js';\n")
        self.before = self.keys()
        self.changed(path.name, ["final"])


class ModelCacheTests(unittest.TestCase):
    def test_disk_cache_and_live_same_second_source_change(self):
        with tempfile.TemporaryDirectory(prefix="msmp-model-test-") as directory:
            root = Path(directory)
            (root / "generation_model_cache.py").write_text("# model cache\n")
            (root / "generation_demo_chunks_templates.py").write_text(
                "from rules import VALUE\n"
                "def wall_templates(seed): return {'seed':seed,'rule':VALUE}\n"
                "def building_long_template(seed,length): return {'seed':seed,'length':length,'rule':VALUE}\n")
            rules = root / "rules.py"
            rules.write_text("VALUE=1\n")
            directory = root / "cache"
            first = model_file("walls", 42, root=root, cache_root=directory)
            self.assertEqual(json.loads(first.read_text())["rule"], 1)
            again = model_file("walls", 42, root=root, cache_root=directory)
            self.assertEqual(first, again)
            old_revision = first.stem.rsplit("-", 1)[-1]
            rules.write_text("VALUE=2\n")  # Same length, no sleep/mtime dependency.
            with self.assertRaises(SourcesChanged):
                model_file("walls", 42, expected=old_revision, root=root, cache_root=directory)
            updated = model_file("walls", 42, root=root, cache_root=directory)
            self.assertNotEqual(first, updated)
            self.assertEqual(json.loads(updated.read_text())["rule"], 2)
            forced = model_file("walls", 42, force=True, root=root, cache_root=directory)
            self.assertEqual(json.loads(forced.read_text())["rule"], 2)


if __name__ == "__main__":
    unittest.main()
