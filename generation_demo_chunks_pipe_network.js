import {localTunnelNetwork} from './generation_demo_chunks_network.js';
import {overlaps} from './generation_demo_generator.js';

export const PIPE_BRANCH_COUNT = 12;
const STEP=64, MARGIN=10;
const distance=(a,b)=>a.reduce((sum,n,i)=>sum+Math.abs(n-b[i]),0);
const volume=(a,b)=>[...a.map((n,i)=>Math.min(n,b[i])-MARGIN),...a.map((n,i)=>Math.abs(n-b[i])+2*MARGIN+1)];
const compact=points=>{
  const out=[];
  for(const p of points) {
    if(out.length&&distance(out.at(-1),p)===0)continue;
    const a=out.at(-2),b=out.at(-1);
    if(a&&[0,1,2].some(axis=>[0,1,2].every(n=>n===axis||a[n]===b[n]&&b[n]===p[n])&&
      Math.sign(b[axis]-a[axis])===Math.sign(p[axis]-b[axis])))out.pop();
    out.push(p);
  }
  return out;
};

export function expandPipeNetwork(layout,trunk) {
  let state=(layout.seed^0x4e455450)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const {world}=layout, limits=[world.length,world.height,world.width];
  const obstacles=[...layout.zones.map(z=>({box:[z.x*32-80,0,z.z*32-80,z.width*32+160,world.height,z.depth*32+160]})),
    ...(layout.buildingLong||[]).map(z=>({box:z.box})),...(layout.wideAreas||[]).map(z=>({box:z.box,wide:z.id})),
    ...(layout.snakes||[]).flatMap(z=>z.volumes.map(box=>({box}))),
    ...(layout.pipeAccessReservations||[]).map(box=>({box}))];
  const clear=(a,b,owner)=>{
    if(a.some((n,i)=>n<MARGIN||n+MARGIN>=limits[i])||b.some((n,i)=>n<MARGIN||n+MARGIN>=limits[i]))return false;
    return !obstacles.some(o=>(owner===undefined||o.wide!==owner)&&overlaps(volume(a,b),o.box));
  };
  const elbow=(a,b)=>{
    for(const c of [[a[0],a[1],b[2]],[b[0],a[1],a[2]]])if(clear(a,c)&&clear(c,b))return compact([a,c,b]);
    return null;
  };
  const size=Math.ceil((Math.max(world.length,world.width)-1)/STEP)+1,grids=new Map();
  const point=(id,y)=>[(id%size)*STEP,y,Math.floor(id/size)*STEP];
  function grid(y) {
    if(grids.has(y))return grids.get(y);
    const blocked=new Uint8Array(size*size),r=STEP/2+MARGIN;
    for(let id=0;id<blocked.length;id++) {
      const p=point(id,y);
      if(p[0]<MARGIN||p[0]+MARGIN>=world.length||p[2]<MARGIN||p[2]+MARGIN>=world.width||
        obstacles.some(o=>overlaps([p[0]-r,y-MARGIN,p[2]-r,r*2+1,MARGIN*2+1,r*2+1],o.box)))blocked[id]=1;
    }
    // Label components once so an impossible route does not trigger repeated searches.
    const components=new Int32Array(blocked.length).fill(-1);
    for(let id=0;id<blocked.length;id++)if(!blocked[id]&&components[id]===-1) {
      const queue=[id];components[id]=id;
      for(let i=0;i<queue.length;i++) {
        const node=queue[i],x=node%size,z=Math.floor(node/size);
        for(const next of [x>0?node-1:-1,x<size-1?node+1:-1,z>0?node-size:-1,z<size-1?node+size:-1])
          if(next>=0&&!blocked[next]&&components[next]===-1){components[next]=id;queue.push(next);}
      }
    }
    const result={blocked,components};grids.set(y,result);return result;
  }
  function route(a,b) {
    const direct=elbow(a,b);if(direct)return direct;
    const {blocked,components}=grid(a[1]);
    const snap=p=>{
      const choices=[];
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++) {
        const x=Math.round(p[0]/STEP)+dx,z=Math.round(p[2]/STEP)+dz,id=z*size+x;
        if(x<1||x>=size-1||z<1||z>=size-1||blocked[id])continue;
        const q=point(id,p[1]),path=elbow(p,q);
        if(path)choices.push({id,path,cost:distance(p,q)});
      }
      return choices.sort((a,b)=>a.cost-b.cost).slice(0,3);
    };
    for(const start of snap(a))for(const end of snap(b)) {
      if(components[start.id]!==components[end.id])continue;
      let network;
      try {network=localTunnelNetwork(size,blocked,[start.id,end.id],state);} catch {continue;}
      const path=[];
      for(let id=end.id;id!==-1;id=network.parents[id])path.push(point(id,a[1]));
      path.reverse();const short=[path[0]];
      for(let i=0;i<path.length-1;) {
        let j=path.length-1,part;
        for(;j>i;j--){part=elbow(path[i],path[j]);if(part)break;}
        if(!part)break;
        short.push(...part.slice(1));i=j;
      }
      if(distance(short.at(-1),path.at(-1))===0)return compact([...start.path,...short,...[...end.path].reverse()]);
    }
    return null;
  }
  const paths=[trunk.points],visits=[{label:'Traversee principale',pos:trunk.points[1]}],connections=[],branches=[];
  const anchors=(target,source=paths)=>{
    const found=new Map();
    for(const path of source)for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],axis=[0,1,2].find(n=>a[n]!==b[n]);
      if(axis===1||axis===undefined||distance(a,b)<96)continue;
      for(const t of [0.25,0.5,0.75]) {
        const p=a.map((n,j)=>Math.round(n+(b[j]-n)*t));found.set(p.join(','),p);
      }
      const p=[...a];p[axis]=Math.max(Math.min(a[axis],b[axis])+32,Math.min(Math.max(a[axis],b[axis])-32,target[axis]));found.set(p.join(','),p);
    }
    return [...found.values()].sort((a,b)=>distance(a,target)-distance(b,target));
  };
  for(let sector=0;sector<PIPE_BRANCH_COUNT;sector++) {
    const y=[32,96,120,176,208,248][sector%6];
    for(let attempt=0;attempt<12;attempt++) {
      const target=[Math.round((sector%4+0.5)*world.length/4)+integer(-260,260),y,
        Math.round((Math.floor(sector/4)+0.5)*world.width/3)+integer(-260,260)];
      if(!clear(target,target))continue;
      const options=anchors(target).filter(p=>clear(p,[p[0],y,p[2]])).slice(0,24);
      const start=options[0],end=options.find(p=>start&&distance(p,start)>700);
      if(!start||!end)continue;
      const lowA=[start[0],y,start[2]],lowB=[end[0],y,end[2]];
      const first=route(lowA,target),last=route(target,lowB);
      if(!first||!last)continue;
      const path=compact([start,...first,...last,end]);paths.push(path);
      branches.push({sector,y,path:paths.length-1});visits.push({label:`Branche ${branches.length}`,pos:target});break;
    }
  }

  const connectedZones=[];
  for(const zone of layout.wideAreas||[])if(zone.type==='open'&&zone.pipe?.points.length) {
    const local=zone.pipe.points;
    const links=[];
    for(const end of [0,local.length-1]) {
      const p=local[end],neighbor=local[end===0?1:end-1],normal=p.map((n,i)=>Math.sign(n-neighbor[i]));
      let connection;
      for(const length of [24,48,80,112]) {
        if(connection)break;
        const outside=p.map((n,i)=>n+normal[i]*length);
        if(!clear(p,outside,zone.id))continue;
        for(const y of [288,p[1],208,120,72]) {
          const exit=[outside[0],y,outside[2]];
          if(!clear(outside,exit))continue;
          for(const anchor of anchors(exit).slice(0,28)) {
            const entry=[anchor[0],y,anchor[2]];
            if(!clear(entry,anchor))continue;
            const path=route(exit,entry);if(!path)continue;
            connection=compact([p,outside,...path,anchor]);break;
          }
          if(connection)break;
        }
      }
      if(!connection)throw Error(`Raccord du tuyau Wide Open ${zone.index+1} introuvable (seed ${layout.seed})`);
      paths.push(connection);links.push({zone:zone.id,port:end===0?'start':'end',pos:p,path:paths.length-1});
    }
    paths.push(local);connections.push(...links);connectedZones.push(zone.id);
    visits.push({label:`Raccord Wide Open ${zone.index+1}`,pos:links[0].pos});
  }
  // Grow towards actual zones, not just random points that may all lie in blocked sectors.
  const coverageBounds=[...layout.zones.map(z=>[z.x*32,0,z.z*32,z.width*32,world.height,z.depth*32]),
    ...(layout.buildingLong||[]).map(z=>z.box),...(layout.wideAreas||[]).map(z=>z.box),
    ...(layout.snakes||[]).flatMap(s=>s.volumes.filter((_,i)=>i%3===0))];
  const proximity=box=>Math.min(...paths.flatMap(path=>path.slice(1).map((b,i)=>{
    const a=path[i];
    return Math.hypot(...[0,1,2].map(j=>Math.max(0,
      box[j]-Math.max(a[j],b[j]),Math.min(a[j],b[j])-box[j]-box[j+3])));
  })));
  const pending=coverageBounds.map((box,id)=>({box,id}));
  const uncovered=[];
  while(pending.length) {
    pending.sort((a,b)=>proximity(b.box)-proximity(a.box));
    const {box,id}=pending.shift();
    if(proximity(box)<=180)continue;
    let added=false;
    for(const y of [96,176,248,32,120,208,288]) {
      if(added)break;
      const [x,,z,sx,,sz]=box;
      const targets=[[x-112,y,Math.round(z+sz/2)],[x+sx+112,y,Math.round(z+sz/2)],
        [Math.round(x+sx/2),y,z-112],[Math.round(x+sx/2),y,z+sz+112]];
      for(const target of targets) {
        if(!clear(target,target))continue;
        const options=anchors(target).filter(p=>clear(p,[p[0],y,p[2]])).slice(0,12);
        for(const anchor of options) {
          const entry=[anchor[0],y,anchor[2]],outward=route(entry,target);
          if(!outward)continue;
          let path=compact([anchor,...outward]);
          // Close a loop when possible; a connected branch still provides coverage otherwise.
          for(const other of options.filter(p=>distance(p,anchor)>400).slice(0,3)) {
            const back=route(target,[other[0],y,other[2]]);
            if(back){path=compact([...path,...back,other]);break;}
          }
          paths.push(path);branches.push({coverage:id,y,path:paths.length-1});
          visits.push({label:`Branche ${branches.length}`,pos:target});added=true;break;
        }
        if(added)break;
      }
    }
    if(!added)uncovered.push(id);
  }
  const volumes=paths.flatMap(path=>path.slice(1).map((b,i)=>{
    const box=volume(path[i],b),min=box.slice(0,3).map(n=>Math.max(0,n));
    return [...min,...min.map((n,j)=>Math.min(limits[j],box[j]+box[j+3])-n)];
  }));
  return {...trunk,paths,volumes,branches,connections,connectedZones,visits,uncovered};
}
