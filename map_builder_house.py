from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path


ZONE_LENGTH = 1000
ZONE_WIDTH = 300
ZONE_HEIGHT = 120

DEFAULT_SEED = 42
DEFAULT_OUT = Path("exports/house_zone.json")
COMPARE_GAP = 50

WALL_THICKNESS = 1
HOUSE_MIN_WIDTH = 12
HOUSE_MAX_WIDTH = 46
FLOOR_STEP = 5
HOUSE_MIN_FLOORS = 1
HOUSE_MAX_FLOORS = 6
HOUSE_MIN_HEIGHT = HOUSE_MIN_FLOORS * FLOOR_STEP + 1
HOUSE_MAX_HEIGHT = HOUSE_MAX_FLOORS * FLOOR_STEP + 1
HOUSE_MIN_DEPTH = 4
HOUSE_MAX_DEPTH = 10
HOUSE_CHAIN_ATTEMPTS = 80
HOUSE_ROOT_SPACING = 150
HOUSE_CHAIN_MIN = 5
HOUSE_CHAIN_MAX = 11
HOUSE_CONNECT_MAX_DISTANCE = 50
HOUSE_MAX_CONNECTIONS_PER_HOUSE = 2
HOUSE_BRIDGE_WIDTH = 1
HOUSE_CONNECTION_OUT = 1
HOUSE_DOOR_HEIGHT = 3
WINDOW_WIDTH = 2
WINDOW_HEIGHT = 2
WINDOW_GAP = 5

BLOCK_BY_KIND = {
    "wall": "minecraft:stone_bricks",
    "house": "minecraft:stone",
    "house_close": "minecraft:stone",
    "house_wide": "minecraft:stone",
    "house_bridge": "minecraft:stone_slab",
    "house_stair": "minecraft:stone_stairs",
    "window": "minecraft:black_stained_glass",
}


@dataclass(frozen=True)
class Zone:
    length: int = ZONE_LENGTH
    width: int = ZONE_WIDTH
    height: int = ZONE_HEIGHT


@dataclass(frozen=True)
class WallSide:
    name: str
    axis: str
    fixed: int
    normal: tuple[int, int]
    start: int
    end: int


@dataclass(frozen=True)
class HouseVolume:
    side: str
    chain: int
    along: int
    y: int
    out: int
    width: int
    height: int
    depth: int


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def add_block(blocks: dict[tuple[int, int, int], str], zone: Zone, x: int, y: int, z: int, kind: str) -> None:
    if 0 <= x < zone.length and 0 <= y < zone.height and 0 <= z < zone.width:
        blocks[(x, y, z)] = kind


def add_box(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    x0: int,
    y0: int,
    z0: int,
    sx: int,
    sy: int,
    sz: int,
    kind: str,
) -> None:
    for y in range(y0, y0 + sy):
        for z in range(z0, z0 + sz):
            for x in range(x0, x0 + sx):
                add_block(blocks, zone, x, y, z, kind)


def remove_box_kind(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    x0: int,
    y0: int,
    z0: int,
    sx: int,
    sy: int,
    sz: int,
    kind: str,
) -> None:
    for y in range(y0, y0 + sy):
        for z in range(z0, z0 + sz):
            for x in range(x0, x0 + sx):
                if 0 <= x < zone.length and 0 <= y < zone.height and 0 <= z < zone.width:
                    if blocks.get((x, y, z)) == kind:
                        blocks.pop((x, y, z))


def add_block_if_open(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    x: int,
    y: int,
    z: int,
    kind: str,
) -> bool:
    if not (0 <= x < zone.length and 0 <= y < zone.height and 0 <= z < zone.width):
        return False
    if blocks.get((x, y, z)) in {"house", "window", "house_bridge", "house_stair"}:
        return False
    blocks[(x, y, z)] = kind
    return True


def add_walls(blocks: dict[tuple[int, int, int], str], zone: Zone, profile: str = "close") -> None:
    add_box(blocks, zone, 0, 0, 0, zone.length, zone.height, WALL_THICKNESS, "wall")
    add_box(blocks, zone, 0, 0, zone.width - WALL_THICKNESS, zone.length, zone.height, WALL_THICKNESS, "wall")
    add_box(blocks, zone, 0, 0, 0, WALL_THICKNESS, zone.height, zone.width, "wall")
    add_box(blocks, zone, zone.length - WALL_THICKNESS, 0, 0, WALL_THICKNESS, zone.height, zone.width, "wall")


