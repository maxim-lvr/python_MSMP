import {NOISE_WORLD,noiseMask} from './generation_noise_mask.js';
import {addExtraZones} from './generation_demo_chunks_generator.js';
import {placeBuildingLong} from './generation_demo_chunks_building_long.js';
import {placeWideAreas} from './generation_demo_chunks_wide.js';
import {generateDemoSnakes} from './generation_demo_chunks_snakes.js';
import {placeNoiseSettlements} from './generation_noise_settlements.js';
export {CUBE_TEST} from './generation_noise_prototype.js';

export function noiseLayout(seed,image,progress=()=>{},options={}) {
  const world=options.world||NOISE_WORLD;
  const mask=noiseMask(image.width,image.height,image.data,world);
  const layout={seed:Number(seed)>>>0,world,zones:[],isSolidBox:mask.isSolid,mapType:'noise',
    snakeVoidCrossings:2,
    ...options,
    buildCounts:options.buildCounts||{long:9,wide:{open:3,restrict:3,ultra_dense:7},snakes:8,bridges:5,walls:160,cavities:48}};
  const limit=Math.floor(layout.world.length/32),counts=layout.buildCounts;
  let state=layout.seed;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  progress('Placement des Building Long et Wide Areas...');
  layout.wideAreas=placeWideAreas(layout);
  layout.buildingLong=placeBuildingLong(layout);
  addExtraZones(layout,Array(counts.bridges).fill('bridge_zone'));
  progress('Placement des cavites et des tunnels Snake...');
  const occupied=[...layout.buildingLong,...layout.wideAreas].map(z=>z.box);
  occupied.push(...layout.zones.map(z=>[z.x*32,0,z.z*32,z.width*32,layout.world.height,z.depth*32]));
  for(let attempt=0;attempt<80000&&layout.zones.length<counts.bridges+counts.cavities;attempt++) {
    let width=integer(20,30),depth=integer(3,6);
    if(integer(0,1))[width,depth]=[depth,width];
    const x=integer(3,limit-3-width),z=integer(3,limit-3-depth);
    const box=[x*32-80,0,z*32-80,width*32+160,layout.world.height,depth*32+160];
    if(!mask.isSolid(box))continue;
    if(occupied.some(b=>box[0]<b[0]+b[3]+64&&box[0]+box[3]+64>b[0]&&box[2]<b[2]+b[5]+64&&box[2]+box[5]+64>b[2]))continue;
    layout.zones.push({id:layout.zones.length,x,z,width,depth,walls:[]});
    occupied.push([x*32,0,z*32,width*32,layout.world.height,depth*32]);
  }
  layout.snakes=generateDemoSnakes(layout);
  addExtraZones(layout,Array(counts.walls).fill('house_wall'));
  progress(`Placement des ${counts.water??4} Water Rooms et ${counts.villages??50} Villager Cities dans les failles...`);
  layout.settlements=placeNoiseSettlements(layout,mask);
  return {layout,mask};
}
