import {mergeBoxes,overlaps,subtract} from './generation_demo_generator.js';

export const MAIN_TUNNEL_MIN_LENGTH=50;
const RADIUS=3,HEIGHT=8;
function spatial(boxes) {
  const buckets=new Map();
  function* keys(b) {
    for(let x=Math.floor(b[0]/32);x<=Math.floor((b[0]+b[3]-1)/32);x++)
      for(let y=Math.floor(b[1]/32);y<=Math.floor((b[1]+b[4]-1)/32);y++)
        for(let z=Math.floor(b[2]/32);z<=Math.floor((b[2]+b[5]-1)/32);z++)yield `${x},${y},${z}`;
  }
  for(const b of boxes)for(const k of keys(b)) {
    if(!buckets.has(k))buckets.set(k,[]);
    buckets.get(k).push(b);
  }
  return b=>{
    const found=new Set();
    for(const k of keys(b))for(const item of buckets.get(k)||[])if(overlaps(b,item))found.add(item);
    return [...found];
  };
}

export function prepareGalleries(layout,houses,shafts,routes) {
  const obstacles=spatial([...houses.map(h=>h.box),
    ...layout.zones.map(z=>[z.x*32,0,z.z*32,z.width*32,300,z.depth*32]),
    ...(layout.snakes||[]).flatMap(s=>s.volumes),...(layout.buildingLong||[]).map(z=>z.box),
    ...(layout.wideAreas||[]).map(z=>z.box),...(layout.settlements||[]).flatMap(z=>[z.box,...(z.accessVolumes||[])]),
    ...(layout.globalPipe?.volumes||[])]);
  const outer=[],inner=[],joints=new Map();
  const clear=box=>box[0]>=1&&box[2]>=1&&box[1]>=1&&box[0]+box[3]<layout.world.length&&
    box[2]+box[5]<layout.world.width&&box[1]+box[4]<layout.world.height&&!obstacles(box).length;
  for(const route of routes) {
    const {a,b}=route,length=Math.abs(a[0]-b[0])+Math.abs(a[2]-b[2]);
    if(!route.main&&length<=MAIN_TUNNEL_MIN_LENGTH)continue;
    // Split at obstacles instead of discarding a whole long gallery at a single entrance.
    const dx=Math.sign(b[0]-a[0]),dz=Math.sign(b[2]-a[2]);
    const alongX=dx!==0||(length===0&&route.axis===0);
    let run;
    const flush=()=>{
      if(!run)return;
      const [p,q]=run,alongX=dx!==0||(length===0&&route.axis===0),rx=alongX?0:RADIUS,rz=alongX?RADIUS:0;
      const box=[Math.min(p[0],q[0])-rx,p[1],Math.min(p[2],q[2])-rz,
        Math.abs(p[0]-q[0])+rx*2+1,HEIGHT,Math.abs(p[2]-q[2])+rz*2+1,'main_tunnel'];
      outer.push(box);inner.push([box[0]+(alongX?0:1),box[1]+1,box[2]+(alongX?1:0),
        box[3]-(alongX?0:2),6,box[5]-(alongX?2:0)]);
      for(const point of [p,q]) {
        const key=point.join(',');
        if(!joints.has(key))joints.set(key,{point,axes:new Set()});
        joints.get(key).axes.add(alongX?0:2);
      }
      run=null;
    };
    for(let i=0;i<=length;i++) {
      const p=[a[0]+dx*i,a[1],a[2]+dz*i];
      // Test the actual cross-section so a gallery can reach the facade without a setback.
      const box=alongX?[p[0],p[1],p[2]-3,1,8,7]:[p[0]-3,p[1],p[2],7,8,1];
      if(!clear(box)){flush();continue;}
      if(!run)run=[p,p];else run[1]=p;
    }
    flush();
  }
  // A bend needs a complete corner chamber, not just two perpendicular thin slices.
  for(const {point:[x,y,z],axes} of joints.values())if(axes.size>1) {
    const box=[x-3,y,z-3,7,8,7,'main_tunnel'];
    if(!clear(box))continue;
    outer.push(box);inner.push([x-2,y+1,z-2,5,6,5]);
  }
  // Close only horizontal dead ends at ladders; through routes and bends stay open.
  const routeIndex=spatial(routes.map(({a,b})=>[Math.min(a[0],b[0]),a[1],Math.min(a[2],b[2]),
    Math.abs(a[0]-b[0])+1,1,Math.abs(a[2]-b[2])+1]));
  const galleryIndex=spatial(outer);
  for(const s of shafts) {
    const levels=new Set(routeIndex([s.x,s.bottom,s.z,1,s.top-s.bottom+1,1]).map(b=>b[1]));
    for(const y of levels) {
      if(!galleryIndex([s.x,y+1,s.z,1,1,1]).length)continue;
      const directions=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dz])=>
        routeIndex([s.x+dx,y-1,s.z+dz,1,3,1]).length);
      if(directions.length!==1)continue;
      const [ix,iz]=directions[0],dx=-ix,dz=-iz,alongX=dx!==0;
      // The backing column is at z+1. Keep one empty cell beyond its far face.
      const steps=dz===1?3:2,endX=s.x+dx*steps,endZ=s.z+dz*steps;
      const box=[Math.min(s.x,endX)-(alongX?0:3),y,Math.min(s.z,endZ)-(alongX?3:0),
        alongX?steps+1:7,8,alongX?7:steps+1,'main_tunnel'];
      if(!clear(box))continue;
      const air=[...box.slice(0,6)];air[1]++;air[4]=6;
      const axis=alongX?0:2,side=alongX?2:0;
      air[side]++;air[side+3]-=2;
      if(dx<0||dz<0)air[axis]++;
      air[axis+3]--;
      outer.push(box);inner.push(air);
    }
  }
  const shells=mergeBoxes(outer),air=mergeBoxes(inner.map(b=>[...b,'air']));
  const query=spatial(shells);
  return {outer:shells,inner:air,shafts,contains:(x,y,z)=>query([x,y,z,1,1,1]).length>0};
}