def wall_sides(zone: Zone) -> tuple[WallSide, ...]:
    corner_margin = WALL_THICKNESS + HOUSE_MAX_DEPTH + 12
    return (
        WallSide("north", "x", 0, (0, 1), corner_margin, zone.length - corner_margin),
        WallSide("south", "x", zone.width - 1, (0, -1), corner_margin, zone.length - corner_margin),
        WallSide("west", "z", 0, (1, 0), corner_margin, zone.width - corner_margin),
        WallSide("east", "z", zone.length - 1, (-1, 0), corner_margin, zone.width - corner_margin),
    )


def wall_sides_for_profile(zone: Zone, profile: str) -> tuple[WallSide, ...]:
    sides = wall_sides(zone)
    return sides


def world_box_for_house(
    zone: Zone,
    side: WallSide,
    along: int,
    y: int,
    out: int,
    width: int,
    height: int,
    depth: int,
) -> tuple[int, int, int, int, int, int]:
    if side.axis == "x":
        z0 = side.fixed if side.normal[1] > 0 else side.fixed - depth + 1
        return along, y, z0, width, height, depth

    x0 = side.fixed if side.normal[0] > 0 else side.fixed - depth + 1
    return x0, y, along, depth, height, width


def volumes_overlap(a: HouseVolume, b: HouseVolume) -> bool:
    if a.side != b.side:
        return False
    return (
        a.along < b.along + b.width
        and a.along + a.width > b.along
        and a.y < b.y + b.height
        and a.y + a.height > b.y
        and 0 < b.depth
        and a.depth > 0
    )


def house_can_fit(zone: Zone, side: WallSide, placed: list[HouseVolume], house: HouseVolume) -> bool:
    if house.along < side.start or house.along + house.width > side.end:
        return False
    if house.y < 1 or house.y + house.height >= zone.height:
        return False
    if house.out != 0:
        return False
    if house.depth < HOUSE_MIN_DEPTH or house.depth > HOUSE_MAX_DEPTH:
        return False

    x0, y0, z0, sx, sy, sz = world_box_for_house(
        zone,
        side,
        house.along,
        house.y,
        house.out,
        house.width,
        house.height,
        house.depth,
    )
    if x0 < 0 or y0 < 0 or z0 < 0 or x0 + sx > zone.length or y0 + sy > zone.height or z0 + sz > zone.width:
        return False
    return not any(volumes_overlap(house, existing) for existing in placed)


