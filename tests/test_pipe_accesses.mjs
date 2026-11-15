import assert from 'node:assert/strict';
import {mapWorld} from '../world_config.js';
import {pipeNetworkBoxes} from '../generation_demo_chunks_pipe.js';
import {subtract} from '../generation_demo_generator.js';
import {connectPipeTunnels,PIPE_ACCESS_SPACING,PIPE_DOOR_SIZE,PIPE_DOOR_INTERVAL} from '../generation_demo_chunks_pipe_accesses.js';
import {noiseMinecraftRuns} from '../generation_noise_export.js';

const contains=(b,p)=>p.every((n,i)=>n>=b[i]&&n<b[i]+b[i+3]);
function shell([x,y,z,sx,sy,sz],kind='dense') {
  return [[x,y,z,sx,1,sz,kind],[x,y+sy-1,z,sx,1,sz,kind],
    [x,y+1,z,sx,sy-2,1,kind],[x,y+1,z+sz-1,sx,sy-2,1,kind],
    [x,y+1,z+1,1,sy-2,sz-2,kind],[x+sx-1,y+1,z+1,1,sy-2,sz-2,kind]];
}
function fixture(floor=97) {
  const world=mapWorld(2048),paths=[[[0,100,1024],[2047,100,1024]],
    [[1800,100,1024],[1800,280,1024],[2047,280,1024]]];
  const routes=[{a:[32,floor,1080],b:[2016,floor,1080],main:true},
    {a:[127,floor,1080],b:[127,floor,1101]},
    {a:[1824,277,1080],b:[2016,277,1080],main:true}];
  const room={id:0,box:[120,floor,1100,14,7,12],doors:[[127,floor+1,1100]]};
  let boxes=[...shell([32,floor,1077,1985,8,7],'main_tunnel'),
    ...shell([1824,277,1077,193,8,7],'main_tunnel'),...shell(room.box),
    [127,floor,1080,1,1,22,'tunnel'],[126,floor+1,1084,1,2,16,'tunnel'],
    [128,floor+1,1084,1,2,16,'tunnel'],[127,floor+3,1084,1,1,16,'tunnel']];
  boxes=boxes.flatMap(b=>subtract(b,[127,floor+1,1080,1,2,22]));
  return {seed:42,world,denseRooms:[room],houses:[],zones:[],snakes:[],buildingLong:[],wideAreas:[],settlements:[],
    routes,growthConnections:[],shafts:[],mainGalleries:{interiors:[
      [32,floor+1,1078,1985,6,5],[1824,278,1078,193,6,5]]},
    air:new Set(),ladderBoxes:[],wallGroups:[],networkBoxes:boxes,stats:{},
    globalPipe:{paths,boxes:pipeNetworkBoxes(paths,world),visits:[]}};
}
const data=connectPipeTunnels(fixture()),pipe=data.globalPipe;
assert.equal(pipe.doorInterval,PIPE_DOOR_INTERVAL);
assert(pipe.accesses.length>=5);
assert(data.stats.pipeAccessSectors>=4,'Distribute doors along the network');
const solids=[...data.networkBoxes,...pipe.boxes,...pipe.pedestrianBoxes];
const solid=p=>solids.some(b=>contains(b,p));
for(const access of pipe.accesses) {
  const route=data.routes[access.target.id],end=access.path.at(-1);
  assert.equal(access.target.kind,'tunnel');
  assert(end.every((n,i)=>n>=Math.min(route.a[i],route.b[i])&&n<=Math.max(route.a[i],route.b[i])),
    'The passage must enter an actual preexisting tunnel');
  assert.deepEqual(access.doorSize,PIPE_DOOR_SIZE);
  for(let h=0;h<2;h++)assert(!solid([access.pipeDoor[0],access.pipeDoor[1]+h,access.pipeDoor[2]]));
  assert(solid([access.pipeDoor[0],access.pipeDoor[1]+2,access.pipeDoor[2]]),'Door has exactly two blocks of headroom');
  for(const side of [-1,1]) {
    const jamb=[...access.pipeDoor];jamb[access.pipeAxis]+=side;
    assert(solid(jamb),'Door has one block of clear width');
  }
  for(let i=0;i<access.path.length;i++) {
    const p=access.path[i];
    assert(solid(p),`Missing floor ${p}`);
    for(let h=1;h<=2;h++)assert(!solid([p[0],p[1]+h,p[2]]),`Blocked connection ${p}`);
    if(i) {
      const previous=access.path[i-1];
      assert.equal(Math.abs(p[0]-previous[0])+Math.abs(p[2]-previous[2]),1);
      assert(Math.abs(p[1]-previous[1])<=1);
    }
  }
}
// Walk from a pipe exit through the existing gallery, through its old door, and into a house.
const lower=pipe.accesses.find(a=>a.path.at(-1)[1]===97),goal=[127,97,1103];
const mapSolid=p=>data.networkBoxes.some(b=>contains(b,p));
const walkable=p=>mapSolid(p)&&!mapSolid([p[0],p[1]+1,p[2]])&&!mapSolid([p[0],p[1]+2,p[2]]);
const queue=[lower.path.at(-1)],seen=new Set([queue[0].join(',')]);let reached=false;
for(let i=0;i<queue.length;i++) {
  const p=queue[i];if(p.every((n,j)=>n===goal[j])){reached=true;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const q=[p[0]+dx,p[1],p[2]+dz],key=q.join(',');
    if(!seen.has(key)&&walkable(q)){seen.add(key);queue.push(q);}
  }
}
assert(reached,'Walking connectivity must continue beyond the new passage and into the map');
for(let i=0;i<pipe.accesses.length;i++)for(let j=0;j<i;j++) {
  const a=pipe.accesses[i].path[0],b=pipe.accesses[j].path[0];
  assert(Math.abs(a[1]-b[1])>=64||Math.hypot(a[0]-b[0],a[2]-b[2])>=PIPE_ACCESS_SPACING);
}
for(const floor of [89,111]) {
  const stairs=connectPipeTunnels(fixture(floor));
  assert(stairs.globalPipe.accesses.some(a=>a.path[0][1]!==a.path.at(-1)[1]));
  const geometry=[...stairs.networkBoxes,...stairs.globalPipe.boxes,...stairs.globalPipe.pedestrianBoxes];
  for(const a of stairs.globalPipe.accesses)for(let i=0;i<a.path.length;i++) {
    const p=a.path[i],height=(a.path[i-1]?.[1]>p[1]||a.path[i+1]?.[1]>p[1])?3:2;
    for(let h=1;h<=height;h++)assert(!geometry.some(b=>contains(b,[p[0],p[1]+h,p[2]])),'Stair headroom');
  }
}
for(const axis of [0,2])for(const sign of [-1,1]) {
  const turning=fixture(),end=[1800,280,1024];end[axis]+=sign*200;
  turning.routes=[];turning.mainGalleries.interiors=[];turning.denseRooms=[];turning.networkBoxes=[];
  turning.globalPipe.paths=[[[1800,100,1024],[1800,280,1024],end]];
  turning.globalPipe.boxes=pipeNetworkBoxes(turning.globalPipe.paths,turning.world);
  connectPipeTunnels(turning);
  const geometry=[...turning.globalPipe.boxes,...turning.globalPipe.pedestrianBoxes];
  for(const [x,y,z,,height] of turning.globalPipe.pedestrianLadders)for(let level=y;level<y+height;level++) {
    assert(!geometry.some(b=>contains(b,[x,level,z])));
    assert(geometry.some(b=>contains(b,[x,level,z+1])));
  }
}
assert.deepEqual(connectPipeTunnels(fixture()).globalPipe.accesses,pipe.accesses);
assert.equal(connectPipeTunnels(data),data);
const rotated=fixture(),turn=b=>[b[2],b[1],b[0],b[5],b[4],b[3],...b.slice(6)];
rotated.denseRooms.forEach(r=>r.box=turn(r.box));
rotated.networkBoxes=rotated.networkBoxes.map(turn);
rotated.mainGalleries.interiors=rotated.mainGalleries.interiors.map(turn);
rotated.routes=rotated.routes.map(r=>({...r,a:[r.a[2],r.a[1],r.a[0]],b:[r.b[2],r.b[1],r.b[0]]}));
rotated.globalPipe.paths=rotated.globalPipe.paths.map(path=>path.map(([x,y,z])=>[z,y,x]));
rotated.globalPipe.boxes=rotated.globalPipe.boxes.map(turn);
connectPipeTunnels(rotated);
assert(rotated.globalPipe.accesses.length>=5&&rotated.globalPipe.accesses.every(a=>a.pipeAxis===2));
const runs=[...noiseMinecraftRuns(data,{voidBoxes:[]},[])];
function exported(point) {
  const p=[point[0],point[1]+data.world.minY,point[2]];
  return runs.reduce((block,r)=>contains([...r.pos,...r.size],p)?r.block:block,undefined);
}
for(const access of pipe.accesses) {
  for(const p of access.path) {
    assert.equal(exported(p),'minecraft:deepslate');
    for(let h=1;h<=2;h++)assert.equal(exported([p[0],p[1]+h,p[2]]),'minecraft:air');
  }
  assert.equal(exported(access.pipeDoor),'minecraft:air');
  assert.equal(exported([access.pipeDoor[0],access.pipeDoor[1]+2,access.pipeDoor[2]]),'minecraft:deepslate');
}
const isolated=fixture();isolated.routes=[];isolated.mainGalleries.interiors=[];
connectPipeTunnels(isolated);
assert(isolated.globalPipe.accesses.length>0,'A real room can receive a direct pipe exit');
assert(isolated.globalPipe.accesses.every(a=>a.target.kind==='room'&&a.join.kind==='room'));
const blocked=fixture();blocked.wideAreas=[{box:[0,0,1034,2048,384,14],boxes:[]}];
connectPipeTunnels(blocked);assert.equal(blocked.globalPipe.accesses.length,0);
// Distant exits must each reach an original tunnel, never an earlier exit's connector.
const remote=fixture();remote.denseRooms=[];remote.networkBoxes=[];remote.mainGalleries.interiors=[];
remote.globalPipe.paths=[[[64,100,64],[1984,100,64]]];
remote.globalPipe.boxes=pipeNetworkBoxes(remote.globalPipe.paths,remote.world);
remote.routes=[{a:[64,97,600],b:[192,97,600],main:true}];
remote.networkBoxes=[[64,97,600,129,1,1,'tunnel']];
connectPipeTunnels(remote);
assert(remote.globalPipe.accesses.length>0,'Connect remote pipes when a real destination is reachable');
const ordered=[...remote.globalPipe.accesses].sort((a,b)=>a.along-b.along);
for(const a of ordered) {
  assert.equal(a.join.kind,'map','New connectors must never be used as destinations');
  assert.equal(a.target.id,0);
  const end=a.path.at(-1),route=remote.routes[0];
  assert(end.every((n,i)=>n>=Math.min(route.a[i],route.b[i])&&n<=Math.max(route.a[i],route.b[i])));
}
for(let i=0;i<ordered.length;i++)for(let j=0;j<i;j++) {
  const other=new Set(ordered[j].path.map(p=>p.join(',')));
  for(const p of ordered[i].path)if(other.has(p.join(',')))
    assert(p[2]===600&&p[0]>=64&&p[0]<=192,'Independent exits may only meet in the original map tunnel');
}
const remoteGeometry=[...remote.networkBoxes,...remote.globalPipe.boxes,...remote.globalPipe.pedestrianBoxes];
for(const access of ordered) {
  for(const p of access.path) {
    assert(remoteGeometry.some(b=>contains(b,p)),'Service junction floor must stay present');
    for(let h=1;h<=2;h++)assert(!remoteGeometry.some(b=>contains(b,[p[0],p[1]+h,p[2]])),
      'Independent connectors must remain traversable');
  }
}
const nearest=fixture();nearest.denseRooms=[];nearest.networkBoxes=[];nearest.mainGalleries.interiors=[];
nearest.globalPipe.paths=[[[32,100,1024],[224,100,1024]]];
nearest.globalPipe.boxes=pipeNetworkBoxes(nearest.globalPipe.paths,nearest.world);
nearest.routes=[{a:[32,97,1120],b:[224,97,1120]}, {a:[32,97,1080],b:[224,97,1080]}];
connectPipeTunnels(nearest);
assert.equal(nearest.globalPipe.accesses[0].target.id,1,'Choose the nearest accessible original tunnel');
const perpendicular=fixture();perpendicular.denseRooms=[];perpendicular.mainGalleries.interiors=[];
perpendicular.globalPipe.paths=[[[32,60,128],[224,60,128]]];
perpendicular.globalPipe.boxes=pipeNetworkBoxes(perpendicular.globalPipe.paths,perpendicular.world);
perpendicular.routes=[{a:[256,57,128],b:[256,57,300]}];
perpendicular.networkBoxes=shell([253,57,127,7,8,175],'main_tunnel');
perpendicular.mainGalleries.interiors=[[254,58,128,5,6,173]];
connectPipeTunnels(perpendicular);
assert(perpendicular.globalPipe.accesses.length>0);
const perpendicularSolids=[...perpendicular.networkBoxes,...perpendicular.globalPipe.pedestrianBoxes];
for(let z=128;z<=300;z++)for(let h=1;h<=2;h++)
  assert(!perpendicularSolids.some(b=>contains(b,[256,57+h,z])),
    'A connection must preserve the existing tunnel beyond the junction');

