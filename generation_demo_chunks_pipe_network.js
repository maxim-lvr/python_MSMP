import {zoneVolume} from './generation_vertical.js';
import {localTunnelNetwork} from './generation_demo_chunks_network.js';
import {overlaps} from './generation_demo_generator.js';
import {compactPipePath as compact,validPipePath,validPipeConnection,pointOnPipePaths} from './generation_demo_chunks_pipe_paths.js';

export const PIPE_BRANCH_COUNT = 12;
const STEP=64, MARGIN=10;
const distance=(a,b)=>a.reduce((sum,n,i)=>sum+Math.abs(n-b[i]),0);
const volume=(a,b)=>[...a.map((n,i)=>Math.min(n,b[i])-MARGIN),...a.map((n,i)=>Math.abs(n-b[i])+2*MARGIN+1)];

export function expandPipeNetwork(layout,trunk,progress=()=>{}) {
  let state=(layout.seed^0x4e455450)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const {world}=layout, limits=[world.length,world.height,world.width];
  const obstacles=[...layout.zones.map(z=>({box:zoneVolume(z,world,80)})),
    ...(layout.buildingLong||[]).map(z=>({box:z.box})),...(layout.wideAreas||[]).map(z=>({box:z.box,wide:z.id})),
    ...(layout.settlements||[]).flatMap(z=>[z.box,...(z.accessVolumes||[])].map(box=>({box}))),
    ...(layout.snakes||[]).flatMap(z=>z.volumes.map(box=>({box}))),
    ...(layout.pipeAccessReservations||[]).map(box=>({box}))];
  const obstacleBuckets=new Map();
  const bucketKeys=function*(b) {
    for(let x=Math.floor(b[0]/128);x<=Math.floor((b[0]+b[3]-1)/128);x++)
      for(let z=Math.floor(b[2]/128);z<=Math.floor((b[2]+b[5]-1)/128);z++)yield `${x},${z}`;
  };
  for(const obstacle of obstacles)for(const key of bucketKeys(obstacle.box)) {
    if(!obstacleBuckets.has(key))obstacleBuckets.set(key,[]);
    obstacleBuckets.get(key).push(obstacle);
  }
  const clear=(a,b,owner)=>{
    if(a.some((n,i)=>n<MARGIN||n+MARGIN>=limits[i])||b.some((n,i)=>n<MARGIN||n+MARGIN>=limits[i]))return false;
    const box=volume(a,b),seen=new Set();
    for(const key of bucketKeys(box))for(const o of obstacleBuckets.get(key)||[]) {
      if(seen.has(o))continue;seen.add(o);
      if((owner===undefined||o.wide!==owner)&&overlaps(box,o.box))return false;
    }
    return true;
  };
  const elbow=(a,b,alternative=false)=>{
    const corners=[[a[0],a[1],b[2]],[b[0],a[1],a[2]]];
    if(alternative)corners.reverse();
    for(const c of corners)if(clear(a,c)&&clear(c,b)) {
      const path=compact([a,c,b]);
      if(path.length===1||validPipePath(path))return path;
    }
    return null;
  };
  const size=Math.ceil((Math.max(world.length,world.width)-1)/STEP)+1,grids=new Map();
  const point=(id,y)=>[(id%size)*STEP,y,Math.floor(id/size)*STEP];
  function grid(y) {
    if(grids.has(y))return grids.get(y);
    const blocked=new Uint8Array(size*size),r=STEP/2+MARGIN;
    for(let id=0;id<blocked.length;id++) {
      const p=point(id,y);
      if(p[0]<MARGIN||p[0]+MARGIN>=world.length||p[2]<MARGIN||p[2]+MARGIN>=world.width)blocked[id]=1;
    }
    // Rasterize obstacle rectangles once, instead of testing every grid cell against every obstacle.
    for(const {box:b} of obstacles) {
      if(y-MARGIN>=b[1]+b[4]||y+MARGIN+1<=b[1])continue;
      const x0=Math.max(0,Math.floor((b[0]-r-1)/STEP)+1),x1=Math.min(size-1,Math.ceil((b[0]+b[3]+r)/STEP)-1);
      const z0=Math.max(0,Math.floor((b[2]-r-1)/STEP)+1),z1=Math.min(size-1,Math.ceil((b[2]+b[5]+r)/STEP)-1);
      for(let z=z0;z<=z1;z++)blocked.fill(1,z*size+x0,z*size+x1+1);
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
  function route(a,b,alternative=false,directOnly=false) {
    const direct=elbow(a,b,alternative);if(direct)return direct;
    if(directOnly)return null;
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
      if(distance(short.at(-1),path.at(-1))===0) {
        const result=compact([...start.path,...short,...[...end.path].reverse()]);
        if(validPipePath(result))return result;
      }
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
    progress(`Tuyaux : raccords ${sector+1}/${PIPE_BRANCH_COUNT}...`);
    const y=[32,96,120,176,208,248][sector%6];
    for(let attempt=0;attempt<24;attempt++) {
      const target=[Math.round((sector%4+0.5)*world.length/4)+integer(-260,260),y,
        Math.round((Math.floor(sector/4)+0.5)*world.width/3)+integer(-260,260)];
      if(!clear(target,target))continue;
      const options=anchors(target).filter(p=>clear(p,[p[0],y,p[2]])).slice(0,24);
      let chosen;
      for(const start of options.slice(0,3)) {
        const lowA=[start[0],y,start[2]],first=route(lowA,target,false,true);
        if(!first)continue;
        const ends=options.filter(p=>Math.abs(p[0]-start[0])+Math.abs(p[2]-start[2])>700).slice(0,4);
        for(const end of ends) {
          for(const alternative of [false,true]) {
            const last=route(target,[end[0],y,end[2]],alternative,true);if(!last)continue;
            const path=compact([start,...first,...last,end]);
            if(!pointOnPipePaths(target,[path])||!validPipeConnection(path,paths))continue;
            chosen={path,start,end};break;
          }
          if(chosen)break;
        }
        if(chosen)break;
      }
      if(!chosen)continue;
      paths.push(chosen.path);
      branches.push({sector,y,path:paths.length-1,inlet:chosen.start,outlet:chosen.end});
      visits.push({label:`Branche ${branches.length}`,pos:target});break;
    }
  }

  const connectedZones=[];
  for(const zone of layout.wideAreas||[])if(zone.type==='open'&&zone.pipe?.points.length) {
    progress(`Tuyaux : entree et sortie Wide Open ${zone.index+1}...`);
    const local=zone.pipe.points;
    const links=[];
    for(const end of [0,local.length-1]) {
      const p=local[end],neighbor=local[end===0?1:end-1],normal=p.map((n,i)=>Math.sign(n-neighbor[i]));
      let connection;
      for(const length of [32,64,96,128,160,224]) {
        if(connection)break;
        const outside=p.map((n,i)=>n+normal[i]*length);
        if(!clear(p,outside,zone.id))continue;
        for(const y of [...new Set([world.height-12,p[1],288,208,120,72])]) {
          const exit=[outside[0],y,outside[2]];
          if(!clear(outside,exit))continue;
          for(const anchor of anchors(exit).slice(0,layout.isSolidBox?80:28)) {
            const entry=[anchor[0],y,anchor[2]];
            if(!clear(entry,anchor))continue;
            for(const alternative of [false,true]) {
              const path=route(exit,entry,alternative);if(!path)continue;
              const candidate=compact([p,outside,...path,anchor]);
              if(validPipeConnection(candidate,paths,false)){connection=candidate;break;}
            }
            if(connection)break;
          }
          if(connection)break;
        }
      }
      if(!connection) {
        throw Error(`Raccord du tuyau Wide Open ${zone.index+1} introuvable (seed ${layout.seed})`);
      }
      paths.push(connection);links.push({zone:zone.id,port:end===0?'start':'end',
        role:end===0?'inlet':'outlet',pos:p,networkPos:connection.at(-1),path:paths.length-1});
    }
    if(!links.length)throw Error(`Aucun raccord du tuyau Wide Open ${zone.index+1} (seed ${layout.seed})`);
    paths.push(local);connections.push(...links);connectedZones.push(zone.id);
    visits.push({label:`Raccord Wide Open ${zone.index+1}`,pos:links[0].pos});
  }
  // Grow towards actual zones, not just random points that may all lie in blocked sectors.
  const coverageBounds=[...layout.zones.map(z=>zoneVolume(z,world)),
    ...(layout.buildingLong||[]).map(z=>z.box),...(layout.wideAreas||[]).map(z=>z.box),
    ...(layout.snakes||[]).flatMap(s=>s.volumes.filter((_,i)=>i%3===0))];
  const proximity=(box,source=paths)=>Math.min(...source.flatMap(path=>path.slice(1).map((b,i)=>{
    const a=path[i];
    return Math.hypot(...[0,1,2].map(j=>Math.max(0,
      box[j]-Math.max(a[j],b[j]),Math.min(a[j],b[j])-box[j]-box[j+3])));
  })));
  const pending=coverageBounds.map((box,id)=>({box,id,distance:proximity(box)}));
  const uncovered=[];
  while(pending.length) {
    if(pending.length%25===0)progress(`Tuyaux : desserte des zones, ${pending.length} restantes...`);
    pending.sort((a,b)=>b.distance-a.distance);
    const {box,id,distance:nearest}=pending.shift();
    if(nearest<=180)continue;
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
          const entry=[anchor[0],y,anchor[2]],outward=route(entry,target,false,true);
          if(!outward)continue;
          let chosen;
          // Coverage needs two real connections, never an open stub near a zone.
          for(const other of options.filter(p=>Math.abs(p[0]-anchor[0])+Math.abs(p[2]-anchor[2])>400).slice(0,4)) {
            for(const alternative of [false,true]) {
              const back=route(target,[other[0],y,other[2]],alternative,true);if(!back)continue;
              const path=compact([anchor,...outward,...back,other]);
              if(!pointOnPipePaths(target,[path])||!validPipeConnection(path,paths))continue;
              chosen={path,other};break;
            }
            if(chosen)break;
          }
          if(!chosen)continue;
          const {path,other}=chosen;
          paths.push(path);branches.push({coverage:id,y,path:paths.length-1,inlet:anchor,outlet:other});
          for(const item of pending)item.distance=Math.min(item.distance,proximity(item.box,[path]));
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
  const ports=[
    {role:'inlet',kind:'map',pos:trunk.points[0],pair:'map'},
    {role:'outlet',kind:'map',pos:trunk.points.at(-1),pair:'map'},
    ...connections.map(c=>({...c,kind:'wide',pair:`wide:${c.zone}`})),
  ];
  for(const port of ports)visits.push({label:`${port.role==='inlet'?'Entree':'Sortie'} tuyau ${port.kind==='map'?'map':`Wide Open ${port.zone+1}`}`,pos:port.pos});
  return {...trunk,paths,volumes,branches,connections,connectedZones,visits,ports,uncovered};
}