def floor_count_for_height(height: int) -> int:
    return max(1, (height - 1) // FLOOR_STEP)


def height_for_floors(floors: int) -> int:
    return floors * FLOOR_STEP + 1


def floor_levels(house: HouseVolume) -> list[int]:
    return [house.y + floor * FLOOR_STEP for floor in range(floor_count_for_height(house.height))]


def is_house_floor_level(house: HouseVolume, y: int) -> bool:
    return y in set(floor_levels(house))


def add_house_shell(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    house: HouseVolume,
) -> None:
    x0, y0, z0, sx, sy, sz = world_box_for_house(
        zone, side, house.along, house.y, house.out, house.width, house.height, house.depth
    )
    remove_box_kind(blocks, zone, x0, y0, z0, sx, sy, sz, "wall")

    for floor in range(floor_count_for_height(house.height) + 1):
        floor_y = house.y + floor * FLOOR_STEP
        if floor_y <= house.y + house.height - 1:
            add_box(blocks, zone, x0, floor_y, z0, sx, 1, sz, "house")

    if side.axis == "x":
        facade_z = z0 + sz - 1 if side.normal[1] > 0 else z0
        back_z = z0 if side.normal[1] > 0 else z0 + sz - 1
        add_box(blocks, zone, x0, house.y, back_z, sx, house.height, 1, "house")
        add_box(blocks, zone, x0, house.y, z0, 1, house.height, sz, "house")
        add_box(blocks, zone, x0 + sx - 1, house.y, z0, 1, house.height, sz, "house")
        add_box(blocks, zone, x0, house.y, facade_z, sx, house.height, 1, "house")
        add_windows(blocks, zone, side, facade_z, house.y, x0, house.width, house.height)
        return

    facade_x = x0 + sx - 1 if side.normal[0] > 0 else x0
    back_x = x0 if side.normal[0] > 0 else x0 + sx - 1
    add_box(blocks, zone, back_x, house.y, z0, 1, house.height, sz, "house")
    add_box(blocks, zone, x0, house.y, z0, sx, house.height, 1, "house")
    add_box(blocks, zone, x0, house.y, z0 + sz - 1, sx, house.height, 1, "house")
    add_box(blocks, zone, facade_x, house.y, z0, 1, house.height, sz, "house")
    add_windows(blocks, zone, side, facade_x, house.y, z0, house.width, house.height)


def add_windows(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    facade_fixed: int,
    y0: int,
    along0: int,
    width: int,
    height: int,
) -> None:
    for floor in range(floor_count_for_height(height)):
        floor_y = y0 + floor * FLOOR_STEP
        wy = floor_y + 2
        if wy + WINDOW_HEIGHT > floor_y + 4:
            continue
        position = along0 + 4
        while position + WINDOW_WIDTH < along0 + width - 3:
            if side.axis == "x":
                add_box(blocks, zone, position, wy, facade_fixed, WINDOW_WIDTH, WINDOW_HEIGHT, 1, "window")
            else:
                add_box(blocks, zone, facade_fixed, wy, position, 1, WINDOW_HEIGHT, WINDOW_WIDTH, "window")
            position += WINDOW_WIDTH + WINDOW_GAP


def add_house_relief(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    rng: random.Random,
    house: HouseVolume,
) -> None:
    return None


def house_to_payload(zone: Zone, side: WallSide, house: HouseVolume) -> dict:
    return {
        "side": house.side,
        "chain": house.chain,
        "local": {
            "along": house.along,
            "y": house.y,
            "out": house.out,
            "floors": floor_count_for_height(house.height),
            "size": [house.width, house.height, house.depth],
        },
        "box": list(world_box_for_house(zone, side, house.along, house.y, house.out, house.width, house.height, house.depth)),
    }


def local_surface_to_world(
    zone: Zone,
    side: WallSide,
    along: int,
    y: int,
    out: int,
) -> tuple[int, int, int]:
    if side.axis == "x":
        z = side.fixed + out if side.normal[1] > 0 else side.fixed - out
        return along, y, z

    x = side.fixed + out if side.normal[0] > 0 else side.fixed - out
    return x, y, along


def add_surface_platform_block(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    along: int,
    y: int,
    out: int,
    kind: str,
) -> int:
    added = 0
    for width_offset in range(HOUSE_BRIDGE_WIDTH):
        x, by, z = local_surface_to_world(zone, side, along, y, max(0, out - width_offset))
        if add_block_if_open(blocks, zone, x, by, z, kind):
            added += 1
    return added


def remove_local_house_blocks(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    along: int,
    y: int,
    out: int,
    height: int,
) -> None:
    for dy in range(height):
        x, by, z = local_surface_to_world(zone, side, along, y + dy, out)
        if blocks.get((x, by, z)) in {"house", "window"}:
            blocks.pop((x, by, z))


def connection_door_data(
    a: HouseVolume,
    b: HouseVolume,
    route: list[tuple[int, int]],
) -> tuple[tuple[HouseVolume, int, int], tuple[HouseVolume, int, int]] | None:
    if not route:
        return None
    if a.along + a.width <= b.along:
        return (a, a.along + a.width - 1, route[0][1]), (b, b.along, route[-1][1])
    if b.along + b.width <= a.along:
        return (b, b.along + b.width - 1, route[0][1]), (a, a.along, route[-1][1])
    return None


def route_touches_house_floors(a: HouseVolume, b: HouseVolume, route: list[tuple[int, int]]) -> bool:
    doors = connection_door_data(a, b, route)
    if doors is None:
        return False
    (first, _first_along, first_y), (second, _second_along, second_y) = doors
    return is_house_floor_level(first, first_y) and is_house_floor_level(second, second_y)


def open_connection_doors(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    a: HouseVolume,
    b: HouseVolume,
    route: list[tuple[int, int]],
) -> None:
    doors = connection_door_data(a, b, route)
    if doors is None:
        return
    for house, along, floor_y in doors:
        max_out = min(house.depth - 1, HOUSE_CONNECTION_OUT + 1)
        for out in range(HOUSE_CONNECTION_OUT, max_out + 1):
            remove_local_house_blocks(blocks, zone, side, along, floor_y + 1, out, HOUSE_DOOR_HEIGHT)


def nearest_house_distance(a: HouseVolume, b: HouseVolume) -> int:
    along_gap = max(0, max(a.along, b.along) - min(a.along + a.width, b.along + b.width))
    vertical_gap = max(0, max(a.y, b.y) - min(a.y + a.height, b.y + b.height))
    return along_gap + vertical_gap


def along_gap_between(a: HouseVolume, b: HouseVolume) -> tuple[int, int] | None:
    if a.along + a.width <= b.along:
        return a.along + a.width, b.along - 1
    if b.along + b.width <= a.along:
        return b.along + b.width, a.along - 1
    return None


def overlap_center(start_a: int, size_a: int, start_b: int, size_b: int) -> int:
    start = max(start_a, start_b)
    end = min(start_a + size_a, start_b + size_b)
    if start < end:
        return (start + end) // 2
    return (start_a + size_a // 2 + start_b + size_b // 2) // 2


def horizontal_connection_route(a: HouseVolume, b: HouseVolume) -> tuple[list[tuple[int, int]], int] | None:
    gap = along_gap_between(a, b)
    if gap is None:
        return None
    start, end = gap
    if start > end:
        return None

    common_levels = sorted(set(floor_levels(a)).intersection(floor_levels(b)))
    if not common_levels:
        return None
    y = common_levels[len(common_levels) // 2]
    return [(along, y) for along in range(start, end + 1)], HOUSE_CONNECTION_OUT


def floor_pair_for_stair(a: HouseVolume, b: HouseVolume, horizontal_length: int) -> tuple[int, int] | None:
    pairs = []
    for ay in floor_levels(a):
        for by in floor_levels(b):
            vertical = abs(by - ay)
            if 0 < vertical <= horizontal_length:
                pairs.append((vertical, ay, by))
    if not pairs:
        return None
    _vertical, ay, by = min(pairs, key=lambda item: item[0])
    return ay, by


def stair_connection_route(a: HouseVolume, b: HouseVolume) -> tuple[list[tuple[int, int]], int] | None:
    gap = along_gap_between(a, b)
    if gap is None:
        return None
    start, end = gap
    if start > end:
        return None
    length = end - start + 1
    pair = floor_pair_for_stair(a, b, length)
    if pair is None:
        return None
    start_y, end_y = pair

    route = []
    steps = max(1, length - 1)
    for index, along in enumerate(range(start, end + 1)):
        y = round(start_y + (end_y - start_y) * (index / steps))
        route.append((along, y))

    return route, HOUSE_CONNECTION_OUT


def connection_can_fit(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    route: list[tuple[int, int]],
    out: int,
) -> bool:
    for along, y in route:
        for width_offset in range(HOUSE_BRIDGE_WIDTH):
            x, by, z = local_surface_to_world(zone, side, along, y, max(0, out - width_offset))
            if not (0 <= x < zone.length and 0 <= by < zone.height and 0 <= z < zone.width):
                return False
            if blocks.get((x, by, z)) in {"house", "window", "house_bridge", "house_stair"}:
                return False
    return True


def draw_connection(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    route: list[tuple[int, int]],
    out: int,
    kind: str,
) -> int:
    added = 0
    for along, y in route:
        added += add_surface_platform_block(blocks, zone, side, along, y, out, kind)
    return added


def add_house_connections(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    houses: list[HouseVolume],
) -> list[dict]:
    candidates = []
    for index, house in enumerate(houses):
        for other_index in range(index + 1, len(houses)):
            other = houses[other_index]
            distance = nearest_house_distance(house, other)
            if 0 < distance <= HOUSE_CONNECT_MAX_DISTANCE:
                candidates.append((distance, index, other_index))

    connections = []
    connection_count = {index: 0 for index in range(len(houses))}
    used_pairs = set()
    for distance, index, other_index in sorted(candidates):
        if connection_count[index] >= HOUSE_MAX_CONNECTIONS_PER_HOUSE:
            continue
        if connection_count[other_index] >= HOUSE_MAX_CONNECTIONS_PER_HOUSE:
            continue
        if (index, other_index) in used_pairs:
            continue

        route_data = horizontal_connection_route(houses[index], houses[other_index])
        kind = "house_bridge"
        if route_data is None:
            route_data = stair_connection_route(houses[index], houses[other_index])
            kind = "house_stair"
        if route_data is None:
            continue

        route, out = route_data
        if len(route) > HOUSE_CONNECT_MAX_DISTANCE + 1:
            continue
        if not route_touches_house_floors(houses[index], houses[other_index], route):
            continue
        if not connection_can_fit(blocks, zone, side, route, out):
            continue

        added = draw_connection(blocks, zone, side, route, out, kind)
        if added == 0:
            continue
        open_connection_doors(blocks, zone, side, houses[index], houses[other_index], route)

        used_pairs.add((index, other_index))
        connection_count[index] += 1
        connection_count[other_index] += 1
        connections.append(
            {
                "side": side.name,
                "kind": kind,
                "from": index,
                "to": other_index,
                "distance": distance,
                "out": out,
                "blocks": added,
                "route": [[along, y] for along, y in route],
            }
        )

    return connections


def random_size(rng: random.Random, parent: HouseVolume | None = None) -> tuple[int, int, int]:
    if parent is None:
        floors = rng.randrange(HOUSE_MIN_FLOORS, HOUSE_MAX_FLOORS + 1)
        return (
            rng.randrange(18, HOUSE_MAX_WIDTH + 1),
            height_for_floors(floors),
            rng.randrange(HOUSE_MIN_DEPTH, HOUSE_MAX_DEPTH + 1),
        )
    parent_floors = floor_count_for_height(parent.height)
    floors = clamp(parent_floors + rng.randrange(-1, 2), HOUSE_MIN_FLOORS, HOUSE_MAX_FLOORS)
    return (
        clamp(parent.width + rng.randrange(-10, 11), HOUSE_MIN_WIDTH, HOUSE_MAX_WIDTH),
        height_for_floors(floors),
        clamp(parent.depth + rng.randrange(-6, 7), HOUSE_MIN_DEPTH, HOUSE_MAX_DEPTH),
    )


def root_house(zone: Zone, side: WallSide, rng: random.Random, chain: int) -> HouseVolume:
    width, height, depth = random_size(rng)
    along = rng.randrange(side.start, max(side.start + 1, side.end - width))
    y = rng.randrange(2, max(3, zone.height - height - 2))
    return HouseVolume(side.name, chain, along, y, 0, width, height, depth)


def child_candidates(zone: Zone, parent: HouseVolume, rng: random.Random) -> list[HouseVolume]:
    candidates = []
    directions = ["left", "right", "up", "down", "left", "right", "up"]
    rng.shuffle(directions)

    for direction in directions:
        width, height, depth = random_size(rng, parent)
        out = 0
        y = clamp(parent.y + rng.randrange(-4, 5), 1, zone.height - height - 1)
        along = parent.along + rng.randrange(-max(1, width // 3), max(2, parent.width // 3 + 1))

        if direction == "left":
            along = parent.along - width
            y = clamp(parent.y + rng.choice((-FLOOR_STEP, 0, FLOOR_STEP)), 1, zone.height - height - 1)
        elif direction == "right":
            along = parent.along + parent.width
            y = clamp(parent.y + rng.choice((-FLOOR_STEP, 0, FLOOR_STEP)), 1, zone.height - height - 1)
        elif direction == "up":
            y = parent.y + parent.height
        elif direction == "down":
            y = parent.y - height

        candidates.append(HouseVolume(parent.side, parent.chain, along, y, out, width, height, depth))

    return candidates


def place_house(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    placed: list[HouseVolume],
    house: HouseVolume,
) -> bool:
    if not house_can_fit(zone, side, placed, house):
        return False
    placed.append(house)
    add_house_shell(blocks, zone, side, house)
    return True


def generate_house_chain(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    rng: random.Random,
    placed: list[HouseVolume],
    chain: int,
) -> list[HouseVolume]:
    root = None
    for _ in range(HOUSE_CHAIN_ATTEMPTS):
        candidate = root_house(zone, side, rng, chain)
        if place_house(blocks, zone, side, placed, candidate):
            root = candidate
            break
    if root is None:
        return []

    chain_houses = [root]
    frontier = [root]
    target = rng.randrange(HOUSE_CHAIN_MIN, HOUSE_CHAIN_MAX + 1)
    attempts = 0

    while len(chain_houses) < target and frontier and attempts < HOUSE_CHAIN_ATTEMPTS * 3:
        attempts += 1
        parent = rng.choice(frontier[-8:])
        placed_child = None
        for candidate in child_candidates(zone, parent, rng):
            if place_house(blocks, zone, side, placed, candidate):
                placed_child = candidate
                break

        if placed_child is None:
            if rng.random() < 0.35:
                frontier.remove(parent)
            continue

        chain_houses.append(placed_child)
        frontier.append(placed_child)

    for house in chain_houses:
        add_house_relief(blocks, zone, side, rng, house)

    return chain_houses


def generate_houses_on_side(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    side: WallSide,
    rng: random.Random,
    chain_start: int,
) -> tuple[list[dict], list[dict], int]:
    placed: list[HouseVolume] = []
    houses = []
    connections = []
    root_count = max(2, (side.end - side.start) // HOUSE_ROOT_SPACING)

    for offset in range(root_count):
        chain_id = chain_start + offset
        for house in generate_house_chain(blocks, zone, side, rng, placed, chain_id):
            houses.append(house_to_payload(zone, side, house))

    connections.extend(add_house_connections(blocks, zone, side, placed))
    return houses, connections, chain_start + root_count


def generate_house_zone(
    zone: Zone,
    seed: int,
    profile: str = "close",
) -> tuple[dict[tuple[int, int, int], str], list[dict], list[dict]]:
    rng = random.Random(seed)
    blocks: dict[tuple[int, int, int], str] = {}
    add_walls(blocks, zone, profile)

    houses = []
    connections = []
    chain = 1
    for side in wall_sides_for_profile(zone, profile):
        side_houses, side_connections, chain = generate_houses_on_side(blocks, zone, side, rng, chain)
        for house in side_houses:
            house["profile"] = profile
        for connection in side_connections:
            connection["profile"] = profile
        houses.extend(side_houses)
        connections.extend(side_connections)

    return blocks, houses, connections


def blocks_to_runs(blocks: dict[tuple[int, int, int], str]) -> list[dict]:
    by_yz_kind: dict[tuple[int, int, str], list[int]] = {}
    for x, y, z in blocks:
        kind = blocks[(x, y, z)]
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


def offset_box(box: list[int], dx: int, dz: int = 0) -> list[int]:
    x, y, z, sx, sy, sz = box
    return [x + dx, y, z + dz, sx, sy, sz]


def merge_zone_blocks(
    target: dict[tuple[int, int, int], str],
    source: dict[tuple[int, int, int], str],
    dx: int,
    dz: int,
    house_kind: str,
) -> None:
    for (x, y, z), kind in source.items():
        target[(x + dx, y, z + dz)] = house_kind if kind == "house" else kind


def offset_houses(houses: list[dict], dx: int, dz: int, profile: str) -> list[dict]:
    shifted = []
    for house in houses:
        item = dict(house)
        item["box"] = offset_box(house["box"], dx, dz)
        item["profile"] = profile
        shifted.append(item)
    return shifted


def offset_connections(connections: list[dict], profile: str) -> list[dict]:
    shifted = []
    for connection in connections:
        item = dict(connection)
        item["profile"] = profile
        shifted.append(item)
    return shifted


def build_compare_payload(args: argparse.Namespace) -> dict:
    close_zone = Zone(length=args.length, width=args.width, height=args.height)
    wide_zone = Zone(length=args.length * 2, width=args.width, height=args.height)
    close_blocks, close_houses, close_connections = generate_house_zone(close_zone, args.seed, "close")
    wide_blocks, wide_houses, wide_connections = generate_house_zone(wide_zone, args.seed + 1, "wide")

    wide_offset_x = close_zone.length + COMPARE_GAP
    combined_zone = Zone(
        length=close_zone.length + COMPARE_GAP + wide_zone.length,
        width=max(close_zone.width, wide_zone.width),
        height=max(close_zone.height, wide_zone.height),
    )
    blocks: dict[tuple[int, int, int], str] = {}
    merge_zone_blocks(blocks, close_blocks, 0, 0, "house_close")
    merge_zone_blocks(blocks, wide_blocks, wide_offset_x, 0, "house_wide")

    houses = offset_houses(close_houses, 0, 0, "close") + offset_houses(wide_houses, wide_offset_x, 0, "wide")
    connections = offset_connections(close_connections, "close") + offset_connections(wide_connections, "wide")
    runs = blocks_to_runs(blocks)
    return {
        "version": 1,
        "type": "house_wall_compare_test",
        "units": "blocks",
        "zone": {
            "size": [combined_zone.length, combined_zone.height, combined_zone.width],
            "axes": {"length": "x", "height": "y", "width": "z"},
        },
        "settings": {
            "seed": args.seed,
            "compare": True,
            "profiles": {
                "close": {"offset": [0, 0, 0], "size": [close_zone.length, close_zone.height, close_zone.width]},
                "wide": {"offset": [wide_offset_x, 0, 0], "size": [wide_zone.length, wide_zone.height, wide_zone.width]},
            },
            "wall_thickness": WALL_THICKNESS,
            "house_depth": [HOUSE_MIN_DEPTH, HOUSE_MAX_DEPTH],
            "house_width": [HOUSE_MIN_WIDTH, HOUSE_MAX_WIDTH],
            "house_height": [HOUSE_MIN_HEIGHT, HOUSE_MAX_HEIGHT],
            "floor_step": FLOOR_STEP,
            "house_floors": [HOUSE_MIN_FLOORS, HOUSE_MAX_FLOORS],
            "connection_max_distance": HOUSE_CONNECT_MAX_DISTANCE,
            "connection_out": HOUSE_CONNECTION_OUT,
        },
        "stats": {
            "blocks": len(blocks),
            "runs": len(runs),
            "houses": len(houses),
            "house_close": len(close_houses),
            "house_wide": len(wide_houses),
            "connections": len(connections),
            "stairs": sum(1 for connection in connections if connection["kind"] == "house_stair"),
            "bridges": sum(1 for connection in connections if connection["kind"] == "house_bridge"),
        },
        "houses": houses,
        "connections": connections,
        "runs": runs,
    }


def build_payload(args: argparse.Namespace) -> dict:
    if args.compare:
        return build_compare_payload(args)

    zone = Zone(length=args.length, width=args.width, height=args.height)
    blocks, houses, connections = generate_house_zone(zone, args.seed)
    runs = blocks_to_runs(blocks)
    return {
        "version": 1,
        "type": "house_wall_test",
        "units": "blocks",
        "zone": {
            "size": [zone.length, zone.height, zone.width],
            "axes": {"length": "x", "height": "y", "width": "z"},
        },
        "settings": {
            "seed": args.seed,
            "wall_thickness": WALL_THICKNESS,
            "house_depth": [HOUSE_MIN_DEPTH, HOUSE_MAX_DEPTH],
            "house_width": [HOUSE_MIN_WIDTH, HOUSE_MAX_WIDTH],
            "house_height": [HOUSE_MIN_HEIGHT, HOUSE_MAX_HEIGHT],
            "floor_step": FLOOR_STEP,
            "house_floors": [HOUSE_MIN_FLOORS, HOUSE_MAX_FLOORS],
            "connection_max_distance": HOUSE_CONNECT_MAX_DISTANCE,
            "connection_out": HOUSE_CONNECTION_OUT,
        },
        "stats": {
            "blocks": len(blocks),
            "runs": len(runs),
            "houses": len(houses),
            "connections": len(connections),
            "stairs": sum(1 for connection in connections if connection["kind"] == "house_stair"),
            "bridges": sum(1 for connection in connections if connection["kind"] == "house_bridge"),
        },
        "houses": houses,
        "connections": connections,
        "runs": runs,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genere un test de maisons accrochees aux murs.")
    parser.add_argument("--length", type=int, default=ZONE_LENGTH)
    parser.add_argument("--width", type=int, default=ZONE_WIDTH)
    parser.add_argument("--height", type=int, default=ZONE_HEIGHT)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--compare", action="store_true")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_payload(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"{payload['stats']['houses']} maisons")
    if args.compare:
        print(f"{payload['stats']['house_close']} house_close et {payload['stats']['house_wide']} house_wide")
    print(f"{payload['stats']['bridges']} ponts et {payload['stats']['stairs']} escaliers entre maisons")
    print(f"{payload['stats']['blocks']} blocks compresses en {payload['stats']['runs']} runs")
    print(f"export: {args.out}")


if __name__ == "__main__":
    main()
