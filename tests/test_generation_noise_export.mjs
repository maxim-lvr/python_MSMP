import assert from 'node:assert/strict';
import {clipRun,noiseMinecraftRuns} from '../generation_noise_export.js';

const bounds=[0,0,0,5000,300,5000];
const run={kind:'test',block:'minecraft:deepslate',pos:[-1,299,4999],size:[3,3,4]};
assert.deepEqual(clipRun(run,bounds),{...run,pos:[0,299,4999],size:[2,1,1]});
assert.equal(clipRun({...run,pos:[5000,0,0]},bounds),null);
assert.throws(()=>clipRun({...run,size:[1.5,1,1]},bounds));
const data={world:{length:100,width:100,height:100},zones:[],houses:[],denseRooms:[],
  snakes:[],buildingLong:[],wideAreas:[],wallGroups:[],
  mainGalleries:{interiors:[[10,11,10,5,6,5]]},
  networkBoxes:[[12,0,13,1,20,1,'ladder_support']],air:new Set([12+12*100+12*10000]),
  ladderBoxes:[[12,1,12,1,19,1,'ladder']],
  globalPipe:{boxes:[],paths:[[[30,30,30],[40,30,30],[40,40,30]]]}};
const runs=[...noiseMinecraftRuns(data,{voidBoxes:[]},[])];
assert(runs.findIndex(r=>r.kind==='air_gallery')<runs.findIndex(r=>r.kind==='ladder_support'));
assert.equal(runs.at(-1).block,'minecraft:ladder[facing=north]');
assert(runs.some(r=>r.kind==='air_pipe'&&r.pos.join(',')==='30,30,30'&&r.size[0]===11));
assert(runs.every(r=>!r.block.includes('stone')));
console.log('Quarter clipping, gallery supports, pipe bore and palette OK');
data.settlements=[{box:[60,20,60,20,20,20],boxes:[
  [60,20,60,20,1,20,'water_ground'],[61,21,61,18,1,18,'water_water'],
  [64,22,64,6,7,6,'village_house'],
]}];
const updated=[...noiseMinecraftRuns(data,{voidBoxes:[]},[])];
assert(updated.some(r=>r.kind==='air_structure'&&r.pos[0]===60));
assert(updated.some(r=>r.kind==='water_water'&&r.block==='minecraft:water'));
assert(updated.some(r=>r.kind==='village_house'&&r.block==='minecraft:deepslate'));
console.log('Water Rooms and villages included in future exports');
