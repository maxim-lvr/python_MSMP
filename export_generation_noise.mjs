import {execFileSync} from 'node:child_process';
import {open,mkdir,link,unlink,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {noiseLayout,noiseWalls} from './generation_noise_layout.js';
import {populateBuildingLong} from './generation_demo_chunks_building_long.js';
import {populateWideArea} from './generation_demo_chunks_wide.js';
import {generateGlobalPipe} from './generation_demo_chunks_pipe.js';
import {populateChunks} from './generation_demo_chunks_houses.js';
import {exportHeader} from './generation_demo_chunks_export.js';
import {clipRun,noiseMinecraftRuns} from './generation_noise_export.js';
import {NOISE_WORLD} from './generation_noise_mask.js';

const root=dirname(fileURLToPath(import.meta.url)),seed=42,density=6;
const full=process.argv.includes('--full');
if(process.argv.slice(2).some(arg=>arg!=='--full'))throw Error('Usage: node export_generation_noise.mjs [--full]');
const bounds=full?[0,0,0,NOISE_WORLD.length,NOISE_WORLD.height,NOISE_WORLD.width]:[0,0,0,5000,300,5000];
const output=resolve(root,full?'exports/map_generation_final_seed42_10000x10000.json':'exports/map_noise_seed42_nord_ouest_5000x5000.json');
try {await stat(output);throw Error(`Export already exists: ${output}`);}catch(e){if(e.code!=='ENOENT')throw e;}
const image=JSON.parse(execFileSync('python3',['-c',
  'from PIL import Image; import json,base64; im=Image.open("noisemap_10000_redone_16.png").convert("RGBA"); print(json.dumps(dict(width=im.width,height=im.height,data=base64.b64encode(im.tobytes()).decode())))'
],{cwd:root,maxBuffer:10e6}));
image.data=Buffer.from(image.data,'base64');
const json=async url=>{const r=await fetch('http://127.0.0.1:5173'+url);if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);return r.json();};
const templates=await json(`/api/demo-chunks-templates?seed=${seed}`);
const {layout,mask}=noiseLayout(seed,image,console.log);
for(let i=0;i<layout.buildingLong.length;i++) {
  const z=layout.buildingLong[i];
  layout.buildingLong[i]=populateBuildingLong(z,await json(`/api/demo-building-long?seed=${z.seed}&length=${z.length}`));
  console.log(`Building Long ${i+1}/${layout.buildingLong.length}`);
}
console.log('Wide Areas and pipes...');
layout.wideAreas=layout.wideAreas.map(populateWideArea);
layout.globalPipe=generateGlobalPipe(layout);
for(const z of layout.wideAreas)if(layout.globalPipe.connectedZones.includes(z.id))
  z.boxes=z.boxes.filter(b=>!['wide_open_pipe','wide_open_pipe_band'].includes(b[6]));
console.log('Dense rooms and galleries...');
const data=populateChunks(layout,templates,undefined,true,density);
delete data.solid;
console.log(full?'Writing complete map export...':'Writing quarter export...',data.stats);
const header=exportHeader(data);
header.zone={pos:bounds.slice(0,3),size:bounds.slice(3)};
header.source={world:data.world,image:'noisemap_10000_redone_16.png',region:full?'full':'north-west',
  ...(full?{}:{quarter:'north-west'}),bounds};
header.source_stats=header.stats;delete header.stats;
header.import_notes[3]='Parse bracketed ladder facing states. Ladders are placed last.';
header.import_notes.push(full?
  'Complete map. Unlisted blocks remain unchanged; no stone fill is emitted.':
  'Only this quarter is written. Structures crossing its boundary are clipped. Unlisted blocks remain unchanged.');
header.import_notes.push('Water Room water is exported as minecraft:water; other solid construction uses deepslate.');
await mkdir(dirname(output),{recursive:true});
const temporary=output+'.partial',file=await open(temporary,'wx');
const counts={},palette=new Set();let total=0,buffer='';
try {
  await file.writeFile(JSON.stringify(header).slice(0,-1)+',"runs":[\n');
  for(const raw of noiseMinecraftRuns(data,mask,noiseWalls(mask,layout.snakes,layout.settlements))) {
    const run=clipRun(raw,bounds);if(!run)continue;
    if(!/^minecraft:(air|deepslate|water|ladder\[facing=(north|south|east|west)\])$/.test(run.block))throw Error(run.block);
    counts[run.kind]=(counts[run.kind]||0)+1;palette.add(run.block);
    buffer+=(total?',\n':'')+JSON.stringify(run);total++;
    if(buffer.length>=262144){await file.writeFile(buffer);buffer='';}
  }
  await file.writeFile(buffer+'\n],"export_stats":'+JSON.stringify({runs:total,runs_by_kind:counts,palette:[...palette]})+'}\n');
  await file.sync();
}finally{await file.close();}
await link(temporary,output);await unlink(temporary);
console.log(JSON.stringify({file:output,bytes:(await stat(output)).size,runs:total,palette:[...palette]}));
