import assert from 'node:assert/strict';
import {mapWorld} from '../world_config.js';
import {compactPipePath,validPipePath,validPipeConnection,pointOnPipePaths} from '../generation_demo_chunks_pipe_paths.js';
import {expandPipeNetwork} from '../generation_demo_chunks_pipe_network.js';
import {pipeBoreBoxes,pipeNetworkSegments} from '../generation_demo_chunks_pipe.js';
import {noiseWalls} from '../generation_noise_layout.js';

assert.deepEqual(compactPipePath([[0,80,0],[128,80,0],[32,80,0],[32,80,96]]),
  [[0,80,0],[32,80,0],[32,80,96]]);
assert.deepEqual(compactPipePath([[0,80,0],[128,80,0],[0,80,0]]),[[0,80,0]]);
assert(!validPipePath([[0,80,0],[128,80,0],[128,80,12],[0,80,12]]),'Reject tight U-turns');
assert(!validPipePath([[0,80,0],[128,80,0],[128,80,128],[64,80,128],[64,80,-64]]),'Reject self intersections');
assert(validPipePath([[0,80,0],[128,80,0],[128,160,0],[256,160,0]]));

const trunk=[[64,300,64],[1024,300,64]];
assert(!validPipeConnection([[128,300,64],[128,160,64],[256,160,64]],[trunk]),'Reject free outlet');
assert(validPipeConnection([[128,300,64],[128,160,64],[768,160,64],[768,300,64]],[trunk]));
assert(!validPipeConnection([[128,300,64],[128,300,80],[768,300,80],[768,300,64]],[trunk]),'Reject close parallel branches');

const world=mapWorld(2400),points=[[0,372,1200],[2399,372,1200]];
const zone={id:0,index:0,type:'open',box:[800,100,800,300,160,300],pipe:{points:[
  [800,200,850],[900,200,850],[900,200,1050],[1099,200,1050],
]}};
const network=expandPipeNetwork({seed:42,world,zones:[],wideAreas:[zone]},
  {points,radius:6,bore:4,drops:0});
assert(network.branches.length>0);
for(const branch of network.branches) {
  const path=network.paths[branch.path],previous=network.paths.slice(0,branch.path);
  assert(validPipeConnection(path,previous));
  assert.deepEqual(branch.inlet,path[0]);assert.deepEqual(branch.outlet,path.at(-1));
  assert.notDeepEqual(branch.inlet,branch.outlet);
}
assert.deepEqual(network.connectedZones,[0]);
assert.equal(network.connections.length,2);
assert.deepEqual(network.connections.map(c=>c.role),['inlet','outlet']);
for(const connection of network.connections) {
  const path=network.paths[connection.path];
  assert.deepEqual(path[0],connection.pos);
  assert.deepEqual(path.at(-1),connection.networkPos);
  assert(pointOnPipePaths(connection.networkPos,network.paths.slice(0,connection.path)));
  assert(validPipeConnection(path,network.paths.slice(0,connection.path),false));
}
assert.equal(network.ports.filter(p=>p.role==='inlet').length,2);
assert.equal(network.ports.filter(p=>p.role==='outlet').length,2);

const pipe={paths:[[[16,40,32],[96,40,32],[96,104,32]]]},wall=[64,0,0,1,128,128,'wall'];
const opened=noiseWalls({walls:[wall]},[],[],pipe);
const contains=(b,p)=>p.every((n,i)=>n>=b[i]&&n<b[i]+b[i+3]);
assert(opened.length>0);
assert(!opened.some(b=>contains(b,[64,40,32])),'The inlet must be open in the viewer');
assert(opened.some(b=>contains(b,[64,40,40])),'Keep the wall outside the round bore');
const bores=[...pipeBoreBoxes(pipe.paths)];
assert(bores.some(b=>contains(b,[64,40,32])),'The export must carve the same inlet');
assert(pipeNetworkSegments(pipe.paths).every(s=>bores.some(b=>contains(b,s.a))));
console.log('Pipe routes: no retracing or tight loops, paired connected ports, no free branches, matching wall openings');
