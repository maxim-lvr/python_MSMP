import assert from 'node:assert/strict';
import {generateChunks} from '../generation_demo_chunks_generator.js';
import {placeWideAreas, populateWideArea} from '../generation_demo_chunks_wide.js';
import {placeBuildingLong, populateBuildingLong} from '../generation_demo_chunks_building_long.js';
import {generateDemoSnakes} from '../generation_demo_chunks_snakes.js';
import {populateChunks} from '../generation_demo_chunks_houses.js';
import {overlaps} from '../generation_demo_generator.js';
import {generateGlobalPipe} from '../generation_demo_chunks_pipe.js';

const layout = generateChunks(42);
layout.buildingLong = placeBuildingLong(layout);
layout.snakes = generateDemoSnakes(layout);
layout.wideAreas = placeWideAreas(layout);
assert.deepEqual(layout.wideAreas, placeWideAreas(layout));
assert.equal(layout.wideAreas.filter(z => z.type === 'open').length, 2);
assert.equal(layout.wideAreas.filter(z => z.type === 'restrict').length, 2);
assert.equal(new Set(layout.wideAreas.map(z => z.seed)).size, 4);
const reserved = [...layout.zones.map(z => [z.x*32, 0, z.z*32, z.width*32, 300, z.depth*32]),
  ...layout.buildingLong.map(z => z.box), ...layout.snakes.flatMap(s => s.volumes)];
layout.wideAreas = layout.wideAreas.map(area => {
  const result = populateWideArea(area), b = result.box;
  assert.ok(result.boxes.length > 1000);
  assert.ok(!reserved.some(other => overlaps(b, other)));
  reserved.push(b);
  assert.ok(b.every(Number.isInteger));
  assert.ok(b[1] + b[4] <= layout.world.height);
  for (const box of result.boxes) {
    assert.ok(box.slice(0, 6).every(Number.isInteger));
    assert.ok([0, 1, 2].every(i => box[i] >= b[i] && box[i] + box[i + 3] <= b[i] + b[i + 3]));
    assert.ok(box[6].startsWith(`wide_${area.type}_`));
  }
  for (const p of [result.spawn, result.lookAt]) assert.ok(p.every(Number.isFinite));
  assert.ok(!result.boxes.some(box => overlaps(box, [...result.spawn.map(n=>n-0.2),0.4,0.4,0.4])));
  return result;
});
console.log('Placement:', layout.wideAreas.map(z => ({type:z.type, seed:z.seed, rotation:z.rotation, box:z.box, boxes:z.boxes.length})));

if (process.argv.includes('--integration')) {
  layout.globalPipe = generateGlobalPipe(layout);
  const get = async path => {
    const response = await fetch(`http://127.0.0.1:5173${path}`);
    assert.ok(response.ok, `${path}: ${response.status}`); return response.json();
  };
  const templates = await get(`/api/demo-chunks-templates?seed=${layout.seed}`);
  for (let i=0; i<layout.buildingLong.length; i++) {
    const zone=layout.buildingLong[i];
    layout.buildingLong[i]=populateBuildingLong(zone,await get(`/api/demo-building-long?seed=${zone.seed}&length=${zone.length}`));
  }
  const result = populateChunks(layout, templates, undefined, false, 11);
  assert.equal(result.wideAreas.length, 4);
  const wideBounds = result.wideAreas.map(z => z.box);
  for (const room of result.denseRooms) assert.ok(!wideBounds.some(b => overlaps(room.box, b)));
  for (const box of result.networkBoxes) assert.ok(!wideBounds.some(b => overlaps(box, b)), `Network enters Wide area: ${box}`);
  for(const box of result.networkBoxes)assert.ok(!result.globalPipe.volumes.some(b=>overlaps(box,b)),`Network enters pipe: ${box}`);
  for(const room of result.denseRooms)assert.ok(!result.globalPipe.volumes.some(b=>overlaps(room.box,b)));
  assert.equal(result.stats.connectedDense, result.stats.denseRooms);
  assert.equal(result.stats.connectedDoors, result.stats.orangeDoors);
  console.log('Integration:', result.stats);
}
