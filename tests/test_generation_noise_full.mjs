import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {noiseLayout,noiseWalls} from '../generation_noise_layout.js';
import {snakeVoidCrossings} from '../generation_demo_chunks_snakes.js';
import {overlaps} from '../generation_demo_generator.js';
import {populateBuildingLong} from '../generation_demo_chunks_building_long.js';
import {populateWideArea} from '../generation_demo_chunks_wide.js';
import {generateGlobalPipe} from '../generation_demo_chunks_pipe.js';
import {populateChunks} from '../generation_demo_chunks_houses.js';
import {snakeAccessPlans} from '../generation_demo_chunks_snake_ports.js';
import {validPipeConnection} from '../generation_demo_chunks_pipe_paths.js';

const image=JSON.parse(execFileSync('python3',['-c',
  'from PIL import Image; import json,base64; im=Image.open("noisemap_10000_redone_16.png").convert("RGBA"); print(json.dumps(dict(width=im.width,height=im.height,data=base64.b64encode(im.tobytes()).decode())))'
],{maxBuffer:100e6}));
image.data=Buffer.from(image.data,'base64');
const seed=Number(process.env.SEED||42);
const started=performance.now(),{layout,mask}=noiseLayout(seed,image,console.log);
assert.equal(layout.world.length,10000);assert.equal(layout.world.width,10000);
assert.equal(layout.wideAreas.length,13);assert.equal(layout.buildingLong.length,9);
assert.equal(layout.wideAreas.filter(z=>z.type==='ultra_dense').length,7);
assert.equal(layout.snakes.length,8);
assert.equal(layout.zones.filter(z=>z.type==='bridge_zone').length,5);
assert.equal(layout.zones.filter(z=>z.type==='house_wall').length,160);
assert(layout.zones.some(z=>z.x*32>5000));assert(layout.zones.some(z=>z.z*32>5000));
const waterRooms=layout.settlements.filter(z=>z.type==='water');
const villages=layout.settlements.filter(z=>z.type==='village');
assert.equal(waterRooms.length,4);assert.equal(villages.length,50);
for(const z of layout.settlements) {
  assert(z.boxes.length>0);
  assert(z.type==='water'?mask.isSolid(z.box):mask.isVoid(z.box));
  if(z.type==='water')assert.equal(z.stats.towers,196);
  else {assert(z.stats.houses>0);assert.equal(z.faultWalls.length,2);}
  for(const b of z.boxes) {
    assert(b.slice(0,6).every(Number.isInteger));
    assert(b.slice(3,6).every(n=>n>0));
    assert([z.box,...(z.accessVolumes||[])].some(v=>[0,1,2].every(i=>b[i]>=v[i]&&b[i]+b[i+3]<=v[i]+v[i+3])));
  }
  for(const other of layout.settlements)if(other.id!==z.id)assert(!overlaps(z.box,other.box));
  assert(!layout.snakes.some(s=>s.volumes.some(b=>overlaps(z.box,b))));
}
assert(new Set(villages.map(v=>Math.floor(v.box[1]/50))).size>=3);
console.log('4 Water Rooms / 50 villages: bounds, void/solid placement and spacing OK');
for(const b of [...layout.wideAreas,...layout.buildingLong].map(z=>z.box))assert(mask.isSolid(b));
const walls=noiseWalls(mask,layout.snakes,layout.settlements);
for(const v of villages) {
  assert.equal(v.ports.length,2);
  assert.deepEqual(v.ports[0].normal.map(n=>n===0?0:-n),v.ports[1].normal);
  for(const p of v.ports) {
    assert(!walls.some(w=>overlaps(w,p.door)),'Blocked wall entrance');
    assert(!v.boxes.some(b=>overlaps(b,p.houseDoor)),'Blocked village house exit');
    const head=[p.deck[0],p.deck[1]+1,p.deck[2],p.deck[3],3,p.deck[5]];
    assert(!v.boxes.some(b=>overlaps(b,head)),'Bridge headroom');
    assert(mask.isVoid(p.deck));
    assert(mask.isSolid(p.door));
    const house=v.houses.find(h=>h.id===p.house);
    assert.equal(p.deck[1],house.box[1]);
  }
}
for(const s of layout.snakes) {
  assert(s.boxes.length>0&&s.rearDoors.length>0);
  assert(s.length>=800&&s.length<=3200);
  assert(snakeVoidCrossings(s.route.points,mask.isSolid,s.y)<=2);
  assert(!walls.some(w=>s.volumes.some(v=>overlaps(w,v))));
}
console.log('Snake crossings:',layout.snakes.map(s=>s.route.voidCrossings));
console.log('Placements OK',layout.zones.length);
const accessPlans=snakeAccessPlans(layout,[],[],[]);
assert.equal(accessPlans.filter(p=>p.village!==undefined).length,100);
console.log('Snake entrances and 100 village exits OK');
if(process.argv.includes('--full')) {
  const json=async url=>{const r=await fetch('http://127.0.0.1:5173'+url);assert(r.ok);return r.json();};
  const templates=json(`/api/demo-chunks-templates?seed=${seed}`);
  let next=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<layout.buildingLong.length) {
      const index=next++,z=layout.buildingLong[index];
      layout.buildingLong[index]=populateBuildingLong(z,await json(`/api/demo-building-long?seed=${z.seed}&length=${z.length}`));
    }
  }));
  console.log('Building Long OK');
  layout.wideAreas=layout.wideAreas.map(populateWideArea);
  layout.globalPipe=generateGlobalPipe(layout);
  assert.equal(layout.globalPipe.connections.length,6);
  for(const branch of layout.globalPipe.branches)
    assert(validPipeConnection(layout.globalPipe.paths[branch.path],layout.globalPipe.paths.slice(0,branch.path)));
  for(const connection of layout.globalPipe.connections)
    assert(validPipeConnection(layout.globalPipe.paths[connection.path],layout.globalPipe.paths.slice(0,connection.path),false));
  console.log('Wide, pipes OK');
  const result=populateChunks(layout,await templates,undefined,false,6);
  assert.equal(result.stats.connectedDense,result.stats.denseRooms);
  assert.equal(result.stats.buildingConnections,36);
  assert.equal(result.stats.villageConnections,100);
  const connectedNodes=new Set(result.edges.flat());
  for(const v of villages) {
    const ports=result.ports.filter(p=>p.village===v.id);
    assert.equal(ports.length,2);
    assert.notEqual(ports[0].shaft,ports[1].shaft);
    for(const p of ports) {
      const shaft=result.shafts.find(s=>s.id===p.shaft);
      assert(shaft.ports.includes(p.id));
      assert(Number.isInteger(shaft.terminal));
      assert(connectedNodes.has(shaft.terminal),'Village shaft not joined to another network node');
      assert(p.access.length>=3);
      const x0=Math.min(...p.access.map(a=>a[0]))-2,x1=Math.max(...p.access.map(a=>a[0]))+3;
      const z0=Math.min(...p.access.map(a=>a[1]))-2,z1=Math.max(...p.access.map(a=>a[1]))+3;
      const near=result.networkBoxes.filter(b=>b[0]<x1&&b[0]+b[3]>x0&&b[2]<z1&&b[2]+b[5]>z0&&
        b[1]<p.door[1]+3&&b[1]+b[4]>p.door[1]-1);
      for(let i=1;i<p.access.length;i++) {
        const a=p.access[i-1],b=p.access[i],n=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
        for(let j=0;j<=n;j++) {
          const x=a[0]+Math.sign(b[0]-a[0])*j,z=a[1]+Math.sign(b[1]-a[1])*j;
          assert(!near.some(b=>overlaps(b,[x,p.door[1],z,1,2,1])),'Blocked village tunnel');
        }
      }
    }
  }
  for(const r of result.denseRooms)assert(mask.isSolid(r.box));
  for(const zone of result.settlements) {
    assert(!result.denseRooms.some(r=>overlaps(zone.box,r.box)));
    assert(!result.networkBoxes.some(b=>overlaps(zone.box,b)));
    assert(!result.ladderBoxes.some(b=>overlaps(zone.box,b)));
    assert(!result.globalPipe.volumes.some(b=>overlaps(zone.box,b)));
  }
  delete result.isSolidBox;
  structuredClone(result);
  console.log(result.stats);
}
console.log(`Time: ${((performance.now()-started)/1000).toFixed(1)}s`);
