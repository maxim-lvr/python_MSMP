from __future__ import annotations

import argparse
import gzip
import json
import math
import random
import struct
import tkinter as tk
from dataclasses import asdict, dataclass, field
from pathlib import Path
from tkinter import filedialog, messagebox


MAP_BOUNDS = {
    "x": (-500, 500),
    "y": (-64, 320),
    "z": (-500, 500),
}

LEVELS = [-64, 32, 128, 224]
PLATFORM_THICKNESS = 4
PLATFORM_INSET = 30
COLLISION_CELL_SIZE = 96
CHUNK_SIZE = 32
PLAYER_WIDTH = 1
PLAYER_HEIGHT = 2
PLAYER_EYE_HEIGHT = 1.6
RENDER_DISTANCE_CHUNKS = 2
VIEWPORT_MARGIN = 180
FAR_RENDER_BUDGET = 180
MID_RENDER_BUDGET = 320
MAX_CANDIDATE_ITEMS = 700
HORIZONTAL_FOV_DEGREES = 95
VERTICAL_FOV_DEGREES = 75

DEFAULT_STRUCTURES = [
    {"name": "micro_block_8x4x6", "size": (8, 4, 6), "count": 100},
    {"name": "compact_6x12x6", "size": (6, 12, 6), "count": 100},
    {"name": "tower_8x10x8", "size": (8, 10, 8), "count": 100},
    {"name": "distant_tower_8x80x8", "size": (8, 80, 8), "count": 10},
    {"name": "wide_hall_30x10x18", "size": (30, 10, 18), "count": 100},
    {"name": "medium_block_18x24x14", "size": (18, 24, 14), "count": 100},
    {"name": "large_block_42x36x28", "size": (42, 36, 28), "count": 100},
    {"name": "long_bar_64x16x12", "size": (64, 16, 12), "count": 100},
]

STRUCTURE_DIR = Path("structure")
AIR_BLOCKS = {"minecraft:air", "minecraft:cave_air", "minecraft:void_air"}

BUILD_COLORS = [
    "#ff4d4d",
    "#4dff88",
    "#4da6ff",
    "#ffd84d",
    "#c77dff",
    "#ff8f4d",
    "#4dffe1",
    "#ff4db8",
    "#a6ff4d",
    "#8f7aff",
    "#ff6f91",
    "#6ee7b7",
    "#60a5fa",
    "#facc15",
    "#f472b6",
    "#fb923c",
    "#22d3ee",
    "#a3e635",
]

STRUCTURE_COLORS = {
    "tower_8x10x8": "#ff4d4d",
    "micro_block_8x4x6": "#4dff88",
    "compact_6x12x6": "#4da6ff",
    "wide_hall_30x10x18": "#ffd84d",
    "medium_block_18x24x14": "#c77dff",
    "large_block_42x36x28": "#ff8f4d",
    "long_bar_64x16x12": "#4dffe1",
    "distant_tower_8x80x8": "#ff4d4d",
    "chunk_fill_32x32x32": "#9ca3af",
    "void_filler_exact": "#d1d5db",
}


@dataclass(frozen=True)
class StructureSpec:
    name: str
    size: tuple[int, int, int]
    count: int = 1
    source: str | None = None


@dataclass(frozen=True)
class Placement:
    id: int
    name: str
    start: tuple[int, int, int]
    size: tuple[int, int, int]
    kind: str = "structure"
    source: str | None = None

    @property
    def end(self) -> tuple[int, int, int]:
        x, y, z = self.start
        sx, sy, sz = self.size
        return x + sx, y + sy, z + sz

    @property
    def color(self) -> str:
        if self.kind == "platform":
            return "#56616e"
        return structure_color(self.name)


@dataclass(frozen=True)
class BlockVoxel:
    pos: tuple[int, int, int]
    name: str
    color: str


@dataclass(frozen=True)
class MinecraftBuild:
    name: str
    size: tuple[int, int, int]
    source: str
    blocks: tuple[BlockVoxel, ...] = field(default_factory=tuple)


def stable_name_index(name: str) -> int:
    total = 0
    for index, char in enumerate(name, start=1):
        total += index * ord(char)
    return total


def structure_color(name: str) -> str:
    if name in STRUCTURE_COLORS:
        return STRUCTURE_COLORS[name]
    return BUILD_COLORS[stable_name_index(name) % len(BUILD_COLORS)]


class NbtReader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0

    def read(self, length: int) -> bytes:
        chunk = self.data[self.offset : self.offset + length]
        if len(chunk) != length:
            raise ValueError("NBT tronque")
        self.offset += length
        return chunk

    def read_u8(self) -> int:
        return self.read(1)[0]

    def read_i8(self) -> int:
        return struct.unpack(">b", self.read(1))[0]

    def read_i16(self) -> int:
        return struct.unpack(">h", self.read(2))[0]

    def read_i32(self) -> int:
        return struct.unpack(">i", self.read(4))[0]

    def read_i64(self) -> int:
        return struct.unpack(">q", self.read(8))[0]

    def read_f32(self) -> float:
        return struct.unpack(">f", self.read(4))[0]

    def read_f64(self) -> float:
        return struct.unpack(">d", self.read(8))[0]

    def read_string(self) -> str:
        length = struct.unpack(">H", self.read(2))[0]
        return self.read(length).decode("utf-8")

    def read_payload(self, tag_type: int):
        if tag_type == 1:
            return self.read_i8()
        if tag_type == 2:
            return self.read_i16()
        if tag_type == 3:
            return self.read_i32()
        if tag_type == 4:
            return self.read_i64()
        if tag_type == 5:
            return self.read_f32()
        if tag_type == 6:
            return self.read_f64()
        if tag_type == 7:
            return [self.read_i8() for _ in range(self.read_i32())]
        if tag_type == 8:
            return self.read_string()
        if tag_type == 9:
            child_type = self.read_u8()
            length = self.read_i32()
            return [self.read_payload(child_type) for _ in range(length)]
        if tag_type == 10:
            compound = {}
            while True:
                child_type = self.read_u8()
                if child_type == 0:
                    return compound
                name = self.read_string()
                compound[name] = self.read_payload(child_type)
        if tag_type == 11:
            return [self.read_i32() for _ in range(self.read_i32())]
        if tag_type == 12:
            return [self.read_i64() for _ in range(self.read_i32())]
        raise ValueError(f"Type NBT non supporte: {tag_type}")

    def read_root(self):
        tag_type = self.read_u8()
        if tag_type != 10:
            raise ValueError("Le root NBT doit etre un compound")
        _root_name = self.read_string()
        return self.read_payload(tag_type)


