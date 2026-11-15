// Ordered fills, compatible with the existing Minecraft JSON run importer.
import {worldRun} from './world_config.js';

export const EXPORT_BLOCKS = {
  wall:'minecraft:deepslate',house:'minecraft:deepslate',
  house_bridge:'minecraft:deepslate',house_stair:'minecraft:deepslate',
  window:'minecraft:deepslate',dense:'minecraft:deepslate',tunnel:'minecraft:deepslate',
  main_tunnel:'minecraft:deepslate',main_tunnel_frame:'minecraft:deepslate',
  ladder_support:'minecraft:deepslate',
  snake_wall:'minecraft:deepslate',snake_floor:'minecraft:deepslate',
  snake_facade:'minecraft:deepslate',snake_alternate:'minecraft:deepslate',
  snake_partition:'minecraft:deepslate',snake_bridge:'minecraft:deepslate',
  snake_window:'minecraft:deepslate',snake_lit:'minecraft:deepslate',
  long_building:'minecraft:deepslate',long_building_dark:'minecraft:deepslate',
  long_floor:'minecraft:deepslate',long_stair:'minecraft:deepslate',
  long_column:'minecraft:deepslate',long_trail:'minecraft:deepslate',
  long_window:'minecraft:deepslate',long_window_dim:'minecraft:deepslate',
  ladder:'minecraft:ladder[facing=north]',
};
const PALETTE=new Set([...Object.values(EXPORT_BLOCKS),'minecraft:air']);

export function exportHeader(data) {
  const {length,height,width,minY=0}=data.world;
  return {
    version:1,type:'generation_demo_chunks_minecraft_export',units:'blocks',
    operation_order:'apply runs in order; later runs overwrite earlier runs',
    zone:{pos:[0,minY,0],size:[length,height,width]},
    settings:{seed:data.seed,density:data.density},
    import_notes:[
      'Apply only the listed runs, including all air fills.',
      'pos is the minimum voxel; maximum inclusive is pos + size - 1.',
      'Split large fills into Minecraft chunks; preserve run order within each chunk.',
      'Parse bracketed block states. Place ladders last, facing north with backing to the south.',
      'Use 64-bit arithmetic for volumes. Do not allocate a dense array for the whole map.',
      `Coordinates are absolute: Y ${minY} through ${minY+height-1} (upper bound ${minY+height}, exclusive). No NBT files are needed.`,
    ],
    stats:{...data.stats,zones:data.zones.length,snakes:data.snakes?.length||0,
      buildingLong:data.buildingLong?.length||0},
  };
}

function run(box,kind,block) {
  if(!block)throw Error(`Unknown export material: ${kind}`);
  return {kind,block,pos:box.slice(0,3),size:box.slice(3,6)};
}

export function validateRun(value,world) {
  if(!PALETTE.has(value.block))throw Error(`Invalid export block: ${value.block}`);
  const limits=[world.length,world.height,world.width];
  const origin=[0,world.minY??0,0];
  if(!value.pos.every((v,i)=>Number.isSafeInteger(v)&&v>=origin[i]&&Number.isSafeInteger(value.size[i])&&
    value.size[i]>0&&v+value.size[i]<=origin[i]+limits[i]))throw Error(`Invalid export volume: ${JSON.stringify(value)}`);
}

export function* excavatedRuns(air,world) {
  // Sparse network air only; large rooms and cavities are emitted as boxes separately.
  const keys=[...air].sort((a,b)=>a-b),s=world.length,w=world.width;
  let last,previous=-2;
  for(const k of keys) {
    const x=k%s,y=Math.floor(k/(s*w)),z=Math.floor(k/s)%w;
    if(last&&k===previous+1&&x!==0)last.size[0]++;
    else {
      if(last)yield last;
      last=run([x,y,z,1,1,1],'air_network','minecraft:air');
    }
    previous=k;
  }
  if(last)yield last;
}

export function* minecraftRuns(data) {
  for(const operation of localMinecraftRuns(data))yield worldRun(operation,data.world);
}

function* localMinecraftRuns(data) {
  if(!(data.air instanceof Set))throw Error('Export requires the actual excavated network air');
  const {height,chunk}=data.world;
  for(const z of data.zones)
    yield run([z.x*chunk,0,z.z*chunk,z.width*chunk,height,z.depth*chunk],'air_zone','minecraft:air');
  for(const h of data.houses)yield run(h.box,'air_house','minecraft:air');
  for(const r of data.denseRooms) {
    const [x,y,z,sx,sy,sz]=r.box;
    yield run([x+1,y+1,z+1,sx-2,sy-2,sz-2],'air_dense','minecraft:air');
  }
  for(const s of data.snakes||[]) {
    // The bottom slab + wall voxels cover the exact bent footprint, not its bounding box.
    for(const [x,y,z,sx,,sz,kind] of s.boxes)if(y===s.y&&(kind==='snake_floor'||kind==='snake_wall'))
      yield run([x,y,z,sx,s.volumes[0][4],sz],'air_snake','minecraft:air');
  }
  for(const z of data.buildingLong||[])yield run(z.box,'air_building_long','minecraft:air');
  for(const group of data.wallGroups)for(const b of [...group.walls,...group.boxes])yield run(b,b[6],EXPORT_BLOCKS[b[6]]);
  for(const b of data.networkBoxes)yield run(b,b[6],EXPORT_BLOCKS[b[6]]);
  for(const s of data.snakes||[])for(const b of s.boxes)yield run(b,b[6],EXPORT_BLOCKS[b[6]]);
  for(const z of data.buildingLong||[])for(const b of z.boxes)yield run(b,b[6],EXPORT_BLOCKS[b[6]]);
  // Reopen doorways after placing shells, then place the single vertical ladder columns.
  yield* excavatedRuns(data.air,data.world);
  for(const b of data.ladderBoxes)if(b[4]!==0)yield run(b,b[6],EXPORT_BLOCKS[b[6]]);
}
