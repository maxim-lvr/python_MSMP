"""Small reusable wall strips for the web prototype; never writes an export."""
from functools import lru_cache
import random

from map_builder_house import (
    Zone, WallSide, generate_houses_on_side, extend_houses_behind_walls, blocks_to_runs,
    add_close_wall_bridges,
)
from map_builder_bridge_zone import Zone as BridgeZone, generate_tower_bridges, blocks_to_runs as bridge_runs
from map_builde_dense_1 import HOUSE_MIN_XZ, HOUSE_MAX_XZ, HOUSE_MIN_Y, HOUSE_MAX_Y
from map_builder_building_long import Zone as BuildingLongZone, build_payload as build_building_long


@lru_cache(maxsize=3)
def wall_templates(seed: int) -> dict:
    strips = {}
    for length in range(64, 257, 32):
        zone = Zone(length=length, width=96, height=240)
        side = WallSide("north", "x", 0, (0, 1), 8, length - 8)
        blocks = {}
        rng = random.Random(seed + length)
        houses, connections, _, placed = generate_houses_on_side(
            blocks, zone, side, rng, 1,
        )
        connections.extend(add_close_wall_bridges(blocks, zone, rng, {"north": (side, placed)}, 100))
        extend_houses_behind_walls(blocks, zone, houses, seed + length)
        strips[length] = {"houses": houses, "connections": connections, "runs": blocks_to_runs(blocks)}
    bridges = []
    for index in range(2):
        blocks, paths, towers, _ = generate_tower_bridges(
            BridgeZone(length=1024, width=320, height=300), seed + index, 24, 12, 150,
        )
        bridges.append({"runs": bridge_runs(blocks), "bridges": len(paths), "towers": len(towers)})
    return {"strips": strips, "bridges": bridges,
            "denseSize": [HOUSE_MIN_XZ, HOUSE_MAX_XZ, HOUSE_MIN_Y, HOUSE_MAX_Y]}


@lru_cache(maxsize=4)
def building_long_template(seed: int, length: int) -> dict:
    payload = build_building_long(seed, BuildingLongZone(length=length), 10, include_ports=True)
    return {
        "size": payload["zone"]["size"],
        "boxes": [[*run["pos"], *run["size"], run["kind"]] for run in payload["runs"]],
        "stats": payload["stats"],
        "trailPorts": payload["trail_ports"],
    }