def read_nbt(path: Path):
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return NbtReader(raw).read_root()


def block_color(block_name: str) -> str:
    if "white" in block_name or "quartz" in block_name:
        return "#e8edf2"
    if "black" in block_name:
        return "#20242a"
    if "gray" in block_name or "grey" in block_name:
        return "#8b949e"
    if "red" in block_name:
        return "#ef4444"
    if "green" in block_name:
        return "#22c55e"
    if "blue" in block_name:
        return "#3b82f6"
    if "yellow" in block_name or "gold" in block_name:
        return "#eab308"
    if "orange" in block_name:
        return "#f97316"
    if "glass" in block_name:
        return "#93c5fd"
    if "light" in block_name or "lamp" in block_name or "lantern" in block_name:
        return "#fde68a"
    if "stone" in block_name or "concrete" in block_name:
        return "#9ca3af"
    if "wood" in block_name or "planks" in block_name:
        return "#b7793e"
    return BUILD_COLORS[stable_name_index(block_name) % len(BUILD_COLORS)]


def block_name_from_palette_entry(entry) -> str:
    if isinstance(entry, dict):
        return str(entry.get("Name") or entry.get("name") or "minecraft:unknown")
    return str(entry)


def load_minecraft_build(path: Path) -> MinecraftBuild:
    root = read_nbt(path)
    size = tuple(int(value) for value in root["size"])
    palette = root.get("palette") or root.get("palettes", [[]])[0]
    blocks = []
    for block in root.get("blocks", []):
        state = int(block.get("state", 0))
        block_name = block_name_from_palette_entry(palette[state])
        if block_name in AIR_BLOCKS:
            continue
        pos = tuple(int(value) for value in block["pos"])
        blocks.append(BlockVoxel(pos=pos, name=block_name, color=block_color(block_name)))
    return MinecraftBuild(
        name=path.stem,
        size=size,
        source=str(path),
        blocks=tuple(blocks),
    )


def load_minecraft_builds(root: Path = STRUCTURE_DIR) -> dict[str, MinecraftBuild]:
    builds = {}
    if not root.exists():
        return builds
    for path in sorted(root.rglob("*.nbt")):
        try:
            build = load_minecraft_build(path)
        except (KeyError, ValueError, OSError, struct.error) as exc:
            print(f"NBT ignore {path}: {exc}")
            continue
        builds[build.name] = build
    return builds


def lighten_hex(color: str, amount: float = 0.45) -> str:
    color = color.lstrip("#")
    red = int(color[0:2], 16)
    green = int(color[2:4], 16)
    blue = int(color[4:6], 16)
    red = round(red + (255 - red) * amount)
    green = round(green + (255 - green) * amount)
    blue = round(blue + (255 - blue) * amount)
    return f"#{red:02x}{green:02x}{blue:02x}"


def shade_hex(color: str, amount: float) -> str:
    color = color.lstrip("#")
    red = int(color[0:2], 16)
    green = int(color[2:4], 16)
    blue = int(color[4:6], 16)
    if amount >= 0:
        red = round(red + (255 - red) * amount)
        green = round(green + (255 - green) * amount)
        blue = round(blue + (255 - blue) * amount)
    else:
        factor = 1 + amount
        red = round(red * factor)
        green = round(green * factor)
        blue = round(blue * factor)
    red = min(255, max(0, red))
    green = min(255, max(0, green))
    blue = min(255, max(0, blue))
    return f"#{red:02x}{green:02x}{blue:02x}"


def visual_color_for_item(item: Placement) -> str:
    if item.kind == "platform":
        return item.color
    x, y, z = item.start
    pattern = (item.id * 17 + x * 3 + y * 5 + z * 7) % 7
    amount = [-0.20, -0.12, -0.06, 0.0, 0.06, 0.12, 0.18][pattern]
    return shade_hex(item.color, amount)


def boxes_overlap(a: Placement, b: Placement, margin: int = 0) -> bool:
    ax1, ay1, az1 = a.start
    ax2, ay2, az2 = a.end
    bx1, by1, bz1 = b.start
    bx2, by2, bz2 = b.end
    return (
        ax1 - margin < bx2
        and ax2 + margin > bx1
        and ay1 - margin < by2
        and ay2 + margin > by1
        and az1 - margin < bz2
        and az2 + margin > bz1
    )


def collision_cells(item: Placement, margin: int = 0) -> set[tuple[int, int, int]]:
    x1, y1, z1 = item.start
    x2, y2, z2 = item.end
    min_x = math.floor((x1 - margin) / COLLISION_CELL_SIZE)
    max_x = math.floor((x2 + margin) / COLLISION_CELL_SIZE)
    min_y = math.floor((y1 - margin) / COLLISION_CELL_SIZE)
    max_y = math.floor((y2 + margin) / COLLISION_CELL_SIZE)
    min_z = math.floor((z1 - margin) / COLLISION_CELL_SIZE)
    max_z = math.floor((z2 + margin) / COLLISION_CELL_SIZE)
    return {
        (x, y, z)
        for x in range(min_x, max_x + 1)
        for y in range(min_y, max_y + 1)
        for z in range(min_z, max_z + 1)
    }


def chunk_coord(value: float) -> int:
    return math.floor(value / CHUNK_SIZE)


def placement_chunks(item: Placement) -> set[tuple[int, int, int]]:
    x1, y1, z1 = item.start
    x2, y2, z2 = item.end
    return {
        (x, y, z)
        for x in range(chunk_coord(x1), chunk_coord(x2 - 1) + 1)
        for y in range(chunk_coord(y1), chunk_coord(y2 - 1) + 1)
        for z in range(chunk_coord(z1), chunk_coord(z2 - 1) + 1)
    }


def build_chunk_index(placements: list[Placement]) -> dict[tuple[int, int, int], list[Placement]]:
    chunks: dict[tuple[int, int, int], list[Placement]] = {}
    for item in placements:
        for chunk in placement_chunks(item):
            chunks.setdefault(chunk, []).append(item)
    return chunks


