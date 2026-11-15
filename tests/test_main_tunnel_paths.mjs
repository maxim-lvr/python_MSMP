import assert from 'node:assert/strict';
import {optimizeMainTunnelPaths,mainTunnelClearance} from '../generation_demo_chunks_tunnel_paths.js';

const size=32,id=(x,z)=>z*size+x;
function fixture(points,levels) {
  const nodes=points.map(([x,z])=>id(x,z)),heights=new Int16Array(size*size).fill(100);
  nodes.forEach((node,i)=>heights[node]=levels[i]);
  return {size,blocked:new Uint8Array(size*size),edges:nodes.slice(1).map((n,i)=>[nodes[i],n]),
    terminals:[nodes[0],nodes.at(-1)],heights,caps:new Int16Array(size*size).fill(200)};
}
const turns=points=>points.slice(2).filter((p,i)=>
  (p[0]!==points[i+1][0])!==(points[i+1][0]!==points[i][0])).length;
const climb=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.abs(p[1]-points[i][1]),0);
const lShape=[[2,2],[3,2],[4,2],[4,3],[4,4]],valley=[100,94,88,94,100];
const flat=optimizeMainTunnelPaths(fixture(lShape,valley))[0];
assert(flat.points.every(p=>p[1]===100),'An empty corner between equal-height entrances stays flat');
assert.equal(turns(flat.points),1);assert(climb(flat.points)<flat.originalClimb);

const detour=[[2,2],[2,3],[3,3],[4,3],[4,4],[5,4]];
for(const [start,end] of [[80,112],[112,80]]) {
  const input=fixture(detour,[start,94,88,94,100,end]),path=optimizeMainTunnelPaths(input)[0];
  assert.equal(turns(path.points),1,'Use at most one right angle when unobstructed');
  assert.equal(path.points.length,6,'Use Manhattan distance without a detour');
  assert.equal(climb(path.points),Math.abs(end-start),'No extra descent/ascent between different heights');
  assert.equal(path.points[0][1],start);assert.equal(path.points.at(-1)[1],end);
}
const blocked=fixture(detour,[100,94,88,94,100,100]);
blocked.blocked[id(5,2)]=1;blocked.blocked[id(2,4)]=1;
const around=optimizeMainTunnelPaths(blocked)[0];
assert(around.points.every(p=>!blocked.blocked[id(p[0]/16,p[2]/16)]),'Keep the detour around a cavity');
assert(around.points.every(p=>p[1]===100),'Flatten height even when planar bends are required');

const overhead=fixture([[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2]],[100,94,86,80,86,94,100]);
overhead.caps[id(5,2)]=80;
const below=optimizeMainTunnelPaths(overhead)[0];
assert.equal(below.points[0][1],100);assert.equal(below.points.at(-1)[1],100);
assert.equal(below.points[3][1],80,'Keep a descent required to pass below an obstacle');
for(let i=1;i<below.points.length;i++)assert(Math.abs(below.points[i][1]-below.points[i-1][1])<=8);
const alternative=fixture(lShape,valley);alternative.caps[id(3,2)]=90;
assert(optimizeMainTunnelPaths(alternative)[0].points.every(p=>p[1]===100),
  'Prefer the other right angle when it avoids an obstacle-induced dip');
const unevenCaps=fixture(Array.from({length:11},(_,i)=>[i+2,2]),Array.from({length:11},(_,i)=>100+i*4));
unevenCaps.caps[id(5,2)]=105;unevenCaps.caps[id(9,2)]=115;
assert.equal(climb(optimizeMainTunnelPaths(unevenCaps)[0].points),40,
  'Delay the climb instead of descending again when a later obstacle has a lower ceiling');
const above=fixture(lShape,valley);above.caps[id(3,2)]=60;above.caps[id(2,3)]=60;
above.clear=mainTunnelClearance([[44,68,28,10,8,10],[28,68,44,10,8,10]]);
assert(optimizeMainTunnelPaths(above)[0].points.every(p=>p[1]===100),
  'Keep a flat passage above low structures instead of forcing a dive underneath');
const clearance=mainTunnelClearance([[64,100,40,7,8,40]]);
assert(!clearance([64,100,32],[64,100,96]),'Check the full gallery body at a crossing');
assert(clearance([64,92,32],[64,92,96]),'Eight blocks below an existing gallery preserves both floors');

const branched=fixture([[2,2],[3,2],[4,2],[5,2],[6,2]],[100,94,100,94,100]);
branched.edges.push([id(4,2),id(4,3)],[id(4,3),id(4,4)]);branched.terminals.push(id(4,4));
const branches=optimizeMainTunnelPaths(branched);
assert.equal(branches.length,3,'Preserve every branch of the network');
assert(branches.every(p=>p.endpoints.includes(id(4,2))),'Keep the common junction');
for(const terminal of branched.terminals)assert(branches.some(p=>p.endpoints.includes(terminal)),'Preserve every entrance');
branched.terminals.push(id(3,2));
assert(optimizeMainTunnelPaths(branched).some(p=>p.endpoints.includes(id(3,2))),
  'An entrance remains an anchor even on a straight degree-two segment');
assert.deepEqual(optimizeMainTunnelPaths(branched),optimizeMainTunnelPaths(branched),'Deterministic routing');
console.log('Main tunnels: flat corners, monotonic stairs, one-bend shortcuts, obstacle clearance and all junctions/entrances preserved');
