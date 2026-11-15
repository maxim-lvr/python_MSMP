import {excavatedRuns} from './generation_demo_chunks_export.js';
import {pipeBoreBoxes} from './generation_demo_chunks_pipe.js';
import {worldRun} from './world_config.js';

const AIR='minecraft:air', ROCK='minecraft:deepslate';
const operation=(box,kind,block=ROCK)=>({kind,block,pos:box.slice(0,3),size:box.slice(3,6)});

export function clipRun(run,bounds) {
  if(![...run.pos,...run.size].every(Number.isSafeInteger)||run.size.some(n=>n<=0))
    throw Error(`Invalid run: ${JSON.stringify(run)}`);
  const pos=run.pos.map((n,i)=>Math.max(n,bounds[i]));
  const size=pos.map((n,i)=>Math.min(run.pos[i]+run.size[i],bounds[i]+bounds[i+3])-n);
  return size.every(n=>n>0)?{...run,pos,size}:null;
}

function* pipeAir(paths) {
  for(const box of pipeBoreBoxes(paths))yield operation(box,'air_pipe',AIR);
}

export function* noiseMinecraftRuns(data,mask,walls) {
  for(const run of localNoiseMinecraftRuns(data,mask,walls))yield worldRun(run,data.world);
}

function* localNoiseMinecraftRuns(data,mask,walls) {
  if(!(data.air instanceof Set))throw Error('Missing excavated network air');
  const air=(b,kind)=>operation(b,kind,AIR), ladders=[];
  for(const b of mask.voidBoxes)yield air(b,'air_noise');
  for(const z of data.zones)yield air([z.x*32,0,z.z*32,z.width*32,data.world.height,z.depth*32],'air_zone');
  for(const h of data.houses)yield air(h.box,'air_house');
  for(const r of data.denseRooms) {
    const [x,y,z,sx,sy,sz]=r.box;
    yield air([x+1,y+1,z+1,sx-2,sy-2,sz-2],'air_dense');
  }
  for(const s of data.snakes)for(const [x,y,z,sx,,sz,kind] of s.boxes)
    if(y===s.y&&(kind==='snake_floor'||kind==='snake_wall'))
      yield air([x,y,z,sx,s.volumes[0][4],sz],'air_snake');
  for(const z of [...data.buildingLong,...data.wideAreas,...(data.settlements||[])])yield air(z.box,'air_structure');
  for(const b of data.mainGalleries.interiors)yield air(b,'air_gallery');
  for(const b of walls)yield operation(b,'wall');
  for(const g of data.wallGroups)for(const b of [...g.walls,...g.boxes])yield operation(b,b[6]);
  for(const b of data.networkBoxes)yield operation(b,b[6]);
  for(const z of [...data.snakes,...data.buildingLong,...data.wideAreas,...(data.settlements||[])])for(const b of z.boxes) {
    if(b[6].endsWith('ladder')) {
      // Restrict ladders are backed by the front wall, rotated with their source model.
      const facing=z.rotation?'west':'south';
      ladders.push(operation(b,b[6],`minecraft:ladder[facing=${facing}]`));
    }else yield operation(b,b[6],b[6]==='water_water'?'minecraft:water':ROCK);
  }
  for(const b of data.globalPipe.boxes)yield operation(b,b[6]);
  yield* excavatedRuns(data.air,data.world);
  yield* pipeAir(data.globalPipe.paths);
  // Open side doors and ceiling shafts into map destinations, then restore floors and backing.
  for(const b of data.globalPipe.accessAir||[])yield air(b,'air_pipe_access');
  for(const b of data.globalPipe.pedestrianBoxes||[])yield operation(b,b[6]);
  for(const b of data.ladderBoxes)if(b[4]>0)
    yield operation(b,'ladder','minecraft:ladder[facing=north]');
  for(const b of data.globalPipe.pedestrianLadders||[])if(b[4]>0)
    yield operation(b,'pipe_ladder','minecraft:ladder[facing=north]');
  yield* ladders;
}
