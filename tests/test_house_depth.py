import unittest
from types import SimpleNamespace
from unittest.mock import patch

import map_builder_house as house


class HouseDepthTests(unittest.TestCase):
    def test_extensions_preserve_facades_and_connections(self):
        for profile, length in (("close", 100), ("wide", 200)):
            for seed in (42, 7):
                with self.subTest(profile=profile, seed=seed):
                    zone = house.Zone(length=length, width=100, height=200)
                    with patch.object(house, "extend_houses_behind_walls"):
                        before, old_houses, old_connections = house.generate_house_zone(zone, seed, profile)
                    after, houses, connections = house.generate_house_zone(zone, seed, profile)
                    self.assertEqual(connections, old_connections)
                    self.assertEqual(len(houses), len(old_houses))
                    self.assertEqual({h["side"] for h in houses}, {"north", "south", "west", "east"})
                    sides = {s.name: s for s in house.wall_sides(zone)}
                    removed = set()
                    for old, new in zip(old_houses, houses):
                        side = sides[new["side"]]
                        local = new["local"]
                        width, height, total = local["size"]
                        self.assertTrue(10 <= total <= 20)
                        self.assertGreater(local["back_depth"], 0)
                        self.assertEqual(local["front_depth"] + local["back_depth"], total)
                        axis = 2 if side.axis == "x" else 0
                        normal = side.normal[1] if axis == 2 else side.normal[0]
                        old_front = old["box"][axis] + (old["box"][axis + 3] - 1 if normal > 0 else 0)
                        new_front = new["box"][axis] + (new["box"][axis + 3] - 1 if normal > 0 else 0)
                        self.assertEqual(new_front, old_front)
                        self.assertEqual(new["box"][axis + 3], total)
                        for dy in range(height):
                            for offset in range(width):
                                along = local["along"] + offset
                                back = house.local_surface_to_world(zone, side, along, local["y"] + dy, -local["back_depth"])
                                door = new.get("rear_door")
                                is_door = door and back[0] == door["pos"][0] and back[2] == door["pos"][2] and door["pos"][1] <= back[1] < door["pos"][1] + 2
                                self.assertEqual(after.get(back), "rear_door" if is_door else "house")
                                wall = house.local_surface_to_world(zone, side, along, local["y"] + dy, 0)
                                if dy % house.FLOOR_STEP and 0 < offset < width - 1 and before.get(wall) in {"house", "wall"}:
                                    self.assertNotIn(wall, after)
                                    removed.add(wall)
                                else:
                                    self.assertEqual(after.get(wall), before.get(wall))
                        for out in range(-local["back_depth"] + 1, 0):
                            for dy in range(height):
                                cell = house.local_surface_to_world(zone, side, local["along"] + width // 2, local["y"] + dy, out)
                                self.assertEqual(after.get(cell), "house" if dy % house.FLOOR_STEP == 0 else None)
                    inside_after = {cell: kind for cell, kind in after.items() if 0 <= cell[0] < zone.length and 0 <= cell[2] < zone.width}
                    self.assertEqual(inside_after, {cell: kind for cell, kind in before.items() if cell not in removed})
                    self.assertGreater(len(after), len(before))

    def test_compare_keeps_both_enclosures_and_outside_geometry(self):
        payload = house.build_compare_payload(SimpleNamespace(length=100, width=100, height=200, seed=42))
        self.assertEqual(payload["settings"]["house_depth"], [10, 20])
        self.assertEqual(payload["zone"]["size"], [350, 200, 100])
        self.assertEqual(payload["stats"]["house_close"], 42)
        self.assertEqual(payload["stats"]["house_wide"], 60)
        runs = payload["runs"]
        self.assertLess(min(r["pos"][0] for r in runs), 0)
        self.assertLess(min(r["pos"][2] for r in runs), 0)
        self.assertGreater(max(r["pos"][0] + r["size"][0] for r in runs), 350)
        self.assertGreater(max(r["pos"][2] + r["size"][2] for r in runs), 100)
        close = [h["box"] for h in payload["houses"] if h["profile"] == "close"]
        wide = [h["box"] for h in payload["houses"] if h["profile"] == "wide"]
        self.assertLess(max(b[0] + b[3] for b in close), min(b[0] for b in wide))


if __name__ == "__main__":
    unittest.main()
