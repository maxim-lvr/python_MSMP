import { generateSnake, HEIGHT } from './house_tunnel_snake_generator.js';
import { localTunnelNetwork } from './generation_demo_chunks_network.js';
import { mergeBoxes } from './generation_demo_generator.js';

export const SNAKE_COUNT = 4;
export const SNAKE_BRIDGES_PER_1000 = 10;
const STEP = 80, OFFSET = 100, SIZE = 61;
const overlap = (a,b) => [0,1,2].every(i=>a[i]<b[i]+b[i+3]&&a[i]+a[i+3]>b[i]);
const point = id => ({x:OFFSET+(id%SIZE)*STEP,z:OFFSET+Math.floor(id/SIZE)*STEP});
const envelope = (a,b,y,margin=18) => [Math.min(a.x,b.x)-margin,y,Math.min(a.z,b.z)-margin,
  Math.abs(a.x-b.x)+2*margin,HEIGHT,Math.abs(a.z-b.z)+2*margin];

function connectedEndpoints(blocked) {
  const visited=new Uint8Array(blocked.length),pairs=[];
  for(let start=0;start<blocked.length;start++)if(!blocked[start]&&!visited[start]) {
    const nodes=[start];visited[start]=1;
    for(let i=0;i<nodes.length;i++) {
      const n=nodes[i],x=n%SIZE,z=Math.floor(n/SIZE);
      for(const next of [x>0?n-1:-1,x<SIZE-1?n+1:-1,z>0?n-SIZE:-1,z<SIZE-1?n+SIZE:-1])
        if(next>=0&&!blocked[next]&&!visited[next]){visited[next]=1;nodes.push(next);}
    }
    // Extremes in four directions find long traversals inside the same free component.
    for(const [dx,dz] of [[1,0],[0,1],[1,1],[1,-1]]) {
      const score=n=>(n%SIZE)*dx+Math.floor(n/SIZE)*dz;
      let a=start,b=start;
      for(const n of nodes){if(score(n)<score(a))a=n;if(score(n)>score(b))b=n;}
      const span=Math.abs(a%SIZE-b%SIZE)+Math.abs(Math.floor(a/SIZE)-Math.floor(b/SIZE));
      if(span*STEP>=2400)pairs.push({start:a,end:b,span});
    }
  }
  return pairs.sort((a,b)=>b.span-a.span);
}

export function generateDemoSnakes(layout) {
  let state=(layout.seed^0x534e414b)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  // Leave room around cavity houses, rear doors and their ladder approaches.
  const obstacles=layout.zones.map(z=>[z.x*32-100,0,z.z*32-100,z.width*32+200,300,z.depth*32+200]);
  for(const {box:[x,,z,sx,,sz]} of layout.buildingLong||[])obstacles.push([x-100,0,z-100,sx+200,300,sz+200]);
  for(const {box:[x,,z,sx,,sz]} of layout.wideAreas||[])obstacles.push([x-100,0,z-100,sx+200,300,sz+200]);
  const snakes=[];
  for(let id=0;id<SNAKE_COUNT;id++) {
    const y=12+id*70+integer(0,12),seed=integer(0,0xffffffff);
    const blocked=new Uint8Array(SIZE*SIZE);
    for(let node=0;node<blocked.length;node++) {
      const p=point(node);
      // Inflate by half a routing cell so entire edges, not only nodes, stay clear.
      const margin=STEP/2+20,area=[p.x-margin,0,p.z-margin,margin*2,300,margin*2];
      if(obstacles.some(b=>overlap(area,b)))blocked[node]=1;
    }
    let route, fallback=[];
    for(let attempt=0;!route;attempt++) {
      let start,end;
      if(attempt<80) {
        const rowA=integer(1,SIZE-2),rowB=integer(1,SIZE-2);
        start=rowA*SIZE+integer(0,3);end=rowB*SIZE+integer(SIZE-4,SIZE-1);
      } else {
        if(attempt===80)fallback=connectedEndpoints(blocked);
        const pair=fallback[attempt-80];if(!pair)break;
        ({start,end}=pair);
      }
      if(blocked[start]||blocked[end])continue;
      let network;
      try {network=localTunnelNetwork(SIZE,blocked,[start,end],seed+attempt);} catch {continue;}
      const nodes=[];
      for(let node=end;node!==-1;node=network.parents[node])nodes.push(node);
      nodes.reverse();
      const points=[];
      for(const node of nodes) {
        const p=point(node),a=points.at(-2),b=points.at(-1);
        if(a&&((a.x===b.x&&b.x===p.x)||(a.z===b.z&&b.z===p.z)))points[points.length-1]=p;
        else points.push(p);
      }
      const lengths=points.slice(1).map((p,i)=>Math.abs(p.x-points[i].x)+Math.abs(p.z-points[i].z));
      route={points,lengths};
    }
    if(!route)throw Error(`Impossible de placer le tunnel snake ${id+1}`);
    const length=route.lengths.reduce((a,b)=>a+b,0);
    const model=generateSnake(seed,Math.min(100,Math.round(length/1000*SNAKE_BRIDGES_PER_1000)),route,true);
    const volumes=route.points.slice(1).map((p,i)=>envelope(route.points[i],p,y));
    const boxes=[];
    for(const [kind,items] of Object.entries(model.boxes)) {
      if(kind==='orange')continue;
      for(const [x,by,z,sx,sy,sz] of items)boxes.push([x,by+y,z,sx,sy,sz,`snake_${kind}`]);
    }
    const rearDoors=model.rooms.filter(r=>r.rearDoor).map(r=>({
      room:r.id,pos:[r.rearDoor.pos[0],r.rearDoor.pos[1]+y,r.rearDoor.pos[2]],normal:r.rearDoor.normal,
    }));
    snakes.push({id,seed,y,length,route,volumes,boxes:mergeBoxes(boxes),bridges:model.bridges.length,
      roomCount:model.rooms.length,rearDoors});
    // Different vertical bands keep independent snakes physically separate.
  }
  return snakes;
}