function roomFixture(kind='room',ceiling=false) {
  const d=fixture();d.denseRooms=[];d.houses=[];d.routes=[];d.networkBoxes=[];d.mainGalleries.interiors=[];
  d.globalPipe.paths=[[[32,60,128],[224,60,128]]];
  d.globalPipe.boxes=pipeNetworkBoxes(d.globalPipe.paths,d.world);
  const room={id:0,box:ceiling?[56,104,120,20,8,20]:[54,57,164,20,8,16]};
  if(kind==='house'){d.houses=[room];d.wallGroups=[{boxes:shell(room.box,'house'),walls:[]}];}
  else {d.denseRooms=[room];d.networkBoxes=shell(room.box);}
  return d;
}
for(const kind of ['room','house'])for(const ceiling of [false,true]) {
  const d=connectPipeTunnels(roomFixture(kind,ceiling)),p=d.globalPipe;
  assert.equal(p.accesses.length,1);
  const a=p.accesses[0],room=(kind==='room'?d.denseRooms:d.houses)[0];
  assert.deepEqual(a.target,{kind,id:0});assert.equal(a.join.kind,kind);
  assert.equal(a.type,ceiling?'ceiling':'side');
  const geometry=[...d.networkBoxes,...d.wallGroups.flatMap(g=>[...g.boxes,...g.walls]),...p.boxes,...p.pedestrianBoxes];
  const solid=q=>geometry.some(b=>contains(b,q));
  const operations=[...noiseMinecraftRuns(d,{voidBoxes:[]},[])];
  const exported=q=>operations.reduce((block,r)=>contains([...r.pos,...r.size],[q[0],q[1]+d.world.minY,q[2]])?r.block:block,undefined);
  if(ceiling) {
    assert.equal(a.ladders.length,1);assert.deepEqual(a.normal,[0,1,0]);
    const [x,y,z,,height]=a.ladders[0];
    for(let level=y;level<y+height;level++) {
      assert(!solid([x,level,z]),'Open ceiling shaft, including the pipe shell and room floor');
      assert(solid([x,level,z+1]),'Continuous ladder backing');
      assert.equal(exported([x,level,z]),'minecraft:ladder[facing=north]');
      assert.equal(exported([x,level,z+1]),'minecraft:deepslate');
    }
    assert(solid([x+1,room.box[1],z]),'A floor to step onto upstairs');
    for(let h=1;h<=2;h++)assert(!solid([x+1,room.box[1]+h,z]),'Clear upstairs landing');
    assert(!solid([x,room.box[1]+2,z]),'Headroom at the ladder exit');
    const obstructed=roomFixture(kind,true);obstructed.buildingLong=[{box:[62,80,126,5,6,5],boxes:[]}];
    connectPipeTunnels(obstructed);assert.equal(obstructed.globalPipe.accesses.length,0,'Do not drill through an unrelated build');
  }else {
    for(const q of a.path) {
      assert(solid(q));for(let h=1;h<=2;h++)assert(!solid([q[0],q[1]+h,q[2]]));
    }
    const end=a.path.at(-1);
    assert(end[0]>room.box[0]&&end[0]<room.box[0]+room.box[3]-1&&
      end[2]>room.box[2]&&end[2]<room.box[2]+room.box[5]-1,'Enter the room interior');
    for(let h=1;h<=2;h++)assert.equal(exported([end[0],end[1]+h,end[2]]),'minecraft:air');
  }
}
console.log('Pipe accesses: independent nearest map destinations, 1x2 doors, upstairs rooms/houses, backed ceiling ladders and Minecraft export OK');
