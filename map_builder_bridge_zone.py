from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path


ZONE_LENGTH = 1000
ZONE_WIDTH = 300
ZONE_HEIGHT = 120

MAIN_WIDTH = 5
MAIN_HEIGHT = 2
SMALL_WIDTH = 3
SMALL_HEIGHT = 1

DEFAULT_BRANCHES = 42
DEFAULT_MIN_LENGTH = 60
DEFAULT_MAX_LENGTH = 240
DEFAULT_SEED = 50

STEP_EVERY_BLOCKS = 10
TURN_CHANCE = 0.14
HEIGHT_CHANGE_CHANCE = 0.24
STOP_CHANCE_AFTER_MIN = 0.018

BRIDGE_BLOCK = "minecraft:stone"
LANDING_SIZE = 11
SUPPORT_SIZE = 4
SIDE_MARGIN = 6
LEVELS = (18, 30, 42, 54, 60, 72, 84, 96)
TOWER_MIN_RADIUS = 6
TOWER_MAX_RADIUS = 15
TOWER_MIN_CENTER_DISTANCE = 70
TOWER_EDGE_CLEARANCE = TOWER_MAX_RADIUS + 2
TOWER_ADJUST_MIN = 5
TOWER_ADJUST_MAX = 10
TOWER_LOCAL_KINDS = {"small_bridge", "landing", "railing"}
MIN_PARALLEL_EDGE_GAP = 5
MIN_PARALLEL_VERTICAL_GAP = 5
BRIDGE_GENERATION_ATTEMPTS = 80
DANGLING_CONNECT_MAX_DISTANCE = 64
DANGLING_CONNECT_WALL_MARGIN = SIDE_MARGIN + LANDING_SIZE // 2 + 1
PYLON_MIN_SPACING = 35


@dataclass(frozen=True)
class Zone:
    length: int = ZONE_LENGTH
    width: int = ZONE_WIDTH
    height: int = ZONE_HEIGHT


@dataclass(frozen=True)
class Walker:
    x: int
    y: int
    z: int
    dx: int
    dz: int


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def main_bridge_y(zone: Zone) -> int:
    return zone.height // 2


def main_bridge_z(zone: Zone) -> int:
    return zone.width // 2


def main_connection_y(zone: Zone) -> int:
    return main_bridge_y(zone) + MAIN_HEIGHT - SMALL_HEIGHT


def bridge_base_y_for_top(top_y: int, height: int, zone: Zone) -> int:
    return clamp(top_y - height, 0, zone.height - height)


def cardinal_directions() -> tuple[tuple[int, int], ...]:
    return ((1, 0), (-1, 0), (0, 1), (0, -1))


def turn_direction(dx: int, dz: int, rng: random.Random) -> tuple[int, int]:
    if dx != 0:
        return (0, rng.choice((-1, 1)))
    return (rng.choice((-1, 1)), 0)


def is_inside_platform_center(x: int, y: int, z: int, zone: Zone, width: int, height: int) -> bool:
    radius = width // 2
    return (
        radius <= x < zone.length - radius
        and 0 <= y <= zone.height - height
        and radius <= z < zone.width - radius
    )


