import unittest
import random
from unittest.mock import patch

import map_builder_house as m


class HouseBridgeTests(unittest.TestCase):
    def test_wide_uses_the_same_bridge_network_as_close(self):
        zone = m.Zone(200, 100, 200)
        close_blocks, close_houses, close_connections = m.generate_house_zone(zone, 43, "close")
        with patch.object(m, "HOUSE_WIDE_BRIDGE_MAX_LENGTH", None):
            wide_blocks, wide_houses, wide_connections = m.generate_house_zone(zone, 43, "wide")
        self.assertEqual(close_blocks, wide_blocks)
        without_profile = lambda items: [{k: v for k, v in item.items() if k != "profile"} for item in items]
        self.assertEqual(without_profile(close_houses), without_profile(wide_houses))
        self.assertEqual(without_profile(close_connections), without_profile(wide_connections))
        self.assertTrue(all(c["profile"] == "wide" for c in wide_connections))
        for flag in ("corner_bridge", "wall_bridge", "cross"):
            self.assertTrue(any(c.get(flag) for c in wide_connections), flag)
        self.assertTrue(any(c["kind"] == "house_stair" for c in wide_connections))

    def test_wide_paths_include_connectors_in_the_100_block_limit(self):
        for seed in (0, 7, 42, 43, 123):
            _, houses, connections = m.generate_house_zone(m.Zone(200, 100, 200), seed, "wide")
            self.assertTrue(connections)
            for connection in connections:
                length = len(connection["route"])
                if connection.get("wall_bridge"):
                    side_houses = [h for h in houses if h["side"] == connection["side"]]
                    first = side_houses[connection["from"]]["local"]["front_depth"]
                    last = side_houses[connection["to"]]["local"]["front_depth"]
                    length += 2 * connection["out"] - first - last
                self.assertLessEqual(length, 100, (seed, connection))

    def test_wide_limit_does_not_change_close(self):
        zone = m.Zone(100, 100, 200)
        before = m.generate_house_zone(zone, 42, "close")
        with patch.object(m, "HOUSE_WIDE_BRIDGE_MAX_LENGTH", 1):
            after = m.generate_house_zone(zone, 42, "close")
        self.assertEqual(before, after)

    def test_exactly_100_blocks_is_allowed_but_101_is_rejected(self):
        for width, expected in ((114, 1), (115, 0)):
            zone = m.Zone(100, width, 40)
            sides = {s.name: s for s in m.wall_sides(zone)}
            side_data = {name: (sides[name], [m.HouseVolume(name, 1, 30, 5, 0, 20, 6, 7)])
                         for name in ("north", "south")}
            blocks = {}
            connections = m.add_close_cross_bridges(blocks, zone, random.Random(42), side_data, max_length=100)
            self.assertEqual(len(connections), expected)
            if connections:
                self.assertEqual(len(connections[0]["route"]), 100)
            else:
                self.assertFalse(blocks, 'No partial bridge should be drawn')

    def test_full_width_stays_in_front_of_all_four_walls_and_corners(self):
        zone = m.Zone(40, 40, 30)
        base_route = [(x, 10, 1) for x in range(12, 0, -1)] + [(1, 10, z) for z in range(2, 13)]
        for flip_x, flip_z in ((False, False), (True, False), (False, True), (True, True)):
            route = [(39 - x if flip_x else x, y, 39 - z if flip_z else z) for x, y, z in base_route]
            blocks = {}
            m.add_walls(blocks, zone)
            walls = dict(blocks)
            self.assertTrue(m.edge_wall_route_can_fit(blocks, zone, route))
            cells = m.world_route_cells(route, wall_zone=zone)
            self.assertTrue(all(0 < x < 39 and 0 < z < 39 for x, _, z in cells))
            self.assertEqual(m.draw_edge_wall_route(blocks, zone, route, "house_bridge"), len(cells))
            self.assertTrue(all(blocks[cell] == kind for cell, kind in walls.items()))
            for x, y, z in route:
                self.assertIn((x, y, z), cells)
                if z in (1, 38):
                    self.assertIn((x, y, z + (1 if z == 1 else -1)), cells)
                if x in (1, 38):
                    self.assertIn((x + (1 if x == 1 else -1), y, z), cells)

    def test_house_shell_and_second_lane_headroom_are_not_overwritten(self):
        zone = m.Zone(40, 40, 30)
        route = [(x, 10, 38) for x in range(5, 20)]
        for kind, cell in (("house", (10, 10, 38)), ("window", (10, 10, 37)), ("house", (10, 12, 37))):
            blocks = {cell: kind}
            self.assertFalse(m.edge_wall_route_can_fit(blocks, zone, route))
            self.assertEqual(m.draw_edge_wall_route(blocks, zone, route, "house_bridge"), 0)
            self.assertEqual(blocks, {cell: kind})

    def test_empty_house_volume_also_blocks_the_route(self):
        zone = m.Zone(40, 40, 30)
        route = [(x, 10, 1) for x in range(5, 20)]
        self.assertFalse(m.edge_wall_route_can_fit({}, zone, route, [(10, 8, 0, 5, 10, 8)]))
        self.assertFalse(m.edge_wall_route_can_fit({}, zone, route, [(10, 12, 0, 5, 10, 8)]))
        self.assertTrue(m.edge_wall_route_can_fit({}, zone, route, [(10, 18, 0, 5, 10, 8)]))

    def test_existing_bridge_clearance_is_preserved(self):
        zone = m.Zone(40, 40, 30)
        route = [(x, 10, 1) for x in range(5, 20)]
        self.assertFalse(m.edge_wall_route_can_fit({(10, 10, 4): "house_bridge"}, zone, route))

    def test_generated_bridges_never_enter_walls_or_houses(self):
        for seed in (0, 7, 42, 123):
            for profile, length in (("close", 100), ("wide", 200)):
                with self.subTest(seed=seed, profile=profile):
                    zone = m.Zone(length, 100, 200)
                    blocks, houses, connections = m.generate_house_zone(zone, seed, profile)
                    self.assertTrue(connections)
                    for (x, y, z), kind in blocks.items():
                        if kind not in m.BRIDGE_BLOCK_KINDS:
                            continue
                        self.assertTrue(0 < x < length - 1 and 0 < z < 99)
                        for h in houses:
                            bx, by, bz, sx, sy, sz = h["box"]
                            self.assertFalse(bx <= x < bx + sx and bz <= z < bz + sz and by <= y < by + sy,
                                             (seed, profile, (x, y, z), h["box"]))


if __name__ == "__main__":
    unittest.main()
