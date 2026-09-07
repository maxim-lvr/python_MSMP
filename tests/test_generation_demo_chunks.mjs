import assert from 'node:assert/strict';
import { generateChunks, WORLD, MIN_GAP } from '../generation_demo_chunks_generator.js';

for (const seed of [0, 1, 42, 1234, 4294967295]) {
  const data = generateChunks(seed);
  assert.deepEqual(data, generateChunks(seed));
  assert.equal(data.zones.length, 18);
  for (const zone of data.zones) {
    assert.ok(Math.max(zone.width, zone.depth) >= 20);
    assert.ok(Math.min(zone.width, zone.depth) >= 3);
    assert.ok([zone.x, zone.z, zone.width, zone.depth].every(Number.isInteger));
    assert.ok(zone.x >= 0 && zone.z >= 0);
    assert.ok((zone.x+zone.width)*32 <= WORLD.length);
    assert.ok((zone.z+zone.depth)*32 <= WORLD.width);
    assert.equal(zone.walls.length, 4);
    for (const [x,y,z,w,h,d] of zone.walls) {
      assert.equal(y, 0);
      assert.equal(h, 300);
      assert.ok((w === 0) !== (d === 0));
      assert.ok(w === 0 ? [zone.x*32,(zone.x+zone.width)*32].includes(x) :
        [zone.z*32,(zone.z+zone.depth)*32].includes(z));
    }
    for (const other of data.zones.filter(other => other.id > zone.id)) {
      const gapX = Math.max(other.x-zone.x-zone.width, zone.x-other.x-other.width);
      const gapZ = Math.max(other.z-zone.z-zone.depth, zone.z-other.z-other.depth);
      assert.ok(Math.max(gapX, gapZ) >= MIN_GAP);
    }
  }
}
assert.notDeepEqual(generateChunks(42).zones, generateChunks(43).zones);
console.log('Chunk generation: 5 seeds passed (bounds, size, spacing, exposed walls, determinism).');
