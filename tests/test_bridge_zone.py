import random
import unittest

import map_builder_bridge_zone as bridge


class CentralBridgeTests(unittest.TestCase):
    def setUp(self):
        self.zone = bridge.Zone()

    def test_landings_are_only_bridge_width(self):
        blocks = {}
        bridge.add_landing(blocks, self.zone, 50, 30, 50)
        self.assertEqual(len(blocks), bridge.SMALL_WIDTH ** 2)
        self.assertEqual(set(blocks.values()), {"small_bridge"})

    def test_support_preserves_existing_decks(self):
        blocks = {(50, 20, 50): "small_bridge"}
        bridge.add_main_bridge(blocks, self.zone)
        bridge.add_support(blocks, self.zone, 50, 80, 50)
        bridge.add_support(blocks, self.zone, 50, 80, bridge.main_bridge_z(self.zone))
        self.assertEqual(blocks[(50, 20, 50)], "small_bridge")
        self.assertEqual(blocks[(50, bridge.main_bridge_y(self.zone), bridge.main_bridge_z(self.zone))], "main_bridge")

    def test_generated_branches_reach_the_main_deck(self):
        for factory in (bridge.add_side_to_center_bridge, bridge.add_orthogonal_link):
            for seed in range(20):
                with self.subTest(factory=factory.__name__, seed=seed):
                    blocks = {}
                    bridge.add_main_bridge(blocks, self.zone)
                    path = factory(blocks, self.zone, random.Random(seed), 1)
                    bridge.clear_central_connection_railings(blocks, self.zone, [path])
                    for span in path["spans"]:
                        points = bridge.span_points(span)
                        self.assertEqual(list(points[-1][:3]), span["end"])
                        for x, y, z, *_ in points:
                            self.assertIn((x, y, z), blocks)
                            for head_y in (y + 1, y + 2):
                                self.assertNotIn((x, head_y, z), blocks)
                    endpoint = path["end"] if path["type"] == "side_to_center" else path["start"]
                    self.assertEqual(endpoint[1], bridge.main_connection_y(self.zone))
                    self.assertEqual(endpoint[2], bridge.main_bridge_z(self.zone))

    def test_complete_generation_preserves_central_surface(self):
        for seed in (50, 42):
            with self.subTest(seed=seed):
                blocks, paths, _, _ = bridge.generate_bridge_zone(self.zone, seed, 42, 60, 240)
                self.assertNotIn("landing", blocks.values())
                self.assertFalse(bridge.has_central_headroom_conflict(blocks, self.zone, paths))
                center = bridge.main_bridge_z(self.zone)
                base = bridge.main_bridge_y(self.zone)
                for x in range(self.zone.length):
                    for z in range(center - 2, center + 3):
                        for y in range(base, base + bridge.MAIN_HEIGHT):
                            self.assertEqual(blocks[(x, y, z)], "main_bridge")
                        for y in (base + 2, base + 3):
                            self.assertNotIn((x, y, z), blocks)
                for path in paths:
                    if path["type"] not in {"side_to_center", "orthogonal_link"}:
                        continue
                    for span in path["spans"]:
                        for x, y, z, *_ in bridge.span_points(span):
                            if abs(z - center) <= 3:
                                self.assertEqual(y, bridge.main_connection_y(self.zone))
                                self.assertIn((x, y, z), blocks)
                                self.assertNotIn((x, y + 1, z), blocks)
                                self.assertNotIn((x, y + 2, z), blocks)


