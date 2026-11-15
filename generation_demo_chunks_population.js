import {skinJobs,runSkinTask,skinRunBoxes} from './generation_demo_chunks_skin.js';
import { mergeBoxes, subtract } from './generation_demo_generator.js';
import { growDense } from './generation_demo_chunks_growth.js';
import { localTunnelNetwork } from './generation_demo_chunks_network.js';
import {optimizeMainTunnelPaths,mainTunnelClearance} from './generation_demo_chunks_tunnel_paths.js';
import { snakeAccessPlans } from './generation_demo_chunks_snake_ports.js';
import {prepareGalleries,galleryMeshes,MAIN_TUNNEL_MIN_LENGTH} from './generation_demo_chunks_galleries.js';
import {addCavityCrossBridges} from './generation_demo_chunks_cross_bridges.js';
import {NOISE_DENSE_RULES} from './generation_dense_rules.js';

export const DENSE_ROOM_COUNT = 54;
export const DENSE_ROOMS_PER_SECTOR = 11;
export const NETWORK_FLOOR = 8;
const normals = { north: [0,-1], south: [0,1], west: [-1,0], east: [1,0] };
const contains = (b,x,y,z) => x>=b[0] && x<b[0]+b[3] && y>=b[1] && y<b[1]+b[4] && z>=b[2] && z<b[2]+b[5];

function transform(box, side, zone, offset,shiftY=30,mirrorLength=null) {
  let [x,y,z,sx,sy,sz,kind] = box;
  if(mirrorLength!==null)x=mirrorLength-x-sx;
  const bx = zone.x*32, bz = zone.z*32;
  if (side==='north') return [bx+offset+x,y+shiftY,bz+z,sx,sy,sz,kind];
  if (side==='south') return [bx+offset+x,y+shiftY,bz+zone.depth*32-z-sz,sx,sy,sz,kind];
  if (side==='west') return [bx+z,y+shiftY,bz+offset+x,sz,sy,sx,kind];
  return [bx+zone.width*32-z-sz,y+shiftY,bz+offset+x,sz,sy,sx,kind];
}

function stripsFor(length) {
  const lengths=[];
  while (length>256) { const next = length-256<64 ? 224 : 256; lengths.push(next); length-=next; }
  lengths.push(length);
  return lengths;
}