export function galleryMeshes(galleries,routes,connections) {
  const cuts=[...galleries.inner];
  const supports=[];
  for(const s of galleries.shafts||[]) {
    cuts.push([s.x,s.bottom+1,s.z,1,s.top-s.bottom+2,1]);
    const support=[s.x,s.bottom,s.z+1,1,s.top-s.bottom+3,1,'ladder_support'];
    supports.push(support);cuts.push(support);
  }
  for(const {a,b} of routes)cuts.push([Math.min(a[0],b[0]),a[1]+1,Math.min(a[2],b[2]),
    Math.abs(a[0]-b[0])+1,3,Math.abs(a[2]-b[2])+1]);
  for(const c of connections)for(let i=0;i<c.path.length;i++) {
    const [x,y,z]=c.path[i];
    cuts.push([x,y+1,z,1,i+1<c.path.length&&c.path[i+1][1]>y?3:2,1]);
  }
  const air=spatial(cuts),occupied=spatial(galleries.outer),result=[];
  // Union the shells without caps at bends/junctions or duplicate overlapping faces.
  const order=new Map(galleries.outer.map((b,i)=>[b,i]));
  for(const box of galleries.outer) {
    let pieces=[box];
    for(const cut of [...air(box),...occupied(box).filter(b=>order.get(b)<order.get(box))]) {
      pieces=pieces.flatMap(b=>subtract(b,cut));if(!pieces.length)break;
    }
    const axis=box[3]>=box[5]?0:2;
    for(const piece of pieces) {
      const end=piece[axis]+piece[axis+3];
      for(let pos=piece[axis];pos<end;) {
        const band=pos%12===0,next=Math.min(end,band?pos+1:pos+12-pos%12);
        const part=[...piece];part[axis]=pos;part[axis+3]=next-pos;
        if(band)part[6]='main_tunnel_frame';
        result.push(part);pos=next;
      }
    }
  }
  return mergeBoxes(result.concat(supports));
}