def grid_candidates(
    item: Placement,
    grid: dict[tuple[int, int, int], list[Placement]],
    margin: int,
) -> list[Placement]:
    candidates_by_id: dict[int, Placement] = {}
    for cell in collision_cells(item, margin):
        for old in grid.get(cell, []):
            candidates_by_id[old.id] = old
    return list(candidates_by_id.values())


def add_to_collision_grid(
    item: Placement,
    grid: dict[tuple[int, int, int], list[Placement]],
    margin: int,
) -> None:
    for cell in collision_cells(item, margin):
        grid.setdefault(cell, []).append(item)


def collides_with_grid(
    item: Placement,
    grid: dict[tuple[int, int, int], list[Placement]],
    margin: int,
) -> bool:
    return any(boxes_overlap(item, old, margin) for old in grid_candidates(item, grid, margin))


def random_start(size: tuple[int, int, int], rng: random.Random) -> tuple[int, int, int]:
    sx, sy, sz = size
    return (
        rng.randint(MAP_BOUNDS["x"][0], MAP_BOUNDS["x"][1] - sx),
        rng.randint(MAP_BOUNDS["y"][0], MAP_BOUNDS["y"][1] - sy),
        rng.randint(MAP_BOUNDS["z"][0], MAP_BOUNDS["z"][1] - sz),
    )


def random_start_on_level(
    size: tuple[int, int, int],
    level_y: int,
    rng: random.Random,
) -> tuple[int, int, int]:
    sx, _sy, sz = size
    x_min = MAP_BOUNDS["x"][0] + PLATFORM_INSET
    x_max = MAP_BOUNDS["x"][1] - PLATFORM_INSET - sx
    z_min = MAP_BOUNDS["z"][0] + PLATFORM_INSET
    z_max = MAP_BOUNDS["z"][1] - PLATFORM_INSET - sz
    return (
        rng.randint(x_min, x_max),
        level_y + PLATFORM_THICKNESS,
        rng.randint(z_min, z_max),
    )


def platform_placements() -> list[Placement]:
    width = MAP_BOUNDS["x"][1] - MAP_BOUNDS["x"][0] - PLATFORM_INSET * 2
    length = MAP_BOUNDS["z"][1] - MAP_BOUNDS["z"][0] - PLATFORM_INSET * 2
    return [
        Placement(
            id=index,
            name=f"platform_level_{index}",
            start=(MAP_BOUNDS["x"][0] + PLATFORM_INSET, level_y, MAP_BOUNDS["z"][0] + PLATFORM_INSET),
            size=(width, PLATFORM_THICKNESS, length),
            kind="platform",
        )
        for index, level_y in enumerate(LEVELS, start=1)
    ]


def generate_simple_whiteroom_world() -> list[Placement]:
    builds = load_minecraft_builds()
    whiterooms = [build for name, build in sorted(builds.items()) if name.startswith("whiteroom")]
    placements = platform_placements()
    if not whiterooms:
        return placements

    base_x = -80
    base_y = LEVELS[1] + PLATFORM_THICKNESS
    base_z = -80
    gap = 1
    next_id = len(placements) + 1
    cursor_x = base_x
    cursor_z = base_z
    row_depth = 0

    for index in range(10):
        build = whiterooms[index % len(whiterooms)]
        sx, _sy, sz = build.size
        if index == 5:
            cursor_x = base_x
            cursor_z += row_depth + gap
            row_depth = 0
        placements.append(
            Placement(
                id=next_id,
                name=build.name,
                start=(cursor_x, base_y, cursor_z),
                size=build.size,
                kind="structure",
                source=build.source,
            )
        )
        next_id += 1
        cursor_x += sx + gap
        row_depth = max(row_depth, sz)

    return placements


def tower_anchor_positions(rng: random.Random) -> list[tuple[int, int, int]]:
    anchors = [
        (-430, -430),
        (420, -430),
        (-430, 420),
        (420, 420),
        (-230, 0),
        (230, 0),
        (0, -230),
        (0, 230),
    ]
    positions = []
    for index, (x, z) in enumerate(anchors):
        level_y = LEVELS[index % len(LEVELS)] + PLATFORM_THICKNESS
        jitter_x = rng.randint(-26, 26)
        jitter_z = rng.randint(-26, 26)
        positions.append((x + jitter_x, level_y, z + jitter_z))
    return positions


def generate_dense_world(
    specs: list[StructureSpec],
    seed: int | None = None,
    margin: int = 1,
    max_attempts: int = 3_000,
    max_failed_in_row: int = 80,
) -> list[Placement]:
    rng = random.Random(seed)
    placements = platform_placements()
    collision_grid: dict[tuple[int, int, int], list[Placement]] = {}
    next_id = len(placements) + 1

    distant_tower_specs = [spec for spec in specs if spec.name == "distant_tower_8x80x8"]
    distant_tower_count = sum(spec.count for spec in distant_tower_specs)
    distant_tower_size = distant_tower_specs[0].size if distant_tower_specs else (8, 80, 8)

    for start in tower_anchor_positions(rng)[:distant_tower_count]:
        tower = Placement(
            id=next_id,
            name="distant_tower_8x80x8",
            start=start,
            size=distant_tower_size,
            kind="tower",
        )
        if collides_with_grid(tower, collision_grid, margin):
            continue
        placements.append(tower)
        add_to_collision_grid(tower, collision_grid, margin)
        next_id += 1

    placeable_specs = [spec for spec in specs if spec.name != "distant_tower_8x80x8"]
    ordered_specs = sorted(placeable_specs, key=lambda item: item.size[0] * item.size[1] * item.size[2], reverse=True)
    for spec in ordered_specs:
        failed_in_row = 0
        for _ in range(spec.count):
            for _attempt in range(max_attempts):
                level_y = rng.choice(LEVELS)
                candidate = Placement(
                    id=next_id,
                    name=spec.name,
                    start=random_start_on_level(spec.size, level_y, rng),
                    size=spec.size,
                    kind="structure",
                    source=spec.source,
                )
                if not collides_with_grid(candidate, collision_grid, margin):
                    placements.append(candidate)
                    add_to_collision_grid(candidate, collision_grid, margin)
                    next_id += 1
                    failed_in_row = 0
                    break
            else:
                failed_in_row += 1
                if failed_in_row >= max_failed_in_row:
                    break

    return placements


