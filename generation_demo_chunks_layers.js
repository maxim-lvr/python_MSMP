import {localTunnelNetwork} from './generation_demo_chunks_network.js';
import {mainTunnelClearance,optimizeMainTunnelPaths} from './generation_demo_chunks_tunnel_paths.js';
import {networkLevels,zoneVolume} from './generation_vertical.js';

const STEP=16,OFFSET=0;
// Horizontal networks at nearby altitudes, joined by walkable ramps instead of full-height ladders.
export function buildLayeredTunnels({layout,houses,shafts,routes,polyline,stairs,addAir,atHouse,ladders,progress=()=>{}}) {
  const world=layout.world,size=Math.floor(world.length/STEP),N=size*size,levels=networkLevels(layout);
  const point=(id,y)=>[(id%size)*STEP+OFFSET,y,Math.floor(id/size)*STEP+OFFSET];
  const adjacent=id=>{const x=id%size,z=Math.floor(id/size),out=[];
    if(x>0)out.push(id-1);if(x<size-1)out.push(id+1);if(z>0)out.push(id-size);if(z<size-1)out.push(id+size);return out;};
  const volumes=[...houses.map(h=>h.box),...layout.zones.map(z=>zoneVolume(z,world)),
    ...(layout.snakes||[]).flatMap(s=>s.volumes),...(layout.buildingLong||[]).map(z=>z.box),
    ...(layout.wideAreas||[]).map(z=>z.box),...(layout.settlements||[]).flatMap(z=>[z.box,...(z.accessVolumes||[])]),
    ...(layout.globalPipe?.volumes||[])];
  const routeBoxes=routes.map(({a,b})=>[Math.min(a[0],b[0])-2,a[1],Math.min(a[2],b[2])-2,
    Math.abs(a[0]-b[0])+5,8,Math.abs(a[2]-b[2])+5]);
  const entranceFloors=new Map();
  for(const route of routes)for(const p of [route.a,route.b]){
    const key=`${p[0]},${p[2]}`;if(!entranceFloors.has(key))entranceFloors.set(key,new Set());entranceFloors.get(key).add(p[1]);
  }
  for(const shaft of shafts) {
    const floors=[...(entranceFloors.get(`${shaft.x},${shaft.z}`)||[])];
    const alternatives=levels.filter(y=>Math.max(shaft.top,y)-Math.min(shaft.bottom,y)<=112&&
      (y<=shaft.bottom-8||y>=shaft.top+8)&&floors.every(floor=>Math.abs(floor-y)>=8));
    alternatives.sort((a,b)=>Math.abs(a-shaft.networkY)-Math.abs(b-shaft.networkY));
    if(alternatives.length)shaft.networkY=alternatives[0];
  }
  const shaftBoxes=shafts.map(s=>[s.x-2,Math.max(0,s.bottom-112),s.z-2,5,
    Math.min(world.height,s.top+116)-Math.max(0,s.bottom-112),5]);
  const shaftVolumeSet=new Set(shaftBoxes);
  let clear=mainTunnelClearance([...volumes,...routeBoxes,...shaftBoxes]);
  const mask=new Uint8Array(N);
  for(let id=0;id<N;id++) {
    const [x,,z]=point(id,0);
    if(x<16||z<16||x+16>=world.length||z+16>=world.width||
      layout.isSolidBox&&!layout.isSolidBox([x-12,0,z-12,25,world.height,25]))mask[id]=1;
  }
  const layers=levels.map((y,index)=>{
    const blocked=mask.slice(),labels=new Int32Array(N).fill(-1),terminals=[];
    for(const b of [...volumes,...routeBoxes.filter(b=>b[1]!==y),...shaftBoxes]) {
      if(y+8<=b[1]||y>=b[1]+b[4])continue;
      const margin=shaftVolumeSet.has(b)?3:11;
      for(let z=Math.max(0,Math.ceil((b[2]-margin-OFFSET)/STEP));z<=Math.min(size-1,Math.floor((b[2]+b[5]+margin-OFFSET)/STEP));z++)
        for(let x=Math.max(0,Math.ceil((b[0]-margin-OFFSET)/STEP));x<=Math.min(size-1,Math.floor((b[0]+b[3]+margin-OFFSET)/STEP));x++)blocked[z*size+x]=1;
    }
    const backing=shaftBoxes.map(b=>[b[0]+2,b[1],b[2]+3,1,b[4],1]);
    const landingClear=mainTunnelClearance([...volumes,...routeBoxes.filter(b=>b[1]!==y),...backing],{radius:0,height:4});
    return {y,index,blocked,labels,terminals,shafts:[],landingClear};
  });
  // An entrance only uses the short ladder leading to its nearest network altitude.
  const findLanding=(shaft,layer)=>{
    const cx=Math.floor(shaft.x/STEP),cz=Math.floor(shaft.z/STEP),node=cz*size+cx;
    let chosen;
    for(let radius=1;radius<=8&&!chosen;radius++)for(let dz=-radius;dz<=radius&&!chosen;dz++)for(let dx=-radius;dx<=radius&&!chosen;dx++) {
      if(Math.max(Math.abs(dx),Math.abs(dz))!==radius)continue;
      const x=cx+dx,z=cz+dz;if(x<0||z<0||x>=size||z>=size)continue;
      const terminal=z*size+x;if(layer.blocked[terminal])continue;
      const [px,,pz]=point(terminal,layer.y),sx=shaft.x,sz=shaft.z;
      for(const points of [[[px,pz],[sx,pz],[sx,sz]],[[px,pz],[px,sz],[sx,sz]],
        ...[-4,4].map(offset=>[[px,pz],[sx+offset,pz],[sx+offset,sz-3],[sx,sz-3],[sx,sz]])]) {
        if(points.slice(1).every((p,i)=>{
          const a=points[i],bounds=[Math.min(a[0],p[0]),layer.y,Math.min(a[1],p[1]),Math.abs(p[0]-a[0])+1,4,Math.abs(p[1]-a[1])+1];
          return (!layout.isSolidBox||layout.isSolidBox(bounds))&&layer.landingClear([a[0],layer.y,a[1]],[p[0],layer.y,p[1]]);
        })){chosen={terminal,points};break;}
      }
    }
    if(!chosen) {
      // Narrow local passages need a small maze search, rather than only L-shaped landings.
      const radius=128,width=radius*2+1,start=radius*width+radius;
      const visited=new Uint8Array(width*width),parent=new Int32Array(width*width).fill(-1),queue=new Int32Array(width*width);
      let head=0,tail=0;queue[tail++]=start;visited[start]=1;
      while(head<tail&&!chosen) {
        const id=queue[head++],px=shaft.x+id%width-radius,pz=shaft.z+Math.floor(id/width)-radius;
        if(id!==start&&px%STEP===OFFSET&&pz%STEP===OFFSET) {
          const terminal=Math.floor(pz/STEP)*size+Math.floor(px/STEP);
          if(terminal>=0&&terminal<N&&!layer.blocked[terminal]) {
            const points=[];for(let n=id;n!==-1;n=parent[n])points.push([shaft.x+n%width-radius,shaft.z+Math.floor(n/width)-radius]);
            const compact=[];for(const point of points){const a=compact.at(-2),b=compact.at(-1);
              if(a&&((a[0]===b[0]&&b[0]===point[0])||(a[1]===b[1]&&b[1]===point[1])))compact[compact.length-1]=point;
              else compact.push(point);}
            chosen={terminal,points:compact};break;
          }
        }
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const x=id%width+dx,z=Math.floor(id/width)+dz;if(x<0||z<0||x>=width||z>=width)continue;
          const next=z*width+x,nx=shaft.x+x-radius,nz=shaft.z+z-radius;
          if(visited[next])continue;visited[next]=1;
          if(nx<1||nz<1||nx>=world.length-1||nz>=world.width-1||
            layout.isSolidBox&&!layout.isSolidBox([nx,layer.y,nz,1,4,1])||!layer.landingClear([nx,layer.y,nz],[nx,layer.y,nz]))continue;
          parent[next]=id;queue[tail++]=next;
        }
      }
    }
    return chosen;
  };
  const verticalClear=mainTunnelClearance(volumes,{radius:1,height:4});
  for(const shaft of shafts) {
    const floors=[...(entranceFloors.get(`${shaft.x},${shaft.z}`)||[])];
    const choices=layers.filter(layer=>Math.max(shaft.top,layer.y)-Math.min(shaft.bottom,layer.y)<=112&&
      (layer.y<=shaft.bottom-8||layer.y>=shaft.top+8)&&floors.every(y=>Math.abs(y-layer.y)>=8)&&
      verticalClear([shaft.x,Math.min(shaft.bottom,layer.y),shaft.z],[shaft.x,Math.max(shaft.top,layer.y),shaft.z]));
    choices.sort((a,b)=>Math.abs(a.y-shaft.networkY)-Math.abs(b.y-shaft.networkY));
    let connected=false;
    for(const layer of choices) {
      const chosen=findLanding(shaft,layer);if(!chosen)continue;
      shaft.networkY=layer.y;shaft.terminal=chosen.terminal+layer.index*N;
      layer.terminals.push(chosen.terminal);layer.shafts.push({shaft,...chosen});connected=true;break;
    }
    if(!connected)throw Error(`Aucun palier proche de l'acces ${shaft.x},${shaft.z} autour de Y ${shaft.networkY}`);
  }

  const queue=new Int32Array(N);let component=0;
  for(const layer of layers)for(let root=0;root<N;root++)if(!layer.blocked[root]&&layer.labels[root]===-1){
    let head=0,tail=0;queue[tail++]=root;layer.labels[root]=component;
    while(head<tail)for(const next of adjacent(queue[head++]))if(!layer.blocked[next]&&layer.labels[next]===-1){layer.labels[next]=component;queue[tail++]=next;}
    component++;
  }
  const ramps=[],pairs=new Set(),union=Array.from({length:component},(_,i)=>i);
  const find=id=>{while(union[id]!==id){union[id]=union[union[id]];id=union[id];}return id;};
  for(let index=0;index<layers.length-1;index++) {
    // Sixteen flat blocks at both ends leave a real landing before the first riser.
    const lower=layers[index],upper=layers[index+1],run=Math.ceil((upper.y-lower.y+32)/STEP);
    const directions=[[run,0],[0,run],[-run,0],[0,-run]];
    const previous=ramps.filter(r=>r.layer===index-1),previousIndex=new Map();
    for(const ramp of previous) {
      const b=ramp.bounds;
      for(let x=Math.floor((b[0]-96)/256);x<=Math.floor((b[0]+b[3]+96)/256);x++)
        for(let z=Math.floor((b[2]-96)/256);z<=Math.floor((b[2]+b[5]+96)/256);z++) {
          const key=`${x},${z}`;if(!previousIndex.has(key))previousIndex.set(key,[]);previousIndex.get(key).push(b);
        }
    }
    const abovePrevious=b=>{
      for(let x=Math.floor(b[0]/256);x<=Math.floor((b[0]+b[3])/256);x++)
        for(let z=Math.floor(b[2]/256);z<=Math.floor((b[2]+b[5])/256);z++)
          for(const other of previousIndex.get(`${x},${z}`)||[])
            if(b[0]<other[0]+other[3]+96&&b[0]+b[3]+96>other[0]&&
              b[2]<other[2]+other[5]+96&&b[2]+b[5]+96>other[2])return true;
      return false;
    };
    const scanOffset=(Math.imul(layout.seed^(index+1),0x45d9f3b)>>>0)%N;
    for(let scan=0;scan<N;scan++) {
      const a=(scan+scanOffset)%N;if(lower.labels[a]<0)continue;
      const rotation=(Math.imul(a+1,374761393)^layout.seed^Math.imul(index+1,668265263))>>>0;
      for(let direction=0;direction<4;direction++) {
        const [dx,dz]=directions[(rotation+direction)%4];
        const x=a%size+dx,z=Math.floor(a/size)+dz;if(x<1||z<1||x>=size-1||z>=size-1)continue;
        const b=z*size+x;if(upper.labels[b]<0)continue;
        const key=`${lower.labels[a]},${upper.labels[b]},${Math.floor((a%size)*STEP/2048)},${Math.floor(Math.floor(a/size)*STEP/2048)}`;
        if(pairs.has(key))continue;
        const p=point(a,lower.y),q=point(b,upper.y),along=dx!==0?1:size;
        const through=[[a-along,a+along],[b-along,b+along]];
        if(through.some((nodes,i)=>nodes.some(n=>n<0||n>=N||(i?upper:lower).blocked[n]||
          (i?upper:lower).labels[n]!==(i?upper.labels[b]:lower.labels[a]))))continue;
        const roadClear=through.every((nodes,i)=>clear(point(nodes[0],i?upper.y:lower.y),point(nodes[1],i?upper.y:lower.y)));
        if(!roadClear)continue;
        // The stair flight lives in its own side branch. The main corridor stays flat and open.
        for(const side of [32,-32]) {
          const first=[p[0]+(dx!==0?0:side),p[1],p[2]+(dx!==0?side:0)];
          const last=[q[0]+(dx!==0?0:side),q[1],q[2]+(dx!==0?side:0)];
          const flight=[Math.min(first[0],last[0])-3,p[1],Math.min(first[2],last[2])-3,
            Math.abs(last[0]-first[0])+7,last[1]-first[1]+8,Math.abs(last[2]-first[2])+7];
          const bounds=[Math.min(p[0],q[0],first[0],last[0])-3,p[1],Math.min(p[2],q[2],first[2],last[2])-3,
            Math.max(p[0],q[0],first[0],last[0])-Math.min(p[0],q[0],first[0],last[0])+7,last[1]-first[1]+8,
            Math.max(p[2],q[2],first[2],last[2])-Math.min(p[2],q[2],first[2],last[2])+7];
          if(bounds[0]<16||bounds[2]<16||bounds[0]+bounds[3]>=world.length-16||bounds[2]+bounds[5]>=world.width-16)continue;
          if(ramps.some(r=>r.layer===index&&bounds[0]<r.bounds[0]+r.bounds[3]&&bounds[0]+bounds[3]>r.bounds[0]&&
            bounds[2]<r.bounds[2]+r.bounds[5]&&bounds[2]+bounds[5]>r.bounds[2])||abovePrevious(bounds)||
            layout.isSolidBox&&!layout.isSolidBox(bounds)||!clear(first,last)||!clear(p,first)||!clear(last,q))continue;
          const insideFlight=n=>{
            const v=point(n,0);return v[0]>=flight[0]-11&&v[0]<=flight[0]+flight[3]+11&&
              v[2]>=flight[2]-11&&v[2]<=flight[2]+flight[5]+11;
          };
          if([...lower.terminals,...upper.terminals,...through.flat(),a,b].some(insideFlight))continue;
          // Keep the horizontal networks from routing under/through the stair flight later.
          for(const layer of [lower,upper])
            for(let z=Math.max(0,Math.ceil((flight[2]-11-OFFSET)/STEP));z<=Math.min(size-1,Math.floor((flight[2]+flight[5]+11-OFFSET)/STEP));z++)
              for(let x=Math.max(0,Math.ceil((flight[0]-11-OFFSET)/STEP));x<=Math.min(size-1,Math.floor((flight[0]+flight[3]+11-OFFSET)/STEP));x++)layer.blocked[z*size+x]=1;
          pairs.add(key);union[find(lower.labels[a])]=find(upper.labels[b]);
          lower.terminals.push(a,...through[0]);upper.terminals.push(b,...through[1]);
          ramps.push({layer:index,bounds,flight,through,entries:[p,q],points:[first,last],endpoints:[a+index*N,b+(index+1)*N]});
          break;
        }
      }
    }
  }
  clear=mainTunnelClearance([...volumes,...routeBoxes,...shaftBoxes,...ramps.map(r=>r.flight)]);
  const edges=[],paths=[],usedComponents=new Set();
  for(const layer of layers) {
    if(!layer.terminals.length)continue;
    progress(`Galeries a plusieurs hauteurs : Y ${layer.y}/${world.height}...`);
    const graph=localTunnelNetwork(size,layer.blocked,layer.terminals,layout.seed^Math.imul(layer.index+1,0x45d9f3b),true);
    for(const t of layer.terminals)usedComponents.add(find(layer.labels[t]));
    edges.push(...graph.edges.map(([a,b])=>[a+layer.index*N,b+layer.index*N]));
    const heights=new Int16Array(N).fill(layer.y);
    const main=optimizeMainTunnelPaths({size,blocked:layer.blocked,edges:graph.edges,terminals:layer.terminals,heights,step:STEP,
      clear:(a,b)=>clear([a[0]+OFFSET,a[1],a[2]+OFFSET],[b[0]+OFFSET,b[1],b[2]+OFFSET])});
    for(const path of main) {
      const points=path.points.map(([x,y,z])=>[x+OFFSET,y,z+OFFSET]);
      for(let i=1;i<points.length;i++)polyline([points[i-1].filter((_,j)=>j!==1),points[i].filter((_,j)=>j!==1)],layer.y,undefined,true);
      paths.push({...path,points,endpoints:path.endpoints.map(n=>n+layer.index*N)});
    }
    for(const {shaft,points} of layer.shafts) {
      polyline(points,layer.y,undefined,true);
      shaft.bottom=Math.min(shaft.bottom,layer.y);shaft.top=Math.max(shaft.top,layer.y);
      for(let y=shaft.bottom+1;y<=shaft.top+2;y++) {
        if(atHouse(shaft.x,y,shaft.z))throw Error('Ladder intersects wall house');
        addAir(shaft.x,y,shaft.z);
      }
      ladders.set(shaft.id,[shaft.x,shaft.bottom+1,shaft.z,1,shaft.top-shaft.bottom,1,'ladder']);
    }
  }
  for(const ramp of ramps){
    const [a,b]=ramp.points,[lowerEntry,upperEntry]=ramp.entries,start=routes.length;
    for(const [i,entry] of [lowerEntry,upperEntry].entries()) {
      const through=ramp.through[i].map(n=>point(n,entry[1]));
      polyline(through.map(p=>[p[0],p[2]]),entry[1],undefined,true);
    }
    polyline([[lowerEntry[0],lowerEntry[2]],[a[0],a[2]]],a[1],undefined,true);
    stairs([a[0],a[2]],[b[0],b[2]],a[1],b[1],true);
    polyline([[b[0],b[2]],[upperEntry[0],upperEntry[2]]],b[1],undefined,true);
    for(let i=start;i<routes.length;i++)routes[i].main=true;
    paths.push(ramp);edges.push(ramp.endpoints);
  }
  return {edges,paths,roots:[...usedComponents],levels:levels.length,ramps:ramps.length};
}
