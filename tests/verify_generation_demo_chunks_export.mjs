import assert from 'node:assert/strict';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {validateRun} from '../generation_demo_chunks_export.js';

const path=process.argv[2];
if(!path)throw Error('Provide the completed Minecraft JSON export');
const lines=createInterface({input:createReadStream(path),crlfDelay:Infinity});
let header,summary,world,total=0,last;
const counts={},samples={air_dense:0,air_house:0,long_trail:0};
const probes=[{pos:[0,0,0],expected:undefined},{pos:[4999,299,4999],expected:undefined}];
for await(const text of lines) {
  const line=text.trim();if(!line)continue;
  assert.ok(!line.includes('stone'),'Unexpected material or fill instruction');
  if(!header) {
    assert.ok(line.endsWith(',"runs":['));
    header=JSON.parse(`${line.slice(0,-9)}}`);
    const [length,height,width]=header.zone.size;world={length,height,width};
    assert.deepEqual(header.zone.size,[5000,300,5000]);
    assert.equal(header.settings.seed,42);
    continue;
  }
  if(line.startsWith('],"export_stats":')) {summary=JSON.parse(`{${line.slice(2)}`).export_stats;continue;}
  assert.ok(!summary,'Data after export trailer');
  const r=JSON.parse(line.endsWith(',')?line.slice(0,-1):line);
  validateRun(r,world);
  if(total===0)assert.equal(r.kind,'air_zone');
  assert.notEqual(r.kind,'base');
  if(r.kind in samples&&samples[r.kind]<12) {
    samples[r.kind]++;
    const pos=r.pos.map((v,i)=>v+Math.floor((r.size[i]-1)/2));
    if(r.kind==='air_house')pos[1]=r.pos[1]+1;
    probes.push({pos,expected:r.kind==='long_trail'?'minecraft:deepslate':'minecraft:air'});
  }
  for(const p of probes)if(p.pos.every((v,i)=>v>=r.pos[i]&&v<r.pos[i]+r.size[i]))p.actual=r.block;
  if(r.kind==='ladder') {
    assert.equal(r.block,'minecraft:ladder[facing=north]');
    assert.equal(r.size[0],1);assert.equal(r.size[2],1);
  } else assert.notEqual(last,'ladder','Ladders must be the final phase');
  last=r.kind;total++;counts[r.kind]=(counts[r.kind]||0)+1;
}
assert.ok(summary,'Incomplete export');
assert.equal(total,summary.runs);assert.deepEqual(counts,summary.runs_by_kind);
assert.equal(summary.write_volumes_by_kind.base,undefined);
assert.equal(header.stats.buildingConnections,16);
assert.equal(header.stats.buildingLong,4);assert.equal(header.stats.snakes,4);
assert.equal(counts.air_zone,18);assert.equal(counts.air_building_long,4);
for(const kind of ['air_dense','air_house','air_snake','air_network','ladder','long_trail','snake_partition'])assert.ok(counts[kind]>0);
for(const p of probes)assert.equal(p.actual,p.expected,`Wrong final block at ${p.pos}`);
console.log(JSON.stringify({runs:total,probes:probes.length,
  denseRooms:counts.air_dense,buildingConnections:header.stats.buildingConnections,valid:true}));