def generate_placements(
    specs: list[StructureSpec],
    seed: int | None = None,
    margin: int = 0,
    max_attempts: int = 10_000,
) -> list[Placement]:
    rng = random.Random(seed)
    placements: list[Placement] = []
    collision_grid: dict[tuple[int, int, int], list[Placement]] = {}
    next_id = 1

    for spec in specs:
        for _ in range(spec.count):
            candidate = None
            for _attempt in range(max_attempts):
                candidate = Placement(
                    id=next_id,
                    name=spec.name,
                    start=random_start(spec.size, rng),
                    size=spec.size,
                    source=spec.source,
                )
                if not collides_with_grid(candidate, collision_grid, margin):
                    break
            else:
                raise RuntimeError(
                    f"Impossible de placer {spec.name} apres {max_attempts} essais. "
                    "La map est peut-etre trop remplie ou la marge trop grande."
                )

            placements.append(candidate)
            add_to_collision_grid(candidate, collision_grid, margin)
            next_id += 1

    return placements


def chunk_ranges(axis: str) -> list[tuple[int, int]]:
    start, end = MAP_BOUNDS[axis]
    ranges = []
    value = start
    while value < end:
        next_value = min(end, value + CHUNK_SIZE)
        ranges.append((value, next_value))
        value = next_value
    return ranges


def generate_full_chunk_world() -> list[Placement]:
    placements: list[Placement] = []
    next_id = 1
    for x1, x2 in chunk_ranges("x"):
        for y1, y2 in chunk_ranges("y"):
            for z1, z2 in chunk_ranges("z"):
                placements.append(
                    Placement(
                        id=next_id,
                        name="chunk_fill_32x32x32",
                        start=(x1, y1, z1),
                        size=(x2 - x1, y2 - y1, z2 - z1),
                        kind="chunk_fill",
                    )
                )
                next_id += 1
    return placements


def permutations3(size: tuple[int, int, int]) -> list[tuple[int, int, int]]:
    sx, sy, sz = size
    return [
        (sx, sy, sz),
        (sx, sz, sy),
        (sy, sx, sz),
        (sy, sz, sx),
        (sz, sx, sy),
        (sz, sy, sx),
    ]


def generate_until_no_space_world(
    specs: list[StructureSpec],
    margin: int = 0,
) -> list[Placement]:
    placements: list[Placement] = []
    next_id = 1
    active_specs = [spec for spec in specs if spec.count != 0]
    candidates = []
    for spec in active_specs:
        for size in sorted(set(permutations3(spec.size)), reverse=True):
            candidates.append((spec, size))
    candidates.sort(key=lambda item: item[1][0] * item[1][1] * item[1][2], reverse=True)
    free_boxes = [
        (
            MAP_BOUNDS["x"][0],
            MAP_BOUNDS["y"][0],
            MAP_BOUNDS["z"][0],
            MAP_BOUNDS["x"][1] - MAP_BOUNDS["x"][0],
            MAP_BOUNDS["y"][1] - MAP_BOUNDS["y"][0],
            MAP_BOUNDS["z"][1] - MAP_BOUNDS["z"][0],
        )
    ]

    def consumed_size(size: tuple[int, int, int]) -> tuple[int, int, int]:
        sx, sy, sz = size
        return sx + margin, sy + margin, sz + margin

    while free_boxes:
        free_boxes.sort(key=lambda box: box[3] * box[4] * box[5], reverse=True)
        x, y, z, width, height, depth = free_boxes.pop(0)
        chosen = None
        chosen_size = None
        consumed = None
        fitting = []
        best_volume = -1
        for spec, size in candidates:
            cx, cy, cz = consumed_size(size)
            if cx <= width and cy <= height and cz <= depth:
                volume = size[0] * size[1] * size[2]
                if volume > best_volume:
                    best_volume = volume
                    fitting = [(spec, size, (cx, cy, cz))]
                elif volume == best_volume:
                    fitting.append((spec, size, (cx, cy, cz)))
        if fitting:
            choice_index = abs(x * 31 + y * 17 + z * 13 + next_id) % len(fitting)
            chosen, chosen_size, consumed = fitting[choice_index]
        if chosen is None or chosen_size is None or consumed is None:
            placements.append(
                Placement(
                    id=next_id,
                    name="void_filler_exact",
                    start=(x, y, z),
                    size=(width, height, depth),
                    kind="structure",
                )
            )
            next_id += 1
            continue

        cx, cy, cz = consumed
        placements.append(
            Placement(
                id=next_id,
                name=chosen.name,
                start=(x, y, z),
                size=chosen_size,
                kind="structure",
                source=chosen.source,
            )
        )
        next_id += 1

        split_boxes = [
            (x + cx, y, z, width - cx, height, depth),
            (x, y + cy, z, cx, height - cy, depth),
            (x, y, z + cz, cx, cy, depth - cz),
        ]
        free_boxes.extend(box for box in split_boxes if box[3] > 0 and box[4] > 0 and box[5] > 0)

    return placements


def filled_volume_ratio(placements: list[Placement]) -> float:
    map_volume = (
        (MAP_BOUNDS["x"][1] - MAP_BOUNDS["x"][0])
        * (MAP_BOUNDS["y"][1] - MAP_BOUNDS["y"][0])
        * (MAP_BOUNDS["z"][1] - MAP_BOUNDS["z"][0])
    )
    filled_volume = sum(item.size[0] * item.size[1] * item.size[2] for item in placements if item.kind != "platform")
    return min(1.0, filled_volume / map_volume)


def save_world(path: Path, placements: list[Placement], seed: int | None, margin: int) -> None:
    data = {
        "map_bounds": MAP_BOUNDS,
        "chunk_size": CHUNK_SIZE,
        "filled_volume_ratio": filled_volume_ratio(placements),
        "player_size": {
            "width": PLAYER_WIDTH,
            "height": PLAYER_HEIGHT,
            "depth": PLAYER_WIDTH,
        },
        "seed": seed,
        "margin": margin,
        "placements": [
            {
                **asdict(item),
                "build_type": item.name if item.kind != "platform" else None,
                "color": item.color,
                "end": item.end,
            }
            for item in placements
        ],
    }
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_world(path: Path) -> list[Placement]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return [
        Placement(
            id=int(item["id"]),
            name=str(item["name"]),
            start=tuple(item["start"]),
            size=tuple(item["size"]),
            kind=str(item.get("kind", "structure")),
            source=item.get("source"),
        )
        for item in data["placements"]
    ]


