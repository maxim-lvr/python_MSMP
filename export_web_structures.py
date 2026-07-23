from __future__ import annotations

import json
from pathlib import Path

from map_builder import load_minecraft_builds

STRUCTURE_DIRS = [Path("structures"), Path("structure")]


def main() -> None:
    builds = {}
    for root in STRUCTURE_DIRS:
        if not root.exists() or not any(root.rglob("*.nbt")):
            continue
        builds.update(load_minecraft_builds(root))
        break

    payload = {
        "structures": [
            {
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
            for build in builds.values()
        ]
    }

    output = Path("web/structures.json")
    output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"{len(payload['structures'])} structures exportees vers {output}")


if __name__ == "__main__":
    main()
