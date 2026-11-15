import {zoneVolume} from './generation_vertical.js';
import {mapWorld} from './world_config.js';

// Same parent/child growth principle as map_builde_dense_1.horizontal_child.
// The spatial index is only a collision accelerator, never a placement grid.
export function growDense({layout,houses,shafts,routes,galleries,target,integer,addAir,sizes}) {
  const world=layout.world||mapWorld(5000);
  const buckets=new Map(), rooms=[], connections=[], anchors=[];
  const overlap=(a,b)=>[0,1,2].every(i=>a[i]<b[i]+b[i+3]&&a[i]+a[i+3]>b[i]);
  const keys=function*(b){
    for(let x=Math.floor(b[0]/32);x<=Math.floor((b[0]+b[3]-1)/32);x++)
      for(let y=Math.floor(b[1]/32);y<=Math.floor((b[1]+b[4]-1)/32);y++)
        for(let z=Math.floor(b[2]/32);z<=Math.floor((b[2]+b[5]-1)/32);z++)yield `${x},${y},${z}`;
  };
  const insert=item=>{for(const k of keys(item.box)){if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(item);}};
  const clear=(box,allowed=[])=>{
    if(box[0]<2||box[2]<2||box[1]<2||box[0]+box[3]>world.length-2||box[2]+box[5]>world.width-2||box[1]+box[4]>world.height-2)return false;
    const seen=new Set();
    for(const k of keys(box))for(const item of buckets.get(k)||[]) {
      if(seen.has(item)||allowed.includes(item))continue;
      seen.add(item);if(overlap(box,item.box))return false;
    }
    return true;
  };
  houses.forEach(h=>insert({box:h.box}));
  for(const zone of layout.buildingLong||[])insert({box:zone.box});
  for(const zone of layout.wideAreas||[])insert({box:zone.box});
  for(const zone of layout.settlements||[])for(const box of [zone.box,...(zone.accessVolumes||[])])insert({box});
  for(const box of layout.globalPipe?.volumes||[])insert({box});
  for(const snake of layout.snakes||[])for(const box of snake.volumes)insert({box});
  // Finite cavities permit growth above and below suspended buildings.
  const cavities=layout.zones.map(z=>zoneVolume(z,world));
  const cavityBuckets=new Map();
  for(const b of cavities)for(let x=Math.floor(b[0]/128);x<=Math.floor((b[0]+b[3]-1)/128);x++)
    for(let z=Math.floor(b[2]/128);z<=Math.floor((b[2]+b[5]-1)/128);z++) {
      const k=`${x},${z}`;if(!cavityBuckets.has(k))cavityBuckets.set(k,[]);cavityBuckets.get(k).push(b);
    }
  const outside=b=>{
    if(layout.isSolidBox&&!layout.isSolidBox(b))return false;
    for(let x=Math.floor(b[0]/128);x<=Math.floor((b[0]+b[3]-1)/128);x++)
      for(let z=Math.floor(b[2]/128);z<=Math.floor((b[2]+b[5]-1)/128);z++)
        if((cavityBuckets.get(`${x},${z}`)||[]).some(c=>overlap(b,c)))return false;
    return true;
  };
  for(const shaft of shafts)insert({box:[shaft.x-1,shaft.bottom,shaft.z-1,3,shaft.top-shaft.bottom+4,3]});
  const galleryItems=(galleries?.outer||[]).map(box=>({box}));
  for(const item of galleryItems) {
    insert(item);
    const b=item.box,axis=b[3]>=b[5]?2:0;
    if(Math.max(b[3],b[5])<11)continue;
    anchors.push({box:[Math.floor(b[0]+b[3]/2)-2,b[1],Math.floor(b[2]+b[5]/2)-2,5,1,5],
      obstacle:item,axis,openings:{},id:null,gallery:true});
  }
  for(const route of routes) {
    const a=route.a,b=route.b;
    if(galleries?.contains(a[0],a[1]+1,a[2])&&galleries.contains(b[0],b[1]+1,b[2]))continue;
    const item={box:[Math.min(a[0],b[0])-1,a[1],Math.min(a[2],b[2])-1,
      Math.abs(a[0]-b[0])+3,5,Math.abs(a[2]-b[2])+3]};
    insert(item);
    const length=Math.abs(a[0]-b[0])+Math.abs(a[2]-b[2]);
    if(length>=4)anchors.push({box:[Math.floor((a[0]+b[0])/2),a[1],Math.floor((a[2]+b[2])/2),1,1,1],
      obstacle:item,axis:a[0]===b[0]?0:2,openings:{},id:null});
  }
  if(!anchors.length)throw Error('No tunnel anchors for dense growth');
  const sides=['west','east','north','south'],opposite=[1,0,3,2];
  let goal=[world.length/2,world.height/2,world.width/2];
  const sectors=new Map(),columns=new Map(),heightCounts=Array(Math.ceil(world.height/50)).fill(0);
  const column=b=>`${Math.floor(b[0]/128)},${Math.floor(b[2]/128)}`;
  const sector=b=>`${Math.floor(b[0]/128)},${Math.floor(b[1]/50)},${Math.floor(b[2]/128)}`;
  for(let attempt=0;attempt<target*100 && rooms.length<target;attempt++) {
    if(attempt%32===0) {
      let best=Infinity;
      for(let n=0;n<12;n++) {
        const p=[integer(24,world.length-24),integer(12,world.height-20),integer(24,world.width-24)];
        if(!outside([...p,1,1,1]))continue;
        const score=heightCounts[Math.floor(p[1]/50)]+(sectors.get(sector(p))||0)*6+(columns.get(column(p))||0)*12;
        if(score<best){goal=p;best=score;}
      }
    }
    let parent,score=Infinity;
    for(let n=0;n<24;n++) {
      const pool=rooms.length && integer(0,9)>1?rooms:anchors;
      const p=pool[integer(0,pool.length-1)];
      if(Object.keys(p.openings).length>=3)continue;
      const b=p.box,dist=Math.abs(b[0]-goal[0])+Math.abs(b[2]-goal[2])+Math.abs(b[1]-goal[1])*12;
      if(dist<score){parent=p;score=dist;}
    }
    if(!parent)continue;
    const p=parent.box;
    let side=integer(0,3);
    if(integer(0,3)>0)side=Math.abs(goal[0]-p[0])>Math.abs(goal[2]-p[2])?(goal[0]<p[0]?0:1):(goal[2]<p[2]?2:3);
    const axis=side<2?0:2,along=axis===0?2:0,sign=side%2===0?-1:1;
    if(parent.openings[sides[side]] || (parent.id===null && axis!==parent.axis))continue;
    const range=layout.denseSizeRanges?layout.denseSizeRanges[integer(0,layout.denseSizeRanges.length-1)]:sizes;
    const footprint=layout.denseFootprints?.[integer(0,layout.denseFootprints.length-1)];
    const size=[footprint?.[0]??integer(range[0],range[1]),integer(range[2],range[3]),
      footprint?.[1]??integer(range[0],range[1])];
    const toward=Math.sign(goal[1]-p[1]);
    const dy=integer(0,3)?toward*integer(1,7):integer(-7,7),floor=p[1]+dy;
    const gap=integer(Math.max(7,Math.abs(dy)+5),integer(0,19)===0?48:26);
    const start=[p[0],p[1],p[2]];
    start[axis]=p[axis]+(sign>0?p[axis+3]-1:0);
    start[along]=parent.id===null?p[along]:integer(p[along]+1,p[along]+p[along+3]-2);
    const b=[0,floor,0,...size];
    b[axis]=sign>0?start[axis]+gap:start[axis]-gap-size[axis]+1;
    b[along]=start[along]-integer(1,size[along]-2);
    const padded=[b[0]-1,b[1]-1,b[2]-1,b[3]+2,b[4]+2,b[5]+2];
    if(!outside(padded)||!clear(padded))continue;
    const end=[start[0],floor,start[2]];
    end[axis]=b[axis]+(sign<0?size[axis]-1:0);
    const length=Math.abs(end[axis]-start[axis]), path=[],volumes=[];
    let valid=true;
    const allowed=[parent.obstacle||parent];
    if(parent.gallery) {
      const neck=[start[0]-1,start[1],start[2]-1,3,5,3];
      for(const k of keys(neck))for(const item of buckets.get(k)||[])
        if(item!==parent.obstacle&&galleryItems.includes(item)&&overlap(neck,item.box)&&!allowed.includes(item))allowed.push(item);
    }
    for(let i=0;i<=length;i++) {
      const y=p[1]+Math.round(dy*Math.max(0,Math.min(1,(i-2)/(length-4))));
      const point=[start[0],y,start[2]];point[axis]+=sign*i;
      const volume=[point[0]-1,y,point[2]-1,3,5,3];
      if(!outside(volume)||!clear(volume,allowed)){valid=false;break;}
      path.push(point);volumes.push(volume);
    }
    if(!valid)continue;
    const room={id:rooms.length,box:b,door:[end[0],floor+1,end[2]],doors:[],openings:{}};
    room.doors.push(room.door);room.openings[sides[opposite[side]]]=true;
    parent.openings[sides[side]]=true;
    if(parent.id!==null)parent.doors.push([start[0],start[1]+1,start[2]]);
    const connection={from:parent.id,to:room.id,kind:dy?'stair':'tunnel',path};
    connections.push(connection);rooms.push(room);insert(room);
    sectors.set(sector(b),(sectors.get(sector(b))||0)+1);
    columns.set(column(b),(columns.get(column(b))||0)+1);
    heightCounts[Math.floor(b[1]/50)]++;
    for(let i=0;i<path.length;i++) {
      const [x,y,z]=path[i],clearance=i+1<path.length&&path[i+1][1]>y?3:2;
      for(let h=1;h<=clearance;h++)addAir(x,y+h,z);
      insert({box:volumes[i]});
    }
  }
  if(rooms.length<target)throw Error(`Dense growth stopped at ${rooms.length}/${target}`);
  // Every accepted child has a real route to its parent, ultimately to an existing tunnel.
  const reachable=new Set();
  for(const edge of connections) {
    if(edge.from!==null&&!reachable.has(edge.from))throw Error('Disconnected dense branch');
    reachable.add(edge.to);
  }
  return {rooms,connections};
}
