import assert from 'node:assert/strict';
import {generateVillagerCity} from '../villager_city.js';
import {overlaps} from '../generation_demo_generator.js';
for(const seed of [42,0,4006339556]) {
  const model=generateVillagerCity(seed);
  assert.deepEqual(model,generateVillagerCity(seed));
  assert.equal(model.houses.length,30);
  assert.ok(model.houses.filter(h=>h.central).length>=4);
  for(const h of model.houses) {
    const [x,y,z,sx,sy,sz]=h.box;
    assert.ok(sx>=4&&sx<=8&&sz>=4&&sz<=8&&sy===7);
    assert.equal(h.doors.length,1);
    assert.equal(model.bridges.filter(b=>b.to===h.id).length,1);
    assert.ok(!model.boxes.some(b=>overlaps(b,[x+1,y+1,z+1,sx-2,5,sz-2])));
    for(const door of h.doors)assert.ok(!model.boxes.some(b=>overlaps(b,door)));
  }
  for(const b of model.boxes) {
    assert.ok(b.slice(0,6).every(Number.isInteger));
    assert.ok([200,100,80].every((max,i)=>b[i]>=0&&b[i]+b[i+3]<=max));
  }
  for(let i=0;i<model.boxes.length;i++)for(let j=0;j<i;j++)assert.ok(!overlaps(model.boxes[i],model.boxes[j]));
  const seen=new Set([-1]);
  for(const edge of model.bridges) {
    assert.ok(seen.has(edge.parent));seen.add(edge.id);
    if(edge.parent>=0)assert.ok(model.bridges[edge.parent].path.some(p=>p.every((n,i)=>n===edge.path[0][i])),
      'A branch must attach to a real parent bridge cell');
  }
  assert.equal(seen.size,model.houses.length+1);
  assert.ok(model.bridges.some(b=>b.parent>=0));
  for(const bridge of model.bridges)for(let i=1;i<bridge.path.length;i++)
    assert.ok(Math.abs(bridge.path[i][1]-bridge.path[i-1][1])<=1);
}
console.log('Villager City: sizes, hollow interiors, doors, collisions, bounds and connectivity OK');