def specs_from_json(path: Path) -> list[StructureSpec]:
    raw_specs = json.loads(path.read_text(encoding="utf-8"))
    return [
        StructureSpec(
            name=str(item["name"]),
            size=tuple(int(value) for value in item["size"]),
            count=int(item.get("count", 1)),
        )
        for item in raw_specs
    ]


def cube_vertices(item: Placement) -> list[tuple[float, float, float]]:
    x, y, z = item.start
    sx, sy, sz = item.size
    return [
        (x, y, z),
        (x + sx, y, z),
        (x + sx, y + sy, z),
        (x, y + sy, z),
        (x, y, z + sz),
        (x + sx, y, z + sz),
        (x + sx, y + sy, z + sz),
        (x, y + sy, z + sz),
    ]


class MapViewer(tk.Tk):
    def __init__(self, placements: list[Placement], seed: int | None, margin: int) -> None:
        super().__init__()
        self.title("Map Builder 3D")
        self.geometry("1200x800")
        self.configure(bg="#101214")

        self.placements = placements
        self.seed = seed
        self.margin = margin
        self.minecraft_builds = load_minecraft_builds()
        self.chunk_index = build_chunk_index(placements)
        self.refresh_world_stats()
        self.camera_x = 0.0
        self.camera_y = 40.0 + PLAYER_EYE_HEIGHT
        self.camera_z = -180.0
        self.yaw = 0.0
        self.pitch = 0.0
        self.move_speed = 75.0
        self.fast_multiplier = 3.0
        self.render_distance_chunks = RENDER_DISTANCE_CHUNKS
        self.keys_down: set[str] = set()
        self.last_tick = None
        self.last_mouse: tuple[int, int] | None = None
        self.selected_id: int | None = None

        self.toolbar = tk.Frame(self, bg="#181c20")
        self.toolbar.pack(side=tk.TOP, fill=tk.X)

        self.status = tk.StringVar()
        self.status.set(self.status_text())
        tk.Label(
            self.toolbar,
            textvariable=self.status,
            bg="#181c20",
            fg="#e5e8eb",
            anchor="w",
            padx=10,
            pady=8,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True)

        buttons = [
            ("Sauver JSON", self.save_dialog),
            ("Charger JSON", self.load_dialog),
            ("Regenerer", self.regenerate),
            ("Reset vue", self.reset_view),
        ]
        for label, command in buttons:
            tk.Button(self.toolbar, text=label, command=command).pack(side=tk.RIGHT, padx=4)

        self.canvas = tk.Canvas(self, bg="#101214", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)
        self.info = tk.StringVar()
        self.info.set(
            "ZQSD: voler | Espace: monter | Ctrl/C: descendre | Shift: rapide | Souris: regarder | Molette: distance chunks"
        )
        tk.Label(self, textvariable=self.info, bg="#101214", fg="#aeb7c2", anchor="w", padx=10).pack(
            side=tk.BOTTOM, fill=tk.X
        )

        self.bind_events()
        self.after(60, self.draw)
        self.after(16, self.tick)

    def item_color(self, item: Placement) -> str:
        return visual_color_for_item(item)

    def refresh_world_stats(self) -> None:
        self.platform_count = sum(1 for item in self.placements if item.kind == "platform")
        self.structure_count = len(self.placements) - self.platform_count

    def bind_events(self) -> None:
        self.canvas.bind("<Configure>", lambda _event: self.draw())
        self.canvas.bind("<ButtonPress-1>", self.on_left_down)
        self.canvas.bind("<B1-Motion>", self.on_left_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_mouse_up)
        self.canvas.bind("<ButtonPress-3>", self.on_right_down)
        self.canvas.bind("<B3-Motion>", self.on_look_drag)
        self.canvas.bind("<ButtonRelease-3>", self.on_mouse_up)
        self.canvas.bind("<MouseWheel>", self.on_mousewheel)
        self.canvas.bind("<Button-4>", lambda _event: self.change_render_distance(1))
        self.canvas.bind("<Button-5>", lambda _event: self.change_render_distance(-1))
        self.bind("<KeyPress>", self.on_key_press)
        self.bind("<KeyRelease>", self.on_key_release)
        self.bind("<Left>", lambda _event: self.rotate(-0.08, 0))
        self.bind("<Right>", lambda _event: self.rotate(0.08, 0))
        self.bind("<Up>", lambda _event: self.rotate(0, 0.06))
        self.bind("<Down>", lambda _event: self.rotate(0, -0.06))

    def status_text(self) -> str:
        return (
            f"Map x:{MAP_BOUNDS['x']} y:{MAP_BOUNDS['y']} z:{MAP_BOUNDS['z']} | "
            f"{self.structure_count} structures + {self.platform_count} plateformes | "
            f"niveaux={LEVELS} | seed={self.seed} | marge={self.margin}"
        )

    def project(self, point: tuple[float, float, float]) -> tuple[float, float, float] | None:
        x, y, z = point
        dx = x - self.camera_x
        dy = y - self.camera_y
        dz = z - self.camera_z

        cy, sy = math.cos(self.yaw), math.sin(self.yaw)
        cp, sp = math.cos(self.pitch), math.sin(self.pitch)

        x_cam = dx * cy - dz * sy
        z_cam = dx * sy + dz * cy
        y_cam = dy * cp - z_cam * sp
        z_depth = dy * sp + z_cam * cp
        if z_depth <= 1.0:
            return None

        width = self.canvas.winfo_width()
        height = self.canvas.winfo_height()
        focal = min(width, height) * 0.82
        return (
            width / 2 + x_cam * focal / z_depth,
            height / 2 - y_cam * focal / z_depth,
            z_depth,
        )

    def camera_chunk(self) -> tuple[int, int, int]:
        return (
            chunk_coord(self.camera_x),
            chunk_coord(self.camera_y),
            chunk_coord(self.camera_z),
        )

    def chunk_is_in_view(self, chunk: tuple[int, int, int]) -> bool:
        x, y, z = chunk
        center = (
            x * CHUNK_SIZE + CHUNK_SIZE / 2,
            y * CHUNK_SIZE + CHUNK_SIZE / 2,
            z * CHUNK_SIZE + CHUNK_SIZE / 2,
        )
        dx = center[0] - self.camera_x
        dy = center[1] - self.camera_y
        dz = center[2] - self.camera_z

        cy, sy = math.cos(self.yaw), math.sin(self.yaw)
        cp, sp = math.cos(self.pitch), math.sin(self.pitch)
        x_cam = dx * cy - dz * sy
        z_cam = dx * sy + dz * cy
        y_cam = dy * cp - z_cam * sp
        z_depth = dy * sp + z_cam * cp

        chunk_radius = CHUNK_SIZE * 0.9
        if z_depth < -chunk_radius:
            return False

        horizontal_limit = math.tan(math.radians(HORIZONTAL_FOV_DEGREES / 2)) * max(1.0, z_depth)
        vertical_limit = math.tan(math.radians(VERTICAL_FOV_DEGREES / 2)) * max(1.0, z_depth)
        return abs(x_cam) <= horizontal_limit + chunk_radius and abs(y_cam) <= vertical_limit + chunk_radius

    def nearby_items(self) -> tuple[list[Placement], int]:
        cx, cy, cz = self.camera_chunk()
        radius = self.render_distance_chunks
        vertical_radius = min(2, radius)
        items_by_id: dict[int, Placement] = {}
        checked_chunks = 0
        visible_chunks = 0
        for x in range(cx - radius, cx + radius + 1):
            for y in range(cy - vertical_radius, cy + vertical_radius + 1):
                for z in range(cz - radius, cz + radius + 1):
                    checked_chunks += 1
                    if not self.chunk_is_in_view((x, y, z)):
                        continue
                    visible_chunks += 1
                    for item in self.chunk_index.get((x, y, z), []):
                        items_by_id[item.id] = item
        items = list(items_by_id.values())
        if len(items) > MAX_CANDIDATE_ITEMS:
            items.sort(key=self.item_distance_sq)
            items = items[:MAX_CANDIDATE_ITEMS]
        return items, visible_chunks

    def item_distance_sq(self, item: Placement) -> float:
        cx = item.start[0] + item.size[0] / 2
        cy = item.start[1] + item.size[1] / 2
        cz = item.start[2] + item.size[2] / 2
        return (cx - self.camera_x) ** 2 + (cy - self.camera_y) ** 2 + (cz - self.camera_z) ** 2

    def draw(self) -> None:
        self.canvas.delete("all")
        self.draw_axes_and_bounds()

        nearby, visible_chunks = self.nearby_items()
        drawable = []
        for item in nearby:
            vertices = cube_vertices(item)
            projected_optional = [self.project(vertex) for vertex in vertices]
            if all(point is None for point in projected_optional):
                continue
            projected = [point for point in projected_optional if point is not None]
            if len(projected) < 3:
                continue
            bounds = self.projected_bounds(projected)
            if not self.is_on_screen(bounds):
                continue
            depth = sum(point[2] for point in projected) / len(projected)
            area = max(1.0, (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]))
            drawable.append((depth, area, item, projected_optional))

        visible_count = len(drawable)
        render_budget = self.render_budget()
        if visible_count > render_budget:
            selected_rows = [row for row in drawable if row[2].id == self.selected_id]
            other_rows = [row for row in drawable if row[2].id != self.selected_id]
            other_rows.sort(key=lambda row: row[1], reverse=True)
            drawable = selected_rows + other_rows[: max(0, render_budget - len(selected_rows))]

        for _depth, _area, item, projected in sorted(drawable, key=lambda row: row[0], reverse=True):
            if self.should_draw_internal_blocks(item):
                self.draw_internal_blocks(item)
            else:
                self.draw_box(item, projected)

        cx, cy, cz = self.camera_chunk()
        self.status.set(
            f"{self.status_text()} | chunk=({cx},{cy},{cz}) | "
            f"distance={self.render_distance_chunks} chunks | "
            f"chunks_vue={visible_chunks} charges={len(nearby)} visibles={len(drawable)}/{visible_count} | "
            f"pos=({self.camera_x:.1f},{self.camera_y:.1f},{self.camera_z:.1f})"
        )

    def projected_bounds(self, projected: list[tuple[float, float, float]]) -> tuple[float, float, float, float]:
        xs = [point[0] for point in projected]
        ys = [point[1] for point in projected]
        return min(xs), min(ys), max(xs), max(ys)

    def is_on_screen(self, bounds: tuple[float, float, float, float]) -> bool:
        left, top, right, bottom = bounds
        width = self.canvas.winfo_width()
        height = self.canvas.winfo_height()
        return (
            right >= -VIEWPORT_MARGIN
            and left <= width + VIEWPORT_MARGIN
            and bottom >= -VIEWPORT_MARGIN
            and top <= height + VIEWPORT_MARGIN
        )

    def render_budget(self) -> int:
        if self.render_distance_chunks >= 10:
            return FAR_RENDER_BUDGET
        if self.render_distance_chunks >= 8:
            return MID_RENDER_BUDGET
        return 10_000_000

    def draw_axes_and_bounds(self) -> None:
        x1, x2 = MAP_BOUNDS["x"]
        y1, y2 = MAP_BOUNDS["y"]
        z1, z2 = MAP_BOUNDS["z"]
        corners = [
            (x1, y1, z1),
            (x2, y1, z1),
            (x2, y2, z1),
            (x1, y2, z1),
            (x1, y1, z2),
            (x2, y1, z2),
            (x2, y2, z2),
            (x1, y2, z2),
        ]
        projected = [self.project(point) for point in corners]
        edges = [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)]
        for start, end in edges:
            if projected[start] is not None and projected[end] is not None:
                self.line(projected[start], projected[end], fill="#3b4652", width=1)

        origin = self.project((0, 0, 0))
        axes = [
            ((120, 0, 0), "#ff6b6b", "X"),
            ((0, 120, 0), "#77dd77", "Y"),
            ((0, 0, 120), "#74a7ff", "Z"),
        ]
        for endpoint, color, label in axes:
            target = self.project(endpoint)
            if origin is not None and target is not None:
                self.line(origin, target, fill=color, width=2)
                self.canvas.create_text(target[0], target[1], text=label, fill=color, font=("Arial", 11, "bold"))

    def draw_box(self, item: Placement, projected: list[tuple[float, float, float] | None]) -> None:
        faces = [
            (0, 1, 2, 3),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (2, 3, 7, 6),
            (1, 2, 6, 5),
            (0, 3, 7, 4),
        ]
        if item.kind == "platform":
            color = self.item_color(item)
            edge = "#95a1ad"
            stipple = "gray12"
        else:
            color = self.item_color(item)
            edge = "#fff1a8" if item.id == self.selected_id else shade_hex(color, -0.55)
            stipple = "gray25"
        face_shades = [-0.10, 0.16, -0.20, -0.04, 0.08, -0.14]
        visible_faces = []
        for face_index, face in enumerate(faces):
            if any(projected[index] is None for index in face):
                continue
            avg_depth = sum(projected[index][2] for index in face if projected[index] is not None) / len(face)
            visible_faces.append((avg_depth, face_index, face))
        visible_faces.sort(key=lambda row: row[0], reverse=True)
        for _avg_depth, face_index, face in visible_faces[:3]:
            if any(projected[index] is None for index in face):
                continue
            coords = []
            for index in face:
                point = projected[index]
                assert point is not None
                coords.extend([point[0], point[1]])
            face_color = color if item.id == self.selected_id else shade_hex(color, face_shades[face_index])
            self.canvas.create_polygon(
                coords,
                fill=face_color,
                outline=edge,
                width=2 if item.id == self.selected_id else 1,
                stipple=stipple,
                tags=(f"box:{item.id}", "build"),
            )

        for start, end in [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)]:
            if projected[start] is not None and projected[end] is not None:
                self.line(projected[start], projected[end], fill=edge, width=2 if item.id == self.selected_id else 1)

        center = tuple((a + b) / 2 for a, b in zip(item.start, item.end))
        center_projected = self.project(center)
        if center_projected and item.id == self.selected_id:
            cx, cy, _depth = center_projected
            self.canvas.create_text(cx, cy, text=str(item.id), fill="#f4f7fb", font=("Arial", 9, "bold"))

    def should_draw_internal_blocks(self, item: Placement) -> bool:
        if item.name not in self.minecraft_builds:
            return False
        cx = item.start[0] + item.size[0] / 2
        cy = item.start[1] + item.size[1] / 2
        cz = item.start[2] + item.size[2] / 2
        distance = math.sqrt((cx - self.camera_x) ** 2 + (cy - self.camera_y) ** 2 + (cz - self.camera_z) ** 2)
        return distance < 80 or item.id == self.selected_id

    def draw_internal_blocks(self, item: Placement) -> None:
        build = self.minecraft_builds[item.name]
        drawable = []
        for block in build.blocks:
            bx, by, bz = block.pos
            voxel = Placement(
                id=item.id,
                name=block.name,
                start=(item.start[0] + bx, item.start[1] + by, item.start[2] + bz),
                size=(1, 1, 1),
                kind="voxel",
            )
            projected_optional = [self.project(vertex) for vertex in cube_vertices(voxel)]
            if all(point is None for point in projected_optional):
                continue
            projected = [point for point in projected_optional if point is not None]
            if len(projected) < 3:
                continue
            bounds = self.projected_bounds(projected)
            if not self.is_on_screen(bounds):
                continue
            depth = sum(point[2] for point in projected) / len(projected)
            drawable.append((depth, block.color, projected_optional))

        for _depth, color, projected in sorted(drawable, key=lambda row: row[0], reverse=True):
            self.draw_voxel(projected, color, item.id == self.selected_id)

    def draw_voxel(
        self,
        projected: list[tuple[float, float, float] | None],
        color: str,
        selected: bool,
    ) -> None:
        faces = [
            (0, 1, 2, 3),
            (4, 5, 6, 7),
            (0, 1, 5, 4),
            (2, 3, 7, 6),
            (1, 2, 6, 5),
            (0, 3, 7, 4),
        ]
        edge = "#fff1a8" if selected else shade_hex(color, -0.45)
        face_shades = [-0.10, 0.16, -0.20, -0.04, 0.08, -0.14]
        for face_index, face in enumerate(faces):
            if any(projected[index] is None for index in face):
                continue
            coords = []
            for index in face:
                point = projected[index]
                assert point is not None
                coords.extend([point[0], point[1]])
            self.canvas.create_polygon(
                coords,
                fill=shade_hex(color, face_shades[face_index]),
                outline=edge,
                width=1,
                tags=("voxel",),
            )

    def line(self, start: tuple[float, float, float], end: tuple[float, float, float], **kwargs: object) -> None:
        self.canvas.create_line(start[0], start[1], end[0], end[1], **kwargs)

    def current_box_id(self) -> int | None:
        current = self.canvas.find_withtag("current")
        if not current:
            return None
        for tag in self.canvas.gettags(current[0]):
            if tag.startswith("box:"):
                return int(tag.split(":", 1)[1])
        return None

    def select_box(self, ident: int) -> None:
        self.selected_id = ident
        item = next(box for box in self.placements if box.id == ident)
        prefix = item.name if item.kind != "platform" else item.kind
        self.info.set(
            f"{prefix} #{item.id} {item.name} | type={item.color} | visuel={self.item_color(item)} | "
            f"depart={item.start} | taille={item.size} | fin={item.end}"
        )
        self.draw()

    def on_left_down(self, event: tk.Event) -> None:
        ident = self.current_box_id()
        if ident is not None:
            self.select_box(ident)
        self.last_mouse = (event.x, event.y)

    def on_right_down(self, event: tk.Event) -> None:
        self.last_mouse = (event.x, event.y)

    def on_left_drag(self, event: tk.Event) -> None:
        self.on_look_drag(event)

    def on_look_drag(self, event: tk.Event) -> None:
        if self.last_mouse is None:
            return
        last_x, last_y = self.last_mouse
        dx = event.x - last_x
        dy = event.y - last_y
        self.rotate(dx * 0.006, -dy * 0.005)
        self.last_mouse = (event.x, event.y)

    def on_mouse_up(self, _event: tk.Event) -> None:
        self.last_mouse = None

    def on_mousewheel(self, event: tk.Event) -> None:
        self.change_render_distance(1 if event.delta > 0 else -1)

    def change_render_distance(self, delta: int) -> None:
        self.render_distance_chunks = min(5, max(1, self.render_distance_chunks + delta))
        self.draw()

    def on_key_press(self, event: tk.Event) -> None:
        self.keys_down.add(event.keysym.lower())

    def on_key_release(self, event: tk.Event) -> None:
        self.keys_down.discard(event.keysym.lower())

    def tick(self) -> None:
        now = self.tk.call("clock", "milliseconds") / 1000
        if self.last_tick is None:
            self.last_tick = now
        dt = min(0.05, now - self.last_tick)
        self.last_tick = now
        if self.update_camera(dt):
            self.draw()
        self.after(16, self.tick)

    def update_camera(self, dt: float) -> bool:
        forward = 0.0
        strafe = 0.0
        vertical = 0.0
        if self.keys_down & {"z", "w"}:
            forward += 1.0
        if "s" in self.keys_down:
            forward -= 1.0
        if self.keys_down & {"q", "a"}:
            strafe -= 1.0
        if "d" in self.keys_down:
            strafe += 1.0
        if self.keys_down & {"space"}:
            vertical += 1.0
        if self.keys_down & {"control_l", "control_r", "c"}:
            vertical -= 1.0
        if forward == 0 and strafe == 0 and vertical == 0:
            return False

        speed = self.move_speed * (self.fast_multiplier if self.keys_down & {"shift_l", "shift_r"} else 1.0)
        length = math.sqrt(forward * forward + strafe * strafe + vertical * vertical)
        forward /= length
        strafe /= length
        vertical /= length

        forward_x = math.sin(self.yaw)
        forward_z = math.cos(self.yaw)
        right_x = math.cos(self.yaw)
        right_z = -math.sin(self.yaw)

        self.camera_x += (forward_x * forward + right_x * strafe) * speed * dt
        self.camera_z += (forward_z * forward + right_z * strafe) * speed * dt
        self.camera_y += vertical * speed * dt
        self.clamp_camera()
        return True

    def clamp_camera(self) -> None:
        half_width = PLAYER_WIDTH / 2
        self.camera_x = min(MAP_BOUNDS["x"][1] - half_width, max(MAP_BOUNDS["x"][0] + half_width, self.camera_x))
        self.camera_y = min(MAP_BOUNDS["y"][1], max(MAP_BOUNDS["y"][0] + PLAYER_EYE_HEIGHT, self.camera_y))
        self.camera_z = min(MAP_BOUNDS["z"][1] - half_width, max(MAP_BOUNDS["z"][0] + half_width, self.camera_z))

    def rotate(self, yaw_delta: float, pitch_delta: float) -> None:
        self.yaw += yaw_delta
        self.pitch = min(math.radians(82), max(math.radians(-82), self.pitch + pitch_delta))
        self.draw()

    def reset_view(self) -> None:
        self.camera_x = 0.0
        self.camera_y = 40.0 + PLAYER_EYE_HEIGHT
        self.camera_z = -180.0
        self.yaw = 0.0
        self.pitch = 0.0
        self.draw()

    def regenerate(self) -> None:
        self.seed = random.randint(1, 999_999)
        self.placements = generate_simple_whiteroom_world()
        self.chunk_index = build_chunk_index(self.placements)
        self.refresh_world_stats()
        self.selected_id = None
        self.status.set(self.status_text())
        self.info.set("Monde simple whiteroom regenere.")
        self.draw()

    def save_dialog(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Sauver la map",
            defaultextension=".json",
            filetypes=[("JSON", "*.json")],
            initialfile="generated_map.json",
        )
        if not path:
            return
        save_world(Path(path), self.placements, self.seed, self.margin)
        self.info.set(f"Map sauvegardee: {path}")

    def load_dialog(self) -> None:
        path = filedialog.askopenfilename(title="Charger une map", filetypes=[("JSON", "*.json")])
        if not path:
            return
        try:
            self.placements = load_world(Path(path))
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            messagebox.showerror("Erreur", f"Impossible de charger ce fichier:\n{exc}")
            return
        self.chunk_index = build_chunk_index(self.placements)
        self.refresh_world_stats()
        self.selected_id = None
        self.status.set(self.status_text())
        self.info.set(f"Map chargee: {path}")
        self.draw()


