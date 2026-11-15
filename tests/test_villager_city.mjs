import assert from 'node:assert/strict';
import {generateVillagerCity,VILLAGER_HOUSE_TYPES} from '../villager_city.js';
import {overlaps} from '../generation_demo_generator.js';
for(const seed of [42,0,4006339556]) {
  const model=generateVillagerCity(seed);
  assert.deepEqual(model,generateVillagerCity(seed));
  assert.equal(model.houses.length,30);
  assert.ok(model.houses.filter(h=>h.central).length>=4);
  for(const h of model.houses) {
    const [x,y,z,sx,sy,sz]=h.box;
    assert.ok(VILLAGER_HOUSE_TYPES.some(size=>size[0]===sx&&size[1]===sy&&size[2]===sz));
    assert.equal(h.floors,sy===11?2:1);
    assert.equal(h.doors.length,1);
    assert.equal(model.bridges.filter(b=>b.to===h.id).length,1);
    if(h.floors===1)assert.ok(!model.boxes.some(b=>overlaps(b,[x+1,y+1,z+1,sx-2,4,sz-2])));
    else {
      const solid=p=>model.boxes.some(b=>p.every((v,i)=>v>=b[i]&&v<b[i]+b[i+3]));
      const walkable=p=>p[0]>=x&&p[0]<x+sx&&p[2]>=z&&p[2]<z+sz&&p[1]>y&&p[1]<y+sy-1&&
        solid([p[0],p[1]-1,p[2]])&&!solid(p)&&!solid([p[0],p[1]+1,p[2]]);
      const start=h.doors[0].slice(0,3),queue=[start],seen=new Set([start.join(',')]);
      assert.ok(walkable(start));
      for(let i=0;i<queue.length;i++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [-1,0,1]) {
        const p=[queue[i][0]+dx,queue[i][1]+dy,queue[i][2]+dz],key=p.join(',');
        if(!seen.has(key)&&walkable(p)){seen.add(key);queue.push(p);}
      }
      assert.ok(queue.some(p=>p[1]===y+6&&p[0]>x+1&&p[0]<x+sx-2),
        'The upper floor must be reachable from the door with two blocks of head clearance');
    }
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
console.log('Villager City: four models, usable upper floors, doors, collisions, bounds and connectivity OK');
