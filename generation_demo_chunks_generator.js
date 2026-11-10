export const WORLD = { length: 5000, width: 5000, height: 300, chunk: 32 };
export const MIN_GAP = 4;
export const HOUSE_WALL_COUNT = 30;

export function generateChunks(seed = 42) {
  let state = Number(seed) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  const limit = Math.floor(WORLD.length / WORLD.chunk);
  const zones = [];
  for (let attempt = 0; attempt < 3000 && zones.length < 18; attempt++) {
    let width = integer(20, 36), depth = integer(3, 9);
    if (random() < 0.5) [width, depth] = [depth, width];
    const x = integer(2, limit - width - 2), z = integer(2, limit - depth - 2);
    if (zones.some(other => x < other.x + other.width + MIN_GAP &&
      x + width + MIN_GAP > other.x && z < other.z + other.depth + MIN_GAP &&
      z + depth + MIN_GAP > other.z)) continue;
    // One surface per exposed rectangle edge; adjacent chunks have no dividing wall.
    const s = WORLD.chunk, h = WORLD.height;
    const walls = [
      [x*s, 0, z*s, width*s, h, 0],
      [x*s, 0, (z+depth)*s, width*s, h, 0],
      [x*s, 0, z*s, 0, h, depth*s],
      [(x+width)*s, 0, z*s, 0, h, depth*s],
    ];
    zones.push({ id: zones.length, x, z, width, depth, walls });
  }
  return { seed: Number(seed) >>> 0, world: WORLD, zones };
}

export function addExtraZones(layout,types=[...Array(2).fill('bridge_zone'),...Array(HOUSE_WALL_COUNT).fill('house_wall')]) {
  let state=(layout.seed^0x45585452)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const {zones}=layout,world=layout.world||WORLD,limit=Math.floor(world.length/world.chunk);
  const reserved=[...(layout.buildingLong||[]).map(z=>z.box),...(layout.wideAreas||[]).map(z=>z.box),
    ...(layout.snakes||[]).flatMap(s=>s.volumes)];
  for(const type of types) {
    let placed=false;
    for(let attempt=0;attempt<12000;attempt++) {
      const rotated=type==='bridge_zone'&&attempt%2===1;
      const width=type==='house_wall'?2:rotated?10:32,depth=type==='house_wall'?2:rotated?32:10;
      const margin=attempt<2000?128:attempt<6000?64:32;
      const x=integer(2,limit-width-2),z=integer(2,limit-depth-2);
      const padding=type==='bridge_zone'?16:80;
      if(layout.isSolidBox&&!layout.isSolidBox([x*32-padding,0,z*32-padding,width*32+padding*2,300,depth*32+padding*2]))continue;
      if(zones.some(o=>x<o.x+o.width+MIN_GAP&&x+width+MIN_GAP>o.x&&
        z<o.z+o.depth+MIN_GAP&&z+depth+MIN_GAP>o.z))continue;
      if(reserved.some(b=>x*32<b[0]+b[3]+margin&&(x+width)*32+margin>b[0]&&
        z*32<b[2]+b[5]+margin&&(z+depth)*32+margin>b[2]))continue;
      const s=world.chunk,h=world.height;
      zones.push({id:zones.length,type,rotated,x,z,width,depth,walls:[
        [x*s,0,z*s,width*s,h,0],[x*s,0,(z+depth)*s,width*s,h,0],
        [x*s,0,z*s,0,h,depth*s],[(x+width)*s,0,z*s,0,h,depth*s],
      ]});placed=true;break;
    }
    if(!placed)throw Error(`Placement impossible pour ${type}`);
  }
}
