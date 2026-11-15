import {NOISE_WORLD,noiseMask} from './generation_noise_mask.js';
import {localTunnelNetwork} from './generation_demo_chunks_network.js';
import {growDense} from './generation_demo_chunks_growth.js';
import {prepareGalleries,galleryMeshes} from './generation_demo_chunks_galleries.js';
import {mergeBoxes,subtract} from './generation_demo_generator.js';

export function generateNoiseMap(seed,image,density=2,progress=()=>{}) {
  const started=performance.now(),world=NOISE_WORLD,mask=noiseMask(image.width,image.height,image.data);
  let state=Number(seed)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const n=Math.floor(world.length/32),blocked=new Uint8Array(n*n),seen=new Uint8Array(n*n),groups=[];
  const center=id=>[id%n*32+16,Math.floor(id/n)*32+16];
  for(let id=0;id<blocked.length;id++) {
    const [x,z]=center(id);blocked[id]=mask.isSolid([x-20,0,z-20,40,world.height,40])?0:1;
  }
  const neighbors=id=>{
    const x=id%n,z=Math.floor(id/n);
    return [x>0?id-1:-1,x<n-1?id+1:-1,z>0?id-n:-1,z<n-1?id+n:-1].filter(k=>k>=0);
  };
  for(let root=0;root<blocked.length;root++)if(!blocked[root]&&!seen[root]) {
    const nodes=[root];seen[root]=1;
    for(let i=0;i<nodes.length;i++)for(const next of neighbors(nodes[i]))if(!seen[next]&&!blocked[next]) {
      seen[next]=1;nodes.push(next);
    }
    groups.push(nodes);
  }
  if(!groups.length)throw Error('La noise map ne contient aucune zone pleine assez large');
  progress('Trace des galeries dans les zones pleines...');
  const routes=[];
  function corridor(a,b,ya,yb) {
    const length=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]),dx=Math.sign(b[0]-a[0]),dz=Math.sign(b[1]-a[1]);
    let run;
    for(let i=0;i<=length;i++) {
      const y=ya+Math.round((yb-ya)*Math.max(0,Math.min(1,(i-4)/Math.max(1,length-8))));
      const p=[a[0]+dx*i,y,a[1]+dz*i];
      if(run&&run.a[1]===y)run.b=p;
      else {run={a:p,b:p,axis:dx?0:2,main:true};routes.push(run);}
    }
  }
  for(const group of groups) {
    let minX=n,minZ=n,maxX=0,maxZ=0;
    for(const id of group){const x=id%n,z=Math.floor(id/n);minX=Math.min(minX,x);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxZ=Math.max(maxZ,z);}
    const size=Math.max(maxX-minX,maxZ-minZ)+1,local=new Uint8Array(size*size).fill(1);
    const index=id=>(Math.floor(id/n)-minZ)*size+id%n-minX;
    for(const id of group)local[index(id)]=0;
    const terminals=new Set([index(group[0])]);
    const count=Math.min(group.length,Math.max(2,Math.min(24,Math.ceil(group.length/160))));
    while(terminals.size<count)terminals.add(index(group[integer(0,group.length-1)]));
    const network=localTunnelNetwork(size,local,[...terminals],integer(0,0xffffffff));
    const heights=new Map([[network.order[0],integer(16,world.height-34)]]),directions=new Map([[network.order[0],1]]);
    const p=id=>[(id%size+minX)*32+16,(Math.floor(id/size)+minZ)*32+16];
    if(group.length===1) {
      const a=p(0),y=heights.get(0);corridor([a[0]-10,a[1]],[a[0]+10,a[1]],y,y);
    }
    for(const node of network.order.slice(1)) {
      const parent=network.parents[node],previous=heights.get(parent);
      let direction=directions.get(parent);if(integer(0,19)===0)direction=-direction;
      if(previous<18)direction=1;if(previous>world.height-36)direction=-1;
      const y=previous+direction*integer(1,3);heights.set(node,y);directions.set(node,direction);
      corridor(p(parent),p(node),previous,y);
    }
  }
  const layout={seed:Number(seed)>>>0,world,isSolidBox:mask.isSolid,
    zones:mask.voidBoxes.map((b,id)=>({id,x:b[0]/32,z:b[2]/32,width:b[3]/32,depth:b[5]/32}))};
  const galleries=prepareGalleries(layout,[],[],routes),air=new Set();
  const key=(x,y,z)=>(y*world.width+z)*world.length+x;
  const xyz=k=>[k%world.length,Math.floor(k/(world.length*world.width)),Math.floor(k/world.length)%world.width];
  const bucketWidth=Math.ceil(world.length/32);
  const target=Math.max(groups.length,Math.round(blocked.reduce((sum,v)=>sum+1-v,0)/16*density));
  progress(`Generation de ${target} pieces et de leurs raccords...`);
  const growth=growDense({layout,houses:[],shafts:[],routes,galleries,target,integer,
    addAir:(x,y,z)=>air.add(key(x,y,z)),sizes:[5,30,5,8]});
  const roomBuckets=new Map();
  for(const room of growth.rooms) {
    const b=room.box;
    for(let x=Math.floor(b[0]/32);x<=Math.floor((b[0]+b[3]-1)/32);x++)
      for(let z=Math.floor(b[2]/32);z<=Math.floor((b[2]+b[5]-1)/32);z++) {
        const id=z*bucketWidth+x;if(!roomBuckets.has(id))roomBuckets.set(id,[]);roomBuckets.get(id).push(b);
      }
  }
  const atRoom=(x,y,z)=>(roomBuckets.get(Math.floor(z/32)*bucketWidth+Math.floor(x/32))||[])
    .some(b=>x>=b[0]&&x<b[0]+b[3]&&y>=b[1]&&y<b[1]+b[4]&&z>=b[2]&&z<b[2]+b[5]);
  progress('Assemblage des pieces et des galeries...');
  const skin=new Set();
  for(const k of air) {
    const [x,y,z]=xyz(k);
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const a=x+dx,b=y+dy,c=z+dz,id=key(a,b,c);
      if(!air.has(id)&&!skin.has(id)&&!atRoom(a,b,c)&&!galleries.contains(a,b,c))skin.add(id);
    }
  }
  const boxes=[];
  for(const {box:[x,y,z,sx,sy,sz],doors} of growth.rooms) {
    let shell=[[x,y,z,sx,1,sz,'dense'],[x,y+sy-1,z,sx,1,sz,'dense'],
      [x,y+1,z,sx,sy-2,1,'dense'],[x,y+1,z+sz-1,sx,sy-2,1,'dense'],
      [x,y+1,z+1,1,sy-2,sz-2,'dense'],[x+sx-1,y+1,z+1,1,sy-2,sz-2,'dense']];
    for(const door of doors)shell=shell.flatMap(b=>subtract(b,[...door,1,2,1]));
    boxes.push(...shell);
  }
  for(const box of mergeBoxes([...skin].map(k=>[...xyz(k),1,1,1,'tunnel'])))boxes.push(box);
  for(const box of galleryMeshes(galleries,routes,growth.connections))boxes.push(box);
  return {seed:layout.seed,world,zones:[],houses:[],ports:[],snakes:[],buildingLong:[],wideAreas:[],
    wallGroups:[{zone:0,boxes:mask.floor,walls:mask.walls}],networkBoxes:boxes,denseRooms:growth.rooms,
    routes,ladderBoxes:[],mainGalleries:{interiors:galleries.inner,sections:galleries.outer.length},
    noise:{components:groups.length,seconds:(performance.now()-started)/1000},
    stats:{wallHouses:0,denseRooms:growth.rooms.length,connectedDense:growth.rooms.length,
      connectedDoors:0,orangeDoors:0,buildingConnections:0,components:groups.length}};
}
