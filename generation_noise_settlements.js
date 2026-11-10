import {generateWaterRoomZone,WATER_ROOM_AREA} from './water_room_zone.js';
import {generateVillagerCity,VILLAGER_CITY_AREA} from './villager_city.js';
import {overlaps} from './generation_demo_generator.js';
import {connectVillageToWalls} from './generation_noise_village_access.js';

export const WATER_ROOM_COUNT=4;
export const VILLAGER_CITY_COUNT=50;
const padded=(b,n)=>[b[0]-n,b[1],b[2]-n,b[3]+n*2,b[4],b[5]+n*2];

export function placeNoiseSettlements(layout,mask) {
  let state=(layout.seed^0x56494c4c)>>>0;
  const integer=(a,b)=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return a+Math.floor(state/4294967296*(b-a+1));
  };
  const occupied=[...layout.zones.map(z=>[z.x*32-80,0,z.z*32-80,z.width*32+160,300,z.depth*32+160]),
    ...(layout.buildingLong||[]).map(z=>padded(z.box,64)),
    ...(layout.wideAreas||[]).map(z=>padded(z.box,32)),
    ...(layout.snakes||[]).flatMap(s=>s.volumes.map(b=>padded(b,32)))];
  const result=[];
  const faultWalls=(box,rotation)=>{
    const axis=rotation?0:2,along=rotation?2:0,ends=[];
    for(const sign of [-1,1]) {
      let found=null;
      for(let distance=0;distance<=256;distance+=16) {
        const p=box.slice(0,3);
        p[along]+=Math.floor(box[along+3]/2);
        p[axis]=sign<0?box[axis]-1-distance:box[axis]+box[axis+3]+distance;
        if(mask.isSolid([...p,1,1,1])){found=p;break;}
      }
      if(!found)return null;
      ends.push(found);
    }
    return ends;
  };
  for(const [type,count,size] of [['water',WATER_ROOM_COUNT,WATER_ROOM_AREA],['village',VILLAGER_CITY_COUNT,VILLAGER_CITY_AREA]]) {
    for(let index=0;index<count;index++) {
      let area;
      for(let attempt=0;attempt<60000;attempt++) {
        const rotation=integer(0,1),sx=rotation?size.width:size.length,sz=rotation?size.length:size.width;
        const x=integer(4,Math.floor((layout.world.length-sx-64)/16))*16;
        const z=integer(4,Math.floor((layout.world.width-sz-64)/16))*16;
        const y=integer(24,layout.world.height-size.height-16),box=[x,y,z,sx,size.height,sz];
        if(type==='water'?!mask.isSolid(padded(box,16)):!mask.isVoid(box))continue;
        if(occupied.some(b=>overlaps(padded(box,16),b)))continue;
        // Spread sites across the map, not fifty vertically stacked copies in one fissure.
        if(result.some(a=>a.type===type&&overlaps(
          [x-128,0,z-128,sx+256,300,sz+256],a.box)))continue;
        const walls=type==='village'?faultWalls(box,rotation):null;
        if(type==='village'&&!walls)continue;
        area=populateNoiseSettlement({id:result.length,index,type,seed:integer(0,0xffffffff),rotation,box,size,faultWalls:walls});
        if(type==='village')area=connectVillageToWalls(area,mask,layout,occupied,result);
        if(!area)continue;
        break;
      }
      if(!area)throw Error(`Placement impossible : ${type} ${index+1}/${count}`);
      result.push(area);occupied.push(padded(area.box,16),...(area.accessVolumes||[]));
    }
  }
  return result;
}

function populateNoiseSettlement(area) {
  const model=area.type==='water'?generateWaterRoomZone(area.seed):generateVillagerCity(area.seed);
  const [ox,oy,oz]=area.box,width=area.size.width;
  const point=([x,y,z])=>area.rotation?[ox+width-z,oy+y,oz+x]:[ox+x,oy+y,oz+z];
  const transform=([x,y,z,sx,sy,sz,kind])=>area.rotation?
    [ox+width-z-sz,oy+y,oz+x,sz,sy,sx,`${area.type}_${kind}`]:
    [ox+x,oy+y,oz+z,sx,sy,sz,`${area.type}_${kind}`];
  const boxes=model.boxes.map(transform);
  const houses=(model.houses||[]).map(h=>({id:h.id,box:transform(h.box).slice(0,6)}));
  return {...area,boxes,houses,spawn:point(model.spawn),lookAt:point(model.lookAt),stats:model.stats};
}
