import assert from 'node:assert/strict';
import {generateChunks} from '../generation_demo_chunks_generator.js';
import {placeBuildingLong} from '../generation_demo_chunks_building_long.js';
import {generateDemoSnakes} from '../generation_demo_chunks_snakes.js';
import {overlaps} from '../generation_demo_generator.js';

const layout=generateChunks(4006339556);
layout.buildingLong=placeBuildingLong(layout);
const snakes=generateDemoSnakes(layout);
assert.equal(snakes.length,4);
const obstacles=[...layout.zones.map(z=>[z.x*32-100,0,z.z*32-100,z.width*32+200,300,z.depth*32+200]),
  ...layout.buildingLong.map(({box:[x,,z,sx,,sz]})=>[x-100,0,z-100,sx+200,300,sz+200])];
for(const s of snakes) {
  assert.ok(s.length>=2400);
  for(const v of s.volumes)assert.ok(!obstacles.some(b=>overlaps(v,b)));
  for(let i=0;i<s.volumes.length;i++)assert.ok(!s.volumes.slice(i+2).some(v=>overlaps(v,s.volumes[i])));
}
console.log('Seed 4006339556: four long snakes, obstacle clearance and no self-intersections.');
