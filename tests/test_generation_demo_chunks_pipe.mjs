import {WORLD_HEIGHT} from '../world_config.js';
import assert from 'node:assert/strict';
import {generateChunks} from '../generation_demo_chunks_generator.js';
import {placeBuildingLong} from '../generation_demo_chunks_building_long.js';
import {generateDemoSnakes} from '../generation_demo_chunks_snakes.js';
import {placeWideAreas, populateWideArea} from '../generation_demo_chunks_wide.js';
import {generateGlobalPipe, pipeBoxes, pipeNetworkBoxes, pipeNetworkSegments} from '../generation_demo_chunks_pipe.js';
import {overlaps} from '../generation_demo_generator.js';
import {validPipeConnection} from '../generation_demo_chunks_pipe_paths.js';

const layout = generateChunks(42);
layout.buildingLong = placeBuildingLong(layout);
layout.snakes = generateDemoSnakes(layout);
layout.wideAreas = placeWideAreas(layout).map(populateWideArea);
const pipe = generateGlobalPipe(layout);
assert.deepEqual(pipe, generateGlobalPipe(layout));
assert.ok(pipe.length >= 4999);
assert.ok(pipe.drops >= 1);
assert.equal(pipe.connectedZones.length,2);
assert.equal(pipe.connections.length,4);
assert.equal(pipe.ports.filter(p=>p.role==='inlet').length,3);
assert.equal(pipe.ports.filter(p=>p.role==='outlet').length,3);
for(const branch of pipe.branches) {
  const path=pipe.paths[branch.path];
  assert(validPipeConnection(path,pipe.paths.slice(0,branch.path)),'Branches must join two distinct network points');
  assert.deepEqual(branch.inlet,path[0]);assert.deepEqual(branch.outlet,path.at(-1));
}
assert.ok(pipe.branches.length>=8);
assert.ok(new Set(pipe.branches.map(b=>b.y)).size>=5);
assert.ok(Math.max(...pipe.points.map(p=>p[1])) - Math.min(...pipe.points.map(p=>p[1])) >= 72);
assert.ok([0,2].some(axis => Math.abs(pipe.points[0][axis]-pipe.points.at(-1)[axis])===4999));
const obstacles = [...layout.zones.map(z=>[z.x*32,0,z.z*32,z.width*32,WORLD_HEIGHT,z.depth*32]),
  ...layout.buildingLong.map(z=>z.box), ...layout.wideAreas.filter(z=>z.type!=='open').map(z=>z.box), ...layout.snakes.flatMap(s=>s.volumes)];
for(const volume of pipe.volumes)assert.ok(!obstacles.some(b=>overlaps(b,volume)));
const bounds=[5000,WORLD_HEIGHT,5000];
for(const b of pipe.boxes)assert.ok(b.slice(0,6).every(Number.isInteger)&&[0,1,2].every(i=>b[i]>=0&&b[i+3]>0&&b[i]+b[i+3]<=bounds[i]));
for(let i=1;i<pipe.points.length;i++) {
  const a=pipe.points[i-1],b=pipe.points[i],axis=[0,1,2].filter(n=>a[n]!==b[n]);assert.equal(axis.length,1);
  const dimension=axis[0];
  assert.ok(a.every((n,i)=>i===dimension||n>=10&&n+10<bounds[i]));
  for(let t=0;t<=1;t+=0.125) {
    const p=a.map((v,n)=>Math.round(v+(b[n]-v)*t));
    assert.ok(!pipe.boxes.some(box=>overlaps(box,[...p,1,1,1])),`Blocked bore at ${p}`);
  }
}
// Small orthogonal sample: no overlapping voxels, including rising and falling elbows.
const sample=pipeBoxes([[0,20,20],[40,20,20],[40,60,20],[100,60,20],[100,20,20],[140,20,20]],{length:150,width:50,height:80});
const occupied=new Set();
for(const [x,y,z,sx,sy,sz] of sample)for(let xx=x;xx<x+sx;xx++)for(let yy=y;yy<y+sy;yy++)for(let zz=z;zz<z+sz;zz++) {
  const key=`${xx},${yy},${zz}`;assert.ok(!occupied.has(key),`Overlapping pipe voxel ${key}`);occupied.add(key);
}
console.log({length:pipe.length,drops:pipe.drops,points:pipe.points,boxes:pipe.boxes.length});
const segments=pipeNetworkSegments(pipe.paths), reached=new Set([0]),queue=[0];
for(const segment of segments)for(const t of [0,0.25,0.5,0.75,1]) {
  const p=segment.a.map((n,i)=>Math.round(n+(segment.b[i]-n)*t));
  assert.ok(!pipe.boxes.some(b=>overlaps(b,[...p,1,1,1])),`Blocked network bore ${p}`);
}
for(const zone of layout.wideAreas.filter(z=>z.type==='open')) {
  const solid=zone.boxes.filter(b=>!['wide_open_pipe','wide_open_pipe_band'].includes(b[6]));
  for(const box of pipe.boxes.filter(b=>overlaps(b,zone.box)))assert.ok(!solid.some(b=>overlaps(b,box)),`Pipe cuts Wide Open ${zone.id}`);
}
const touches=(a,b)=>[0,1,2].every(i=>Math.max(Math.min(a.a[i],a.b[i]),Math.min(b.a[i],b.b[i]))<=Math.min(Math.max(a.a[i],a.b[i]),Math.max(b.a[i],b.b[i])));
for(let n=0;n<queue.length;n++)for(let j=0;j<segments.length;j++)if(!reached.has(j)&&touches(segments[queue[n]],segments[j])){reached.add(j);queue.push(j);}
assert.equal(reached.size,segments.length,'Pipe network is disconnected');
for(const c of pipe.connections) {
  assert.deepEqual(pipe.paths[c.path][0],c.pos);
  assert.ok(!pipe.boxes.some(b=>overlaps(b,[...c.pos,1,1,1])),'Capped Wide Open connection');
}
const junctions=pipeNetworkBoxes([[[10,30,40],[90,30,40]],[[40,30,10],[40,30,90]],[[40,30,40],[40,80,40]]],{length:100,width:100,height:100});
assert.ok(!junctions.some(b=>overlaps(b,[40,30,40,1,1,1])));
const cells=new Set();
for(const [x,y,z,sx,sy,sz] of junctions)for(let xx=x;xx<x+sx;xx++)for(let yy=y;yy<y+sy;yy++)for(let zz=z;zz<z+sz;zz++) {
  const key=`${xx},${yy},${zz}`;assert.ok(!cells.has(key),`Duplicate junction voxel ${key}`);cells.add(key);
}
console.log({branches:pipe.branches.length,connectedZones:pipe.connectedZones,segments:segments.length,components:1});
