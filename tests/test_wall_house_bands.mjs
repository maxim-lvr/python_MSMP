import assert from 'node:assert/strict';
import {populateChunkCore} from '../generation_demo_chunks_population.js';
import {overlaps,subtract} from '../generation_demo_generator.js';

// Two houses near opposite ends of a 320-high template reproduce the seam collision.
const houses=[1,304].map(y=>({box:[20,y,-10,12,16,20],rear_door:{pos:[25,y+1,-10]}}));
const runs=houses.flatMap(h=>{
  const [x,y,z,sx,sy,sz]=h.box;
  return [[x,y,z,sx,1,sz],[x,y+sy-1,z,sx,1,sz],
    [x,y+1,z,sx,sy-2,1],[x,y+1,z+sz-1,sx,sy-2,1],
    [x,y+1,z+1,1,sy-2,sz-2],[x+sx-1,y+1,z+1,1,sy-2,sz-2]]
    .flatMap(b=>subtract([...b,'house'],[...h.rear_door.pos,1,2,1]))
    .map(b=>({pos:b.slice(0,3),size:b.slice(3,6),kind:b[6]}));
});
const templates={strips:{64:{height:320,houses,runs}},bridges:[],denseSize:[5,30,5,8]};
for(const bands of [[16,336,656],[8,336,664]])for(const seed of [42,0,7]) {
  const data=populateChunkCore({seed,world:{length:1024,width:1024,height:1000,chunk:32},
    zones:[{id:0,x:8,z:8,width:2,depth:2}],wallHouseBands:bands},templates,0,true);
  assert.equal(data.houses.length,24);
  assert.equal(data.ports.length,24);
  for(let i=0;i<data.houses.length;i++) {
    const box=data.houses[i].box;
    assert(box[1]>=0&&box[1]+box[4]<=1000);
    for(let j=0;j<i;j++)assert(!overlaps(box,data.houses[j].box),'Stacked house bands must never overlap');
  }
  for(const port of data.ports)assert(data.shafts.find(s=>s.id===port.shaft)?.ports.includes(port.id));
}
console.log('House Wall bands: seam collisions avoided, all 24 doors connected, bounds valid on seeds 42, 0 and 7');
