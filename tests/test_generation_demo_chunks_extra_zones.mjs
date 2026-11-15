import {WORLD_HEIGHT} from '../world_config.js';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {generateChunks,addExtraZones} from '../generation_demo_chunks_generator.js';
import {populateChunks} from '../generation_demo_chunks_houses.js';
import {overlaps} from '../generation_demo_generator.js';

const layout=generateChunks(42);
addExtraZones(layout);
assert.equal(layout.zones.filter(z=>z.type==='house_wall').length,30);
assert.equal(layout.zones.filter(z=>z.type==='bridge_zone').length,2);
const boxes=layout.zones.map(z=>[z.x*32,0,z.z*32,z.width*32,WORLD_HEIGHT,z.depth*32]);
for(let i=0;i<boxes.length;i++)for(let j=0;j<i;j++)assert.ok(!overlaps(boxes[i],boxes[j]));
const templates=JSON.parse(execFileSync('python3',['-c',
  'import json; from generation_demo_chunks_templates import wall_templates; print(json.dumps(wall_templates(42)))'],
  {maxBuffer:64*1024*1024}));
const result=populateChunks(layout,templates,54);
for(const zone of layout.zones.filter(z=>z.type==='house_wall')) {
  assert.equal(zone.width,2);assert.equal(zone.depth,2);
  assert.equal(new Set(result.houses.filter(h=>h.zone===zone.id).map(h=>h.side)).size,4);
}
for(const zone of layout.zones.filter(z=>z.type==='bridge_zone')) {
  const group=result.wallGroups.find(g=>g.zone===zone.id);
  for(const kind of ['zone_main_bridge','zone_small_bridge','zone_tower','zone_door'])
    assert.ok(group.boxes.some(b=>b[6]===kind));
}
assert.ok(result.wallGroups.some(g=>g.boxes.some(b=>b[6]==='house_bridge')));
console.log('Thirty House Wall zones with four populated sides, two Bridges zones, wall links: OK');
