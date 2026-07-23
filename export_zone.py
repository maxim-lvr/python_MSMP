from __future__ import annotations

import argparse
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image

from map_builder import load_minecraft_builds


WORLD_SCALE = 16
WORLD_MIN_Y = -64
WORLD_MAX_Y = 320
GENERATION_MAX_Y = 300
GENERATION_HEIGHT_BLOCKS = GENERATION_MAX_Y - WORLD_MIN_Y
WORLD = {"width": 1200, "height": math.ceil(GENERATION_HEIGHT_BLOCKS / WORLD_SCALE), "depth": 1200}
EMPTY_BRIGHTNESS = 0.94
FULL_HEIGHT_BRIGHTNESS = 0.30
MIN_SOLID_HEIGHT = 5

ACTIVE_STRUCTURE_NAMES = ("building", "room_1", "pillar_1")
ACTIVE_BRIDGE_NAMES = ("bridge",)
ACTIVE_WALL_NAMES = (
    "stone_wall_x_neg",
    "stone_wall_x_pos",
    "stone_wall_z_neg",
    "stone_wall_z_pos",
    "stone_wall_x_neg_h12",
    "stone_wall_x_pos_h12",
    "stone_wall_z_neg_h12",
    "stone_wall_z_pos_h12",
)

BLUE_CONNECTOR_TARGET = 200
BLUE_CONNECTOR_MIN_LENGTH = 3
BLUE_CONNECTOR_MAX_LENGTH = 20
BLUE_CONNECTOR_SPACING = 20
BLUE_CONNECTOR_NEAR_START_TARGET = 70
BLUE_CONNECTOR_NEAR_START_RADIUS = 260
SAME_ISLAND_PATH_LIMIT = 220
SAME_ISLAND_MAX_VISITED = 9000
SAME_ISLAND_DIRECTIONS = (
    (1, 0),
    (-1, 0),
    (0, 1),
    (0, -1),
    (1, 1),
    (1, -1),
    (-1, 1),
    (-1, -1),
)
WALL_TILT_DEGREES = 5
WALL_THICKNESS_BLOCKS = 2
WALL_MAX_DISTANCE_CELLS = max(
    1,
    math.ceil((GENERATION_HEIGHT_BLOCKS * math.tan(math.radians(WALL_TILT_DEGREES)) + WALL_THICKNESS_BLOCKS) / WORLD_SCALE),
)


