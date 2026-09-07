import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTemplates, assembleDemo, overlaps, mergeBoxes, subtract } from '../generation_demo_generator.js';

const sources = {};
for (const [key, name] of Object.entries({ dense: 'dense_1', bridge: 'bridge_zone', long: 'building_long_minecraft', house: 'house_zone' })) {
  sources[key] = JSON.parse(fs.readFileSync(new URL(`../exports/${name}.json`, import.meta.url)));
}
const volume = boxes => boxes.reduce((sum, b) => sum + b[3] * b[4] * b[5], 0);
const unit = [0, 0, 0, 1, 1, 1, 'wall'];
assert.deepEqual(mergeBoxes([unit, [1, 0, 0, 1, 1, 1, 'wall']]), [[0, 0, 0, 2, 1, 1, 'wall']]);
assert.equal(mergeBoxes([unit, [1, 0, 0, 1, 1, 1, 'floor']]).length, 2);
assert.equal(volume(subtract([0, 0, 0, 3, 4, 3, 'wall'], [1, 1, 0, 1, 2, 1])), 34);

for (const seed of [0, 42, 123, 4294967295]) {
  const templates = buildTemplates(sources, seed);
  const dense = templates.find(t => t.type === 'dense');
  const snake = templates.find(t => t.type === 'tunnel');
  assert.equal(dense.buildings, 1100);
  assert.equal(volume(dense.boxes), sources.dense.stats.blocks);
  assert.deepEqual(dense.size, [500, 200, 500]);
  assert.equal(snake.size[1], 41);
  assert.equal(snake.route.lengths.reduce((a, b) => a + b), 1500);
  assert(snake.route.lengths.every(n => n >= 70 && n <= 150));
  const data = assembleDemo(seed, templates);
  assert.equal(new Set(data.sectors.map(s => s.type)).size, 6);
  assert(data.sectors.length >= 12);
  const reached = new Set([0]);
  for (const [a, b] of data.edges) { assert(reached.has(a)); reached.add(b); }
  assert.equal(reached.size, data.sectors.length);
  assert.equal(data.connections.length, data.sectors.length - 1);

  for (const sector of data.sectors) {
    assert.equal(sector.coarse, sector.detail, 'Never replace dense rooms or snake with invented LOD boxes');
    const [x, y, z, w, h, d] = sector.bounds;
    assert(x >= 0 && y >= 0 && z >= 0 && x + w <= 5000 && z + d <= 5000 && y + h <= 300);
    const original = templates.find(t => t.type === sector.type);
    assert.equal(sector.buildings, original.buildings);
    assert.equal(h, original.size[1]);
    assert(volume(sector.detail) >= volume(original.boxes) - sector.used.length * 2);
    assert(volume(sector.detail) <= volume(original.boxes) + sector.ports.reduce((sum, p) => sum + volume([p.deck]), 0));
    for (const box of sector.detail) {
      assert(box.slice(0, 6).every(Number.isInteger));
      assert(box.slice(3, 6).every(n => n > 0));
      assert(box[0] >= x && box[1] >= y && box[2] >= z && box[0] + box[3] <= x + w && box[1] + box[4] <= y + h && box[2] + box[5] <= z + d);
    }
    for (const other of data.sectors) if (other.id > sector.id) assert(!overlaps(sector.bounds, other.bounds));
    for (const i of sector.used) {
      const p = sector.ports[i];
      const passage = [...p.deck]; passage[1]++; passage[4] = 2;
      assert(!sector.detail.some(b => overlaps(b, passage)), `Blocked entrance ${sector.type}`);
      const axis = p.normal[0] ? 0 : 2;
      const sign = p.normal[0] || p.normal[1];
      for (let t = p.p[axis]; sign < 0 ? t <= p.door[axis] + 1 : t >= p.door[axis] - 1; t -= sign) {
        const cell = [...p.p, 1, 1, 1]; cell[axis] = t;
        assert(sector.detail.some(b => overlaps(b, cell)), `Missing entrance floor ${sector.type}`);
        const air = [...cell]; air[1]++; air[4] = 2;
        assert(!sector.detail.some(b => overlaps(b, air)), `Insufficient entrance headroom ${sector.type}`);
      }
    }
  }
  for (const link of data.connections) {
    const a = data.sectors[link.from].ports[link.fromPort];
    const b = data.sectors[link.to].ports[link.toPort];
    assert.equal(a.p[1], b.p[1]);
    assert.equal(link.deck[1], a.p[1]);
    assert.equal(Math.min(link.deck[3], link.deck[5]), 3);
    const axis = a.normal[0] ? 0 : 2;
    assert.equal(link.deck[axis], Math.min(a.p[axis], b.p[axis]) + 1);
    assert.equal(link.deck[axis + 3], Math.abs(a.p[axis] - b.p[axis]) - 1);
    const air = [...link.deck]; air[4] = 4;
    assert(!data.sectors.some(s => overlaps(s.bounds, air)));
  }
  console.log(`Seed ${seed}: ${data.sectors.length} original builds, connected entrances, headroom, bounds and fidelity OK`);
  if (seed === 42) {
    const repeat = assembleDemo(seed, templates);
    assert.deepEqual(repeat.connections, data.connections);
    assert.deepEqual(repeat.sectors.map(s => s.bounds), data.sectors.map(s => s.bounds));
  }
}
