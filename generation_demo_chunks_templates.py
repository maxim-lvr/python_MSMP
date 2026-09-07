"""Small reusable wall strips for the web prototype; never writes an export."""
from functools import lru_cache
import random

from map_builder_house import (
    Zone, WallSide, generate_houses_on_side, extend_houses_behind_walls, blocks_to_runs,
)
from map_builde_dense_1 import HOUSE_MIN_XZ, HOUSE_MAX_XZ, HOUSE_MIN_Y, HOUSE_MAX_Y


@lru_cache(maxsize=3)
def wall_templates(seed: int) -> dict:
    strips = {}
    for length in range(64, 257, 32):
        zone = Zone(length=length, width=96, height=240)
        side = WallSide("north", "x", 0, (0, 1), 8, length - 8)
        blocks = {}
        houses, connections, _, _ = generate_houses_on_side(
            blocks, zone, side, random.Random(seed + length), 1,
        )
        extend_houses_behind_walls(blocks, zone, houses, seed + length)
        strips[length] = {"houses": houses, "connections": connections, "runs": blocks_to_runs(blocks)}
    return {"strips": strips, "denseSize": [HOUSE_MIN_XZ, HOUSE_MAX_XZ, HOUSE_MIN_Y, HOUSE_MAX_Y]}
