export const WORLD = { length: 5000, width: 5000, height: 300, chunk: 32 };
export const MIN_GAP = 4;

export function generateChunks(seed = 42) {
  let state = Number(seed) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  const limit = Math.floor(WORLD.length / WORLD.chunk);
  const zones = [];
  for (let attempt = 0; attempt < 3000 && zones.length < 18; attempt++) {
    let width = integer(20, 36), depth = integer(3, 9);
    if (random() < 0.5) [width, depth] = [depth, width];
    const x = integer(2, limit - width - 2), z = integer(2, limit - depth - 2);
    if (zones.some(other => x < other.x + other.width + MIN_GAP &&
      x + width + MIN_GAP > other.x && z < other.z + other.depth + MIN_GAP &&
      z + depth + MIN_GAP > other.z)) continue;
    // One surface per exposed rectangle edge; adjacent chunks have no dividing wall.
    const s = WORLD.chunk, h = WORLD.height;
    const walls = [
      [x*s, 0, z*s, width*s, h, 0],
      [x*s, 0, (z+depth)*s, width*s, h, 0],
      [x*s, 0, z*s, 0, h, depth*s],
      [(x+width)*s, 0, z*s, 0, h, depth*s],
    ];
    zones.push({ id: zones.length, x, z, width, depth, walls });
  }
  return { seed: Number(seed) >>> 0, world: WORLD, zones };
}
