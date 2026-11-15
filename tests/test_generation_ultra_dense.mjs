import assert from 'node:assert/strict';
import {ULTRA_DENSE_AREA,placeWideAreas,populateWideArea} from '../generation_demo_chunks_wide.js';
import {mapWorld} from '../world_config.js';
import {noiseMinecraftRuns} from '../generation_noise_export.js';
import {snakeAccessPlans} from '../generation_demo_chunks_snake_ports.js';
import {populateChunkCore} from '../generation_demo_chunks_population.js';

const world=mapWorld(5000),layout={seed:42,world,zones:[],buildCounts:{wide:{ultra_dense:4}}};
const areas=placeWideAreas(layout);
assert.equal(areas.length,4);
for(const rotation of [0,1]) {
  const area=populateWideArea({id:0,index:0,type:'ultra_dense',seed:42,rotation,size:ULTRA_DENSE_AREA,
    box:[32,24,64,rotation?ULTRA_DENSE_AREA.width:ULTRA_DENSE_AREA.length,200,
      rotation?ULTRA_DENSE_AREA.length:ULTRA_DENSE_AREA.width]});
  assert.equal(area.stats.houses,792);assert.equal(area.stats.doors,3960);
  assert(area.ports.length>=4&&area.ports.length<=8);
  for(const side of ['north','south','west','east']) {
    const count=area.ports.filter(p=>p.side===side).length;assert(count>=1&&count<=3);
  }
  const solid=p=>area.boxes.some(b=>p.every((v,i)=>v>=b[i]&&v<b[i]+b[i+3]));
  for(const port of area.ports) {
    const axis=port.normal[0]?0:2;
    assert.equal(port.pos[axis],area.box[axis]+(port.normal[axis]>0?area.box[axis+3]-1:0));
    for(let step=0;step<=11;step++) {
      const p=port.entry.map((v,i)=>v+port.normal[i]*step);
      assert(!solid(p),'The entrance has no remaining blind backing');
      assert(!solid([p[0],p[1]+1,p[2]]),'Two blocks of head clearance');
      assert(solid([p[0],p[1]-1,p[2]]),'Continuous supported floor');
    }
  }
  for(const b of area.boxes)assert([0,1,2].every(i=>b[i]>=area.box[i]&&b[i]+b[i+3]<=area.box[i]+area.box[i+3]),
    'All facades and exterior rooms fit inside the reserved box, including after rotation');
  const data={world,zones:[],houses:[],denseRooms:[],snakes:[],buildingLong:[],wideAreas:[area],
    wallGroups:[],networkBoxes:[],air:new Set(),ladderBoxes:[],mainGalleries:{interiors:[]},globalPipe:{boxes:[],paths:[]}};
  const runs=[...noiseMinecraftRuns(data,{voidBoxes:[]},[])];
  assert.equal(runs[0].kind,'air_structure');assert.deepEqual(runs[0].size,area.box.slice(3));
  assert(runs.some(r=>r.kind==='wide_ultra_dense_room_wall'&&r.block==='minecraft:deepslate'));
  const point=area.spawn.map(Math.floor);point[1]+=world.minY;
  const block=runs.reduce((previous,r)=>point.every((n,i)=>n>=r.pos[i]&&n<r.pos[i]+r.size[i])?r.block:previous,undefined);
  assert.equal(block,'minecraft:air','The courtyard is excavated in the Minecraft export');
}

// Check actual network carving, ladder attachment and graph connectivity, beyond choosing doors.
const area=populateWideArea({id:0,index:0,type:'ultra_dense',seed:42,rotation:0,
  box:[256,64,256,ULTRA_DENSE_AREA.length,200,ULTRA_DENSE_AREA.width]});
const small={seed:42,world:mapWorld(1024),zones:[],wideAreas:[area]};
assert.equal(snakeAccessPlans(small,[],[],[]).length,area.ports.length);
const data=populateChunkCore(small,{strips:{},bridges:[],denseSize:[5,30,5,8]},0,true);
assert.equal(data.stats.ultraDenseConnections,area.ports.length);
const key=([x,y,z])=>(y*1024+z)*1024+x;
for(const port of data.ports) {
  assert(data.air.has(key(port.door))&&data.air.has(key([port.door[0],port.door[1]+1,port.door[2]])));
  const shaft=data.shafts.find(s=>s.id===port.shaft);
  assert(shaft&&shaft.ports.includes(port.id));
  assert(data.ladderBoxes.some(b=>b[0]===shaft.x&&b[2]===shaft.z));
}
const reached=new Set([data.edges[0][0]]);
let previous=-1;
while(previous!==reached.size){previous=reached.size;for(const e of data.edges) {
  if(reached.has(e[0]))reached.add(e[1]);if(reached.has(e[1]))reached.add(e[0]);
}}
assert(data.edges.every(e=>reached.has(e[0])&&reached.has(e[1])),'All entrance shafts join one network');
console.log('Ultra dense: entrance quotas, supported doors, both rotations, connected ladders/network and Minecraft export OK');