def default_specs() -> list[StructureSpec]:
    minecraft_specs = [
        StructureSpec(name=build.name, size=build.size, count=1, source=build.source)
        for build in load_minecraft_builds().values()
    ]
    if minecraft_specs:
        return minecraft_specs
    return [
        StructureSpec(name=item["name"], size=item["size"], count=item["count"])
        for item in DEFAULT_STRUCTURES
    ]


def fill_specs(multiplier: int = 10) -> list[StructureSpec]:
    specs = []
    for item in DEFAULT_STRUCTURES:
        count = item["count"]
        if item["name"] == "distant_tower_8x80x8":
            count = max(count, 8)
        else:
            count = max(count * multiplier, 1_000)
        specs.append(StructureSpec(name=item["name"], size=item["size"], count=count))
    return specs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generateur et viewer de structures 3D.")
    parser.add_argument("--seed", type=int, default=None, help="Seed pour reproduire la meme map.")
    parser.add_argument("--margin", type=int, default=0, help="Distance minimale entre deux structures.")
    parser.add_argument("--structures", type=Path, default=None, help="JSON contenant les structures a placer.")
    parser.add_argument("--save", type=Path, default=Path("generated_map.json"), help="Fichier JSON de sortie.")
    parser.add_argument("--load", type=Path, default=None, help="Charge une map deja generee.")
    parser.add_argument("--simple", action="store_true", help="Utilise l'ancien placement libre sans plateformes.")
    parser.add_argument("--random", action="store_true", help="Utilise le placement aleatoire limite par count.")
    parser.add_argument("--fill", action="store_true", help="Essaie de remplir la map autant que possible.")
    parser.add_argument("--fill-100", action="store_true", help="Remplit 100% du volume avec des chunks 32x32x32.")
    parser.add_argument("--no-gui", action="store_true", help="Genere et sauvegarde sans ouvrir la fenetre.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.load:
        placements = load_world(args.load)
    else:
        specs = specs_from_json(args.structures) if args.structures else default_specs()
        if args.fill_100:
            placements = generate_full_chunk_world()
        elif args.simple:
            placements = generate_simple_whiteroom_world()
        elif args.random:
            placements = generate_dense_world(specs, args.seed, args.margin)
        elif args.fill:
            placements = generate_until_no_space_world(specs, args.margin)
        else:
            placements = generate_simple_whiteroom_world()
        save_world(args.save, placements, args.seed, args.margin)

    if args.no_gui:
        print(f"{len(placements)} structures sauvegardees dans {args.save}")
        return

    app = MapViewer(placements, args.seed, args.margin)
    app.mainloop()


if __name__ == "__main__":
    main()
