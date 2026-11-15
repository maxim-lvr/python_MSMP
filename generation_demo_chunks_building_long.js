import { mergeBoxes } from './generation_demo_generator.js';

export const BUILDING_LONG_COUNT = 4;
export const BUILDING_LONG_LENGTHS = [800,960,1120,1280];
const WIDTH=280,HEIGHT=150,GAP=256;
const near=(a,b)=>a[0]<b[0]+b[3]+GAP&&a[0]+a[3]+GAP>b[0]&&
  a[2]<b[2]+b[5]+GAP&&a[2]+a[5]+GAP>b[2];

export function placeBuildingLong(layout) {
  let state=(layout.seed^0x4c4f4e47)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const obstacles=layout.zones.map(z=>[z.x*32,0,z.z*32,z.width*32,layout.world.height,z.depth*32]),zones=[];
  for(const zone of layout.wideAreas||[])obstacles.push(zone.box);
  const count=layout.buildCounts?.long??BUILDING_LONG_COUNT;
  for(let attempt=0;attempt<12000*count/4&&zones.length<count;attempt++) {
    const length=attempt<8000?BUILDING_LONG_LENGTHS[integer(0,3)]:800,rotation=integer(0,1);
    const sx=rotation?WIDTH:length,sz=rotation?length:WIDTH;
    const x=integer(4,Math.floor((layout.world.length-sx-128)/32))*32,z=integer(4,Math.floor((layout.world.width-sz-128)/32))*32;
    const y=16+(zones.length%4)*32,box=[x,y,z,sx,HEIGHT,sz];
    if(layout.isSolidBox&&!layout.isSolidBox([x-64,0,z-64,sx+128,layout.world.height,sz+128]))continue;
    if(obstacles.some(b=>near(box,b)))continue;
    zones.push({id:zones.length,seed:integer(0,0xffffffff),length,rotation,box});obstacles.push(box);
  }
  if(zones.length!==count)throw Error(`Pas assez de place pour les ${count} Building Long`);
  return zones;
}

export function populateBuildingLong(zone,template) {
  if(template.size[0]!==zone.length||template.size[1]!==HEIGHT||template.size[2]!==WIDTH)
    throw Error('Dimensions du modele Building Long incompatibles');
  const [ox,oy,oz]=zone.box;
  const point=([x,y,z])=>zone.rotation?[ox+WIDTH-z,oy+y,oz+x]:[ox+x,oy+y,oz+z];
  const localBoxes=[...template.boxes],bridgePorts=[];
  let state=(zone.seed^0x42524944)>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const contains=(b,p)=>[0,1,2].every(i=>p[i]>=b[i]&&p[i]<b[i]+b[i+3]);
  for(const side of ['start','end']) {
    const candidates=(template.trailPorts||[]).filter(p=>p.side===side);
    for(let i=candidates.length-1;i>0;i--) {
      const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];
    }
    const selected=[];
    for(const candidate of candidates) {
      const [x,y,z]=candidate.pos;
      if(selected.some(p=>p.trail===candidate.trail))continue;
      if(localBoxes.some(b=>contains(b,[x,y+1,z])||contains(b,[x,y+2,z])))continue;
      selected.push(candidate);
      if(!localBoxes.some(b=>b[6]==='trail'&&contains(b,candidate.pos)))localBoxes.push([x,y,z,1,1,1,'trail']);
      const sign=side==='start'?-1:1;
      // Voxel minima need the same quarter-turn as boxes, not the point transform.
      const anchor=zone.rotation?[ox+WIDTH-z-1,oy+y,oz+x]:[ox+x,oy+y,oz+z];
      const normal=zone.rotation?[0,0,sign]:[sign,0,0];
      bridgePorts.push({id:bridgePorts.length,trail:candidate.trail,end:side,anchor,normal,
        door:[anchor[0]+normal[0],anchor[1]+1,anchor[2]+normal[2]]});
      if(selected.length===2)break;
    }
    if(selected.length!==2)throw Error(`Building Long ${zone.id+1} : deux chemins rouges accessibles requis au cote ${side}`);
  }
  const boxes=localBoxes.map(([x,y,z,sx,sy,sz,kind])=>zone.rotation?
    [ox+WIDTH-z-sz,oy+y,oz+x,sz,sy,sx,`long_${kind}`]:
    [ox+x,oy+y,oz+z,sx,sy,sz,`long_${kind}`]);
  return {...zone,boxes:mergeBoxes(boxes),bridgePorts,stats:template.stats,spawn:point([45,58,158]),lookAt:point([110,58,158])};
}
