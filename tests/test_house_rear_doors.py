import unittest
from types import SimpleNamespace
from unittest.mock import patch

import map_builder_house as m


class RearDoorTests(unittest.TestCase):
    def test_one_in_six_and_only_two_rear_blocks_change(self):
        for profile, length, seed in (("close", 100, 42), ("wide", 200, 43), ("close", 100, 7)):
            with self.subTest(profile=profile, seed=seed):
                zone = m.Zone(length, 100, 200)
                with patch.object(m, "add_rear_doors"):
                    before, old_houses, old_connections = m.generate_house_zone(zone, seed, profile)
                blocks, houses, connections = m.generate_house_zone(zone, seed, profile)
                self.assertEqual(connections, old_connections)
                self.assertEqual([{k: v for k, v in h.items() if k != "rear_door"} for h in houses], old_houses)
                selected = [h for h in houses if "rear_door" in h]
                self.assertEqual(len(selected), len(houses) // 6)
                expected = set()
                for h in selected:
                    door = h["rear_door"]
                    x, y, z = door["pos"]
                    bx, by, bz, sx, sy, sz = h["box"]
                    self.assertEqual(door["size"], [1, 2, 1])
                    self.assertEqual(y, by + 1)
                    self.assertEqual(blocks[x, y - 1, z], "house")
                    if h["side"] in ("north", "south"):
                        self.assertEqual(z, bz if h["side"] == "north" else bz + sz - 1)
                        inside = (x, y, z + (1 if h["side"] == "north" else -1))
                    else:
                        self.assertEqual(x, bx if h["side"] == "west" else bx + sx - 1)
                        inside = (x + (1 if h["side"] == "west" else -1), y, z)
                    self.assertNotIn(inside, blocks)
                    for dy in (0, 1):
                        cell = (x, y + dy, z)
                        expected.add(cell)
                        self.assertEqual(before[cell], "house")
                        self.assertEqual(blocks[cell], "rear_door")
                self.assertEqual(set(blocks), set(before))
                self.assertEqual({cell for cell in blocks if blocks[cell] != before[cell]}, expected)
                again = m.generate_house_zone(zone, seed, profile)[1]
                self.assertEqual([h.get("rear_door") for h in houses], [h.get("rear_door") for h in again])

    def test_compare_offsets_door_positions_and_renders_orange(self):
        payload = m.build_compare_payload(SimpleNamespace(length=100, width=100, height=200, seed=42))
        runs = [r for r in payload["runs"] if r["kind"] == "rear_door"]
        self.assertEqual(sum(r["size"][0] * r["size"][1] * r["size"][2] for r in runs), 34)
        self.assertTrue(all(r["block"] == "minecraft:orange_concrete" for r in runs))
        for h in payload["houses"]:
            if "rear_door" not in h:
                continue
            x, y, z = h["rear_door"]["pos"]
            for dy in (0, 1):
                self.assertTrue(any(rx <= x < rx + sx and ry <= y + dy < ry + sy and rz <= z < rz + sz
                                    for r in runs for rx, ry, rz in [r["pos"]] for sx, sy, sz in [r["size"]]))


if __name__ == "__main__":
    unittest.main()
