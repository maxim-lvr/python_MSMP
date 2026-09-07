from __future__ import annotations

import argparse
import json
import random
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path


ZONE_LENGTH = 500
ZONE_WIDTH = 500
ZONE_HEIGHT = 200

DEFAULT_SEED = 42
DEFAULT_OUT = Path("exports/dense_1.json")
DEFAULT_MINECRAFT_OUT = Path("exports/dense_1_minecraft.json")

HOUSE_COUNT = 1100
HOUSE_MIN_XZ = 5
HOUSE_MAX_XZ = 30
HOUSE_MIN_Y = 5
HOUSE_MAX_Y = 8
HOUSE_MARGIN = 1
HORIZONTAL_GAP_MIN = 2
HORIZONTAL_GAP_MAX = 14
VERTICAL_GAP_MIN = 2
VERTICAL_GAP_MAX = 18
MAX_HORIZONTAL_CONNECT_DISTANCE = 28
MAX_VERTICAL_CONNECT_DISTANCE = 34
MAX_STAIR_CONNECT_DISTANCE = 36
PREFERRED_MAX_OPENINGS = 3
FORCED_MAX_OPENINGS = 4
SPREAD_PARENT_SAMPLE = 64
LONG_CONNECTION_MIN_ROUTE = 80
LONG_CONNECTION_MAX_ROUTE = 260
LONG_CONNECTION_MIN = 2
LONG_CONNECTION_MAX = 4
LONG_CONNECTION_OPENING_LIMIT = 5
BRIDGE_WIDTH = 3
BRIDGE_CLEAR_HEIGHT = 4
STAIR_CLEAR_HEIGHT = 5
LADDER_SHAFT_SIZE = 3

BLOCK_BY_KIND = {
    "air": "minecraft:air",
    "base": "minecraft:stone",
    "house": "minecraft:stone_bricks",
    "door": "minecraft:air",
    "corridor": "minecraft:stone",
    "stair": "minecraft:stone",
    "ladder": "minecraft:ladder[facing=north]",
    "long_connection": "minecraft:stone",
}


@dataclass(frozen=True)
class Zone:
    length: int = ZONE_LENGTH
    width: int = ZONE_WIDTH
    height: int = ZONE_HEIGHT


@dataclass
class House:
    id: int
    x: int
    y: int
    z: int
    sx: int
    sy: int
    sz: int
    openings: dict[str, int] = field(default_factory=dict)

    @property
    def max_x(self) -> int:
        return self.x + self.sx - 1

    @property
    def max_y(self) -> int:
        return self.y + self.sy - 1

    @property
    def max_z(self) -> int:
        return self.z + self.sz - 1

    def box(self) -> list[int]:
        return [self.x, self.y, self.z, self.sx, self.sy, self.sz]


@dataclass(frozen=True)
class ConnectionCandidate:
    kind: str
    a: int
    b: int
    a_side: str
    b_side: str
    distance: int
    route: tuple[tuple[int, int, int], ...]
    doors: tuple[tuple[int, str, tuple[int, int, int]], tuple[int, str, tuple[int, int, int]]]


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, item: int) -> int:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, a: int, b: int) -> bool:
        root_a = self.find(a)
        root_b = self.find(b)
        if root_a == root_b:
            return False
        if self.rank[root_a] < self.rank[root_b]:
            root_a, root_b = root_b, root_a
        self.parent[root_b] = root_a
        if self.rank[root_a] == self.rank[root_b]:
            self.rank[root_a] += 1
        return True

    def component_count(self) -> int:
        return len({self.find(index) for index in range(len(self.parent))})


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def interval_overlap(a0: int, a1: int, b0: int, b1: int) -> tuple[int, int] | None:
    start = max(a0, b0)
    end = min(a1, b1)
    if start > end:
        return None
    return start, end


def overlaps_with_margin(a: House, b: House, margin: int = HOUSE_MARGIN) -> bool:
    return not (
        a.max_x + margin < b.x
        or b.max_x + margin < a.x
        or a.max_y + margin < b.y
        or b.max_y + margin < a.y
        or a.max_z + margin < b.z
        or b.max_z + margin < a.z
    )


def can_place(zone: Zone, houses: list[House], house: House) -> bool:
    if house.x < 0 or house.y < 0 or house.z < 0:
        return False
    if house.x + house.sx > zone.length or house.y + house.sy > zone.height or house.z + house.sz > zone.width:
        return False
    return not any(overlaps_with_margin(house, placed) for placed in houses)


def random_size(rng: random.Random) -> tuple[int, int, int]:
    return (
        rng.randrange(HOUSE_MIN_XZ, HOUSE_MAX_XZ + 1),
        rng.randrange(HOUSE_MIN_Y, HOUSE_MAX_Y + 1),
        rng.randrange(HOUSE_MIN_XZ, HOUSE_MAX_XZ + 1),
    )


def overlap_aligned_start(parent_start: int, parent_size: int, child_size: int, rng: random.Random) -> int:
    minimum = parent_start - child_size + 3
    maximum = parent_start + parent_size - 3
    if minimum > maximum:
        return parent_start
    return rng.randrange(minimum, maximum + 1)


def horizontal_child(zone: Zone, parent: House, house_id: int, rng: random.Random) -> House:
    sx, sy, sz = random_size(rng)
    side = rng.choice(("west", "east", "north", "south"))
    gap = rng.randrange(HORIZONTAL_GAP_MIN, HORIZONTAL_GAP_MAX + 1)
    y = parent.y

    if side == "east":
        x = parent.x + parent.sx + gap
        z = overlap_aligned_start(parent.z, parent.sz, sz, rng)
    elif side == "west":
        x = parent.x - gap - sx
        z = overlap_aligned_start(parent.z, parent.sz, sz, rng)
    elif side == "south":
        x = overlap_aligned_start(parent.x, parent.sx, sx, rng)
        z = parent.z + parent.sz + gap
    else:
        x = overlap_aligned_start(parent.x, parent.sx, sx, rng)
        z = parent.z - gap - sz

    return House(house_id, x, y, z, sx, sy, sz)


