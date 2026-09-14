import assert from 'node:assert/strict';
import {generateWideRestrictArea, AREA} from '../wide_restrict_area.js';
import {overlaps} from '../generation_demo_generator.js';

const data = generateWideRestrictArea(42);
assert.deepEqual(data, generateWideRestrictArea(42));
assert.ok(data.rooms.length > 200);
const massRooms = data.rooms.filter(room => room.mass);
assert.ok(massRooms.length > 400);
assert.ok(new Set(massRooms.map(room => room.sy)).size > 12);
assert.ok(massRooms.some(room => room.z < 40) && massRooms.some(room => room.z > 520));
assert.ok(massRooms.some(room => room.y > 190) && massRooms.some(room => room.y < 15));
assert.ok(data.solids.length > 50);
const coreBuildings = data.buildings.filter(b => !b.mass && !b.terminal);
for (const b of coreBuildings) assert.equal(b.rooms.filter(room => room.featured).length, 2);
assert.ok(data.stats.featured < coreBuildings.reduce((sum, b) => sum + b.rooms.length, 0) / 5);
assert.ok(data.endWall && data.terminal);
assert.equal(data.stairs.filter(stair => stair.terminal).length, 18);
for (const box of data.boxes) {
  assert.ok(box.slice(0, 6).every(Number.isInteger));
  for (const [axis, limit] of [AREA.length, AREA.height, AREA.width].entries()) {
    assert.ok(box[axis] >= 0 && box[axis + 3] > 0 && box[axis] + box[axis + 3] <= limit);
  }
}
const clear = box => assert.ok(!data.boxes.some(b => b[6] !== 'ladder' && overlaps(b, box)), `Blocked access ${box}`);
const supported = (x, y, z) => assert.ok(data.boxes.some(b => overlaps(b, [x + 0.1, y, z + 0.1, 0.8, 1, 0.8])));
for (const door of data.doors) clear(door);
for (const stair of data.stairs) {
  for (const [x, y, z] of stair.points) { supported(x, y, z); clear([x, y + 1, z, 1, 3, 1]); }
  const [x, y, z] = stair.points.at(-1);
  const landing = stair.landing || [x + 1, y + 1, z];
  supported(...landing); clear([landing[0], landing[1] + 1, landing[2], 1, 3, 1]);
}
for (const bridge of data.bridges) {
  for (let z = bridge.start - 1; z <= bridge.end; z++) {
    supported(bridge.x, bridge.y, z); clear([bridge.x - 1, bridge.y + 1, z, 3, 3, 1]);
  }
}
for (const ladder of data.ladders) {
  clear([ladder.x, ladder.bottom, ladder.z, 1, ladder.top - ladder.bottom + 3, 1]);
  supported(ladder.x, ladder.bottom - 1, ladder.z);
  supported(ladder.x, ladder.top, ladder.z + 1);
  clear([ladder.x, ladder.top + 1, ladder.z + 1, 1, 2, 1]);
}
const neighbors = data.rooms.map(() => []);
for (const {a, b} of data.connections) { neighbors[a].push(b); neighbors[b].push(a); }
const seen = new Set([0]), queue = [0];
for (let i = 0; i < queue.length; i++) for (const id of neighbors[queue[i]]) {
  if (!seen.has(id)) { seen.add(id); queue.push(id); }
}
assert.equal(seen.size, data.rooms.length);
clear([...data.spawn.map(v => v - 0.3), 0.6, 0.6, 0.6]);
console.log({...data.stats, reachable: seen.size, boxes: data.boxes.length});
