from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path


DEFAULT_SEED = 98371
DEFAULT_OUT = Path("exports/building_long_minecraft.json")


@dataclass(frozen=True)
class Zone:
    length: int = 1000
    width: int = 280
    height: int = 150


BLOCK_BY_KIND = {
    "building": "minecraft:deepslate_bricks",
    "building_dark": "minecraft:polished_blackstone_bricks",
    "floor": "minecraft:deepslate_tiles",
    "stair": "minecraft:polished_deepslate",
    "column": "minecraft:blackstone",
    "trail": "minecraft:deepslate",
    "window": "minecraft:tinted_glass",
    "window_dim": "minecraft:gray_stained_glass",
}


class JsRng:
    def __init__(self, seed: int) -> None:
        self.state = seed & 0xFFFFFFFF

    def random(self) -> float:
        self.state = (self.state * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.state / 4294967296

    def randint0(self, upper_exclusive: int) -> int:
        return int(self.random() * upper_exclusive)


def clipped_box(zone: Zone, x: int, y: int, z: int, sx: int, sy: int, sz: int) -> tuple[int, int, int, int, int, int] | None:
    x0 = max(0, x)
    y0 = max(0, y)
    z0 = max(0, z)
    x1 = min(zone.length, x + sx)
    y1 = min(zone.height, y + sy)
    z1 = min(zone.width, z + sz)
    if x1 <= x0 or y1 <= y0 or z1 <= z0:
        return None
    return x0, y0, z0, x1 - x0, y1 - y0, z1 - z0


def add_box(boxes: list[tuple[int, int, int, int, int, int, str]], zone: Zone, x: int, y: int, z: int, sx: int, sy: int, sz: int, kind: str) -> None:
    box = clipped_box(zone, x, y, z, sx, sy, sz)
    if box:
        boxes.append((*box, kind))


def make_window_set(building: tuple[int, int, int, int, int, int], rng: JsRng, density: float, zone: Zone) -> set[tuple[int, int]]:
    x, _y, _z, sx, sy, _sz = building
    cells: set[tuple[int, int]] = set()
    start_x = x + 3
    end_x = x + sx - 4
    end_y = min(sy - 5, zone.height - 5)

    for wy in range(6, end_y + 1, 6):
        row_shift = 0 if (wy // 18) % 2 == 0 else 2
        for wx in range(start_x + row_shift, end_x + 1, 5):
            if rng.random() > density or (wx + wy) % 23 == 0:
                continue
            cells.add((wx, wy))
            cells.add((wx, wy + 1))
    return cells


def add_window_block(boxes: list[tuple[int, int, int, int, int, int, str]], zone: Zone, x: int, y: int, z: int, rng: JsRng) -> None:
    add_box(boxes, zone, x, y, z, 1, 1, 1, "window" if rng.random() < 0.78 else "window_dim")


def add_facade(
    boxes: list[tuple[int, int, int, int, int, int, str]],
    zone: Zone,
    building: tuple[int, int, int, int, int, int],
    facade_z: int,
    window_cells: set[tuple[int, int]],
    rng: JsRng,
    wall_kind: str,
) -> None:
    x, _y, _z, sx, sy, _sz = building
    for y in range(sy):
        run_start: int | None = None
        for dx in range(sx):
            wx = x + dx
            is_window = (wx, y) in window_cells
            if is_window:
                if run_start is not None:
                    add_box(boxes, zone, run_start, y, facade_z, wx - run_start, 1, 1, wall_kind)
                    run_start = None
                add_window_block(boxes, zone, wx, y, facade_z, rng)
            elif run_start is None:
                run_start = wx

        if run_start is not None:
            add_box(boxes, zone, run_start, y, facade_z, x + sx - run_start, 1, 1, wall_kind)


def make_stair_layout(building: tuple[int, int, int, int, int, int], rng: JsRng) -> dict | None:
    x, _y, z, sx, _sy, sz = building
    if sx < 12 or sz < 10:
        return None

    floor_step = 8
    direction = 1 if rng.random() >= 0.5 else -1
    stair_run = floor_step - 1
    inner_min_x = x + 2
    inner_max_x = x + sx - 3
    span = max(1, inner_max_x - inner_min_x - stair_run + 2)
    stair_x = inner_min_x + rng.randint0(span) if direction > 0 else inner_max_x - rng.randint0(span)
    stair_z = z + 2 + rng.randint0(max(1, sz - 6))
    end_x = stair_x + direction * (stair_run - 1)
    hole_start_x = end_x - 2 if direction > 0 else end_x
    hole_end_x = end_x + 1 if direction > 0 else end_x + 3

    return {
        "floor_step": floor_step,
        "stair_run": stair_run,
        "stair_x": stair_x,
        "stair_z": stair_z,
        "direction": direction,
        "hole_x0": max(x + 1, hole_start_x),
        "hole_x1": min(x + sx - 1, hole_end_x),
        "hole_z0": max(z + 1, stair_z),
        "hole_z1": min(z + sz - 1, stair_z + 2),
    }


def add_floor_plate(
    boxes: list[tuple[int, int, int, int, int, int, str]],
    zone: Zone,
    building: tuple[int, int, int, int, int, int],
    y: int,
    hole: dict | None,
) -> None:
    x, _building_y, z, sx, _sy, sz = building
    x0 = x + 1
    x1 = x + sx - 1
    z0 = z + 1
    z1 = z + sz - 1

    if not hole:
        add_box(boxes, zone, x0, y, z0, max(1, x1 - x0), 1, max(1, z1 - z0), "floor")
        return

    hx0 = max(x0, hole["hole_x0"])
    hx1 = min(x1, hole["hole_x1"])
    hz0 = max(z0, hole["hole_z0"])
    hz1 = min(z1, hole["hole_z1"])

    add_box(boxes, zone, x0, y, z0, x1 - x0, 1, hz0 - z0, "floor")
    add_box(boxes, zone, x0, y, hz1, x1 - x0, 1, z1 - hz1, "floor")
    add_box(boxes, zone, x0, y, hz0, hx0 - x0, 1, hz1 - hz0, "floor")
    add_box(boxes, zone, hx1, y, hz0, x1 - hx1, 1, hz1 - hz0, "floor")


def add_internal_stairs(
    boxes: list[tuple[int, int, int, int, int, int, str]],
    zone: Zone,
    building: tuple[int, int, int, int, int, int],
    layout: dict | None,
) -> None:
    if not layout:
        return
    _x, _y, _z, _sx, sy, _sz = building
    for floor_y in range(0, sy - layout["floor_step"], layout["floor_step"]):
        for step in range(layout["stair_run"]):
            sx_pos = layout["stair_x"] + step * layout["direction"]
            add_box(boxes, zone, sx_pos, floor_y + 1 + step, layout["stair_z"], 1, 1, 2, "stair")


def add_building_shell(
    boxes: list[tuple[int, int, int, int, int, int, str]],
    zone: Zone,
    building: tuple[int, int, int, int, int, int],
    rng: JsRng,
    is_dark: bool,
) -> None:
    x, _y, z, sx, sy, sz = building
    wall_kind = "building_dark" if is_dark else "building"

    add_box(boxes, zone, x, 0, z + 1, 1, sy, max(1, sz - 2), wall_kind)
    add_box(boxes, zone, x + sx - 1, 0, z + 1, 1, sy, max(1, sz - 2), wall_kind)

    add_facade(boxes, zone, building, z, make_window_set(building, rng, 0.72, zone), rng, wall_kind)
    add_facade(boxes, zone, building, z + sz - 1, make_window_set(building, rng, 0.36, zone), rng, wall_kind)

    stair_layout = make_stair_layout(building, rng)
    for y in range(0, sy, 8):
        add_floor_plate(boxes, zone, building, y, None if y == 0 else stair_layout)
    add_floor_plate(boxes, zone, building, sy - 1, None)
    add_internal_stairs(boxes, zone, building, stair_layout)


def add_trail_block(blocks: list[tuple[int, int, int]], occupied: set[tuple[int, int, int]], zone: Zone, x: int, y: int, z: int) -> None:
    cell = (round(x), round(y), round(z))
    if cell in occupied:
        return
    cx, cy, cz = cell
    if 0 <= cx < zone.length and 0 <= cy < zone.height and 0 <= cz < zone.width:
        occupied.add(cell)
        blocks.append(cell)


def add_x_trail(blocks: list[tuple[int, int, int]], occupied: set[tuple[int, int, int]], breakable: set[tuple[int, int, int]], zone: Zone, x0: int, x1: int, y: int, z: int) -> None:
    for x in range(min(round(x0), round(x1)), max(round(x0), round(x1)) + 1):
        before = len(blocks)
        add_trail_block(blocks, occupied, zone, x, y, z)
        if len(blocks) > before:
            breakable.add(blocks[-1])


def add_z_trail(blocks: list[tuple[int, int, int]], occupied: set[tuple[int, int, int]], zone: Zone, x: int, y: int, z0: int, z1: int) -> None:
    for z in range(min(round(z0), round(z1)), max(round(z0), round(z1)) + 1):
        add_trail_block(blocks, occupied, zone, x, y, z)


def column_lane_z(column: dict, side: str) -> int:
    return column["z"] - 1 if side == "north" else column["z"] + column["width"]


def add_column_ramp(blocks: list[tuple[int, int, int]], occupied: set[tuple[int, int, int]], zone: Zone, column: dict, y: int, side: str, from_west: bool, delta_y: int) -> int:
    lane_z = column_lane_z(column, side)
    start_x = column["x"] - 1 if from_west else column["x"] + column["width"]
    end_x = column["x"] + column["width"] if from_west else column["x"] - 1
    steps = max(1, abs(end_x - start_x))
    direction = 1 if start_x <= end_x else -1
    for i in range(steps + 1):
        x = start_x + i * direction
        step_y = y + round((delta_y * i) / steps)
        add_trail_block(blocks, occupied, zone, x, step_y, lane_z)
    return y + delta_y


def column_ring_cells(column: dict) -> list[tuple[int, int]]:
    min_x = column["x"] - 1
    max_x = column["x"] + column["width"]
    min_z = column["z"] - 1
    max_z = column["z"] + column["width"]
    cells = []
    for x in range(min_x, max_x + 1):
        cells.append((x, min_z))
    for z in range(min_z + 1, max_z + 1):
        cells.append((max_x, z))
    for x in range(max_x - 1, min_x - 1, -1):
        cells.append((x, max_z))
    for z in range(max_z - 1, min_z, -1):
        cells.append((min_x, z))
    return cells


def add_column_spiral(blocks: list[tuple[int, int, int]], occupied: set[tuple[int, int, int]], zone: Zone, column: dict, y: int, side: str, from_west: bool) -> int:
    lane_z = column_lane_z(column, side)
    start = (column["x"] - 1 if from_west else column["x"] + column["width"], lane_z)
    exit_cell = (column["x"] + column["width"] if from_west else column["x"] - 1, lane_z)
    clockwise = from_west if side == "north" else not from_west
    ring = column_ring_cells(column)
    if not clockwise:
        ring.reverse()
    start_index = ring.index(start) if start in ring else 0
    ordered = ring[start_index:] + ring[:start_index]
    current_y = y
    last_y = y
    did_full_loop = False
    for i in range(len(ordered) * 2):
        cell = ordered[i % len(ordered)]
        last_y = current_y
        add_trail_block(blocks, occupied, zone, cell[0], last_y, cell[1])
        if i > 0 and i % 2 == 0:
            current_y += 1
        if i >= len(ordered):
            did_full_loop = True
        if did_full_loop and cell == exit_cell:
            break
    return last_y


def generate_red_trail(column_centers: list[dict], rng: JsRng, zone: Zone) -> tuple[list[tuple[int, int, int]], set[tuple[int, int, int]]]:
    trail: list[tuple[int, int, int]] = []
    occupied: set[tuple[int, int, int]] = set()
    breakable: set[tuple[int, int, int]] = set()
    by_z: dict[int, list[dict]] = {}
    for column in column_centers:
        by_z.setdefault(column["z"], []).append(column)

    rows = sorted(by_z)
    row = 1 + rng.randint0(max(1, len(rows) - 2))
    side = "north" if rng.random() < 0.5 else "south"
    y = 8 + rng.randint0(12)
    from_west = rng.random() < 0.5
    x = 0 if from_west else zone.length - 1

    while x < zone.length - 1 if from_west else x > 0:
        columns = sorted(by_z[rows[row]], key=lambda item: item["x"], reverse=not from_west)
        next_column = next((column for column in columns if (column["x"] + column["width"] >= x + 1 if from_west else column["x"] <= x - 1)), None)
        if not next_column:
            add_x_trail(trail, occupied, breakable, zone, x, zone.length - 1 if from_west else 0, y, column_lane_z(columns[-1], side))
            break

        lane_z = column_lane_z(next_column, side)
        approach_x = max(x, next_column["x"] - 1) if from_west else min(x, next_column["x"] + next_column["width"])
        add_x_trail(trail, occupied, breakable, zone, x, approach_x, y, lane_z)

        roll = rng.random()
        if roll < 0.2 and y < zone.height - 30:
            y = add_column_spiral(trail, occupied, zone, next_column, y, side, from_west)
        elif roll < 0.52 and y < zone.height - 14:
            y = add_column_ramp(trail, occupied, zone, next_column, y, side, from_west, 2)
        elif roll < 0.78 and y > 12:
            y = add_column_ramp(trail, occupied, zone, next_column, y, side, from_west, -2)
        else:
            add_column_ramp(trail, occupied, zone, next_column, y, side, from_west, 0)

        if rng.random() < 0.28:
            direction = -1 if rng.random() < 0.5 else 1
            next_row = max(0, min(len(rows) - 1, row + direction))
            if next_row != row:
                from_z = column_lane_z(next_column, side)
                row = next_row
                side = "south" if side == "north" else "north"
                target_column = next((column for column in by_z[rows[row]] if column["x"] == next_column["x"]), next_column)
                to_z = column_lane_z(target_column, side)
                add_z_trail(trail, occupied, zone, next_column["x"] + next_column["width"] + 1 if from_west else next_column["x"] - 1, y, from_z, to_z)

        x = next_column["x"] + next_column["width"] + 1 if from_west else next_column["x"] - 1

    return trail, breakable


def degrade_trail(candidate: list[tuple[int, int, int]], breakable: set[tuple[int, int, int]], rng: JsRng, ratio: float = 0.2) -> list[tuple[int, int, int]]:
    return [cell for cell in candidate if cell not in breakable or rng.random() >= ratio]


def has_trail_conflict(candidate: list[tuple[int, int, int]], heights_by_xz: dict[tuple[int, int], list[int]]) -> bool:
    for x, y, z in candidate:
        if any(abs(height - y) < 3 for height in heights_by_xz.get((x, z), [])):
            return True
    return False


def register_trail(candidate: list[tuple[int, int, int]], heights_by_xz: dict[tuple[int, int], list[int]]) -> None:
    for x, y, z in candidate:
        heights_by_xz.setdefault((x, z), []).append(y)


def generate_red_trails(column_centers: list[dict], rng: JsRng, zone: Zone, count: int, ports: list[dict] | None = None) -> tuple[list[tuple[int, int, int]], int]:
    trails: list[tuple[int, int, int]] = []
    heights_by_xz: dict[tuple[int, int], list[int]] = {}
    accepted = 0
    for _ in range(count):
        candidate = None
        for _attempt in range(700):
            raw, breakable = generate_red_trail(column_centers, rng, zone)
            degraded = degrade_trail(raw, breakable, rng)
            if degraded and not has_trail_conflict(degraded, heights_by_xz):
                candidate = degraded
                break
        if candidate is None:
            continue
        if ports is not None:
            for side, edge in (("start", 0), ("end", zone.length - 1)):
                ends = [cell for cell in raw if cell[0] == edge]
                if ends:
                    pos = ends[0] if raw[0][0] == edge else ends[-1]
                    ports.append({"trail": accepted, "side": side, "pos": list(pos)})
        register_trail(candidate, heights_by_xz)
        trails.extend(candidate)
        accepted += 1
    return trails, accepted


def boxes_to_runs(boxes: list[tuple[int, int, int, int, int, int, str]]) -> list[dict]:
    runs = []
    for x, y, z, sx, sy, sz, kind in boxes:
        runs.append(
            {
                "kind": kind,
                "block": BLOCK_BY_KIND[kind],
                "pos": [x, y, z],
                "size": [sx, sy, sz],
            }
        )
    return runs


def run_volume(run: dict) -> int:
    sx, sy, sz = run["size"]
    return sx * sy * sz


def cells_to_runs(cells: list[tuple[int, int, int]], kind: str) -> list[dict]:
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


def build_payload(seed: int, zone: Zone, trail_count: int, *, include_ports: bool = False) -> dict:
    rng = JsRng(seed)
    boxes: list[tuple[int, int, int, int, int, int, str]] = []
    building_count = 0
    column_centers: list[dict] = []

    row_depths = [24, 24, 24]
    row_z = [14, 48, 82]
    for row in range(3):
        x = row * 6
        while x < zone.length:
            wanted_sx = 26 + rng.randint0(28)
            sz = row_depths[row] + rng.randint0(6)
            sy = zone.height - rng.randint0(18)
            z = row_z[row] + rng.randint0(4)
            building = clipped_box(zone, x, 0, z, wanted_sx, sy, sz)
            if building and building[3] >= 12:
                add_building_shell(boxes, zone, building, rng, rng.random() < 0.22)
                building_count += 1
            x += wanted_sx + 8 + rng.randint0(8)

    for x in range(0, zone.length + 1, 20):
        for z in range(180, 241, 20):
            width = 4
            add_box(boxes, zone, x, 0, z, width, zone.height, width, "column")
            if clipped_box(zone, x, 0, z, width, zone.height, width):
                column_centers.append({"x": x, "z": z, "width": width})

    trail_ports: list[dict] = []
    trails, accepted_trails = generate_red_trails(column_centers, rng, zone, trail_count, trail_ports if include_ports else None)
    runs = boxes_to_runs(boxes) + cells_to_runs(trails, "trail")
    blocks = sum(run_volume(run) for run in runs)
    return {
        **({"trail_ports": trail_ports} if include_ports else {}),
        "version": 1,
        "type": "building_long_minecraft_export",
        "units": "blocks",
        "operation_order": "place all runs; this export does not include a base fill, so unlisted blocks stay unchanged",
        "zone": {
            "size": [zone.length, zone.height, zone.width],
            "axes": {"length": "x", "height": "y", "width": "z"},
        },
        "settings": {
            "seed": seed,
            "trail_count": trail_count,
            "blocks": BLOCK_BY_KIND,
        },
        "stats": {
            "buildings": building_count,
            "columns": len(column_centers),
            "accepted_trails": accepted_trails,
            "trail_blocks": len(trails),
            "blocks": blocks,
            "runs": len(runs),
        },
        "runs": runs,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exporte la zone building_long pour Minecraft.")
    parser.add_argument("--length", type=int, default=1000)
    parser.add_argument("--width", type=int, default=280)
    parser.add_argument("--height", type=int, default=150)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--trails", type=int, default=10)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_payload(args.seed, Zone(args.length, args.width, args.height), args.trails)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    stats = payload["stats"]
    print(f"{stats['buildings']} buildings")
    print(f"{stats['columns']} colonnes")
    print(f"{stats['accepted_trails']}/{args.trails} chemins")
    print(f"{stats['trail_blocks']} blocks de chemins")
    print(f"{stats['runs']} runs exportes vers {args.out}")


if __name__ == "__main__":
    main()
