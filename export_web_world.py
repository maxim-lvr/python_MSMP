from __future__ import annotations

import json
import random
from pathlib import Path

from map_builder import LEVELS, MAP_BOUNDS, PLATFORM_THICKNESS, Placement, boxes_overlap, load_minecraft_builds, platform_placements


STRUCTURE_COUNT = 120
SEED = 42


def generate_random_web_world(builds: dict[str, object]) -> list[Placement]:
    rng = random.Random(SEED)
    whiterooms = list(builds.values())
    placements = platform_placements()
    if not whiterooms:
        return placements

    next_id = len(placements) + 1
    attempts = 0
    max_attempts = STRUCTURE_COUNT * 400
    while len(placements) - 4 < STRUCTURE_COUNT and attempts < max_attempts:
        attempts += 1
        build = rng.choice(whiterooms)
        sx, sy, sz = build.size
        level = rng.choice(LEVELS)
        start = (
            rng.randrange(MAP_BOUNDS["x"][0] + 40, MAP_BOUNDS["x"][1] - 40 - sx),
            level + PLATFORM_THICKNESS,
            rng.randrange(MAP_BOUNDS["z"][0] + 40, MAP_BOUNDS["z"][1] - 40 - sz),
        )
        candidate = Placement(
            id=next_id,
            name=build.name,
            start=start,
            size=build.size,
            kind="structure",
            source=build.source,
        )
        if any(boxes_overlap(candidate, old, margin=1) for old in placements if old.kind != "platform"):
            continue
        placements.append(candidate)
        next_id += 1
    return placements


def main() -> None:
    builds = load_minecraft_builds()
    placements = generate_random_web_world(builds)

    payload = {
        "placements": [
            {
                "id": item.id,
                "name": item.name,
                "start": item.start,
                "size": item.size,
                "kind": item.kind,
                "source": item.source,
                "color": item.color,
            }
            for item in placements
        ],
        "builds": {
            name: {
                "name": build.name,
                "size": build.size,
                "source": build.source,
                "blocks": [
                    {
                        "pos": block.pos,
                        "name": block.name,
                        "color": block.color,
                    }
                    for block in build.blocks
                ],
            }
            for name, build in builds.items()
        },
    }

    output = Path("web/world.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"{len(payload['placements'])} placements exportes vers {output}")


if __name__ == "__main__":
    main()