class PylonFirstTests(unittest.TestCase):
    def test_routes_need_enough_steps_on_each_leg(self):
        self.assertEqual(bridge.connection_route_options((0, 60, 0), (69, 67, 9)), [])

    def test_pylons_are_connected_without_obstructions(self):
        zone = bridge.Zone()
        for seed in (0, 42, 50, 123):
            with self.subTest(seed=seed):
                blocks, paths, pylons, connections = bridge.generate_pylon_bridges(zone, seed, 42, 60, 240)
                self.assertEqual(set(blocks.values()), {"main_bridge", "small_bridge", "support"})
                self.assertEqual(connections, [])
                self.assertEqual(len(pylons), 42)
                self.assertEqual(len(paths), len(pylons))
                by_id = {p["id"]: p for p in pylons}
                used = []
                decks = []
                for path in paths:
                    self.assertEqual(path["type"], "pylon_to_center")
                    self.assertTrue(60 <= path["length"] <= 240)
                    used.append(path["pylon"])
                    p = by_id[path["pylon"]]
                    self.assertEqual(path["start"], [p["x"], p["y"], p["z"]])
                    self.assertEqual(path["end"], [p["x"], bridge.main_connection_y(zone), bridge.main_bridge_z(zone)])
                    self.assertEqual(path["to_path"], 0)
                    self.assertEqual(len(path["spans"]), 1)
                    self.assertEqual(blocks[(p["x"], p["y"] - 1, p["z"])], "support")
                    route = [tuple(path["spans"][0]["start"])] + [tuple(s["end"]) for s in path["spans"]]
                    deck = bridge.pylon_bridge_deck(route)
                    for x, y, z in deck:
                        on_main = abs(z - bridge.main_bridge_z(zone)) <= bridge.MAIN_WIDTH // 2
                        self.assertEqual(blocks[(x, y, z)], "main_bridge" if on_main else "small_bridge")
                        self.assertNotIn((x, y + 1, z), blocks)
                        self.assertNotIn((x, y + 2, z), blocks)
                    for span in path["spans"]:
                        self.assertEqual(list(bridge.span_points(span)[-1][:3]), span["end"])
                    for other_deck in decks:
                        for x, y, z in deck & other_deck:
                            self.assertEqual(blocks[(x, y, z)], "main_bridge")
                    decks.append(deck)
                self.assertEqual(set(used), set(by_id))
                self.assertTrue(all(used.count(i) == 1 for i in by_id))
                self.assertTrue(all(0 <= x < zone.length and 0 <= y < zone.height and 0 <= z < zone.width for x, y, z in blocks))

    def test_seed_and_empty_zone(self):
        args = (bridge.Zone(), 50, 42, 60, 240)
        self.assertEqual(bridge.generate_pylon_bridges(*args), bridge.generate_pylon_bridges(*args))
        blocks, paths, pylons, _ = bridge.generate_pylon_bridges(bridge.Zone(), 50, 0, 60, 240)
        self.assertEqual(paths, [])
        self.assertEqual(pylons, [])
        self.assertEqual(set(blocks.values()), {"main_bridge"})


class TowerEntranceTests(unittest.TestCase):
    def test_full_height_towers_with_one_bridge_and_two_orange_blocks(self):
        zone = bridge.Zone()
        blocks, paths, towers, connections = bridge.generate_bridge_zone(zone, 50, 42, 60, 240)
        self.assertGreater(len(towers), 0)
        self.assertLessEqual(len(towers), 42)
        for i, tower in enumerate(towers):
            for other in towers[i + 1:]:
                self.assertGreaterEqual(
                    (tower["x"] - other["x"]) ** 2 + (tower["z"] - other["z"]) ** 2,
                    70 ** 2,
                )
        self.assertEqual(len(paths), len(towers))
        self.assertEqual(connections, [])
        self.assertEqual(set(blocks.values()), {"main_bridge", "small_bridge", "tower", "door"})
        self.assertEqual(sum(kind == "door" for kind in blocks.values()), len(towers) * 2)
        by_id = {t["id"]: t for t in towers}
        for path in paths:
            self.assertEqual(path["type"], "tower_to_center")
            t = by_id[path["tower"]]
            self.assertTrue(6 <= t["radius"] <= 15)
            self.assertEqual(t["height"], zone.height)
            for y in range(zone.height):
                self.assertEqual(blocks[(t["x"], y, t["z"])], "tower")
            self.assertEqual(path["start"], t["bridge_start"])
            self.assertEqual(path["end"], [t["x"], bridge.main_connection_y(zone), bridge.main_bridge_z(zone)])
            self.assertEqual(len(path["spans"]), 1)
            x, y, z = t["door"]["pos"]
            self.assertEqual(t["door"]["size"], [1, 2, 1])
            self.assertEqual(blocks[(x, y, z)], "door")
            self.assertEqual(blocks[(x, y + 1, z)], "door")
            self.assertEqual(blocks[(x, y - 1, z)], "tower")
            self.assertEqual(path["start"][1], y - 1)
            self.assertEqual(abs(path["start"][2] - z), 1)
            for px, py, pz, dx, dz, _ in bridge.span_points(path["spans"][0]):
                for bx, by, bz in bridge.platform_blocks_at(px, py, pz, dx, dz, 3, 1):
                    self.assertIn(blocks[(bx, by, bz)], {"small_bridge", "main_bridge"})
                    self.assertNotIn((bx, by + 1, bz), blocks)
                    self.assertNotIn((bx, by + 2, bz), blocks)
        runs = bridge.blocks_to_runs(blocks)
        self.assertEqual(sum(r["size"][0] * r["size"][1] * r["size"][2] for r in runs), len(blocks))
        self.assertLess(sum(r["kind"] == "tower" for r in runs), 3000)
        for run in runs:
            x, y, z = run["pos"]
            sx, sy, sz = run["size"]
            self.assertEqual(blocks[(x, y, z)], run["kind"])
            self.assertEqual(blocks[(x + sx - 1, y + sy - 1, z + sz - 1)], run["kind"])


if __name__ == "__main__":
    unittest.main()