function* populationSteps(layout, templates, count = DENSE_ROOM_COUNT, diagnostics = false, density = null, progress = ()=>{}) {
  if(layout.mapType==='noise')layout={...NOISE_DENSE_RULES,...layout};
  const S=layout.world.length, D=layout.world.width, GRID=Math.floor(S/32);
  const key=(x,y,z)=>(y*D+z)*S+x;
  const cell=(x,z)=>Math.floor(z/32)*GRID+Math.floor(x/32);
  const center=id=>[(id%GRID)*32+16,Math.floor(id/GRID)*32+16];
  let state = (layout.seed ^ 0x44454e53) >>> 0;
  const integer = (a,b) => {
    state = (Math.imul(state,1664525)+1013904223)>>>0;
    return a + Math.floor(state/4294967296*(b-a+1));
  };
  const houses=[], ports=[], wallGroups=[];
  const crossingObstacles=[...(layout.snakes||[]).flatMap(s=>s.volumes),
    ...(layout.globalPipe?.volumes||[])];
  const prepared = Object.fromEntries(Object.entries(templates.strips).map(([length,t]) => [length,
    mergeBoxes(t.runs.filter(r=>r.kind!=='rear_door').map(r=>[...r.pos,...r.size,r.kind]))]));
  for (const zone of layout.zones) {
    const boxes=[], localHouses=[];
    if(zone.type==='bridge_zone') {
      const index=layout.zones.filter(z=>z.type==='bridge_zone').indexOf(zone);
      const model=templates.bridges[index%templates.bridges.length];
      wallGroups.push({zone:zone.id,walls:[],boxes:model.runs.map(r=>zone.rotated?[
        zone.x*32+320-r.pos[2]-r.size[2],r.pos[1],zone.z*32+r.pos[0],
        r.size[2],r.size[1],r.size[0],`zone_${r.kind}`]:[
        r.pos[0]+zone.x*32,r.pos[1],r.pos[2]+zone.z*32,...r.size,`zone_${r.kind}`])});
      continue;
    }
    for (const side of Object.keys(normals)) {
      const length = (side==='north'||side==='south' ? zone.width : zone.depth)*32;
      let offset=length===64?0:16;
      for (const size of stripsFor(length-offset*2)) {
        const strip=templates.strips[size];
        const bands=layout.wallHouseBands||[null];
        for(const [bandIndex,band] of bands.entries()) {
          const stripHeight=strip.height||240;
          const ceiling=Math.max(0,layout.world.height-stripHeight);
          const minShift=band===null?Math.min(16,ceiling):Math.min(band,ceiling);
          // Keep the whole template below the next band, including its random offset.
          const nextBand=bands[bandIndex+1]??layout.world.height;
          const maxShift=band===null?ceiling:Math.min(band+24,ceiling,nextBand-stripHeight);
          const shiftY=integer(minShift,maxShift),mirror=integer(0,1)?size:null;
          for (const box of prepared[size]) boxes.push(transform(box,side,zone,offset,shiftY,mirror));
          for (const h of strip.houses) {
            const house={id:houses.length,zone:zone.id,side,box:transform(h.box,side,zone,offset,shiftY,mirror).slice(0,6)};
            houses.push(house); localHouses.push(house);
            if (h.rear_door) {
              const door=transform([...h.rear_door.pos,1,2,1],side,zone,offset,shiftY,mirror).slice(0,3);
              ports.push({id:ports.length,house:house.id,zone:zone.id,side,door});
            }
          }
        }
        offset+=size;
      }
    }
    let walls = [
      [zone.x*32,0,zone.z*32,zone.width*32,layout.world.height,1,'wall'],
      [zone.x*32,0,(zone.z+zone.depth)*32-1,zone.width*32,layout.world.height,1,'wall'],
      [zone.x*32,0,zone.z*32+1,1,layout.world.height,zone.depth*32-2,'wall'],
      [(zone.x+zone.width)*32-1,0,zone.z*32+1,1,layout.world.height,zone.depth*32-2,'wall'],
    ];
    for (const house of localHouses) walls=walls.flatMap(w=>subtract(w,house.box));
    const crossBridges=addCavityCrossBridges(zone,localHouses,boxes,layout.seed,
      crossingObstacles);
    wallGroups.push({zone:zone.id,boxes,walls,crossBridges});
  }

  // Sparse solid stone is implicit. Only excavated room/tunnel air and its boundary are stored.
  const air=new Set(), brickShell=new Set(), ladders=new Map(), shafts=new Map(), routes=[];
  const houseIndex=new Map();
  for (const h of houses) {
    const b=h.box;
    for(let x=Math.floor(b[0]/64);x<=Math.floor((b[0]+b[3]-1)/64);x++)
      for(let y=Math.floor(b[1]/64);y<=Math.floor((b[1]+b[4]-1)/64);y++)
        for(let z=Math.floor(b[2]/64);z<=Math.floor((b[2]+b[5]-1)/64);z++) {
          const k=`${x},${y},${z}`;
          if(!houseIndex.has(k))houseIndex.set(k,[]);
          houseIndex.get(k).push(h);
        }
  }
  const atHouse=(x,y,z)=>houseIndex.get(`${Math.floor(x/64)},${Math.floor(y/64)},${Math.floor(z/64)}`)?.find(h=>contains(h.box,x,y,z));
  const addAir=(x,y,z)=>{
    if(x<1||z<1||x>=S-1||z>=D-1||y<1||y>=layout.world.height-1)throw Error('Excavation outside world');
    air.add(key(x,y,z));
  };
  const line=(a,b,floor,owner=null)=>{
    if(a[0]!==b[0] && a[1]!==b[1])throw Error('Non axial tunnel');
    const dx=Math.sign(b[0]-a[0]), dz=Math.sign(b[1]-a[1]);
    const n=Math.abs(b[0]-a[0])+Math.abs(b[1]-a[1]);
    for(let i=0;i<=n;i++) for(let dy=1;dy<=2;dy++) {
      const x=a[0]+dx*i,z=a[1]+dz*i,y=floor+dy;
      const h=atHouse(x,y,z);
      if(h && h.id!==owner)throw Error(`Tunnel intersects unrelated wall house at ${x},${y},${z} (owner ${owner}: ${houses[owner]?.box}, house ${h.id}: ${h.box})`);
      addAir(x,y,z);
    }
    routes.push({a:[a[0],floor,a[1]],b:[b[0],floor,b[1]]});
  };
  const polyline=(points,floor,owner,main=false)=>{
    const start=routes.length;
    for(let i=1;i<points.length;i++)line(points[i-1],points[i],floor,owner);
    const length=points.slice(1).reduce((n,p,i)=>n+Math.abs(p[0]-points[i][0])+Math.abs(p[1]-points[i][1]),0);
    if(main||length>MAIN_TUNNEL_MIN_LENGTH)for(let i=start;i<routes.length;i++)routes[i].main=true;
  };
  const shaftFor=(x,z,top)=>{
    const id=cell(x,z);
    const shaft=shafts.get(id)||{id,x,z,top:NETWORK_FLOOR,bottom:top,ports:[]};
    shaft.top=Math.max(shaft.top,top);shaft.bottom=Math.min(shaft.bottom,top); shafts.set(id,shaft);
    return shaft;
  };
  const access=(door,side,shaft,owner)=>{
    const [x,y,z]=door, floor=y-1, sx=shaft.x, sz=shaft.z;
    let points;
    // Every upper landing approaches from the north, leaving the ladder's south backing intact.
    if(side==='north') points=[[x,z],[x,sz+8],[sx+4,sz+8],[sx+4,sz-3],[sx,sz-3],[sx,sz]];
    else if(side==='south') points=[[x,z],[x,sz-8],[sx,sz-8],[sx,sz]];
    else {
      const lane=sx+(side==='west'?8:-8);
      points=[[x,z],[lane,z],[lane,sz-3],[sx,sz-3],[sx,sz]];
    }
    polyline(points,floor,owner);
  };
  for (const port of ports) {
    const zone=layout.zones[port.zone], [x,y,z]=port.door;
    let sx=Math.floor(x/32)*32+16, sz=Math.floor(z/32)*32+16;
    if(port.side==='north')sz=zone.z*32-48;
    if(port.side==='south')sz=(zone.z+zone.depth)*32+48;
    if(port.side==='west')sx=zone.x*32-48;
    if(port.side==='east')sx=(zone.x+zone.width)*32+48;
    const shaft=shaftFor(sx,sz,y-1);
    shaft.ports.push(port.id); port.shaft=shaft.id;
    access(port.door,port.side,shaft,port.house);
    const [nx,nz]=normals[port.side];
    line([x,z],[x-nx,z-nz],y-1,port.house);
  }
  const snakeEntries=new Set();
  if(layout.snakes?.length||layout.buildingLong?.length||layout.settlements?.some(z=>z.ports?.length)||layout.wideAreas?.some(z=>z.ports?.length))for(const plan of snakeAccessPlans(layout,houses,shafts.values(),routes)) {
    const [x,y,z]=plan.door,[nx,,nz]=plan.normal;
    const shaft=shaftFor(plan.x,plan.z,y-1);
    const side=nx<0?'west':nx>0?'east':nz<0?'north':'south';
    const port={id:ports.length,snake:plan.snake,buildingLong:plan.buildingLong,bridgePort:plan.bridgePort,
      village:plan.village,ultraDense:plan.ultraDense,sourceDoor:plan.sourceDoor,
      trail:plan.trail,end:plan.end,room:plan.room,side,door:plan.door,shaft:shaft.id,access:plan.points};
    ports.push(port);shaft.ports.push(port.id);
    polyline(plan.points,y-1,undefined,true);
    // Existing room floors and walls close the neck; do not rebuild them inside the room.
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(dx*nx+dz*nz<=(plan.buildingLong===undefined?0:-1))
      for(let dy=-1;dy<=2;dy++)snakeEntries.add(key(x+dx,y+dy,z+dz));
  }

  const blocked=new Uint8Array(GRID*GRID);
  if(layout.isSolidBox)for(let id=0;id<blocked.length;id++) {
    const [x,z]=center(id);if(!layout.isSolidBox([x-16,0,z-16,32,layout.world.height,32]))blocked[id]=1;
  }
  for(const zone of layout.zones) for(let z=zone.z;z<zone.z+zone.depth;z++)
    blocked.fill(1,z*GRID+zone.x,z*GRID+zone.x+zone.width);
  const denseRooms=[], usedRoomCells=new Set();
  const denseBoxes=[], denseIndex=new Map();
  const atDense=(x,y,z)=>denseIndex.get(cell(x,z))?.some(b=>contains(b,x,y,z));
  const denseSizes=layout.denseSizes||templates.denseSize;
  const [minSize,maxSize,minHeight,maxHeight]=denseSizes;
  const available=id=>{
    const gx=id%GRID,gz=Math.floor(id/GRID);
    return gx>=2&&gx<GRID-2&&gz>=2&&gz<GRID-2 &&
      ![id,id-GRID,id+GRID,id-1,id+1,id-2*GRID,id-GRID-1,id-GRID+1]
        .some(k=>blocked[k]||shafts.has(k)||usedRoomCells.has(k));
  };
  const jobs=[];
  if(density!==null) {
    if(!Number.isInteger(density)||density<1||density>20)throw Error('Density must be between 1 and 20');
    count=Math.round(blocked.reduce((n,value)=>n+(value===0),0)*density/16);
  } else {
    for(let attempt=0;attempt<20000&&jobs.length<count;attempt++) {
      const id=integer(2,GRID-3)*GRID+integer(2,GRID-3);
      if(!available(id))continue;
      usedRoomCells.add(id);usedRoomCells.add(id-GRID);
      jobs.push({id,floor:[32,128,224][jobs.length%3]});
    }
  }
  for(const {id,floor} of jobs) {
    const footprint=layout.denseFootprints?.[integer(0,layout.denseFootprints.length-1)];
    const [cx,cz]=center(id),sx=footprint?.[0]??integer(minSize,maxSize),
      sz=footprint?.[1]??integer(minSize,maxSize),sy=integer(minHeight,maxHeight);
    const box=[cx-Math.floor(sx/2),floor,cz-Math.floor(sz/2),sx,sy,sz];
    const room={id:denseRooms.length,box,door:[cx,floor+1,box[2]]};
    denseRooms.push(room); usedRoomCells.add(id);
    if(!denseIndex.has(id))denseIndex.set(id,[]);
    denseIndex.get(id).push(box);
    if(diagnostics)for(let x=box[0];x<box[0]+sx;x++)for(let y=floor;y<floor+sy;y++)for(let z=box[2];z<box[2]+sz;z++) {
      if(x===box[0]||x===box[0]+sx-1||y===floor||y===floor+sy-1||z===box[2]||z===box[2]+sz-1)brickShell.add(key(x,y,z));
      else addAir(x,y,z);
    }
    else {
      const [x,y,z]=box;
      const shell=[
        [x,y,z,sx,1,sz,'dense'],[x,y+sy-1,z,sx,1,sz,'dense'],
        [x,y+1,z,sx,sy-2,1,'dense'],[x,y+1,z+sz-1,sx,sy-2,1,'dense'],
        [x,y+1,z+1,1,sy-2,sz-2,'dense'],[x+sx-1,y+1,z+1,1,sy-2,sz-2,'dense'],
      ];
      denseBoxes.push(...shell.flatMap(b=>subtract(b,[...room.door,1,2,1])));
    }
    const shaft=shaftFor(cx,cz-32,floor); room.shaft=shaft.id;
    access(room.door,'north',shaft,null);
  }
  if(density===null&&denseRooms.length!==count)throw Error('Not enough space for dense rooms');

  // Route a single connected underground tree around the cavities, never across them.
  const g=density===null?GRID:Math.floor(S/16);
  const graphBlocked=density===null?blocked:new Uint8Array(g*g);
  const graphCenter=id=>density===null?center(id):[(id%g)*16,Math.floor(id/g)*16];
  if(layout.isSolidBox)for(let id=0;id<graphBlocked.length;id++) {
    const [x,z]=graphCenter(id);if(!layout.isSolidBox([x-12,0,z-12,25,layout.world.height,25]))graphBlocked[id]=1;
  }
  if(density!==null) {
    for(let i=0;i<g;i++){graphBlocked[i]=1;graphBlocked[i*g]=1;}
    for(const zone of layout.zones)
      for(let z=Math.ceil((zone.z*32-24)/16);z<=Math.floor(((zone.z+zone.depth)*32+24)/16);z++)
        graphBlocked.fill(1,z*g+Math.ceil((zone.x*32-24)/16),z*g+Math.floor(((zone.x+zone.width)*32+24)/16)+1);
  }
  for(const shaft of shafts.values()) {
    shaft.node=density===null?shaft.id:shaft.z/16*g+shaft.x/16;
    graphBlocked[shaft.node]=1;
  }
  const neighbours=id=>{
    const result=[],x=id%g,z=Math.floor(id/g);
    if(x>0)result.push(id-1); if(x<g-1)result.push(id+1);
    if(z>0)result.push(id-g); if(z<g-1)result.push(id+g);
    return result;
  };
  const terminals=[];
  for(const shaft of shafts.values()) {
    const candidates=[shaft.node-g,shaft.node-1,shaft.node+1,...(density!==null?[shaft.node+g]:[])];
    const terminal=candidates.find(id=>id>=0&&id<graphBlocked.length&&!graphBlocked[id]&&neighbours(shaft.node).includes(id));
    if(terminal===undefined)throw Error('Ladder has no free lower entrance');
    terminals.push(terminal); shaft.terminal=terminal;
  }
  const localNetwork=density===null?null:localTunnelNetwork(g,graphBlocked,terminals,layout.seed,!!layout.isSolidBox);
  const visited=new Uint8Array(graphBlocked.length),parent=localNetwork?.parents||new Int32Array(graphBlocked.length).fill(-1);
  const queue=new Int32Array(graphBlocked.length);
  let head=0,tail=0;
  queue[tail++]=terminals[0];visited[terminals[0]]=1;
  if(localNetwork) {
    queue.set(localNetwork.order);tail=localNetwork.order.length;
    for(const node of localNetwork.order)visited[node]=1;
  }
  while(!localNetwork&&head<tail) {
    const id=queue[head++];
    for(const next of neighbours(id))if(!graphBlocked[next]&&!visited[next]) {
      visited[next]=1;parent[next]=id;queue[tail++]=next;
    }
  }
  const tree=new Set(localNetwork?.roots||[terminals[0]]),edges=[];
  const heights=new Int16Array(graphBlocked.length).fill(NETWORK_FLOOR);
  let caps;
  if(density!==null) {
    // Persistent climbs/descents explore the volume instead of drifting around one floor.
    const directions=new Int8Array(graphBlocked.length);
    heights[queue[0]]=integer(12,layout.world.height-20);
    directions[queue[0]]=integer(0,1)?1:-1;
    for(let i=1;i<tail;i++) {
      const node=queue[i],previous=parent[node];
      if(previous<0){heights[node]=integer(12,layout.world.height-20);directions[node]=integer(0,1)?1:-1;continue;}
      let direction=directions[previous];
      if(integer(0,39)===0)direction=-direction;
      const step=integer(3,6);
      let y=heights[previous]+direction*step;
      if(y<8||y>layout.world.height-16){direction=-direction;y=heights[previous]+direction*step;}
      heights[node]=y;directions[node]=direction;
    }
    if(routes.length||layout.snakes?.length||layout.buildingLong?.length||layout.wideAreas?.length||layout.settlements?.length||layout.globalPipe) {
      // Approach snakes gradually from below, rather than treating them as full-height walls.
      caps=new Int16Array(g*g).fill(layout.world.height-16);
      const levels=Array.from({length:layout.world.height-15},()=>[]);
      const overhead=[...(layout.snakes||[]).flatMap(s=>s.volumes),...(layout.buildingLong||[]).map(z=>z.box),
        ...(layout.wideAreas||[]).map(z=>z.box),...(layout.settlements||[]).flatMap(z=>[z.box,...(z.accessVolumes||[])]),
        ...(layout.globalPipe?.volumes||[])];
      // Reserve the full height of existing entrance galleries, including their floors.
      // The general cap subtracts six blocks; lowering this bound by two leaves eight.
      for(const {a,b} of routes)overhead.push([Math.min(a[0],b[0])-3,a[1]-2,Math.min(a[2],b[2])-3,
        Math.abs(a[0]-b[0])+7,8,Math.abs(a[2]-b[2])+7]);
      for(const port of ports)if(port.snake!==undefined||port.buildingLong!==undefined||port.village!==undefined||port.ultraDense!==undefined)for(let i=1;i<port.access.length;i++) {
        const a=port.access[i-1],b=port.access[i];
        overhead.push([Math.min(a[0],b[0])-1,port.door[1]-1,Math.min(a[1],b[1])-1,
          Math.abs(a[0]-b[0])+3,4,Math.abs(a[1]-b[1])+3]);
      }
      for(const [x,y,z,sx,,sz] of overhead)
        for(let gz=Math.max(0,Math.floor((z-32)/16));gz<=Math.min(g-1,Math.ceil((z+sz+32)/16));gz++)
          for(let gx=Math.max(0,Math.floor((x-32)/16));gx<=Math.min(g-1,Math.ceil((x+sx+32)/16));gx++) {
            const node=gz*g+gx,cap=y-6;
            if(cap<caps[node]){caps[node]=cap;levels[cap].push(node);}
          }
      for(let cap=0;cap<layout.world.height-18;cap++)for(const node of levels[cap]) {
        if(caps[node]!==cap)continue;
        for(const next of neighbours(node))if(caps[next]>cap+3){caps[next]=cap+3;levels[cap+3].push(next);}
      }
      for(const node of localNetwork.order)heights[node]=Math.min(heights[node],caps[node]);
    }
  }
  const points=new Map();
  const point=id=>{
    if(!points.has(id)) {
      const [x,z]=graphCenter(id);
      // Grid neighbours share an axis; jitter creates useless one-block doglegs.
      points.set(id,[x,z]);
    }
    return points.get(id);
  };
  const stairs=(a,b,ya,yb)=>{
    const middle=[b[0],a[1]],path=[];
    for(const [p,q] of [[a,middle],[middle,b]]) {
      const n=Math.abs(q[0]-p[0])+Math.abs(q[1]-p[1]);
      for(let i=0;i<n;i++)path.push([p[0]+Math.sign(q[0]-p[0])*i,p[1]+Math.sign(q[1]-p[1])*i]);
    }
    path.push(b);
    let run;
    const hold=Math.max(0,Math.min(4,Math.floor((path.length-1-Math.abs(yb-ya))/2)));
    for(let i=0;i<path.length;i++) {
      const progress=Math.max(0,Math.min(1,(i-hold)/Math.max(1,path.length-1-2*hold)));
      const y=ya+Math.round((yb-ya)*progress),[x,z]=path[i];
      for(let h=1;h<=3;h++)addAir(x,y+h,z);
      const p=[x,y,z];
      if(run&&run.a[1]===y&&(run.a[0]===x||run.a[2]===z))run.b=p;
      else {
        const neighbor=path[i+1]||path[i-1]||path[i];
        run={a:p,b:p,axis:neighbor[0]!==x?0:2};routes.push(run);
      }
    }
  };
  for(const terminal of terminals) {
    if(!visited[terminal])throw Error('Underground network is disconnected');
    let id=terminal;
    while(!tree.has(id)) {
      const next=parent[id];
      edges.push([id,next]);
      tree.add(id);id=next;
    }
  }
  const clearMain=mainTunnelClearance([...(layout.snakes||[]).flatMap(s=>s.volumes),
    ...[...(layout.buildingLong||[]),...(layout.wideAreas||[]),...(layout.settlements||[])]
      .flatMap(z=>[z.box,...(z.accessVolumes||[])]),...(layout.globalPipe?.volumes||[]),
    ...houses.map(h=>h.box),...routes.map(({a,b})=>[Math.min(a[0],b[0])-3,a[1],Math.min(a[2],b[2])-3,
      Math.abs(a[0]-b[0])+7,8,Math.abs(a[2]-b[2])+7])]);
  const mainTunnelPaths=density===null?[]:optimizeMainTunnelPaths({size:g,blocked:graphBlocked,
    edges,terminals,heights,caps,clear:clearMain});
  const mainStart=routes.length;
  if(density===null)for(const [a,b] of edges)line(center(a),center(b),NETWORK_FLOOR);
  else for(const {points} of mainTunnelPaths)for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i];stairs([a[0],a[2]],[b[0],b[2]],a[1],b[1]);
  }
  for(let i=mainStart;i<routes.length;i++)routes[i].main=true;

  for(const shaft of shafts.values()) {
    const floor=heights[shaft.terminal],p=point(shaft.terminal);
    // Keep the final approach north/east/west of the shaft, never through its backing.
    const c=graphCenter(shaft.terminal);
    const landing=c[1]>shaft.z&&c[0]===shaft.x?
      [[shaft.x+4,c[1]],[shaft.x+4,shaft.z-3],[shaft.x,shaft.z-3]]:[];
    polyline([p,[c[0],p[1]],c,...landing,[shaft.x,shaft.z]],floor,undefined,true);
    shaft.bottom=density===null?NETWORK_FLOOR:Math.min(shaft.bottom,floor);
    shaft.top=Math.max(shaft.top,floor);
    for(let y=shaft.bottom+1;y<=shaft.top+2;y++) {
      if(atHouse(shaft.x,y,shaft.z))throw Error('Ladder intersects wall house');
      addAir(shaft.x,y,shaft.z);
    }
    ladders.set(shaft.id,[shaft.x,shaft.bottom+1,shaft.z,1,shaft.top-shaft.bottom,1,'ladder']);
  }
  let growthConnections=[];
  const galleries=prepareGalleries(layout,houses,[...shafts.values()],routes);
  if(density!==null) {
    const growth=growDense({layout,houses,shafts:[...shafts.values()],routes,galleries,target:count,integer,addAir,sizes:denseSizes});
    denseRooms.push(...growth.rooms);growthConnections=growth.connections;
    for(const room of denseRooms) {
      const [x,y,z,sx,sy,sz]=room.box;
      for(let gx=Math.floor(x/32);gx<=Math.floor((x+sx-1)/32);gx++)
        for(let gz=Math.floor(z/32);gz<=Math.floor((z+sz-1)/32);gz++) {
          const id=gz*GRID+gx;if(!denseIndex.has(id))denseIndex.set(id,[]);denseIndex.get(id).push(room.box);
        }
      let shell=[
        [x,y,z,sx,1,sz,'dense'],[x,y+sy-1,z,sx,1,sz,'dense'],
        [x,y+1,z,sx,sy-2,1,'dense'],[x,y+1,z+sz-1,sx,sy-2,1,'dense'],
        [x,y+1,z+1,1,sy-2,sz-2,'dense'],[x+sx-1,y+1,z+1,1,sy-2,sz-2,'dense'],
      ];
      for(const door of room.doors)shell=shell.flatMap(b=>subtract(b,[...door,1,2,1]));
      denseBoxes.push(...shell);
    }
  }

  // Skin calculations share no mutable growth state and run independently by spatial tile.
  progress('Construction des parois des tunnels...');
  const skinWork=skinJobs({air,brickShell,snakeEntries,houses,denseRooms,galleries,
    shafts:[...shafts.values()],world:layout.world,diagnostics,skipDense:diagnostics&&density===null});
  const skin=yield skinWork;
  const solid=diagnostics?new Map():null;
  if(diagnostics)for(const part of skin){for(const k of part.tunnel)solid.set(k,'tunnel');for(const k of part.dense)solid.set(k,'dense');}
  for(const shaft of shafts.values())for(let y=shaft.bottom+1;y<=shaft.top;y++)
    if(air.has(key(shaft.x,y,shaft.z+1)))throw Error('Missing ladder backing');
  const mainBoxes=galleryMeshes(galleries,routes,growthConnections);
  const networkBoxes=mergeBoxes(skinRunBoxes(skin,layout.world)).concat(denseBoxes,mainBoxes);
  const buildingConnections=ports.filter(p=>p.buildingLong!==undefined).length;
  const result={...layout,houses,ports,wallGroups,denseRooms,shafts:[...shafts.values()],
    networkBoxes,ladderBoxes:[...ladders.values()],routes,edges,mainTunnelPaths,growthConnections,
    mainGalleries:{interiors:galleries.inner,sections:galleries.outer.length},
    stone:{block:'minecraft:stone',implicit:true},density,
    stats:{wallHouses:houses.length,denseRooms:denseRooms.length,orangeDoors:ports.length-buildingConnections,
      ultraDenseConnections:ports.filter(p=>p.ultraDense!==undefined).length,
      waterRooms:(layout.settlements||[]).filter(z=>z.type==='water').length,
      villages:(layout.settlements||[]).filter(z=>z.type==='village').length,
      villageConnections:ports.filter(p=>p.village!==undefined).length,
      connectedDense:denseRooms.length,connectedDoors:ports.length-buildingConnections,buildingConnections,components:localNetwork?.roots.length||1,excavatedCells:air.size}};
  if(diagnostics)Object.assign(result,{air,solid});
  return result;
}

// Preserve the synchronous API used by exports and existing tests.
export function populateChunkCore(...args) {
  const steps=populationSteps(...args);let step=steps.next();
  while(!step.done)step=steps.next(step.value.map(runSkinTask));
  return step.value;
}

export async function populateChunkCoreParallel(pool,...args) {
  const steps=populationSteps(...args);let step=steps.next();
  while(!step.done) {
    const total=step.value.length,progress=args[5]||(()=>{});let completed=0,last=0;
    const report=()=>{
      const longest=Math.max(0,...[...pool.jobs.values()].map(j=>(performance.now()-j.started)/1000));
      progress(`Parois : ${completed}/${total} tuiles · ${pool.size} workers · tache en cours ${Math.floor(longest)} s...`);
    };
    report();const heartbeat=setInterval(report,2000);let results;
    try {
      results=await Promise.all(step.value.map(job=>pool.run('skin',job,[job.air.buffer]).then(result=>{
        completed++;if(performance.now()-last>250||completed===total){last=performance.now();report();}
        return result;
      })));
    }finally{clearInterval(heartbeat);}
    step=steps.next(results);
  }
  return step.value;
}
