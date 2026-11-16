"""Independent, compact clusters for the four faces of House Wall zones."""
import random

from map_builder_house import (
    Zone, WallSide, HouseVolume, place_house, child_candidates, house_to_payload,
    height_for_floors, add_house_connections, add_close_wall_bridges,
    extend_houses_behind_walls, blocks_to_runs,
)


def wall_hive(seed: int) -> dict:
    zone = Zone(length=64, width=96, height=240)
    # Ten blocks keep neighbouring perpendicular facades from intersecting.
    side = WallSide('north', 'x', 0, (0, 1), 10, 54)
    rng = random.Random(seed)
    blocks, placed = {}, []
    for chain in range(3):
        if chain == 2 and rng.random() >= .15:
            break  # Isolated houses are much rarer than the two larger clusters.
        root = None
        for _ in range(60):
            width, height = rng.randint(12, 32), height_for_floors(rng.randint(1, 6))
            along = rng.choice([side.start, side.end - width, rng.randint(side.start, side.end - width)])
            candidate = HouseVolume('north', chain, along, rng.randint(2, zone.height-height-2),
                                    0, width, height, rng.randint(4, 10))
            if place_house(blocks, zone, side, placed, candidate):
                root = candidate
                break
        if root is None:
            continue
        frontier, count = [root], 1
        target = 1 if chain == 2 else rng.randint(7, 11)
        for _ in range(180):
            if count >= target or not frontier:
                break
            parent = rng.choice(frontier)
            for candidate in child_candidates(zone, parent, rng):
                if place_house(blocks, zone, side, placed, candidate):
                    frontier.append(candidate)
                    count += 1
                    break
            else:
                if rng.random() < .15:
                    frontier.remove(parent)
    houses = [house_to_payload(zone, side, house) for house in placed]
    connections = add_house_connections(blocks, zone, side, placed)
    connections.extend(add_close_wall_bridges(blocks, zone, rng, {'north': (side, placed)}, 100))
    extend_houses_behind_walls(blocks, zone, houses, seed)
    return {'houses': houses, 'connections': connections, 'runs': blocks_to_runs(blocks), 'height': zone.height}