def random_main_start(zone: Zone, rng: random.Random) -> Walker:
    top_y = main_bridge_y(zone) + MAIN_HEIGHT
    y = bridge_base_y_for_top(top_y, SMALL_HEIGHT, zone)
    z = main_bridge_z(zone) + rng.randint(-(MAIN_WIDTH // 2), MAIN_WIDTH // 2)
    x = rng.randrange(10, zone.length - 10)
    dx, dz = rng.choice(cardinal_directions())
    return Walker(x=x, y=y, z=z, dx=dx, dz=dz)


def random_edge_start(zone: Zone, rng: random.Random) -> Walker:
    edge = rng.choice(("west", "east", "north", "south"))
    y = rng.randrange(8, zone.height - SMALL_HEIGHT - 8)
    if edge == "west":
        return Walker(1, y, rng.randrange(2, zone.width - 2), 1, 0)
    if edge == "east":
        return Walker(zone.length - 2, y, rng.randrange(2, zone.width - 2), -1, 0)
    if edge == "north":
        return Walker(rng.randrange(2, zone.length - 2), y, 1, 0, 1)
    return Walker(rng.randrange(2, zone.length - 2), y, zone.width - 2, 0, -1)


def random_walker(zone: Zone, rng: random.Random) -> Walker:
    if rng.random() < 0.68:
        return random_main_start(zone, rng)
    return random_edge_start(zone, rng)


def platform_blocks_at(x: int, y: int, z: int, dx: int, dz: int, width: int, height: int) -> set[tuple[int, int, int]]:
    radius = width // 2
    blocks = set()
    for by in range(height):
        if dx != 0:
            for oz in range(-radius, radius + 1):
                blocks.add((x, y + by, z + oz))
        else:
            for ox in range(-radius, radius + 1):
                blocks.add((x + ox, y + by, z))
    return blocks


def add_main_bridge(blocks: dict[tuple[int, int, int], str], zone: Zone) -> None:
    z = main_bridge_z(zone)
    y = main_bridge_y(zone)
    radius = MAIN_WIDTH // 2
    for x in range(zone.length):
        for by in range(MAIN_HEIGHT):
            for oz in range(-radius, radius + 1):
                blocks[(x, y + by, z + oz)] = "main_bridge"


def add_block(blocks: dict[tuple[int, int, int], str], zone: Zone, x: int, y: int, z: int, kind: str) -> None:
    if 0 <= x < zone.length and 0 <= y < zone.height and 0 <= z < zone.width:
        if blocks.get((x, y, z)) == "main_bridge":
            return
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


def add_landing(blocks: dict[tuple[int, int, int], str], zone: Zone, x: int, y: int, z: int) -> None:
    # Keep the deck joined at corners without a wide platform on the pylon.
    radius = SMALL_WIDTH // 2
    add_box(blocks, zone, x - radius, y, z - radius, SMALL_WIDTH, 1, SMALL_WIDTH, "small_bridge")


def add_support(blocks: dict[tuple[int, int, int], str], zone: Zone, x: int, y: int, z: int) -> None:
    half = SUPPORT_SIZE // 2
    for ty in range(max(1, y)):
        for tx in range(x - half, x - half + SUPPORT_SIZE):
            for tz in range(z - half, z - half + SUPPORT_SIZE):
                if (tx, ty, tz) not in blocks:
                    add_block(blocks, zone, tx, ty, tz, "support")


def tower_radius_for_endpoint(x: int, y: int, z: int, seed: int) -> int:
    rng = random.Random((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ seed)
    return rng.randint(TOWER_MIN_RADIUS, TOWER_MAX_RADIUS)


def is_near_box_wall(zone: Zone, x: int, z: int) -> bool:
    return (
        x <= TOWER_EDGE_CLEARANCE
        or z <= TOWER_EDGE_CLEARANCE
        or x >= zone.length - TOWER_EDGE_CLEARANCE - 1
        or z >= zone.width - TOWER_EDGE_CLEARANCE - 1
    )


def is_near_main_bridge(zone: Zone, x: int, z: int) -> bool:
    return abs(z - main_bridge_z(zone)) <= MAIN_WIDTH // 2 + LANDING_SIZE // 2 + 1


def tower_footprint(x: int, z: int, radius: int) -> list[tuple[int, int]]:
    radius_sq = radius * radius
    cells = []
    for oz in range(-radius, radius + 1):
        for ox in range(-radius, radius + 1):
            if ox * ox + oz * oz <= radius_sq:
                cells.append((x + ox, z + oz))
    return cells


def normalize_tower_endpoint(endpoint: list[int] | dict) -> dict:
    if isinstance(endpoint, dict):
        return endpoint
    return {"pos": endpoint, "dir": [0, 0]}


def is_bridge_corridor_cell(
    tx: int,
    tz: int,
    y: int,
    ty: int,
    x: int,
    z: int,
    dx: int,
    dz: int,
) -> bool:
    if not (y - 1 <= ty <= y + SMALL_HEIGHT + 1):
        return False
    corridor_radius = SMALL_WIDTH // 2 + 1
    if dx != 0:
        return abs(tz - z) <= corridor_radius
    if dz != 0:
        return abs(tx - x) <= corridor_radius
    return abs(tx - x) <= corridor_radius and abs(tz - z) <= corridor_radius


def is_landing_cell(tx: int, tz: int, x: int, z: int) -> bool:
    landing_radius = LANDING_SIZE // 2
    return abs(tx - x) <= landing_radius and abs(tz - z) <= landing_radius


def is_allowed_tower_overlap(
    kind: str,
    tx: int,
    ty: int,
    tz: int,
    x: int,
    y: int,
    z: int,
    source_x: int,
    source_z: int,
    dx: int,
    dz: int,
) -> bool:
    if kind == "support":
        return True
    if kind not in TOWER_LOCAL_KINDS:
        return False
    if not (y - 1 <= ty <= y + SMALL_HEIGHT + 1):
        return False
    if kind == "landing" and (is_landing_cell(tx, tz, x, z) or is_landing_cell(tx, tz, source_x, source_z)):
        return True
    return is_bridge_corridor_cell(tx, tz, y, ty, x, z, dx, dz)


def tower_can_fit(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    x: int,
    y: int,
    z: int,
    radius: int,
    source_x: int,
    source_z: int,
    dx: int,
    dz: int,
) -> bool:
    for tx, tz in tower_footprint(x, z, radius):
        if tx < 0 or tz < 0 or tx >= zone.length or tz >= zone.width:
            return False
        for ty in range(zone.height):
            kind = blocks.get((tx, ty, tz))
            if kind is None or kind == "tower":
                continue
            if not is_allowed_tower_overlap(kind, tx, ty, tz, x, y, z, source_x, source_z, dx, dz):
                return False
    return True


def bridge_step_cells(x: int, y: int, z: int, dx: int, dz: int) -> set[tuple[int, int, int]]:
    radius = SMALL_WIDTH // 2
    cells = set()
    for by in range(SMALL_HEIGHT):
        if dx != 0:
            for oz in range(-radius, radius + 1):
                cells.add((x, y + by, z + oz))
            cells.add((x, y + SMALL_HEIGHT, z - radius))
            cells.add((x, y + SMALL_HEIGHT, z + radius))
        else:
            for ox in range(-radius, radius + 1):
                cells.add((x + ox, y + by, z))
            cells.add((x - radius, y + SMALL_HEIGHT, z))
            cells.add((x + radius, y + SMALL_HEIGHT, z))
    return cells


def connector_can_fit(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    source: tuple[int, int, int],
    target: tuple[int, int, int],
    dx: int,
    dz: int,
) -> bool:
    x0, y0, z0 = source
    x1, y1, z1 = target
    length = abs(x1 - x0) + abs(z1 - z0)
    step_x = 0 if x0 == x1 else (1 if x1 > x0 else -1)
    step_z = 0 if z0 == z1 else (1 if z1 > z0 else -1)

    for distance in range(length + 1):
        x = x0 + step_x * distance
        z = z0 + step_z * distance
        y = deck_y_at(distance, y0, y1)
        for tx, ty, tz in bridge_step_cells(x, y, z, step_x or dx, step_z or dz):
            if tx < 0 or ty < 0 or tz < 0 or tx >= zone.length or ty >= zone.height or tz >= zone.width:
                return False
            kind = blocks.get((tx, ty, tz))
            if kind is None or kind == "support":
                continue
            if kind in TOWER_LOCAL_KINDS and is_bridge_corridor_cell(tx, tz, y, ty, x0, z0, dx, dz):
                continue
            return False
    return True


def tower_adjust_offsets() -> list[int]:
    offsets = [0]
    for amount in range(TOWER_ADJUST_MIN, TOWER_ADJUST_MAX + 1):
        offsets.extend((amount, -amount))
    return offsets


def tower_candidate_for_offset(
    source: tuple[int, int, int],
    dx: int,
    dz: int,
    offset: int,
) -> tuple[int, int, int]:
    x, y, z = source
    return x + dx * offset, y, z + dz * offset


def add_tower(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    x: int,
    y: int,
    z: int,
    radius: int,
) -> int:
    added = 0
    for tx, tz in tower_footprint(x, z, radius):
        for ty in range(zone.height):
            if (tx, ty, tz) in blocks:
                continue
            blocks[(tx, ty, tz)] = "tower"
            added += 1
    return added


def deck_y_at(distance: int, y0: int, y1: int) -> int:
    delta = y1 - y0
    if delta == 0:
        return y0
    allowed_steps = distance // STEP_EVERY_BLOCKS
    step = clamp(allowed_steps, 0, abs(delta))
    return y0 + (step if delta > 0 else -step)


def add_bridge_step(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    x: int,
    y: int,
    z: int,
    dx: int,
    dz: int,
    kind: str = "small_bridge",
) -> None:
    if y == main_connection_y(zone) and abs(z - main_bridge_z(zone)) <= MAIN_WIDTH // 2:
        return
    radius = SMALL_WIDTH // 2
    for by in range(SMALL_HEIGHT):
        if dx != 0:
            for oz in range(-radius, radius + 1):
                add_block(blocks, zone, x, y + by, z + oz, kind)
            add_block(blocks, zone, x, y + SMALL_HEIGHT, z - radius, "railing")
            add_block(blocks, zone, x, y + SMALL_HEIGHT, z + radius, "railing")
        else:
            for ox in range(-radius, radius + 1):
                add_block(blocks, zone, x + ox, y + by, z, kind)
            add_block(blocks, zone, x - radius, y + SMALL_HEIGHT, z, "railing")
            add_block(blocks, zone, x + radius, y + SMALL_HEIGHT, z, "railing")


def add_span(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    start: tuple[int, int, int],
    end: tuple[int, int, int],
    kind: str = "small_bridge",
) -> list[tuple[int, int, int]]:
    x0, y0, z0 = start
    x1, y1, z1 = end
    if x0 != x1 and z0 != z1:
        raise ValueError("add_span attend un segment droit sur X ou Z")

    dx = 0 if x0 == x1 else (1 if x1 > x0 else -1)
    dz = 0 if z0 == z1 else (1 if z1 > z0 else -1)
    length = abs(x1 - x0) + abs(z1 - z0)
    points = []

    for distance in range(length + 1):
        x = x0 + dx * distance
        z = z0 + dz * distance
        y = deck_y_at(distance, y0, y1)
        add_bridge_step(blocks, zone, x, y, z, dx, dz, kind)
        points.append((x, y, z))

    return points


def span_record(start: tuple[int, int, int], end: tuple[int, int, int], width: int = SMALL_WIDTH) -> dict:
    return {"start": list(start), "end": list(end), "width": width}


def span_points(span: dict) -> list[tuple[int, int, int, int, int, int]]:
    x0, y0, z0 = span["start"]
    x1, y1, z1 = span["end"]
    dx = 0 if x0 == x1 else (1 if x1 > x0 else -1)
    dz = 0 if z0 == z1 else (1 if z1 > z0 else -1)
    length = abs(x1 - x0) + abs(z1 - z0)
    width = span.get("width", SMALL_WIDTH)
    points = []

    for distance in range(length + 1):
        x = x0 + dx * distance
        z = z0 + dz * distance
        y = deck_y_at(distance, y0, y1)
        points.append((x, y, z, dx, dz, width))

    return points


def path_parallel_entries(path: dict) -> list[tuple[str, int, int, int, int, int]]:
    entries = []
    for span in path.get("spans", []):
        for x, y, z, dx, dz, width in span_points(span):
            if dx != 0:
                entries.append(("x", x, y, z, width, path["id"]))
            elif dz != 0:
                entries.append(("z", z, y, x, width, path["id"]))
    return entries


def add_path_to_parallel_index(index: dict[tuple[str, int], list[tuple[int, int, int, int]]], path: dict) -> None:
    for axis, along, y, lateral, width, path_id in path_parallel_entries(path):
        index.setdefault((axis, along), []).append((y, lateral, width, path_id))


def has_close_parallel_conflict(
    index: dict[tuple[str, int], list[tuple[int, int, int, int]]],
    path: dict,
) -> bool:
    for axis, along, y, lateral, width, path_id in path_parallel_entries(path):
        for other_y, other_lateral, other_width, other_path_id in index.get((axis, along), []):
            if other_path_id == path_id:
                continue
            vertical_gap = abs(y - other_y)
            edge_gap = abs(lateral - other_lateral) - (width // 2 + other_width // 2)
            if vertical_gap < MIN_PARALLEL_VERTICAL_GAP and edge_gap < MIN_PARALLEL_EDGE_GAP:
                return True
    return False


def main_bridge_path(zone: Zone) -> dict:
    start = (0, main_connection_y(zone), main_bridge_z(zone))
    end = (zone.length - 1, main_connection_y(zone), main_bridge_z(zone))
    return {
        "id": 0,
        "type": "main_bridge",
        "spans": [span_record(start, end, MAIN_WIDTH)],
    }


def bridge_target_points(paths: list[dict], zone: Zone) -> list[tuple[int, int, int, int, int]]:
    targets = []
    for path in [main_bridge_path(zone)] + paths:
        for span in path.get("spans", []):
            for x, y, z, _dx, _dz, width in span_points(span):
                targets.append((x, y, z, width, path["id"]))
    return targets


def is_near_connection_wall(zone: Zone, x: int, z: int) -> bool:
    return (
        x <= DANGLING_CONNECT_WALL_MARGIN
        or z <= DANGLING_CONNECT_WALL_MARGIN
        or x >= zone.length - DANGLING_CONNECT_WALL_MARGIN - 1
        or z >= zone.width - DANGLING_CONNECT_WALL_MARGIN - 1
    )


def endpoint_is_connected(
    endpoint: tuple[int, int, int],
    zone: Zone,
    path_id: int,
    targets: list[tuple[int, int, int, int, int]],
) -> bool:
    x, y, z = endpoint
    if is_near_connection_wall(zone, x, z):
        return True
    for tx, ty, tz, width, target_path_id in targets:
        if target_path_id == path_id:
            continue
        if abs(y - ty) > 1:
            continue
        contact_distance = SMALL_WIDTH // 2 + width // 2 + 1
        if abs(x - tx) + abs(z - tz) <= contact_distance:
            return True
    return False


def route_mid_y(start: tuple[int, int, int], corner_x: int, corner_z: int, end: tuple[int, int, int]) -> int | None:
    x0, y0, z0 = start
    x1, y1, z1 = end
    first_length = abs(corner_x - x0) + abs(corner_z - z0)
    second_length = abs(x1 - corner_x) + abs(z1 - corner_z)
    total_length = first_length + second_length
    delta = y1 - y0
    if abs(delta) > total_length // STEP_EVERY_BLOCKS:
        return None
    if delta == 0:
        return y0

    sign = 1 if delta > 0 else -1
    needed = abs(delta)
    first_capacity = first_length // STEP_EVERY_BLOCKS
    second_capacity = second_length // STEP_EVERY_BLOCKS
    if needed > first_capacity + second_capacity:
        return None
    minimum_first = max(0, needed - second_capacity)
    proportional_first = round(needed * (first_length / max(1, total_length)))
    first_steps = clamp(proportional_first, minimum_first, min(needed, first_capacity))
    return y0 + sign * first_steps


def connection_route_options(
    start: tuple[int, int, int],
    end: tuple[int, int, int],
) -> list[list[tuple[int, int, int]]]:
    x0, y0, z0 = start
    x1, y1, z1 = end
    if x0 == x1 or z0 == z1:
        length = abs(x1 - x0) + abs(z1 - z0)
        if abs(y1 - y0) <= length // STEP_EVERY_BLOCKS:
            return [[start, end]]
        return []

    routes = []
    for corner_x, corner_z in ((x1, z0), (x0, z1)):
        mid_y = route_mid_y(start, corner_x, corner_z, end)
        if mid_y is None:
            continue
        routes.append([start, (corner_x, mid_y, corner_z), (x1, y1, z1)])
    return routes


def route_to_spans(route: list[tuple[int, int, int]]) -> list[dict]:
    return [span_record(route[index], route[index + 1]) for index in range(len(route) - 1)]


def route_length(route: list[tuple[int, int, int]]) -> int:
    total = 0
    for (x0, _y0, z0), (x1, _y1, z1) in zip(route, route[1:]):
        total += abs(x1 - x0) + abs(z1 - z0)
    return total


def route_can_fit_parallel_rules(
    parallel_index: dict[tuple[str, int], list[tuple[int, int, int, int]]],
    path_id: int,
    route: list[tuple[int, int, int]],
) -> bool:
    return not has_close_parallel_conflict(
        parallel_index,
        {"id": path_id, "type": "connection", "spans": route_to_spans(route)},
    )


def find_nearest_connection_route(
    endpoint: tuple[int, int, int],
    path_id: int,
    targets: list[tuple[int, int, int, int, int]],
    parallel_index: dict[tuple[str, int], list[tuple[int, int, int, int]]],
) -> tuple[list[tuple[int, int, int]], int] | None:
    candidates = []
    x, y, z = endpoint
    for tx, ty, tz, _width, target_path_id in targets:
        if target_path_id == path_id:
            continue
        if (tx, ty, tz) == endpoint:
            continue
        horizontal_distance = abs(tx - x) + abs(tz - z)
        if horizontal_distance > DANGLING_CONNECT_MAX_DISTANCE:
            continue
        for route in connection_route_options(endpoint, (tx, ty, tz)):
            length = route_length(route)
            if length > DANGLING_CONNECT_MAX_DISTANCE:
                continue
            if route_can_fit_parallel_rules(parallel_index, path_id, route):
                candidates.append((length + abs(ty - y) * 4, route, target_path_id))

    if not candidates:
        return None

    _score, route, target_path_id = min(candidates, key=lambda item: item[0])
    return route, target_path_id


def draw_connection_route(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    route: list[tuple[int, int, int]],
) -> int:
    added_points = 0
    for point in route:
        add_landing(blocks, zone, *point)
    for start, end in zip(route, route[1:]):
        added_points += len(add_span(blocks, zone, start, end))
    return added_points


def connect_dangling_bridges(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    paths: list[dict],
    parallel_index: dict[tuple[str, int], list[tuple[int, int, int, int]]],
) -> list[dict]:
    connections = []
    targets = bridge_target_points(paths, zone)

    for path in paths:
        endpoints = [("start", tuple(path["start"])), ("end", tuple(path["end"]))]
        if any(endpoint_is_connected(endpoint, zone, path["id"], targets) for _label, endpoint in endpoints):
            continue

        candidates = []
        for label, endpoint in endpoints:
            found = find_nearest_connection_route(endpoint, path["id"], targets, parallel_index)
            if found is None:
                continue
            route, target_path_id = found
            candidates.append((route_length(route), label, route, target_path_id))

        if not candidates:
            continue

        _length, label, route, target_path_id = min(candidates, key=lambda item: item[0])
        spans = route_to_spans(route)
        candidate_blocks = blocks.copy()
        added_points = draw_connection_route(candidate_blocks, zone, route)
        if has_central_headroom_conflict(candidate_blocks, zone, paths + [{"spans": spans}]):
            continue
        blocks.clear()
        blocks.update(candidate_blocks)
        path.setdefault("connections", []).append(
            {
                "from": label,
                "to_path": target_path_id,
                "route": [list(point) for point in route],
                "length": route_length(route),
            }
        )
        path.setdefault("spans", []).extend(spans)
        add_path_to_parallel_index(parallel_index, {"id": path["id"], "type": "connection", "spans": spans})
        targets.extend(
            (x, y, z, width, path["id"])
            for span in spans
            for x, y, z, _dx, _dz, width in span_points(span)
        )
        connections.append(
            {
                "path": path["id"],
                "from": label,
                "to_path": target_path_id,
                "route": [list(point) for point in route],
                "length": route_length(route),
                "points": added_points,
            }
        )

    return connections


def side_anchor(zone: Zone, rng: random.Random) -> tuple[int, int, int, str]:
    side = rng.choice(("north", "south"))
    x = rng.randrange(40, zone.length - 40)
    y = rng.choice(LEVELS)
    z = SIDE_MARGIN if side == "north" else zone.width - SIDE_MARGIN - 1
    return x, y, z, side


def central_anchor(zone: Zone, rng: random.Random, x: int | None = None, y: int | None = None, side: str | None = None) -> tuple[int, int, int]:
    z_offset = MAIN_WIDTH // 2 + SMALL_WIDTH // 2 + MIN_PARALLEL_EDGE_GAP + 1
    if side == "north":
        z = main_bridge_z(zone) - z_offset
    elif side == "south":
        z = main_bridge_z(zone) + z_offset
    else:
        z = main_bridge_z(zone) + rng.choice((-z_offset, z_offset))
    return (
        x if x is not None else rng.randrange(40, zone.length - 40),
        y if y is not None else rng.choice(LEVELS),
        z,
    )


def add_side_to_center_bridge(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    rng: random.Random,
    path_id: int,
) -> dict:
    x, y, z, side = side_anchor(zone, rng)
    deck_y = main_connection_y(zone)
    if rng.random() < 0.42:
        y = deck_y
    length = abs(main_bridge_z(zone) - z)
    max_steps = (length - MAIN_WIDTH // 2 - 1) // STEP_EVERY_BLOCKS
    y = clamp(y, deck_y - max_steps, deck_y + max_steps)
    end = (x, deck_y, main_bridge_z(zone))
    add_landing(blocks, zone, x, y, z)
    add_support(blocks, zone, x, y, z)
    add_landing(blocks, zone, *end)
    add_support(blocks, zone, end[0], end[1], end[2])
    start = (x, y, z)
    points = add_span(blocks, zone, start, end)
    return {
        "id": path_id,
        "type": "side_to_center",
        "start": list(points[0]),
        "end": list(points[-1]),
        "tower_endpoints": [],
        "spans": [span_record(start, end)],
        "length": len(points),
    }


def add_parallel_gallery(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    rng: random.Random,
    path_id: int,
) -> dict:
    y = rng.choice(LEVELS)
    side = rng.choice(("north", "south"))
    z = rng.randrange(28, 82) if side == "north" else rng.randrange(zone.width - 82, zone.width - 28)
    span = rng.randrange(150, 360)
    x0 = rng.randrange(30, zone.length - span - 30)
    x1 = x0 + span
    add_landing(blocks, zone, x0, y, z)
    add_landing(blocks, zone, x1, y, z)
    if rng.random() < 0.65:
        add_support(blocks, zone, x0, y, z)
        add_support(blocks, zone, x1, y, z)
    start = (x0, y, z)
    end = (x1, y, z)
    points = add_span(blocks, zone, start, end)
    return {
        "id": path_id,
        "type": "parallel_gallery",
        "start": list(points[0]),
        "end": list(points[-1]),
        "tower_endpoints": [
            {"pos": list(points[0]), "dir": [-1, 0]},
            {"pos": list(points[-1]), "dir": [1, 0]},
        ],
        "spans": [span_record(start, end)],
        "length": len(points),
    }


def add_orthogonal_link(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    rng: random.Random,
    path_id: int,
) -> dict:
    start = central_anchor(zone, rng, y=main_connection_y(zone))
    entry = (start[0], start[1], main_bridge_z(zone))
    side = "north" if start[2] < main_bridge_z(zone) else "south"
    mid_x = clamp(start[0] + rng.choice((-1, 1)) * rng.randrange(45, 140), 20, zone.length - 20)
    end_z = rng.randrange(32, 95) if side == "north" else rng.randrange(zone.width - 95, zone.width - 32)
    end_y = clamp(start[1] + rng.choice((-12, -8, 0, 8, 12)), 8, zone.height - 8)
    max_steps = abs(end_z - start[2]) // STEP_EVERY_BLOCKS
    end_y = clamp(end_y, start[1] - max_steps, start[1] + max_steps)
    mid = (mid_x, start[1], start[2])
    end = (mid_x, end_y, end_z)
    add_landing(blocks, zone, *start)
    add_landing(blocks, zone, *mid)
    add_landing(blocks, zone, *end)
    if rng.random() < 0.55:
        add_support(blocks, zone, end[0], end[1], end[2])
    points = add_span(blocks, zone, entry, start) + add_span(blocks, zone, start, mid)[1:] + add_span(blocks, zone, mid, end)[1:]
    end_dz = 1 if end[2] > mid[2] else -1
    return {
        "id": path_id,
        "type": "orthogonal_link",
        "start": list(points[0]),
        "end": list(points[-1]),
        "tower_endpoints": [{"pos": list(points[-1]), "dir": [0, end_dz]}],
        "spans": [span_record(entry, start), span_record(start, mid), span_record(mid, end)],
        "length": len(points),
    }


def add_architectural_bridge(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    rng: random.Random,
    path_id: int,
) -> dict:
    roll = rng.random()
    if roll < 0.48:
        return add_side_to_center_bridge(blocks, zone, rng, path_id)
    if roll < 0.78:
        return add_parallel_gallery(blocks, zone, rng, path_id)
    return add_orthogonal_link(blocks, zone, rng, path_id)


def add_endpoint_towers(
    blocks: dict[tuple[int, int, int], str],
    zone: Zone,
    paths: list[dict],
    seed: int,
) -> list[dict]:
    towers = []
    seen = set()

    for path in paths:
        for raw_endpoint in path.get("tower_endpoints", []):
            endpoint = normalize_tower_endpoint(raw_endpoint)
            source_x, source_y, source_z = endpoint["pos"]
            dx, dz = endpoint.get("dir", [0, 0])
            key = (source_x, source_y, source_z)
            if key in seen:
                continue
            seen.add(key)

            radius = tower_radius_for_endpoint(source_x, source_y, source_z, seed)
            placed = False
            rejected_pos = [source_x, 0, source_z]

            for offset in tower_adjust_offsets():
                x, y, z = tower_candidate_for_offset((source_x, source_y, source_z), dx, dz, offset)
                rejected_pos = [x, 0, z]
                if is_near_box_wall(zone, x, z) or is_near_main_bridge(zone, x, z):
                    continue
                if not tower_can_fit(blocks, zone, x, y, z, radius, source_x, source_z, dx, dz):
                    continue

                if offset != 0:
                    source = (source_x, source_y, source_z)
                    target = (x, y, z)
                    if not connector_can_fit(blocks, zone, source, target, dx, dz):
                        continue
                    add_span(blocks, zone, source, target)

                added = add_tower(blocks, zone, x, y, z, radius)
                towers.append(
                    {
                        "pos": [x, 0, z],
                        "radius": radius,
                        "height": zone.height,
                        "attached_to": path["id"],
                        "placed": True,
                        "blocks": added,
                        "source": [source_x, source_y, source_z],
                        "adjust": offset,
                    }
                )
                placed = True
                break

            if not placed:
                towers.append(
                    {
                        "pos": rejected_pos,
                        "radius": radius,
                        "height": zone.height,
                        "attached_to": path["id"],
                        "placed": False,
                        "source": [source_x, source_y, source_z],
                    }
                )

    return towers


def walk_branch(
    zone: Zone,
    rng: random.Random,
    branch_id: int,
    min_length: int,
    max_length: int,
) -> dict:
    walker = random_walker(zone, rng)
    length_target = rng.randrange(min_length, max_length + 1)
    points = []
    blocks = {}
    last_height_step = 0

    for distance in range(length_target):
        if not is_inside_platform_center(walker.x, walker.y, walker.z, zone, SMALL_WIDTH, SMALL_HEIGHT):
            break

        points.append((walker.x, walker.y, walker.z))
        for block in platform_blocks_at(walker.x, walker.y, walker.z, walker.dx, walker.dz, SMALL_WIDTH, SMALL_HEIGHT):
            blocks[block] = "small_bridge"

        if distance >= min_length and rng.random() < STOP_CHANCE_AFTER_MIN:
            break

        dx, dz = walker.dx, walker.dz
        if rng.random() < TURN_CHANCE:
            dx, dz = turn_direction(dx, dz, rng)

        y = walker.y
        if distance - last_height_step >= STEP_EVERY_BLOCKS and rng.random() < HEIGHT_CHANGE_CHANCE:
            y = clamp(y + rng.choice((-1, 1)), 0, zone.height - SMALL_HEIGHT)
            last_height_step = distance

        nx = walker.x + dx
        nz = walker.z + dz
        if not is_inside_platform_center(nx, y, nz, zone, SMALL_WIDTH, SMALL_HEIGHT):
            dx, dz = -dx, -dz
            nx = walker.x + dx
            nz = walker.z + dz

        walker = Walker(nx, y, nz, dx, dz)

    return {
        "id": branch_id,
        "blocks": blocks,
        "points": points,
        "start": list(points[0]) if points else None,
        "end": list(points[-1]) if points else None,
        "length": len(points),
    }


def has_central_headroom_conflict(
    blocks: dict[tuple[int, int, int], str], zone: Zone, paths: list[dict]
) -> bool:
    for path in paths:
        for span in path.get("spans", []):
            for x, y, z, _dx, _dz, _width in span_points(span):
                if abs(z - main_bridge_z(zone)) > 12:
                    continue
                for ty in range(y + SMALL_HEIGHT, y + SMALL_HEIGHT + 2):
                    if blocks.get((x, ty, z)) not in (None, "railing"):
                        return True
    return False


def clear_central_connection_railings(
    blocks: dict[tuple[int, int, int], str], zone: Zone, paths: list[dict]
) -> None:
    # A crossing is an opening, not a railing across the walking lane.
    routes = [
        path["spans"] for path in paths
        if path["type"] in {"side_to_center", "orthogonal_link"}
    ]
    routes.extend(
        route_to_spans([tuple(point) for point in connection["route"]])
        for path in paths for connection in path.get("connections", [])
        if connection["to_path"] == 0
    )
    for spans in routes:
        for span in spans:
            for x, y, z, _dx, _dz, _width in span_points(span):
                for ty in range(y + SMALL_HEIGHT, y + SMALL_HEIGHT + 2):
                    if blocks.get((x, ty, z)) == "railing":
                        del blocks[(x, ty, z)]
    for x in range(zone.length):
        for z in range(main_bridge_z(zone) - MAIN_WIDTH // 2, main_bridge_z(zone) + MAIN_WIDTH // 2 + 1):
            for y in range(main_bridge_y(zone) + MAIN_HEIGHT, main_bridge_y(zone) + MAIN_HEIGHT + 2):
                if blocks.get((x, y, z)) == "railing":
                    del blocks[(x, y, z)]


def place_bridge_pylons(
    zone: Zone, rng: random.Random, count: int, min_length: int, max_length: int
) -> list[dict]:
    pylons = []
    margin = SUPPORT_SIZE + 4
    center = main_bridge_z(zone)
    for _ in range(count * 200):
        if len(pylons) == count:
            break
        x = rng.randrange(margin, zone.length - margin)
        z = rng.randrange(margin, zone.width - margin)
        if abs(z - center) < MAIN_WIDTH // 2 + SUPPORT_SIZE + MIN_PARALLEL_EDGE_GAP:
            continue
        distance = abs(z - center)
        if not min_length <= distance <= max_length:
            continue
        if any((x - p["x"]) ** 2 + (z - p["z"]) ** 2 < PYLON_MIN_SPACING ** 2 for p in pylons):
            continue
        # Reserve a separate straight approach to the central bridge on each side.
        if any(
            (z < center) == (p["z"] < center)
            and abs(x - p["x"]) < SMALL_WIDTH + MIN_PARALLEL_EDGE_GAP
            for p in pylons
        ):
            continue
        max_steps = min(6, max(0, (distance - MAIN_WIDTH // 2 - SUPPORT_SIZE) // STEP_EVERY_BLOCKS))
        y = clamp(main_connection_y(zone) + rng.randint(-max_steps, max_steps), 8, zone.height - 4)
        pylons.append({"id": len(pylons) + 1, "x": x, "y": y, "z": z, "size": SUPPORT_SIZE})
    return pylons


def pylon_bridge_deck(route: list[tuple[int, int, int]]) -> set[tuple[int, int, int]]:
    deck = set()
    radius = SMALL_WIDTH // 2
    for span in route_to_spans(route):
        for x, y, z, dx, dz, _width in span_points(span):
            deck.update(platform_blocks_at(x, y, z, dx, dz, SMALL_WIDTH, SMALL_HEIGHT))
    # The pylon junction stays within its footprint; the other end joins the main deck.
    for x, y, z in route:
        for dx in range(-radius, radius + 1):
            for dz in range(-radius, radius + 1):
                deck.add((x + dx, y, z + dz))
    return deck


def generate_pylon_bridges(
    zone: Zone, seed: int, count: int, min_length: int, max_length: int
) -> tuple[dict[tuple[int, int, int], str], list[dict], list[dict], list[dict]]:
    if count < 0 or min_length < 1 or max_length < min_length:
        raise ValueError("Nombre de pylones et longueurs invalides")
    pylons = place_bridge_pylons(zone, random.Random(seed), count, min_length, max_length)
    blocks = {}
    add_main_bridge(blocks, zone)
    for p in pylons:
        add_support(blocks, zone, p["x"], p["y"], p["z"])

    paths = []
    for p in pylons:
        start = (p["x"], p["y"], p["z"])
        end = (p["x"], main_connection_y(zone), main_bridge_z(zone))
        for x, y, z in pylon_bridge_deck([start, end]):
            add_block(blocks, zone, x, y, z, "small_bridge")
        paths.append({
            "id": p["id"], "type": "pylon_to_center",
            "pylon": p["id"], "to_path": 0,
            "start": list(start), "end": list(end),
            "spans": [span_record(start, end)],
            "length": abs(end[2] - start[2]),
        })
    return blocks, paths, pylons, []


def generate_bridge_zone(
    zone: Zone,
    seed: int,
    branches: int,
    min_length: int,
    max_length: int,
) -> tuple[dict[tuple[int, int, int], str], list[dict], list[dict], list[dict]]:
    return generate_tower_bridges(zone, seed, branches, min_length, max_length)


def generate_tower_bridges(
    zone: Zone, seed: int, count: int, min_length: int, max_length: int
) -> tuple[dict[tuple[int, int, int], str], list[dict], list[dict], list[dict]]:
    if count < 0 or min_length < 1 or max_length < min_length:
        raise ValueError("Nombre de tours et longueurs invalides")
    rng = random.Random(seed)
    center = main_bridge_z(zone)
    towers = []
    for _ in range(count * 300):
        if len(towers) == count:
            break
        radius = rng.randint(TOWER_MIN_RADIUS, TOWER_MAX_RADIUS)
        x = rng.randrange(radius + 2, zone.length - radius - 2)
        z = rng.randrange(radius + 2, zone.width - radius - 2)
        direction = 1 if z < center else -1
        facade_z = z + direction * radius
        start_z = facade_z + direction
        distance = abs(start_z - center)
        if abs(z - center) <= radius + MAIN_WIDTH // 2 + MIN_PARALLEL_EDGE_GAP:
            continue
        if not min_length <= distance <= max_length:
            continue
        if any(
            (x - t["x"]) ** 2 + (z - t["z"]) ** 2
            < max(TOWER_MIN_CENTER_DISTANCE, radius + t["radius"] + MIN_PARALLEL_EDGE_GAP) ** 2
            for t in towers
        ):
            continue
        # Both straight approaches must clear the other tower's full footprint.
        if any(
            (z < center) == (t["z"] < center)
            and abs(x - t["x"]) < max(radius, t["radius"]) + SMALL_WIDTH // 2 + MIN_PARALLEL_EDGE_GAP + 1
            for t in towers
        ):
            continue
        max_steps = min(6, max(0, (distance - MAIN_WIDTH // 2 - 1) // STEP_EVERY_BLOCKS))
        y = clamp(main_connection_y(zone) + rng.randint(-max_steps, max_steps), 2, zone.height - 4)
        towers.append({
            "id": len(towers) + 1, "x": x, "z": z, "radius": radius,
            "pos": [x, 0, z], "height": zone.height, "placed": True,
            "bridge_start": [x, y, start_z],
            "door": {"pos": [x, y + 1, facade_z], "size": [1, 2, 1]},
        })

    blocks = {}
    add_main_bridge(blocks, zone)
    for tower in towers:
        add_tower(blocks, zone, tower["x"], 0, tower["z"], tower["radius"])
        x, y, z = tower["door"]["pos"]
        add_box(blocks, zone, x, y, z, 1, 2, 1, "door")
    paths = []
    for tower in towers:
        start = tuple(tower["bridge_start"])
        end = (start[0], main_connection_y(zone), center)
        span = span_record(start, end)
        for x, y, z, dx, dz, _width in span_points(span):
            for bx, by, bz in platform_blocks_at(x, y, z, dx, dz, SMALL_WIDTH, SMALL_HEIGHT):
                add_block(blocks, zone, bx, by, bz, "small_bridge")
        paths.append({
            "id": tower["id"], "type": "tower_to_center", "tower": tower["id"],
            "to_path": 0, "start": list(start), "end": list(end),
            "spans": [span], "length": abs(end[2] - start[2]),
        })
    return blocks, paths, towers, []


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
                    "block": "minecraft:orange_concrete" if kind == "door" else BRIDGE_BLOCK,
                    "pos": [start, y, z],
                    "size": [previous - start + 1, 1, 1],
                }
            )
            if x is not None:
                start = previous = x
    # Tall towers share the same footprint through most of their height.
    merged = []
    vertical_runs = {}
    for run in runs:
        if run["kind"] not in {"tower", "door"}:
            merged.append(run)
            continue
        x, y, z = run["pos"]
        key = (run["kind"], x, z, run["size"][0])
        previous = vertical_runs.get(key)
        if previous is not None and previous["pos"][1] + previous["size"][1] == y:
            previous["size"][1] += run["size"][1]
        else:
            merged.append(run)
            vertical_runs[key] = run
    return merged


def build_payload(args: argparse.Namespace) -> dict:
    zone = Zone(length=args.length, width=args.width, height=args.height)
    blocks, paths, towers, connections = generate_bridge_zone(
        zone=zone,
        seed=args.seed,
        branches=args.branches,
        min_length=args.min_length,
        max_length=args.max_length,
    )
    runs = blocks_to_runs(blocks)
    return {
        "version": 1,
        "type": "bridge_zone_test",
        "units": "blocks",
        "zone": {
            "size": [zone.length, zone.height, zone.width],
            "axes": {"length": "x", "height": "y", "width": "z"},
        },
        "settings": {
            "seed": args.seed,
            "tower_candidates": args.branches,
            "min_length": args.min_length,
            "max_length": args.max_length,
            "main_bridge": {
                "width": MAIN_WIDTH,
                "height": MAIN_HEIGHT,
                "y": main_bridge_y(zone),
                "z": main_bridge_z(zone),
            },
            "small_bridges": {
                "width": SMALL_WIDTH,
                "height": SMALL_HEIGHT,
                "step_every_blocks": STEP_EVERY_BLOCKS,
            },
            "towers": {
                "min_radius": TOWER_MIN_RADIUS,
                "max_radius": TOWER_MAX_RADIUS,
                "height": zone.height,
                "connections_per_tower": 1,
                "min_center_distance": TOWER_MIN_CENTER_DISTANCE,
            },
        },
        "stats": {
            "blocks": len(blocks),
            "runs": len(runs),
            "paths": len(paths),
            "non_empty_paths": sum(1 for path in paths if path["length"] > 0),
            "towers": len(towers),
            "connections": len(connections),
        },
        "paths": paths,
        "pylons": [],
        "towers": towers,
        "connections": connections,
        "runs": runs,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genere une zone de test pour un algo de ponts.")
    parser.add_argument("--length", type=int, default=ZONE_LENGTH)
    parser.add_argument("--width", type=int, default=ZONE_WIDTH)
    parser.add_argument("--height", type=int, default=ZONE_HEIGHT)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--towers", "--pylons", "--branches", dest="branches", type=int, default=DEFAULT_BRANCHES)
    parser.add_argument("--min-length", type=int, default=DEFAULT_MIN_LENGTH)
    parser.add_argument("--max-length", type=int, default=DEFAULT_MAX_LENGTH)
    parser.add_argument("--out", type=Path, default=Path("exports/bridge_zone.json"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_payload(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"{payload['stats']['blocks']} blocks compresses en {payload['stats']['runs']} runs")
    print(f"{payload['stats']['non_empty_paths']}/{payload['stats']['paths']} ponts secondaires generes")
    print(f"{payload['stats']['connections']} connexions ajoutees entre ponts")
    print(f"{payload['stats']['towers']} tours reliees")
    print(f"export: {args.out}")


if __name__ == "__main__":
    main()
