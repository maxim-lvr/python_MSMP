import {subtract,mergeBoxes} from './generation_demo_generator.js';

export const WATER_ROOM_AREA={length:200,width:200,height:20};
export const WATER_TOWER_SIZE=6;
export function generateWaterRoomZone(seed=42) {
  let state=Number(seed)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const towers=[],shells=[],doors=[],size=WATER_TOWER_SIZE,pitch=size+8;
  for(let x=5;x+size<199;x+=pitch)for(let z=5;z+size<199;z+=pitch) {
    const tx=x+integer(-1,1),tz=z+integer(-1,1);
    towers.push([tx,1,tz,size,18,size,'tower']);
    const side=integer(0,3),middle=Math.floor(size/2);
    const door=side<2?[tx+middle,2,tz+(side===0?0:size-1),1,2,1]:
      [tx+(side===2?0:size-1),2,tz+middle,1,2,1];
    doors.push(door);
    const walls=[
      [tx,1,tz,size,1,size,'tower'],
      [tx,2,tz,size,17,1,'tower'],[tx,2,tz+size-1,size,17,1,'tower'],
      [tx,2,tz+1,1,17,size-2,'tower'],[tx+size-1,2,tz+1,1,17,size-2,'tower'],
    ];
    shells.push(...walls.flatMap(b=>subtract(b,door)));
  }
  let water=[[1,1,1,198,1,198,'water']];
  for(const tower of towers)water=water.flatMap(b=>subtract(b,tower));
  const boxes=[
    [0,0,0,200,1,200,'ground'],[0,19,0,200,1,200,'ceiling'],
    [0,1,0,200,18,1,'boundary'],[0,1,199,200,18,1,'boundary'],
    [0,1,1,1,18,198,'boundary'],[199,1,1,1,18,198,'boundary'],
    ...shells,...mergeBoxes(water),
  ];
  return {seed:Number(seed)>>>0,boxes,towers,doors,spawn:[14,3.6,14],lookAt:[14,3.6,190],
    stats:{towers:towers.length}};
}