def js_like_hash01(a: int, b: int, c: int) -> float:
    n = (a * 374761393 + b * 668265263 + c * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 4294967295


def load_structures(root: Path) -> dict[str, object]:
    builds = load_minecraft_builds(root)
    active = set(ACTIVE_STRUCTURE_NAMES + ACTIVE_BRIDGE_NAMES + ACTIVE_WALL_NAMES)
    return {name: build for name, build in builds.items() if name in active}


def image_brightness(image, x: int, z: int) -> float:
    width, height = image.size
    px = min(width - 1, max(0, int((x / WORLD["width"]) * width)))
    pz = min(height - 1, max(0, int((z / WORLD["depth"]) * height)))
    red, green, blue = image.getpixel((px, pz))
    return (red + green + blue) / (255 * 3)


def column_height_for_brightness(brightness: float) -> int:
    if brightness >= EMPTY_BRIGHTNESS:
        return 0
    return WORLD["height"]


def generate_column_heights(noise_path: Path) -> list[bytearray]:
    image = Image.open(noise_path).convert("RGB")
    heights = [bytearray(WORLD["width"]) for _ in range(WORLD["depth"])]
    for z in range(WORLD["depth"]):
        for x in range(WORLD["width"]):
            heights[z][x] = column_height_for_brightness(image_brightness(image, x, z))
    return heights


def solid_height_blocks(heights, x: int, z: int) -> int:
    return min(heights[z][x] * WORLD_SCALE, GENERATION_HEIGHT_BLOCKS)


def bridge_index(x: int, z: int) -> int:
    return z * WORLD["width"] + x


def bridge_end_positions(x: int, z: int, length: int, axis: str) -> tuple[int, int, int, int]:
    start_x = x - (1 if axis == "x" else 0)
    start_z = z - (1 if axis == "z" else 0)
    end_x = x + (length if axis == "x" else 0)
    end_z = z + (length if axis == "z" else 0)
    return start_x, start_z, end_x, end_z


def bridge_end_heights(heights, x: int, z: int, length: int, axis: str) -> tuple[int, int]:
    start_x, start_z, end_x, end_z = bridge_end_positions(x, z, length, axis)
    return heights[start_z][start_x], heights[end_z][end_x]


def same_island_path_exists(heights, x: int, z: int, length: int, axis: str) -> bool:
    start_x, start_z, end_x, end_z = bridge_end_positions(x, z, length, axis)
    if abs(start_x - end_x) + abs(start_z - end_z) > SAME_ISLAND_PATH_LIMIT:
        return False

    queue = deque([(start_x, start_z, 0)])
    visited = {bridge_index(start_x, start_z)}

    while queue:
        cx, cz, distance = queue.popleft()
        if cx == end_x and cz == end_z:
            return True
        if distance >= SAME_ISLAND_PATH_LIMIT:
            continue

        for dx, dz in SAME_ISLAND_DIRECTIONS:
            nx = cx + dx
            nz = cz + dz
            if nx < 0 or nz < 0 or nx >= WORLD["width"] or nz >= WORLD["depth"]:
                continue
            if heights[nz][nx] == 0:
                continue
            key = bridge_index(nx, nz)
            if key in visited:
                continue
            visited.add(key)
            if len(visited) >= SAME_ISLAND_MAX_VISITED:
                return False
            queue.append((nx, nz, distance + 1))
    return False


def bridge_area_is_free(mask: bytearray, x: int, z: int, length: int, axis: str) -> bool:
    for index in range(length):
        px = x + (index if axis == "x" else 0)
        pz = z + (index if axis == "z" else 0)
        for dz in range(-BLUE_CONNECTOR_SPACING, BLUE_CONNECTOR_SPACING + 1):
            for dx in range(-BLUE_CONNECTOR_SPACING, BLUE_CONNECTOR_SPACING + 1):
                nx = px + dx
                nz = pz + dz
                if nx < 0 or nz < 0 or nx >= WORLD["width"] or nz >= WORLD["depth"]:
                    continue
                if mask[bridge_index(nx, nz)]:
                    return False
    return True


def reserve_bridge_area(mask: bytearray, x: int, z: int, length: int, axis: str) -> None:
    for index in range(length):
        px = x + (index if axis == "x" else 0)
        pz = z + (index if axis == "z" else 0)
        for dz in range(-BLUE_CONNECTOR_SPACING, BLUE_CONNECTOR_SPACING + 1):
            for dx in range(-BLUE_CONNECTOR_SPACING, BLUE_CONNECTOR_SPACING + 1):
                nx = px + dx
                nz = pz + dz
                if nx < 0 or nz < 0 or nx >= WORLD["width"] or nz >= WORLD["depth"]:
                    continue
                mask[bridge_index(nx, nz)] = 1


def can_place_bridge(heights, mask: bytearray, x: int, z: int, length: int, axis: str) -> bool:
    if x < 1 or z < 1:
        return False
    if axis == "x" and x + length >= WORLD["width"]:
        return False
    if axis == "z" and z + length >= WORLD["depth"]:
        return False

    start_height, end_height = bridge_end_heights(heights, x, z, length, axis)
    if start_height == 0 or end_height == 0:
        return False

    for index in range(length):
        px = x + (index if axis == "x" else 0)
        pz = z + (index if axis == "z" else 0)
        if heights[pz][px] != 0:
            return False
        if mask[bridge_index(px, pz)]:
            return False
    return bridge_area_is_free(mask, x, z, length, axis)


def collect_bridge_candidates(heights, x_bounds: tuple[int, int], z_bounds: tuple[int, int]) -> list[dict]:
    candidates = []
    x_min, x_max = x_bounds
    z_min, z_max = z_bounds

    for axis in ("x", "z"):
        if axis == "x":
            line_start, line_end = z_min, z_max
            cursor_start, cursor_end = x_min, x_max
            line_length = WORLD["width"]
        else:
            line_start, line_end = x_min, x_max
            cursor_start, cursor_end = z_min, z_max
            line_length = WORLD["depth"]

        for line in range(max(1, line_start), min(line_end, WORLD["depth" if axis == "x" else "width"] - 1)):
            cursor = max(1, cursor_start)
            while cursor < min(cursor_end, line_length - 1):
                x = cursor if axis == "x" else line
                z = line if axis == "x" else cursor
                before_x = x - (1 if axis == "x" else 0)
                before_z = z - (1 if axis == "z" else 0)

                if heights[before_z][before_x] == 0 or heights[z][x] != 0:
                    cursor += 1
                    continue

                end = cursor
                while end < line_length - 1:
                    px = end if axis == "x" else line
                    pz = line if axis == "x" else end
                    if heights[pz][px] != 0:
                        break
                    end += 1

                length = end - cursor
                end_x = end if axis == "x" else line
                end_z = line if axis == "x" else end
                if (
                    BLUE_CONNECTOR_MIN_LENGTH <= length <= BLUE_CONNECTOR_MAX_LENGTH
                    and end < line_length
                    and heights[end_z][end_x] != 0
                ):
                    candidates.append(
                        {
                            "x": x,
                            "z": z,
                            "length": length,
                            "axis": axis,
                            "score": js_like_hash01(x, z, length + (0 if axis == "x" else 10000)),
                        }
                    )

                cursor = max(cursor + 1, end)

    candidates.sort(key=lambda item: item["score"])
    return candidates


def bridge_distance_to_center(candidate: dict, center_x: int, center_z: int) -> float:
    world_x = candidate["x"] + (candidate["length"] / 2 if candidate["axis"] == "x" else 0.5)
    world_z = candidate["z"] + (candidate["length"] / 2 if candidate["axis"] == "z" else 0.5)
    world_x -= WORLD["width"] / 2
    world_z -= WORLD["depth"] / 2
    dx = world_x - center_x / WORLD_SCALE
    dz = world_z - center_z / WORLD_SCALE
    return math.sqrt(dx * dx + dz * dz)


def bridge_cell_y_for_candidate(candidate: dict, highest_bridge_cell_y: int, max_island_cell_y: int) -> int:
    highest_allowed_y = max(0, min(highest_bridge_cell_y, max_island_cell_y))
    salt = candidate["length"] + (83000 if candidate["axis"] == "x" else 93000)
    return math.floor(js_like_hash01(candidate["x"], candidate["z"], salt) * (highest_allowed_y + 1))


def generate_bridges(
    heights,
    center_x: int,
    center_z: int,
    x_cells: range,
    z_cells: range,
    bridge_height: int = WORLD_SCALE,
    margin: int = 48,
) -> dict[tuple[int, int, int], dict]:
    bridge_cells = {}
    mask = bytearray(WORLD["width"] * WORLD["depth"])
    x_bounds = (max(1, x_cells.start - margin), min(WORLD["width"] - 1, x_cells.stop + margin))
    z_bounds = (max(1, z_cells.start - margin), min(WORLD["depth"] - 1, z_cells.stop + margin))
    candidates = collect_bridge_candidates(heights, x_bounds, z_bounds)
    near_candidates = [
        item
        for item in candidates
        if bridge_distance_to_center(item, center_x, center_z) <= BLUE_CONNECTOR_NEAR_START_RADIUS
    ]
    near_candidates.sort(key=lambda item: item["score"])

    placed = 0
    placed_near = 0
    highest_bridge_cell_y = max(0, math.floor((GENERATION_HEIGHT_BLOCKS - bridge_height) / WORLD_SCALE))

    def place(candidate: dict) -> bool:
        nonlocal placed
        if placed >= BLUE_CONNECTOR_TARGET:
            return False
        x, z, length, axis = candidate["x"], candidate["z"], candidate["length"], candidate["axis"]
        if same_island_path_exists(heights, x, z, length, axis):
            return False
        if not can_place_bridge(heights, mask, x, z, length, axis):
            return False

        start_height, end_height = bridge_end_heights(heights, x, z, length, axis)
        y = bridge_cell_y_for_candidate(candidate, highest_bridge_cell_y, max(0, min(start_height, end_height) - 1))
        for index in range(length):
            cell_x = x + (index if axis == "x" else 0)
            cell_z = z + (index if axis == "z" else 0)
            bridge_cells[(cell_x, y, cell_z)] = {"axis": axis}
        reserve_bridge_area(mask, x, z, length, axis)
        placed += 1
        return True

    for candidate in near_candidates:
        if placed_near >= BLUE_CONNECTOR_NEAR_START_TARGET or placed >= BLUE_CONNECTOR_TARGET:
            break
        if place(candidate):
            placed_near += 1

    for candidate in candidates:
        if placed >= BLUE_CONNECTOR_TARGET:
            break
        place(candidate)

    return bridge_cells


def world_to_cell(value: int, axis_size: int) -> int:
    return math.floor(value / WORLD_SCALE + axis_size / 2)


def cell_to_world(value: int, axis_size: int) -> int:
    return (value - axis_size // 2) * WORLD_SCALE


def height_to_world_y(value: int) -> int:
    return WORLD_MIN_Y + value


def fitting_templates(structures: list, remaining_height: int) -> list:
    return [
        build
        for build in structures
        if build.size[0] <= WORLD_SCALE and build.size[2] <= WORLD_SCALE and build.size[1] <= remaining_height
    ]


def can_fill_height(structures: list, height: int, cache: dict[int, bool]) -> bool:
    if height == 0:
        return True
    if height < 0:
        return False
    if height in cache:
        return cache[height]
    cache[height] = any(can_fill_height(structures, height - build.size[1], cache) for build in structures)
    return cache[height]


def choose_stack_template(
    structures: list,
    x: int,
    z: int,
    cursor_height: int,
    remaining_height: int,
    fill_cache: dict[int, bool],
):
    candidates = fitting_templates(structures, remaining_height)
    if not candidates:
        return None

    clean = [build for build in candidates if can_fill_height(structures, remaining_height - build.size[1], fill_cache)]

    pool = clean or candidates
    index = math.floor(js_like_hash01(x, z, cursor_height + 61000) * len(pool))
    return pool[min(len(pool) - 1, index)]


def stack_for_column(structures: list, heights, x: int, z: int) -> list[dict]:
    available_height = solid_height_blocks(heights, x, z)
    stack = []
    cursor_height = 0
    fill_cache = {0: True}

    while cursor_height < available_height:
        remaining = available_height - cursor_height
        build = choose_stack_template(structures, x, z, cursor_height, remaining, fill_cache)
        if build is None:
            break
        stack.append({"name": build.name, "y": cursor_height, "size": build.size})
        cursor_height += build.size[1]

    return stack


def compute_wall_distance_map(heights) -> list[bytearray]:
    distances = [bytearray([255]) * WORLD["width"] for _ in range(WORLD["depth"])]

    for z in range(WORLD["depth"]):
        for x in range(WORLD["width"]):
            if heights[z][x] != 0:
                continue

            best_distance = 255
            for dz in range(-WALL_MAX_DISTANCE_CELLS, WALL_MAX_DISTANCE_CELLS + 1):
                for dx in range(-WALL_MAX_DISTANCE_CELLS, WALL_MAX_DISTANCE_CELLS + 1):
                    if dx == 0 and dz == 0:
                        continue
                    solid_x = x + dx
                    solid_z = z + dz
                    if solid_x < 0 or solid_z < 0 or solid_x >= WORLD["width"] or solid_z >= WORLD["depth"]:
                        continue
                    if heights[solid_z][solid_x] == 0:
                        continue
                    distance = max(abs(dx), abs(dz))
                    best_distance = min(best_distance, distance)

            if best_distance <= WALL_MAX_DISTANCE_CELLS:
                distances[z][x] = best_distance

    return distances


def wall_depth_for_segment(segment_end_blocks: int) -> int:
    end_blocks = min(GENERATION_HEIGHT_BLOCKS, segment_end_blocks)
    depth = 1 + math.floor((end_blocks * math.tan(math.radians(WALL_TILT_DEGREES)) + WALL_THICKNESS_BLOCKS) / WORLD_SCALE)
    return max(1, min(WALL_MAX_DISTANCE_CELLS, depth))


def bridge_segments_by_column(bridge_cells, bridge_height: int) -> dict[tuple[int, int], list[tuple[int, int]]]:
    segments: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for x, y, z in bridge_cells:
        segments.setdefault((x, z), []).append((y * WORLD_SCALE, y * WORLD_SCALE + bridge_height))
    return segments


def overlaps_bridge_segment(
    bridge_segments: dict[tuple[int, int], list[tuple[int, int]]],
    x: int,
    z: int,
    start_y: int,
    end_y: int,
) -> bool:
    for bridge_start_y, bridge_end_y in bridge_segments.get((x, z), []):
        if start_y < bridge_end_y and end_y > bridge_start_y:
            return True
    return False


def wall_panel_names_for_cell(heights, x: int, z: int, distance: int) -> list[str]:
    panels = set()
    for dz in range(-distance, distance + 1):
        for dx in range(-distance, distance + 1):
            if dx == 0 and dz == 0:
                continue
            if max(abs(dx), abs(dz)) != distance:
                continue
            solid_x = x + dx
            solid_z = z + dz
            if solid_x < 0 or solid_z < 0 or solid_x >= WORLD["width"] or solid_z >= WORLD["depth"]:
                continue
            if heights[solid_z][solid_x] == 0:
                continue
            if dx < 0:
                panels.add("stone_wall_x_neg")
            elif dx > 0:
                panels.add("stone_wall_x_pos")
            if dz < 0:
                panels.add("stone_wall_z_neg")
            elif dz > 0:
                panels.add("stone_wall_z_pos")
    return sorted(panels)


def wall_variant_name(name: str, height: int) -> str:
    if height == WORLD_SCALE:
        return name
    return f"{name}_h{height}"


def generate_slope_walls(heights, x_cells: range, z_cells: range, bridge_cells, bridge_height: int) -> list[dict]:
    wall_distances = compute_wall_distance_map(heights)
    bridge_segments = bridge_segments_by_column(bridge_cells, bridge_height)
    walls = []

    for z in z_cells:
        for x in x_cells:
            if heights[z][x] != 0:
                continue
            distance = wall_distances[z][x]
            if distance == 0 or distance == 255:
                continue
            panel_names = wall_panel_names_for_cell(heights, x, z, distance)
            if not panel_names:
                continue

            y = 0
            while y < GENERATION_HEIGHT_BLOCKS:
                segment_end = min(GENERATION_HEIGHT_BLOCKS, y + WORLD_SCALE)
                segment_height = segment_end - y
                if wall_depth_for_segment(segment_end) < distance:
                    y = segment_end
                    continue
                if overlaps_bridge_segment(bridge_segments, x, z, y, segment_end):
                    y = segment_end
                    continue

                for panel_name in panel_names:
                    variant_name = wall_variant_name(panel_name, segment_height)
                    walls.append(
                        {
                            "kind": "wall_panel",
                            "name": variant_name,
                            "block": "minecraft:stone",
                            "source": f"structures/{variant_name}.nbt",
                            "pos": [
                                cell_to_world(x, WORLD["width"]),
                                height_to_world_y(y),
                                cell_to_world(z, WORLD["depth"]),
                            ],
                            "rotation_y": 0,
                            "size": [WORLD_SCALE, segment_height, WORLD_SCALE],
                            "distance_from_solid": distance,
                            "max_distance_from_solid": WALL_MAX_DISTANCE_CELLS,
                            "tilt_degrees": WALL_TILT_DEGREES,
                            "blocky": True,
                        }
                    )
                y = segment_end

    walls.sort(key=lambda item: (item["pos"][2], item["pos"][1], item["pos"][0]))
    return walls


def zone_cells(center_x: int, center_z: int, size: int) -> tuple[range, range, dict]:
    half = size // 2
    min_x = center_x - half
    max_x = center_x + half
    min_z = center_z - half
    max_z = center_z + half
    min_cell_x = max(0, world_to_cell(min_x, WORLD["width"]))
    max_cell_x = min(WORLD["width"], world_to_cell(max_x - 1, WORLD["width"]) + 1)
    min_cell_z = max(0, world_to_cell(min_z, WORLD["depth"]))
    max_cell_z = min(WORLD["depth"], world_to_cell(max_z - 1, WORLD["depth"]) + 1)
    bounds = {
        "min": [min_x, WORLD_MIN_Y, min_z],
        "max": [max_x, WORLD_MAX_Y, max_z],
        "cell_min": [min_cell_x, 0, min_cell_z],
        "cell_max": [max_cell_x, WORLD["height"], max_cell_z],
    }
    return range(min_cell_x, max_cell_x), range(min_cell_z, max_cell_z), bounds


def build_export(args: argparse.Namespace) -> dict:
    structures = load_structures(args.structures_dir)
    normal_structures = [structures[name] for name in ACTIVE_STRUCTURE_NAMES if name in structures]
    bridge_build = next((structures[name] for name in ACTIVE_BRIDGE_NAMES if name in structures), None)
    bridge_height = bridge_build.size[1] if bridge_build is not None else WORLD_SCALE
    if not normal_structures:
        raise SystemExit("Aucune structure active trouvee dans le dossier structures.")

    x_cells, z_cells, bounds = zone_cells(args.center_x, args.center_z, args.size)
    heights = generate_column_heights(args.noise)
    bridge_cells = generate_bridges(heights, args.center_x, args.center_z, x_cells, z_cells, bridge_height)
    slope_walls = generate_slope_walls(heights, x_cells, z_cells, bridge_cells, bridge_height)

    placements = []
    skipped_small_tops = 0

    for z in z_cells:
        for x in x_cells:
            if heights[z][x] == 0:
                continue
            stack = stack_for_column(normal_structures, heights, x, z)
            for item in stack:
                placements.append(
                    {
                        "kind": "structure",
                        "name": item["name"],
                        "pos": [
                            cell_to_world(x, WORLD["width"]),
                            height_to_world_y(item["y"]),
                            cell_to_world(z, WORLD["depth"]),
                        ],
                        "rotation_y": 0,
                        "size": list(item["size"]),
                    }
                )
            filled = sum(item["size"][1] for item in stack)
            if filled < solid_height_blocks(heights, x, z):
                skipped_small_tops += 1

    bridge_placements = 0
    if bridge_build is not None:
        x_set = set(x_cells)
        z_set = set(z_cells)
        for (x, y, z), bridge in sorted(bridge_cells.items()):
            if x not in x_set or z not in z_set:
                continue
            placements.append(
                {
                    "kind": "bridge",
                    "name": bridge_build.name,
                    "pos": [
                        cell_to_world(x, WORLD["width"]),
                        height_to_world_y(y * WORLD_SCALE),
                        cell_to_world(z, WORLD["depth"]),
                    ],
                    "rotation_y": 90 if bridge["axis"] == "x" else 0,
                    "size": list(bridge_build.size),
                    "axis": bridge["axis"],
                }
            )
            bridge_placements += 1

    placements.extend(slope_walls)
    placements.sort(key=lambda item: (item["pos"][2], item["pos"][1], item["pos"][0], item["kind"]))
    return {
        "version": 1,
        "type": "msmp_zone_export",
        "units": "minecraft_blocks",
        "world": {
            "logical_size": [WORLD["width"], WORLD["height"], WORLD["depth"]],
            "scale": WORLD_SCALE,
            "vertical_range": [WORLD_MIN_Y, WORLD_MAX_Y],
            "generation_y_range": [WORLD_MIN_Y, GENERATION_MAX_Y],
        },
        "zone": {
            "center": [args.center_x, args.center_z],
            "size": [args.size, args.size],
            "bounds": bounds,
        },
        "structures": {
            name: {
                "source": structures[name].source,
                "size": list(structures[name].size),
            }
            for name in sorted(structures)
        },
        "stats": {
            "placements": len(placements),
            "bridges": bridge_placements,
            "slope_walls": len(slope_walls),
            "wall_panels": len(slope_walls),
            "skipped_small_tops": skipped_small_tops,
        },
        "placements": placements,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exporte une zone de la map en placements de structures.")
    parser.add_argument("--center-x", type=int, default=-95 * WORLD_SCALE)
    parser.add_argument("--center-z", type=int, default=-145 * WORLD_SCALE)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--noise", type=Path, default=Path("web/noisemap.stringy.jpg"))
    parser.add_argument("--structures-dir", type=Path, default=Path("structures"))
    parser.add_argument("--out", type=Path, default=Path("exports/zone_512.json"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_export(args)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"{payload['stats']['placements']} placements exportes vers {args.out}")
    print(f"{payload['stats']['bridges']} bridges dans la zone")


if __name__ == "__main__":
    main()
