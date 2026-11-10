"""Validate the streamed Minecraft export without loading it all into memory."""
import json
import sys
from collections import Counter

counts = Counter()
palette = set()
with open(sys.argv[1], encoding="utf-8") as source:
    header_line = next(source).strip()
    header = json.loads(header_line.removesuffix(',"runs":[') + "}")
    origin, size = header["zone"]["pos"], header["zone"]["size"]
    footer = None
    for line in source:
        line = line.strip()
        if line.startswith('],"export_stats":'):
            footer = json.loads("{" + line[2:])["export_stats"]
            break
        if not line:
            continue
        run = json.loads(line.removeprefix(",").removesuffix(","))
        for i in range(3):
            assert isinstance(run["pos"][i], int)
            assert isinstance(run["size"][i], int)
            assert run["size"][i] > 0
            assert origin[i] <= run["pos"][i]
            assert run["pos"][i] + run["size"][i] <= origin[i] + size[i]
        counts[run["kind"]] += 1
        palette.add(run["block"])
    assert not source.read().strip()
assert footer and counts == footer["runs_by_kind"]
assert sum(counts.values()) == footer["runs"]
allowed = {"minecraft:air", "minecraft:deepslate", "minecraft:water"}
allowed.update(f"minecraft:ladder[facing={f}]" for f in ("north", "south", "east", "west"))
assert palette <= allowed
assert {"air_noise", "air_gallery", "air_pipe", "dense", "ladder_support"} <= counts.keys()
if header["source"].get("region") == "full":
    assert header["zone"] == {"pos": [0, 0, 0], "size": [10000, 300, 10000]}
    assert header["source_stats"]["waterRooms"] == 4
    assert header["source_stats"]["villages"] == 50
    assert header["source_stats"]["villageConnections"] == 100
    assert {"village_house", "village_bridge", "water_tower", "water_water"} <= counts.keys()
print(json.dumps({"runs": sum(counts.values()), "palette": sorted(palette), "bounds": header["zone"], "valid": True}))
