import assert from 'node:assert/strict';
import {WORLD_MIN_Y,WORLD_MAX_Y,WORLD_HEIGHT,mapWorld} from '../world_config.js';
import {WORLD as CHUNK_WORLD,generateChunks} from '../generation_demo_chunks_generator.js';
import {WORLD as DEMO_WORLD} from '../generation_demo_generator.js';
import {WORLD as MEGA_WORLD} from '../generation_megastructure.js';
import {NOISE_WORLD,noiseMask} from '../generation_noise_mask.js';
import {exportHeader,minecraftRuns,validateRun} from '../generation_demo_chunks_export.js';
import {noiseMinecraftRuns,clipRun} from '../generation_noise_export.js';
import {growDense} from '../generation_demo_chunks_growth.js';
import {pipeNetworkBoxes} from '../generation_demo_chunks_pipe.js';

for(const world of [CHUNK_WORLD,DEMO_WORLD,MEGA_WORLD,NOISE_WORLD]) {
  assert.equal(world.minY,-64);
  assert.equal(world.maxY,320);
  assert.equal(world.height,384);
  assert.equal(world.minY+world.height,world.maxY);
}
const layout=generateChunks(42);
for(const zone of layout.zones)for(const wall of zone.walls)assert.equal(wall[4],WORLD_HEIGHT);

const world=mapWorld(64),key=(x,y,z)=>(y*world.width+z)*world.length+x;
const data={world,seed:42,stats:{},zones:[],houses:[],denseRooms:[],snakes:[],buildingLong:[],wideAreas:[],
  wallGroups:[],networkBoxes:[[0,0,0,64,1,64,'wall'],[0,383,0,64,1,64,'wall'],
    [20,350,20,1,1,1,'main_tunnel'],[21,350,20,1,1,1,'main_tunnel_frame'],[22,350,20,1,1,1,'ladder_support']],
  air:new Set([key(10,1,10),key(11,1,10),key(10,382,10)]),
  ladderBoxes:[[10,1,10,1,382,1,'ladder']],mainGalleries:{interiors:[]},globalPipe:{boxes:[],paths:[]}};
assert.deepEqual(exportHeader(data).zone,{pos:[0,-64,0],size:[64,384,64]});
for(const runs of [[...minecraftRuns(data)],[...noiseMinecraftRuns(data,{voidBoxes:[]},[])]]) {
  for(const run of runs)validateRun(run,world);
  assert(runs.some(r=>r.pos[1]===WORLD_MIN_Y&&r.block==='minecraft:deepslate'));
  assert(runs.some(r=>r.pos[1]===WORLD_MAX_Y-1&&r.block==='minecraft:deepslate'));
  assert(runs.some(r=>r.kind==='air_network'&&r.pos[1]===-63&&r.size[0]===2));
  assert(runs.some(r=>r.kind==='air_network'&&r.pos[1]===318));
  assert.equal(runs.at(-1).block,'minecraft:ladder[facing=north]');
  assert.equal(runs.at(-1).pos[1],-63);
  assert.equal(runs.at(-1).size[1],382);
}
for(const y of [-65,320])assert.throws(()=>validateRun({block:'minecraft:air',pos:[0,y,0],size:[1,1,1]},world));
assert.throws(()=>validateRun({block:'minecraft:air',pos:[0,319,0],size:[1,2,1]},world));
const bounds=[0,-64,0,64,384,64];
assert.deepEqual(clipRun({block:'minecraft:air',pos:[0,-65,0],size:[1,3,1]},bounds).size,[1,2,1]);
assert.deepEqual(clipRun({block:'minecraft:air',pos:[0,319,0],size:[1,3,1]},bounds).size,[1,1,1]);
assert.equal(clipRun({block:'minecraft:air',pos:[0,320,0],size:[1,1,1]},bounds),null);

const pixels=new Uint8Array([0,0,0,255,255,255,255,255]);
const mask=noiseMask(2,1,pixels,world);
assert(mask.walls.every(b=>b[1]+b[4]===WORLD_HEIGHT));
assert(mask.voidBoxes.every(b=>b[1]===0&&b[4]===WORLD_HEIGHT));

let state=42;
const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
const growth=growDense({layout:{world:mapWorld(512),zones:[]},houses:[],shafts:[],
  routes:[{a:[128,330,256],b:[384,330,256]}],target:16,integer,sizes:[5,18,5,8],
  addAir:(x,y,z)=>assert(y>=0&&y<WORLD_HEIGHT)});
assert(growth.rooms.some(r=>r.box[1]>300));
assert(growth.rooms.every(r=>r.box[1]+r.box[4]<WORLD_HEIGHT));

const pipes=pipeNetworkBoxes([[[10,330,40],[90,330,40]],[[10,335,40],[90,335,40]]],mapWorld(128));
for(const y of [330,335])assert(!pipes.some(b=>[40,y,40].every((n,i)=>n>=b[i]&&n<b[i]+b[i+3])),
  'Nearby pipe shells must leave both bores open');
console.log('World Y -64..319: map bounds, full-height walls, sparse air, ladders and both exports OK');
