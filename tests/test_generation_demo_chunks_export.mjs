import assert from 'node:assert/strict';
import {minecraftRuns,validateRun,exportHeader,excavatedRuns,EXPORT_BLOCKS} from '../generation_demo_chunks_export.js';

const world={length:100,width:100,height:50,chunk:10};
const key=(x,y,z)=>(y*100+z)*100+x;
const data={world,seed:42,density:11,stats:{buildingConnections:4},
  zones:[{x:1,z:1,width:2,depth:2}],
  houses:[{box:[7,5,15,8,6,7]}],denseRooms:[{box:[40,5,40,8,6,8]}],
  wallGroups:[{walls:[[10,0,10,20,50,1,'wall']],boxes:[
    [7,5,15,8,1,7,'house'],[7,10,15,8,1,7,'house'],[7,6,15,1,4,7,'house']]}],
  networkBoxes:[[40,5,40,8,1,8,'dense'],[40,10,40,8,1,8,'dense'],[39,6,42,1,2,1,'tunnel'],
    [38,5,43,1,6,1,'tunnel'],[38,5,42,1,1,1,'tunnel'],[38,10,42,1,1,1,'tunnel']],
  snakes:[{y:20,volumes:[[60,20,60,32,5,32]],boxes:[
    [60,20,60,12,1,4,'snake_floor'],[68,20,64,4,1,12,'snake_floor'],
    [60,20,59,12,5,1,'snake_wall'],[60,24,60,12,1,4,'snake_floor'],
    [60,21,60,1,3,4,'snake_partition']]}],
  buildingLong:[{box:[5,30,60,30,15,20],boxes:[
    [5,32,70,12,1,1,'long_trail'],[20,30,65,4,15,4,'long_column']]}],
  air:new Set([key(7,6,18),key(7,7,18),key(39,6,42),key(39,7,42),
    key(38,6,42),key(38,7,42),key(38,8,42),key(38,9,42)]),
  ladderBoxes:[[38,6,42,1,2,1,'ladder'],[48,6,42,1,0,1,'ladder']],
};
const runs=[...minecraftRuns(data)];
runs.forEach(r=>validateRun(r,world));
const at=(x,y,z)=>runs.reduce((block,r)=>[x,y,z].every((v,i)=>v>=r.pos[i]&&v<r.pos[i]+r.size[i])?r.block:block,null);
assert.equal(runs[0].kind,'air_zone');
assert.ok(!runs.some(r=>r.kind==='base'));
assert.ok(!JSON.stringify({header:exportHeader(data),runs}).includes('stone'));
for(const [kind,block] of Object.entries(EXPORT_BLOCKS))
  assert.equal(block,kind==='ladder'?'minecraft:ladder[facing=north]':'minecraft:deepslate');
assert.equal(at(99,49,99),null);
assert.equal(at(20,20,20),'minecraft:air');
assert.equal(at(20,10,10),'minecraft:deepslate');
assert.equal(at(8,6,18),'minecraft:air'); // Interior extends behind cavity wall.
assert.equal(at(8,5,18),'minecraft:deepslate');
assert.equal(at(7,6,18),'minecraft:air'); // Door is cut after shell placement.
assert.equal(at(44,8,44),'minecraft:air');
assert.equal(at(44,5,44),'minecraft:deepslate');
assert.equal(at(39,6,42),'minecraft:air');
assert.equal(at(38,7,42),'minecraft:ladder[facing=north]');
assert.equal(at(38,7,43),'minecraft:deepslate'); // South backing.
assert.equal(at(38,8,42),'minecraft:air');
assert.equal(at(38,9,42),'minecraft:air');
assert.equal(at(38,10,42),'minecraft:deepslate');
assert.equal(at(65,22,62),'minecraft:air');
assert.equal(at(70,22,70),'minecraft:air');
assert.equal(at(63,22,70),null); // Never clear the snake bounding rectangle.
assert.equal(at(60,22,62),'minecraft:deepslate');
assert.equal(at(10,32,70),'minecraft:deepslate');
assert.equal(at(10,33,70),'minecraft:air');
assert.equal(at(21,35,66),'minecraft:deepslate');
assert.equal(at(4,35,70),null);
assert.equal(runs.at(-1).kind,'ladder');
assert.equal(runs.filter(r=>r.kind==='ladder').length,1);
assert.deepEqual(exportHeader(data).zone.size,[100,50,100]);
assert.throws(()=>[...minecraftRuns({...data,air:undefined})]);
assert.throws(()=>validateRun({block:'minecraft:air',pos:[99,0,0],size:[2,1,1]},world));
assert.throws(()=>validateRun({block:'minecraft:stone',pos:[0,0,0],size:[1,1,1]},world));
assert.equal([...excavatedRuns(new Set([key(99,1,1),key(0,1,2)]),world)].length,2);
console.log('Deepslate/air/ladder palette, untouched exterior, hollow rooms, doors and ladders verified.');
