import {mergeBoxes,overlaps,subtract} from './generation_demo_generator.js';

// Work in horizontal slices so room-sized voids do not fragment a full-height mass.
export function solidExcept(volumes,voids,kind) {
  const result=[];
  for(const volume of volumes) {
    const cuts=voids.filter(cut=>overlaps(volume,cut));
    const bottom=volume[1],top=bottom+volume[4],levels=new Set([bottom,top]);
    for(const cut of cuts){levels.add(Math.max(bottom,cut[1]));levels.add(Math.min(top,cut[1]+cut[4]));}
    const ys=[...levels].sort((a,b)=>a-b);
    for(let i=1;i<ys.length;i++) {
      const y=ys[i-1],height=ys[i]-y;
      let pieces=[[volume[0],y,volume[2],volume[3],height,volume[5],kind]];
      for(const cut of cuts)if(cut[1]<y+height&&cut[1]+cut[4]>y)
        pieces=pieces.flatMap(box=>subtract(box,[cut[0],y,cut[2],cut[3],height,cut[5]]));
      result.push(...pieces);
    }
  }
  return mergeBoxes(result);
}