def vertical_child(zone: Zone, parent: House, house_id: int, rng: random.Random) -> House:
    sx, sy, sz = random_size(rng)
    direction = rng.choice(("up", "down"))
    gap = rng.randrange(VERTICAL_GAP_MIN, VERTICAL_GAP_MAX + 1)
    y = parent.y + parent.sy + gap if direction == "up" else parent.y - gap - sy

    align_mode = rng.choice(("west", "east", "north", "south"))
    if align_mode == "west":
        x = parent.x
        z = overlap_aligned_start(parent.z, parent.sz, sz, rng)
    elif align_mode == "east":
        x = parent.max_x - sx + 1
        z = overlap_aligned_start(parent.z, parent.sz, sz, rng)
    elif align_mode == "north":
        x = overlap_aligned_start(parent.x, parent.sx, sx, rng)
        z = parent.z
    else:
        x = overlap_aligned_start(parent.x, parent.sx, sx, rng)
        z = parent.max_z - sz + 1

    x = clamp(x, 0, zone.length - sx)
    z = clamp(z, 0, zone.width - sz)
    return House(house_id, x, y, z, sx, sy, sz)


def house_center(house: House) -> tuple[int, int, int]:
    return (house.x + house.sx // 2, house.y + house.sy // 2, house.z + house.sz // 2)


def distance_to_target(house: House, target: tuple[int, int, int]) -> int:
    x, y, z = house_center(house)
    tx, ty, tz = target
    return abs(x - tx) + abs(y - ty) * 2 + abs(z - tz)


def target_point(zone: Zone, rng: random.Random) -> tuple[int, int, int]:
    if rng.random() < 0.42:
        x = rng.choice((0, zone.length - 1)) if rng.random() < 0.55 else rng.randrange(0, zone.length)
        y = rng.choice((0, zone.height - 1)) if rng.random() < 0.38 else rng.randrange(0, zone.height)
        z = rng.choice((0, zone.width - 1)) if rng.random() < 0.55 else rng.randrange(0, zone.width)
        return x, y, z

    return (
        rng.randrange(0, zone.length),
        rng.randrange(0, zone.height),
        rng.randrange(0, zone.width),
    )


def parent_towards_target(houses: list[House], target: tuple[int, int, int], rng: random.Random) -> House:
    sample_size = min(len(houses), SPREAD_PARENT_SAMPLE)
    sample = rng.sample(houses, sample_size)
    return min(sample, key=lambda house: distance_to_target(house, target))


def child_towards(zone: Zone, parent: House, house_id: int, target: tuple[int, int, int], rng: random.Random) -> House:
    sx, sy, sz = random_size(rng)
    px, py, pz = house_center(parent)
    tx, ty, tz = target
    dx = tx - px
    dy = ty - py
    dz = tz - pz

    if abs(dy) > 18 and rng.random() < 0.65:
        gap = rng.randrange(VERTICAL_GAP_MIN, VERTICAL_GAP_MAX + 1)
        y = parent.y + parent.sy + gap if dy >= 0 else parent.y - gap - sy
        align_mode = rng.choice(("west", "east", "north", "south"))
        if align_mode == "west":
            x = parent.x
            z = overlap_aligned_start(parent.z, parent.sz, sz, rng)
        elif align_mode == "east":
            x = parent.max_x - sx + 1
            z = overlap_aligned_start(parent.z, parent.sz, sz, rng)
        elif align_mode == "north":
            x = overlap_aligned_start(parent.x, parent.sx, sx, rng)
            z = parent.z
        else:
            x = overlap_aligned_start(parent.x, parent.sx, sx, rng)
            z = parent.max_z - sz + 1
        return House(house_id, clamp(x, 0, zone.length - sx), y, clamp(z, 0, zone.width - sz), sx, sy, sz)

    gap = rng.randrange(HORIZONTAL_GAP_MIN, HORIZONTAL_GAP_MAX + 1)
    y = parent.y
    if abs(dx) >= abs(dz):
        if dx >= 0:
            x = parent.x + parent.sx + gap
            z = overlap_aligned_start(parent.z, parent.sz, sz, rng)
        else:
            x = parent.x - gap - sx
            z = overlap_aligned_start(parent.z, parent.sz, sz, rng)
    else:
        if dz >= 0:
            x = overlap_aligned_start(parent.x, parent.sx, sx, rng)
            z = parent.z + parent.sz + gap
        else:
            x = overlap_aligned_start(parent.x, parent.sx, sx, rng)
            z = parent.z - gap - sz

    return House(house_id, x, y, z, sx, sy, sz)


def random_root(zone: Zone, house_id: int, rng: random.Random) -> House:
    sx, sy, sz = random_size(rng)
    return House(
        house_id,
        rng.randrange(0, zone.length - sx + 1),
        rng.randrange(0, zone.height - sy + 1),
        rng.randrange(0, zone.width - sz + 1),
        sx,
        sy,
        sz,
    )


def place_houses(zone: Zone, rng: random.Random, target_count: int) -> list[House]:
    first = random_root(zone, 0, rng)
    houses = [first]
    attempts = 0
    max_attempts = target_count * 900

    while len(houses) < target_count and attempts < max_attempts:
        attempts += 1
        point = target_point(zone, rng)
        parent = parent_towards_target(houses, point, rng)
        house_id = len(houses)
        if rng.random() < 0.86:
            candidate = child_towards(zone, parent, house_id, point, rng)
        elif rng.random() < 0.72:
            candidate = horizontal_child(zone, parent, house_id, rng)
        else:
            candidate = vertical_child(zone, parent, house_id, rng)

        has_parent_connection = (
            horizontal_candidate(parent, candidate) is not None
            or stair_candidate(parent, candidate) is not None
            or ladder_candidate(parent, candidate) is not None
        )
        if has_parent_connection and can_place(zone, houses, candidate):
            houses.append(candidate)

    return houses


def side_opening_allowed(house: House, side: str, limit: int) -> bool:
    if side in house.openings:
        return False
    return len(house.openings) < limit


def register_opening(house: House, side: str, connection_index: int, allow_duplicate_side: bool = False) -> None:
    if side not in house.openings:
        house.openings[side] = connection_index
        return
    if not allow_duplicate_side:
        return

    suffix = 2
    while f"{side}_{suffix}" in house.openings:
        suffix += 1
    house.openings[f"{side}_{suffix}"] = connection_index


def horizontal_candidate(a: House, b: House) -> ConnectionCandidate | None:
    if a.y != b.y:
        return None

    if a.max_x < b.x:
        gap = b.x - a.max_x - 1
        overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
        if overlap and gap <= MAX_HORIZONTAL_CONNECT_DISTANCE:
            z = (overlap[0] + overlap[1]) // 2
            y = a.y
            route = tuple((x, y, z) for x in range(a.max_x + 1, b.x))
            return ConnectionCandidate(
                "door",
                a.id,
                b.id,
                "east",
                "west",
                gap,
                route,
                ((a.id, "east", (a.max_x, y + 1, z)), (b.id, "west", (b.x, y + 1, z))),
            )

    if b.max_x < a.x:
        gap = a.x - b.max_x - 1
        overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
        if overlap and gap <= MAX_HORIZONTAL_CONNECT_DISTANCE:
            z = (overlap[0] + overlap[1]) // 2
            y = a.y
            route = tuple((x, y, z) for x in range(a.x - 1, b.max_x, -1))
            return ConnectionCandidate(
                "door",
                a.id,
                b.id,
                "west",
                "east",
                gap,
                route,
                ((a.id, "west", (a.x, y + 1, z)), (b.id, "east", (b.max_x, y + 1, z))),
            )

    if a.max_z < b.z:
        gap = b.z - a.max_z - 1
        overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
        if overlap and gap <= MAX_HORIZONTAL_CONNECT_DISTANCE:
            x = (overlap[0] + overlap[1]) // 2
            y = a.y
            route = tuple((x, y, z) for z in range(a.max_z + 1, b.z))
            return ConnectionCandidate(
                "door",
                a.id,
                b.id,
                "south",
                "north",
                gap,
                route,
                ((a.id, "south", (x, y + 1, a.max_z)), (b.id, "north", (x, y + 1, b.z))),
            )

    if b.max_z < a.z:
        gap = a.z - b.max_z - 1
        overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
        if overlap and gap <= MAX_HORIZONTAL_CONNECT_DISTANCE:
            x = (overlap[0] + overlap[1]) // 2
            y = a.y
            route = tuple((x, y, z) for z in range(a.z - 1, b.max_z, -1))
            return ConnectionCandidate(
                "door",
                a.id,
                b.id,
                "north",
                "south",
                gap,
                route,
                ((a.id, "north", (x, y + 1, a.z)), (b.id, "south", (x, y + 1, b.max_z))),
            )

    return None


def stair_route_between(start: int, end: int, start_y: int, end_y: int, fixed: int, axis: str) -> tuple[tuple[int, int, int], ...]:
    if start <= end:
        positions = list(range(start, end + 1))
    else:
        positions = list(range(start, end - 1, -1))

    distance = max(1, len(positions) - 1)
    vertical = end_y - start_y
    route = []
    for index, position in enumerate(positions):
        moved = round(vertical * (index / distance))
        y = start_y + moved
        if axis == "x":
            route.append((position, y, fixed))
        else:
            route.append((fixed, y, position))
    return tuple(route)


def stair_candidate(a: House, b: House) -> ConnectionCandidate | None:
    if a.y == b.y:
        return None

    if a.max_x < b.x:
        gap = b.x - a.max_x - 1
        vertical = abs(b.y - a.y)
        overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
        if overlap and vertical <= gap and gap <= MAX_STAIR_CONNECT_DISTANCE:
            z = (overlap[0] + overlap[1]) // 2
            route = stair_route_between(a.max_x + 1, b.x - 1, a.y, b.y, z, "x")
            return ConnectionCandidate(
                "stair",
                a.id,
                b.id,
                "east",
                "west",
                gap + vertical,
                route,
                ((a.id, "east", (a.max_x, a.y + 1, z)), (b.id, "west", (b.x, b.y + 1, z))),
            )

    if b.max_x < a.x:
        gap = a.x - b.max_x - 1
        vertical = abs(b.y - a.y)
        overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
        if overlap and vertical <= gap and gap <= MAX_STAIR_CONNECT_DISTANCE:
            z = (overlap[0] + overlap[1]) // 2
            route = stair_route_between(a.x - 1, b.max_x + 1, a.y, b.y, z, "x")
            return ConnectionCandidate(
                "stair",
                a.id,
                b.id,
                "west",
                "east",
                gap + vertical,
                route,
                ((a.id, "west", (a.x, a.y + 1, z)), (b.id, "east", (b.max_x, b.y + 1, z))),
            )

    if a.max_z < b.z:
        gap = b.z - a.max_z - 1
        vertical = abs(b.y - a.y)
        overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
        if overlap and vertical <= gap and gap <= MAX_STAIR_CONNECT_DISTANCE:
            x = (overlap[0] + overlap[1]) // 2
            route = stair_route_between(a.max_z + 1, b.z - 1, a.y, b.y, x, "z")
            return ConnectionCandidate(
                "stair",
                a.id,
                b.id,
                "south",
                "north",
                gap + vertical,
                route,
                ((a.id, "south", (x, a.y + 1, a.max_z)), (b.id, "north", (x, b.y + 1, b.z))),
            )

    if b.max_z < a.z:
        gap = a.z - b.max_z - 1
        vertical = abs(b.y - a.y)
        overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
        if overlap and vertical <= gap and gap <= MAX_STAIR_CONNECT_DISTANCE:
            x = (overlap[0] + overlap[1]) // 2
            route = stair_route_between(a.z - 1, b.max_z + 1, a.y, b.y, x, "z")
            return ConnectionCandidate(
                "stair",
                a.id,
                b.id,
                "north",
                "south",
                gap + vertical,
                route,
                ((a.id, "north", (x, a.y + 1, a.z)), (b.id, "south", (x, b.y + 1, b.max_z))),
            )

    return None


def preferred_positions(start: int, end: int) -> list[int]:
    center = (start + end) // 2
    return sorted(range(start, end + 1), key=lambda value: (abs(value - center), value))


def shared_ladder_points(a: House, b: House) -> list[tuple[str, str, int, int, int, int]]:
    x_overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
    z_overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
    points = []

    for x, side_a, side_b in (
        (a.x, "west", "west"),
        (a.max_x, "east", "east"),
    ):
        if x in (b.x, b.max_x) and z_overlap:
            route_x = x - 2 if side_a == "west" else x + 2
            for z in preferred_positions(z_overlap[0], z_overlap[1]):
                points.append((side_a, side_b, route_x, z, x, z))

    for z, side_a, side_b in (
        (a.z, "north", "north"),
        (a.max_z, "south", "south"),
    ):
        if z in (b.z, b.max_z) and x_overlap:
            route_z = z - 2 if side_a == "north" else z + 2
            for x in preferred_positions(x_overlap[0], x_overlap[1]):
                points.append((side_a, side_b, x, route_z, x, z))

    return points


def ladder_candidates(a: House, b: House) -> list[ConnectionCandidate]:
    if a.max_y < b.y:
        low, high = a, b
    elif b.max_y < a.y:
        low, high = b, a
    else:
        return []

    gap = high.y - low.max_y - 1
    vertical_distance = high.y - low.y
    if vertical_distance > MAX_VERTICAL_CONNECT_DISTANCE:
        return []

    candidates = []
    for low_side, high_side, x, z, door_x, door_z in shared_ladder_points(low, high):
        route = tuple((x, y, z) for y in range(low.y + 1, high.y + 2))
        candidate = ConnectionCandidate(
            "ladder",
            low.id,
            high.id,
            low_side,
            high_side,
            gap + vertical_distance,
            route,
            ((low.id, low_side, (door_x, low.y + 1, door_z)), (high.id, high_side, (door_x, high.y + 1, door_z))),
        )

        if candidate.a == a.id:
            candidates.append(candidate)
        else:
            candidates.append(
                ConnectionCandidate(
                    candidate.kind,
                    a.id,
                    b.id,
                    candidate.b_side,
                    candidate.a_side,
                    candidate.distance,
                    tuple(reversed(candidate.route)),
                    (candidate.doors[1], candidate.doors[0]),
                )
            )

    return candidates


def ladder_candidate(a: House, b: House) -> ConnectionCandidate | None:
    candidates = ladder_candidates(a, b)
    return candidates[0] if candidates else None


def long_horizontal_candidate(a: House, b: House) -> ConnectionCandidate | None:
    if a.y != b.y:
        return None

    if a.max_x < b.x:
        gap = b.x - a.max_x - 1
        overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
        if overlap and LONG_CONNECTION_MIN_ROUTE <= gap <= LONG_CONNECTION_MAX_ROUTE:
            z = (overlap[0] + overlap[1]) // 2
            y = a.y
            route = tuple((x, y, z) for x in range(a.max_x + 1, b.x))
            return ConnectionCandidate(
                "long_bridge",
                a.id,
                b.id,
                "east",
                "west",
                gap,
                route,
                ((a.id, "east", (a.max_x, y + 1, z)), (b.id, "west", (b.x, y + 1, z))),
            )

    if b.max_x < a.x:
        gap = a.x - b.max_x - 1
        overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
        if overlap and LONG_CONNECTION_MIN_ROUTE <= gap <= LONG_CONNECTION_MAX_ROUTE:
            z = (overlap[0] + overlap[1]) // 2
            y = a.y
            route = tuple((x, y, z) for x in range(a.x - 1, b.max_x, -1))
            return ConnectionCandidate(
                "long_bridge",
                a.id,
                b.id,
                "west",
                "east",
                gap,
                route,
                ((a.id, "west", (a.x, y + 1, z)), (b.id, "east", (b.max_x, y + 1, z))),
            )

    if a.max_z < b.z:
        gap = b.z - a.max_z - 1
        overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
        if overlap and LONG_CONNECTION_MIN_ROUTE <= gap <= LONG_CONNECTION_MAX_ROUTE:
            x = (overlap[0] + overlap[1]) // 2
            y = a.y
            route = tuple((x, y, z) for z in range(a.max_z + 1, b.z))
            return ConnectionCandidate(
                "long_bridge",
                a.id,
                b.id,
                "south",
                "north",
                gap,
                route,
                ((a.id, "south", (x, y + 1, a.max_z)), (b.id, "north", (x, y + 1, b.z))),
            )

    if b.max_z < a.z:
        gap = a.z - b.max_z - 1
        overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
        if overlap and LONG_CONNECTION_MIN_ROUTE <= gap <= LONG_CONNECTION_MAX_ROUTE:
            x = (overlap[0] + overlap[1]) // 2
            y = a.y
            route = tuple((x, y, z) for z in range(a.z - 1, b.max_z, -1))
            return ConnectionCandidate(
                "long_bridge",
                a.id,
                b.id,
                "north",
                "south",
                gap,
                route,
                ((a.id, "north", (x, y + 1, a.z)), (b.id, "south", (x, y + 1, b.max_z))),
            )

    return None


def long_stair_candidate(a: House, b: House) -> ConnectionCandidate | None:
    if a.y == b.y:
        return None

    candidates = []

    if a.max_x < b.x:
        gap = b.x - a.max_x - 1
        vertical = abs(b.y - a.y)
        overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
        if overlap and vertical <= gap:
            z = (overlap[0] + overlap[1]) // 2
            route = stair_route_between(a.max_x + 1, b.x - 1, a.y, b.y, z, "x")
            candidates.append(("east", "west", gap + vertical, route, ((a.id, "east", (a.max_x, a.y + 1, z)), (b.id, "west", (b.x, b.y + 1, z)))))

    if b.max_x < a.x:
        gap = a.x - b.max_x - 1
        vertical = abs(b.y - a.y)
        overlap = interval_overlap(a.z + 1, a.max_z - 1, b.z + 1, b.max_z - 1)
        if overlap and vertical <= gap:
            z = (overlap[0] + overlap[1]) // 2
            route = stair_route_between(a.x - 1, b.max_x + 1, a.y, b.y, z, "x")
            candidates.append(("west", "east", gap + vertical, route, ((a.id, "west", (a.x, a.y + 1, z)), (b.id, "east", (b.max_x, b.y + 1, z)))))

    if a.max_z < b.z:
        gap = b.z - a.max_z - 1
        vertical = abs(b.y - a.y)
        overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
        if overlap and vertical <= gap:
            x = (overlap[0] + overlap[1]) // 2
            route = stair_route_between(a.max_z + 1, b.z - 1, a.y, b.y, x, "z")
            candidates.append(("south", "north", gap + vertical, route, ((a.id, "south", (x, a.y + 1, a.max_z)), (b.id, "north", (x, b.y + 1, b.z)))))

    if b.max_z < a.z:
        gap = a.z - b.max_z - 1
        vertical = abs(b.y - a.y)
        overlap = interval_overlap(a.x + 1, a.max_x - 1, b.x + 1, b.max_x - 1)
        if overlap and vertical <= gap:
            x = (overlap[0] + overlap[1]) // 2
            route = stair_route_between(a.z - 1, b.max_z + 1, a.y, b.y, x, "z")
            candidates.append(("north", "south", gap + vertical, route, ((a.id, "north", (x, a.y + 1, a.z)), (b.id, "south", (x, b.y + 1, b.max_z)))))

    valid = [
        (a_side, b_side, distance, route, doors)
        for a_side, b_side, distance, route, doors in candidates
        if LONG_CONNECTION_MIN_ROUTE <= len(route) <= LONG_CONNECTION_MAX_ROUTE
    ]
    if not valid:
        return None
    a_side, b_side, distance, route, doors = min(valid, key=lambda item: item[2])
    return ConnectionCandidate("long_stair", a.id, b.id, a_side, b_side, distance, route, doors)


def long_ladder_candidates(a: House, b: House) -> list[ConnectionCandidate]:
    candidates = []
    for candidate in ladder_candidates(a, b):
        route_length = len(candidate.route)
        if LONG_CONNECTION_MIN_ROUTE <= route_length <= LONG_CONNECTION_MAX_ROUTE:
            candidates.append(
                ConnectionCandidate(
                    "long_ladder",
                    candidate.a,
                    candidate.b,
                    candidate.a_side,
                    candidate.b_side,
                    candidate.distance,
                    candidate.route,
                    candidate.doors,
                )
            )
    return candidates


def long_connection_candidates(houses: list[House]) -> list[ConnectionCandidate]:
    candidates = []
    for index, house in enumerate(houses):
        for other in houses[index + 1 :]:
            for candidate in (
                long_horizontal_candidate(house, other),
                long_stair_candidate(house, other),
            ):
                if candidate:
                    candidates.append(candidate)
            candidates.extend(long_ladder_candidates(house, other))
    return candidates


def connection_candidates(houses: list[House]) -> list[ConnectionCandidate]:
    candidates = []
    for index, house in enumerate(houses):
        for other in houses[index + 1 :]:
            horizontal = horizontal_candidate(house, other)
            if horizontal:
                candidates.append(horizontal)
            stair = stair_candidate(house, other)
            if stair:
                candidates.append(stair)
            candidates.extend(ladder_candidates(house, other))
    return candidates


def in_zone(cell: tuple[int, int, int], zone: Zone) -> bool:
    x, y, z = cell
    return 0 <= x < zone.length and 0 <= y < zone.height and 0 <= z < zone.width


def connection_is_ladder(connection: ConnectionCandidate) -> bool:
    return connection.kind in {"ladder", "long_ladder"}


def connection_is_stair(connection: ConnectionCandidate) -> bool:
    return connection.kind in {"stair", "long_stair"}


def connection_clear_height(connection: ConnectionCandidate) -> int:
    return STAIR_CLEAR_HEIGHT if connection_is_stair(connection) else BRIDGE_CLEAR_HEIGHT


def route_axes_at(route: tuple[tuple[int, int, int], ...], index: int) -> set[str]:
    axes = set()
    x, _y, z = route[index]
    for neighbor_index in (index - 1, index + 1):
        if neighbor_index < 0 or neighbor_index >= len(route):
            continue
        nx, _ny, nz = route[neighbor_index]
        if nx != x:
            axes.add("x")
        if nz != z:
            axes.add("z")
    return axes or {"x"}


def bridge_floor_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    cells = set()
    half_width = BRIDGE_WIDTH // 2
    for index, (x, y, z) in enumerate(connection.route):
        axes = route_axes_at(connection.route, index)
        if "x" in axes:
            for dz in range(-half_width, half_width + 1):
                cells.add((x, y, z + dz))
        if "z" in axes:
            for dx in range(-half_width, half_width + 1):
                cells.add((x + dx, y, z))
    return cells


def bridge_volume_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    cells = set()
    clear_height = connection_clear_height(connection)
    for x, y, z in bridge_floor_cells(connection):
        for dy in range(clear_height):
            cells.add((x, y + dy, z))
    return cells


def bridge_render_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    cells = set()
    half_width = BRIDGE_WIDTH // 2
    clear_height = connection_clear_height(connection)
    for index, (x, y, z) in enumerate(connection.route):
        axes = route_axes_at(connection.route, index)
        for axis in axes:
            for offset in range(-half_width, half_width + 1):
                if axis == "x":
                    cell_x, cell_z = x, z + offset
                else:
                    cell_x, cell_z = x + offset, z

                cells.add((cell_x, y, cell_z))
                cells.add((cell_x, y + clear_height - 1, cell_z))
                if offset != 0:
                    for dy in range(1, clear_height - 1):
                        cells.add((cell_x, y + dy, cell_z))

    for x, y, z in connection.route:
        for dy in range(1, clear_height - 1):
            cells.discard((x, y + dy, z))
    return cells


def ladder_bounds(connection: ConnectionCandidate) -> tuple[int, int, int, int]:
    x, _y, z = connection.route[0]
    ys = [cell[1] for cell in connection.route]
    return x, z, min(ys), max(ys)


def ladder_access_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    cells = set()
    for _house_id, side, (door_x, door_y, door_z) in connection.doors:
        if side == "west":
            opening_x, opening_z = door_x - 1, door_z
        elif side == "east":
            opening_x, opening_z = door_x + 1, door_z
        elif side == "north":
            opening_x, opening_z = door_x, door_z - 1
        else:
            opening_x, opening_z = door_x, door_z + 1

        for y in range(door_y, door_y + 3):
            cells.add((opening_x, y, opening_z))
    return cells


def ladder_floor_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    cells = set()
    x, z, first_y, _last_y = ladder_bounds(connection)
    half_width = LADDER_SHAFT_SIZE // 2
    floor_y = first_y - 1
    for dx in range(-half_width, half_width + 1):
        for dz in range(-half_width, half_width + 1):
            cells.add((x + dx, floor_y, z + dz))
    return cells


def ladder_wall_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    cells = set()
    x, z, first_y, last_y = ladder_bounds(connection)
    half_width = LADDER_SHAFT_SIZE // 2
    for y in range(first_y, last_y + 3):
        for dx in range(-half_width, half_width + 1):
            for dz in range(-half_width, half_width + 1):
                if dx == 0 and dz == 0:
                    continue
                cells.add((x + dx, y, z + dz))
    cells.difference_update(ladder_access_cells(connection))
    return cells


def ladder_line_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    return set(connection.route)


def ladder_top_air_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    x, z, _first_y, last_y = ladder_bounds(connection)
    return {(x, last_y + 1, z), (x, last_y + 2, z)}


def ladder_ceiling_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    cells = set()
    x, z, _first_y, last_y = ladder_bounds(connection)
    half_width = LADDER_SHAFT_SIZE // 2
    ceiling_y = last_y + 3
    for dx in range(-half_width, half_width + 1):
        for dz in range(-half_width, half_width + 1):
            cells.add((x + dx, ceiling_y, z + dz))
    return cells


def ladder_volume_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    cells = set()
    x, z, first_y, last_y = ladder_bounds(connection)
    half_width = LADDER_SHAFT_SIZE // 2
    for y in range(first_y - 1, last_y + 4):
        for dx in range(-half_width, half_width + 1):
            for dz in range(-half_width, half_width + 1):
                cells.add((x + dx, y, z + dz))
    return cells


def connection_render_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    if connection_is_ladder(connection):
        return (
            ladder_floor_cells(connection)
            | ladder_wall_cells(connection)
            | ladder_line_cells(connection)
            | ladder_ceiling_cells(connection)
        )
    return bridge_render_cells(connection)


def connection_volume_cells(connection: ConnectionCandidate) -> set[tuple[int, int, int]]:
    if connection_is_ladder(connection):
        return ladder_volume_cells(connection)
    return bridge_volume_cells(connection)


def connection_block_kind(connection: ConnectionCandidate) -> str:
    if connection.kind.startswith("long_"):
        return "long_connection"
    if connection.kind in {"ladder", "stair"}:
        return connection.kind
    return "corridor"


def stair_floor_direction(connection: ConnectionCandidate) -> str:
    start = connection.route[0]
    end = connection.route[-1]
    if end[1] < start[1]:
        start, end = end, start
    dx = end[0] - start[0]
    dz = end[2] - start[2]
    if abs(dx) >= abs(dz):
        return "east" if dx >= 0 else "west"
    return "south" if dz >= 0 else "north"


def route_is_clear(
    connection: ConnectionCandidate,
    blocked: set[tuple[int, int, int]],
    connector_blocks: set[tuple[int, int, int]],
    zone: Zone,
    avoid_connectors: bool = True,
) -> bool:
    ladder_centers = set(connection.route) if connection_is_ladder(connection) else set()
    for cell in connection_volume_cells(connection):
        if not in_zone(cell, zone):
            return False
        if cell in blocked:
            return False
        if cell in ladder_centers and cell in connector_blocks:
            return False
        if avoid_connectors and cell in connector_blocks:
            return False
    return True


def carve_door(blocks: dict[tuple[int, int, int], str], door: tuple[int, str, tuple[int, int, int]]) -> None:
    _house_id, _side, (x, y, z) = door
    for dy in range(3):
        blocks.pop((x, y + dy, z), None)


def draw_connection(
    blocks: dict[tuple[int, int, int], str],
    connection: ConnectionCandidate,
    connector_blocks: set[tuple[int, int, int]],
) -> None:
    if connection_is_ladder(connection):
        for cell in ladder_floor_cells(connection):
            blocks[cell] = "corridor"
        for cell in ladder_wall_cells(connection):
            blocks[cell] = "corridor"
        for cell in ladder_ceiling_cells(connection):
            blocks[cell] = "corridor"
        for cell in ladder_line_cells(connection):
            blocks[cell] = "ladder"
        connector_blocks.update(connection_volume_cells(connection))
        for door in connection.doors:
            carve_door(blocks, door)
        return

    kind = connection_block_kind(connection)
    rendered_cells = connection_render_cells(connection)
    for cell in rendered_cells:
        blocks[cell] = kind
    connector_blocks.update(connection_volume_cells(connection))
    for door in connection.doors:
        carve_door(blocks, door)


def select_connections(
    houses: list[House],
    candidates: list[ConnectionCandidate],
    blocks: dict[tuple[int, int, int], str],
    blocked: set[tuple[int, int, int]],
    rng: random.Random,
    zone: Zone,
) -> list[ConnectionCandidate]:
    selected = []
    connector_blocks: set[tuple[int, int, int]] = set()
    by_pair = sorted(candidates, key=lambda item: (item.distance + rng.random() * 8, item.kind != "door"))

    def try_pass(limit: int, only_components: bool) -> None:
        union = UnionFind(len(houses))
        for connection in selected:
            union.union(connection.a, connection.b)

        for candidate in by_pair:
            if only_components and union.find(candidate.a) == union.find(candidate.b):
                continue
            house_a = houses[candidate.a]
            house_b = houses[candidate.b]
            if not side_opening_allowed(house_a, candidate.a_side, limit):
                continue
            if not side_opening_allowed(house_b, candidate.b_side, limit):
                continue
            if not route_is_clear(candidate, blocked, connector_blocks, zone):
                continue

            register_opening(house_a, candidate.a_side, len(selected))
            register_opening(house_b, candidate.b_side, len(selected))
            draw_connection(blocks, candidate, connector_blocks)
            selected.append(candidate)
            union.union(candidate.a, candidate.b)

            if only_components and union.component_count() == 1:
                break

    try_pass(PREFERRED_MAX_OPENINGS, only_components=True)
    if connected_house_ids(len(houses), selected) != set(range(len(houses))):
        try_pass(FORCED_MAX_OPENINGS, only_components=True)
    force_connect_remaining(houses, by_pair, selected, blocks, blocked, connector_blocks, zone)
    try_pass(PREFERRED_MAX_OPENINGS, only_components=False)
    return selected


def force_connect_remaining(
    houses: list[House],
    candidates: list[ConnectionCandidate],
    selected: list[ConnectionCandidate],
    blocks: dict[tuple[int, int, int], str],
    blocked: set[tuple[int, int, int]],
    connector_blocks: set[tuple[int, int, int]],
    zone: Zone,
) -> None:
    selected_pairs = {tuple(sorted((connection.a, connection.b))) for connection in selected}

    def current_union() -> UnionFind:
        union = UnionFind(len(houses))
        for connection in selected:
            union.union(connection.a, connection.b)
        return union

    for allow_duplicate_side, opening_limit, avoid_connectors in (
        (False, FORCED_MAX_OPENINGS, True),
        (True, FORCED_MAX_OPENINGS, True),
        (True, FORCED_MAX_OPENINGS + 2, True),
    ):
        progress = True
        while progress:
            union = current_union()
            if union.component_count() == 1:
                return
            progress = False

            for candidate in candidates:
                pair_key = tuple(sorted((candidate.a, candidate.b)))
                if pair_key in selected_pairs:
                    continue
                if union.find(candidate.a) == union.find(candidate.b):
                    continue

                house_a = houses[candidate.a]
                house_b = houses[candidate.b]
                if len(house_a.openings) >= opening_limit or len(house_b.openings) >= opening_limit:
                    continue
                if not allow_duplicate_side and (candidate.a_side in house_a.openings or candidate.b_side in house_b.openings):
                    continue
                if not route_is_clear(candidate, blocked, connector_blocks, zone, avoid_connectors=avoid_connectors):
                    continue

                register_opening(house_a, candidate.a_side, len(selected), allow_duplicate_side)
                register_opening(house_b, candidate.b_side, len(selected), allow_duplicate_side)
                draw_connection(blocks, candidate, connector_blocks)
                selected.append(candidate)
                selected_pairs.add(pair_key)
                progress = True
                break


def connector_blocks_from_connections(connections: list[ConnectionCandidate]) -> set[tuple[int, int, int]]:
    blocks = set()
    for connection in connections:
        blocks.update(connection_volume_cells(connection))
    return blocks


def long_route_is_clear(
    connection: ConnectionCandidate,
    blocked: set[tuple[int, int, int]],
    connector_blocks: set[tuple[int, int, int]],
    zone: Zone,
) -> bool:
    for cell in connection_volume_cells(connection):
        if not in_zone(cell, zone):
            return False
        if cell in connector_blocks:
            return False
        if cell in blocked:
            return False
    return True


def add_long_connections(
    houses: list[House],
    existing_connections: list[ConnectionCandidate],
    blocks: dict[tuple[int, int, int], str],
    blocked: set[tuple[int, int, int]],
    rng: random.Random,
    zone: Zone,
) -> list[ConnectionCandidate]:
    selected_pairs = {tuple(sorted((connection.a, connection.b))) for connection in existing_connections}
    connector_blocks = connector_blocks_from_connections(existing_connections)
    target = rng.randrange(LONG_CONNECTION_MIN, LONG_CONNECTION_MAX + 1)
    candidates = long_connection_candidates(houses)
    rng.shuffle(candidates)
    candidates.sort(key=lambda candidate: (-len(candidate.route), candidate.distance))

    selected = []
    for candidate in candidates:
        if len(selected) >= target:
            break
        pair_key = tuple(sorted((candidate.a, candidate.b)))
        if pair_key in selected_pairs:
            continue

        house_a = houses[candidate.a]
        house_b = houses[candidate.b]
        if len(house_a.openings) >= LONG_CONNECTION_OPENING_LIMIT:
            continue
        if len(house_b.openings) >= LONG_CONNECTION_OPENING_LIMIT:
            continue
        if not long_route_is_clear(candidate, blocked, connector_blocks, zone):
            continue

        register_opening(house_a, candidate.a_side, len(existing_connections) + len(selected), allow_duplicate_side=True)
        register_opening(house_b, candidate.b_side, len(existing_connections) + len(selected), allow_duplicate_side=True)
        draw_connection(blocks, candidate, connector_blocks)
        selected.append(candidate)
        selected_pairs.add(pair_key)

    return selected


def connected_house_ids(count: int, connections: list[ConnectionCandidate]) -> set[int]:
    graph = [[] for _ in range(count)]
    for connection in connections:
        graph[connection.a].append(connection.b)
        graph[connection.b].append(connection.a)

    seen = {0}
    queue = deque([0])
    while queue:
        current = queue.popleft()
        for other in graph[current]:
            if other not in seen:
                seen.add(other)
                queue.append(other)
    return seen


def add_house_shell(blocks: dict[tuple[int, int, int], str], house: House) -> None:
    for y in range(house.y, house.y + house.sy):
        for z in range(house.z, house.z + house.sz):
            for x in range(house.x, house.x + house.sx):
                on_shell = (
                    x == house.x
                    or x == house.max_x
                    or y == house.y
                    or y == house.max_y
                    or z == house.z
                    or z == house.max_z
                )
                if on_shell:
                    blocks[(x, y, z)] = "house"


def solid_house_blocks(houses: list[House]) -> set[tuple[int, int, int]]:
    blocked = set()
    for house in houses:
        for y in range(house.y, house.y + house.sy):
            for z in range(house.z, house.z + house.sz):
                for x in range(house.x, house.x + house.sx):
                    blocked.add((x, y, z))
    return blocked


def blocks_to_runs(blocks: dict[tuple[int, int, int], str]) -> list[dict]:
    by_yz_kind: dict[tuple[int, int, str], list[int]] = {}
    for (x, y, z), kind in blocks.items():
        by_yz_kind.setdefault((y, z, kind), []).append(x)

    runs = []
    for (y, z, kind), xs in sorted(by_yz_kind.items()):
        xs.sort()
        start = xs[0]
        previous = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == previous + 1:
                previous = x
                continue
            runs.append(
                {
                    "kind": kind,
                    "block": BLOCK_BY_KIND[kind],
                    "pos": [start, y, z],
                    "size": [previous - start + 1, 1, 1],
                }
            )
            if x is not None:
                start = previous = x
    return runs


def cells_to_runs(cells: set[tuple[int, int, int]], kind: str) -> list[dict]:
    by_yz: dict[tuple[int, int], list[int]] = {}
    for x, y, z in cells:
        by_yz.setdefault((y, z), []).append(x)

    runs = []
    for (y, z), xs in sorted(by_yz.items()):
        xs.sort()
        start = xs[0]
        previous = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == previous + 1:
                previous = x
                continue
            runs.append(
                {
                    "kind": kind,
                    "block": BLOCK_BY_KIND[kind],
                    "pos": [start, y, z],
                    "size": [previous - start + 1, 1, 1],
                }
            )
            if x is not None:
                start = previous = x
    return runs


def minecraft_air_cells(payload: dict) -> set[tuple[int, int, int]]:
    cells = set()
    for house in payload["houses"]:
        x, y, z = house["pos"]
        sx, sy, sz = house["size"]
        for cy in range(y + 1, y + sy - 1):
            for cz in range(z + 1, z + sz - 1):
                for cx in range(x + 1, x + sx - 1):
                    cells.add((cx, cy, cz))

    for connection in payload["connections"]:
        kind = connection["kind"]
        route = [tuple(cell) for cell in connection["route"]]
        clear_height = STAIR_CLEAR_HEIGHT if kind in {"stair", "long_stair"} else BRIDGE_CLEAR_HEIGHT
        if kind not in {"ladder", "long_ladder"}:
            for x, y, z in route:
                for dy in range(1, clear_height - 1):
                    cells.add((x, y + dy, z))
        else:
            ladder_connection = ConnectionCandidate(
                kind,
                connection["from"],
                connection["to"],
                connection["from_side"],
                connection["to_side"],
                connection["distance"],
                tuple(route),
                tuple(
                    (door["house"], door["side"], tuple(door["pos"]))
                    for door in connection["doors"]
                ),
            )
            cells.update(ladder_access_cells(ladder_connection))
            cells.update(ladder_top_air_cells(ladder_connection))

        for door in connection["doors"]:
            x, y, z = door["pos"]
            for dy in range(3):
                cells.add((x, y + dy, z))

    return cells


def build_minecraft_export(payload: dict) -> dict:
    zone_size = payload["zone"]["size"]
    base_run = {
        "kind": "base",
        "block": BLOCK_BY_KIND["base"],
        "pos": [0, 0, 0],
        "size": zone_size,
    }
    air_runs = cells_to_runs(minecraft_air_cells(payload), "air")
    runs = [base_run, *air_runs, *payload["runs"]]
    return {
        "version": 1,
        "type": "dense_house_test_1_minecraft_export",
        "units": payload["units"],
        "operation_order": "apply runs in order; later runs overwrite earlier runs",
        "zone": payload["zone"],
        "settings": payload["settings"],
        "stats": {
            **payload["stats"],
            "minecraft_runs": len(runs),
            "air_runs": len(air_runs),
        },
        "runs": runs,
    }


def houses_bounds(houses: list[House]) -> dict:
    if not houses:
        return {"min": [0, 0, 0], "max": [0, 0, 0], "span": [0, 0, 0]}
    min_x = min(house.x for house in houses)
    min_y = min(house.y for house in houses)
    min_z = min(house.z for house in houses)
    max_x = max(house.max_x for house in houses)
    max_y = max(house.max_y for house in houses)
    max_z = max(house.max_z for house in houses)
    return {
        "min": [min_x, min_y, min_z],
        "max": [max_x, max_y, max_z],
        "span": [max_x - min_x + 1, max_y - min_y + 1, max_z - min_z + 1],
    }


def connection_to_payload(connection: ConnectionCandidate) -> dict:
    return {
        "kind": connection.kind,
        "from": connection.a,
        "to": connection.b,
        "from_side": connection.a_side,
        "to_side": connection.b_side,
        "distance": connection.distance,
        "route": [list(cell) for cell in connection.route],
        "doors": [
            {"house": house_id, "side": side, "pos": list(pos)}
            for house_id, side, pos in connection.doors
        ],
    }


def build_dense_payload(seed: int, target: int, zone: Zone) -> dict:
    best_payload = None
    for retry in range(8):
        rng = random.Random(seed + retry * 10_003)
        houses = place_houses(zone, rng, target)
        blocks: dict[tuple[int, int, int], str] = {}
        for house in houses:
            add_house_shell(blocks, house)

        blocked = solid_house_blocks(houses)
        candidates = connection_candidates(houses)
        connections = select_connections(houses, candidates, blocks, blocked, rng, zone)
        long_connections = add_long_connections(houses, connections, blocks, blocked, rng, zone)
        connections.extend(long_connections)
        reachable = connected_house_ids(len(houses), connections)
        runs = blocks_to_runs(blocks)
        bounds = houses_bounds(houses)
        payload = {
            "version": 1,
            "type": "dense_house_test_1",
            "units": "blocks",
            "zone": {
                "size": [zone.length, zone.height, zone.width],
                "axes": {"length": "x", "height": "y", "width": "z"},
            },
            "settings": {
                "seed": seed,
                "retry": retry,
                "target_houses": target,
                "house_size": {
                    "x_z": [HOUSE_MIN_XZ, HOUSE_MAX_XZ],
                    "y": [HOUSE_MIN_Y, HOUSE_MAX_Y],
                },
                "preferred_max_openings": PREFERRED_MAX_OPENINGS,
                "forced_max_openings": FORCED_MAX_OPENINGS,
            },
            "stats": {
                "houses": len(houses),
                "connections": len(connections),
                "door_connections": sum(1 for connection in connections if connection.kind == "door"),
                "stair_connections": sum(1 for connection in connections if connection.kind == "stair"),
                "ladder_connections": sum(1 for connection in connections if connection.kind == "ladder"),
                "long_connections": sum(1 for connection in connections if connection.kind.startswith("long_")),
                "long_bridge_connections": sum(1 for connection in connections if connection.kind == "long_bridge"),
                "long_stair_connections": sum(1 for connection in connections if connection.kind == "long_stair"),
                "long_ladder_connections": sum(1 for connection in connections if connection.kind == "long_ladder"),
                "candidate_connections": len(candidates),
                "connected": len(reachable) == len(houses),
                "reachable_houses": len(reachable),
                "max_openings_on_house": max((len(house.openings) for house in houses), default=0),
                "bounds": bounds,
                "coverage_ratio": [
                    round(bounds["span"][0] / zone.length, 3),
                    round(bounds["span"][1] / zone.height, 3),
                    round(bounds["span"][2] / zone.width, 3),
                ],
                "blocks": len(blocks),
                "runs": len(runs),
            },
            "houses": [
                {
                    "id": house.id,
                    "pos": [house.x, house.y, house.z],
                    "size": [house.sx, house.sy, house.sz],
                    "openings": dict(sorted(house.openings.items())),
                }
                for house in houses
            ],
            "connections": [connection_to_payload(connection) for connection in connections],
            "runs": runs,
        }

        best_payload = payload
        if payload["stats"]["connected"]:
            return payload

    return best_payload if best_payload is not None else {}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genere une zone dense de houses connectees.")
    parser.add_argument("--length", type=int, default=ZONE_LENGTH)
    parser.add_argument("--width", type=int, default=ZONE_WIDTH)
    parser.add_argument("--height", type=int, default=ZONE_HEIGHT)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--houses", type=int, default=HOUSE_COUNT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--minecraft-out", type=Path, default=DEFAULT_MINECRAFT_OUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_dense_payload(args.seed, args.houses, Zone(args.length, args.width, args.height))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    minecraft_payload = build_minecraft_export(payload)
    args.minecraft_out.parent.mkdir(parents=True, exist_ok=True)
    args.minecraft_out.write_text(json.dumps(minecraft_payload, separators=(",", ":")), encoding="utf-8")
    stats = payload["stats"]
    print(f"{stats['houses']} houses")
    print(
        f"{stats['connections']} connexions "
        f"({stats['door_connections']} portes, {stats['stair_connections']} escaliers, "
        f"{stats['ladder_connections']} echelles, {stats['long_connections']} longues rouges)"
    )
    print(f"connecte: {stats['connected']} ({stats['reachable_houses']}/{stats['houses']})")
    print(f"{stats['blocks']} blocks compresses en {stats['runs']} runs")
    print(f"export: {args.out}")
    print(f"export minecraft: {args.minecraft_out}")


if __name__ == "__main__":
    main()
