import {mergeBoxes,subtract,overlaps} from './generation_demo_generator.js';

export function decorateWideOpenArea(layout) {
  const {world,towers,terraces,bridges,spawn}=layout;
  let state=(layout.seed^0x50495045)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const boxes=[],buildings=[],pillars=[],buckets=new Map();
  const keys=function*(b) {
    for(let x=Math.floor(b[0]/32);x<=Math.floor((b[0]+b[3]-1)/32);x++)
      for(let y=Math.floor(b[1]/32);y<=Math.floor((b[1]+b[4]-1)/32);y++)
        for(let z=Math.floor(b[2]/32);z<=Math.floor((b[2]+b[5]-1)/32);z++)yield `${x},${y},${z}`;
  };
  const reserve=b=>{for(const key of keys(b)){if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(b);}};
  const clear=b=>{
    if(b[0]<0||b[1]<1||b[2]<0||b[0]+b[3]>world.length||b[1]+b[4]>world.height||b[2]+b[5]>world.width)return false;
    for(const key of keys(b))if(buckets.get(key)?.some(other=>overlaps(b,other)))return false;
    return true;
  };
  // Reserve usable volumes, not just the visible floor: decoration cannot fill a walkway.
  for(const t of towers)reserve([t.box[0]-4,0,t.box[2]-4,t.box[3]+8,world.height,t.box[5]+8]);
  for(const t of terraces)reserve([t.x-t.radius-2,t.y-7,t.z-t.radius-2,t.radius*2+5,12,t.radius*2+5]);
  for(const {box:[x,y,z,sx,sy,sz]} of layout.houses)reserve([x-2,y,z-2,sx+4,sy+2,sz+4]);
  for(const bridge of bridges)for(const [x,y,z] of bridge.path)reserve([x-4,y-2,z-4,9,8,9]);
  for(const b of layout.boxes)if(b[6]==='boundary')reserve(b);
  reserve([Math.floor(spawn[0])-2,Math.floor(spawn[1])-2,Math.floor(spawn[2])-2,5,6,5]);

  const radius=6,outerRadius=8;
  let pipe;
  const heights=[world.height-15,world.height-12,201,163,125,87,49,12];
  for(let attempt=0;attempt<heights.length*1200&&!pipe;attempt++) {
    const axis=Math.floor(attempt/600)%2===0?0:2,length=axis===0?world.length:world.width,width=axis===0?world.width:world.length;
    const y=heights[Math.floor(attempt/1200)],zA=integer(34,width-34),zB=integer(34,width-34),bend=integer(80,length-80);
    if(Math.abs(zA-zB)<60||Math.abs(zA-zB)>210)continue;
    const points=[[0,y,zA],[bend,y,zA],[bend,y,zB],[length-1,y,zB]].map(p=>axis===0?p:[p[2],p[1],p[0]]);
    const volumes=points.slice(1).map((b,i)=> {
      const a=points[i],x=Math.max(0,Math.min(a[0],b[0])-10),z=Math.max(0,Math.min(a[2],b[2])-10);
      return [x,y-10,z,Math.min(world.length,Math.max(a[0],b[0])+11)-x,21,Math.min(world.width,Math.max(a[2],b[2])+11)-z];
    });
    if(volumes.every(clear))pipe={points,volumes,radius,outerRadius,axis};
  }
  // Optional decoration must not make the entire zone unavailable on a difficult seed.
  if(!pipe)pipe={points:[],volumes:[],radius,outerRadius,axis:0};
  pipe.volumes.forEach(reserve);
  const outer=new Map(),inner=new Set(),key=(x,y,z)=>`${x},${y},${z}`;
  const voxel=(x,y,z,inside,kind='pipe')=> {
    if(x<0||x>=world.length||z<0||z>=world.width||y<1||y>=world.height)return;
    const id=key(x,y,z);
    if(inside)inner.add(id);
    else if(!outer.has(id)||kind==='pipe_band')outer.set(id,[x,y,z,1,1,1,kind]);
  };
  for(let i=1;i<pipe.points.length;i++) {
    const a=pipe.points[i-1],b=pipe.points[i],axis=a[0]===b[0]?2:0,length=Math.abs(b[axis]-a[axis]),sign=Math.sign(b[axis]-a[axis]);
    for(let step=0;step<=length;step++) {
      const center=[...a];center[axis]+=sign*step;
      const band=step>15&&step<length-15&&step%72<3,r=band?outerRadius:radius;
      for(let dy=-r;dy<=r;dy++)for(let across=-r;across<=r;across++) {
        const d=dy*dy+across*across;if(d>r*r)continue;
        voxel(center[0]+(axis===2?across:0),center[1]+dy,center[2]+(axis===0?across:0),d<=16,band?'pipe_band':'pipe');
      }
    }
  }
  // Unite the bores at each elbow before emitting the shell, avoiding internal caps.
  for(const [x,y,z] of pipe.points.slice(1,-1))for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++)for(let dz=-radius;dz<=radius;dz++) {
    const d=dx*dx+dy*dy+dz*dz;if(d<=radius*radius)voxel(x+dx,y+dy,z+dz,d<=16);
  }
  for(const [id,box] of outer)if(!inner.has(id))boxes.push(box);

  function buildingShell(box,kind) {
    const [x,y,z,sx,sy,sz]=box;
    let walls=[[x,y+1,z,sx,sy-2,1,kind],[x,y+1,z+sz-1,sx,sy-2,1,kind],
      [x,y+1,z+1,1,sy-2,sz-2,kind],[x+sx-1,y+1,z+1,1,sy-2,sz-2,kind]];
    const windows=[];
    for(let wy=y+4;wy<y+sy-3;wy+=8) {
      for(let wx=x+3;wx<x+sx-3;wx+=7)for(const wz of [z,z+sz-1])windows.push([wx,wy,wz,1,2,1]);
      for(let wz=z+3;wz<z+sz-3;wz+=7)for(const wx of [x,x+sx-1])windows.push([wx,wy,wz,1,2,1]);
    }
    for(const w of windows) {
      walls=walls.flatMap(b=>subtract(b,w));boxes.push([...w,integer(0,12)===0?'light':'window']);
    }
    boxes.push(...walls,[x,y,z,sx,1,sz,'detail_trim'],[x,y+sy-1,z,sx,1,sz,'detail_trim']);
    for(let floor=y+8;floor<y+sy-1;floor+=8)boxes.push([x+1,floor,z+1,sx-2,1,sz-2,'detail_trim']);
  }
  const horizontalGap=(a,b)=>Math.hypot(Math.max(0,a[0]-b[0]-b[3],b[0]-a[0]-a[3]),
    Math.max(0,a[2]-b[2]-b[5],b[2]-a[2]-a[5]));
  for(const anchor of ['ground','ceiling'])for(let attempt=0;attempt<5000&&buildings.filter(b=>b.anchor===anchor).length<7;attempt++) {
    const sx=integer(28,52),sz=integer(24,54),height=integer(62,142);
    const x=integer(16,world.length-sx-16),z=integer(16,world.width-sz-16),y=anchor==='ground'?1:world.height-height;
    const reservation=[x-3,y,z-3,sx+6,height,sz+6];
    if(!clear(reservation)||buildings.some(b=>horizontalGap(reservation,b.reservation)<22))continue;
    reserve(reservation);
    const tiers=[],split=Math.floor(height*0.58),inset=integer(3,6);
    if(anchor==='ground')tiers.push([x,y,z,sx,split,sz],[x+inset,y+split,z+inset,sx-inset*2,height-split,sz-inset*2]);
    else tiers.push([x+inset,y,z+inset,sx-inset*2,height-split,sz-inset*2],[x,y+height-split,z,sx,split,sz]);
    for(const tier of tiers)buildingShell(tier,anchor==='ground'?'industrial':'suspended');
    buildings.push({anchor,box:[x,y,z,sx,height,sz],reservation,tiers});
  }
  for(let attempt=0;attempt<4000&&pillars.length<18;attempt++) {
    const r=integer(2,4),x=integer(18,world.length-18),z=integer(18,world.width-18);
    const anchor=pillars.length%3===0?'full':pillars.length%3===1?'ceiling':'ground';
    const height=anchor==='full'?world.height-1:integer(58,180),y=anchor==='ceiling'?world.height-height:1;
    const reservation=[x-r-2,y,z-r-2,r*2+5,height,r*2+5];
    if(pillars.some(p=>Math.hypot(x-p.x,z-p.z)<90)||towers.some(t=>Math.hypot(x-t.x,z-t.z)<60))continue;
    if(!clear(reservation))continue;
    reserve(reservation);
    for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)if(dx*dx+dz*dz<=r*r)boxes.push([x+dx,y,z+dz,1,height,1,'detail_pillar']);
    for(let cy=y+4;cy<y+height-3;cy+=integer(23,38)) {
      for(let dx=-r-1;dx<=r+1;dx++)for(let dz=-r-1;dz<=r+1;dz++) {
        const d=dx*dx+dz*dz;if(d>r*r&&d<=(r+1)*(r+1))boxes.push([x+dx,cy,z+dz,1,2,1,'detail_trim']);
      }
    }
    pillars.push({anchor,reservation,x,z});
  }
  return {boxes:mergeBoxes(boxes),pipe,buildings,pillars};
}
