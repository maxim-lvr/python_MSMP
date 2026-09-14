import {execFileSync} from 'node:child_process';
import {open,mkdir,link,unlink,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {generateChunks} from './generation_demo_chunks_generator.js';
import {placeBuildingLong,populateBuildingLong} from './generation_demo_chunks_building_long.js';
import {generateDemoSnakes} from './generation_demo_chunks_snakes.js';
import {populateChunks,DENSE_ROOMS_PER_SECTOR} from './generation_demo_chunks_houses.js';
import {exportHeader,minecraftRuns,validateRun} from './generation_demo_chunks_export.js';

const {values}=parseArgs({options:{seed:{type:'string',default:'42'},
  density:{type:'string',default:String(DENSE_ROOMS_PER_SECTOR)},out:{type:'string'}}});
const seed=Number(values.seed),density=Number(values.density);
if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(density)||density<1||density>30)
  throw Error('Seed: 0..4294967295; density: 1..30');
const root=dirname(fileURLToPath(import.meta.url));
const output=resolve(values.out||`${root}/exports/generation_demo_chunks_seed${seed}_deepslate.json`);
try {await stat(output);throw Error(`Export already exists: ${output}`);} catch(error) {if(error.code!=='ENOENT')throw error;}
const python=expression=>JSON.parse(execFileSync('python3',['-c',
  `import json; from generation_demo_chunks_templates import wall_templates, building_long_template; print(json.dumps(${expression}))`],
  {cwd:root,maxBuffer:40_000_000}));

console.log(`Generation seed ${seed}, density ${density}...`);
const layout=generateChunks(seed),templates=python(`wall_templates(${seed})`);
layout.buildingLong=placeBuildingLong(layout).map(zone=>populateBuildingLong(zone,python(`building_long_template(${zone.seed},${zone.length})`)));
console.log('Four Building Long models loaded; generating snakes and dense network...');
layout.snakes=generateDemoSnakes(layout);
const data=populateChunks(layout,templates,undefined,true,density);
// Diagnostic solids are unnecessary once their compressed boxes have been created.
delete data.solid;
console.log(`${data.denseRooms.length} dense rooms, ${data.ports.length} accesses; writing ordered fills...`);
await mkdir(dirname(output),{recursive:true});
const temporary=`${output}.partial`,file=await open(temporary,'wx');
const counts={},volumes={};
let total=0,buffer='';
try {
  await file.writeFile(`${JSON.stringify(exportHeader(data)).slice(0,-1)},"runs":[\n`);
  for(const operation of minecraftRuns(data)) {
    validateRun(operation,data.world);
    counts[operation.kind]=(counts[operation.kind]||0)+1;
    volumes[operation.kind]=(volumes[operation.kind]||0)+operation.size.reduce((n,s)=>n*s,1);
    buffer+=`${total?',\n':''}${JSON.stringify(operation)}`;total++;
    if(buffer.length>=262144){await file.writeFile(buffer);buffer='';}
  }
  await file.writeFile(`${buffer}\n],"export_stats":${JSON.stringify({runs:total,runs_by_kind:counts,write_volumes_by_kind:volumes})}}\n`);
  await file.sync();
} finally {await file.close();}
// Publish only a completed file, without overwriting any previous export.
await link(temporary,output);await unlink(temporary);
console.log(JSON.stringify({file:output,bytes:(await stat(output)).size,runs:total,
  buildingConnections:data.stats.buildingConnections}));
