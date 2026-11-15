import {zoneVolume} from './generation_vertical.js';
import {mergeBoxes,overlaps,subtract} from './generation_demo_generator.js';
import {pipeNetworkSegments} from './generation_demo_chunks_pipe.js';
import {compactPipePath} from './generation_demo_chunks_pipe_paths.js';

export const PIPE_ACCESS_SECTOR = 512;
export const PIPE_ACCESS_SPACING = 128;
export const PIPE_DOOR_INTERVAL = 192;
export const PIPE_DOOR_SIZE = [1,2,1];
const MAX_REACH = 1536;

function spatial(items=[],size=64) {
  const buckets=new Map();
  function* keys(b) {
    for(let x=Math.floor(b[0]/size);x<=Math.floor((b[0]+b[3]-1)/size);x++)
      for(let y=Math.floor(b[1]/size);y<=Math.floor((b[1]+b[4]-1)/size);y++)
        for(let z=Math.floor(b[2]/size);z<=Math.floor((b[2]+b[5]-1)/size);z++)yield `${x},${y},${z}`;
  }
  const add=item=>{for(const key of keys(item.box)) {
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(item);
  }};
  items.forEach(add);
  return {add,query:box=>{
    const found=new Set();
    for(const key of keys(box))for(const item of buckets.get(key)||[])if(overlaps(box,item.box))found.add(item);
    return [...found];
  }};
}

function pathBounds(points,radius=1,height=4) {
  const low=[0,1,2].map(i=>Math.min(...points.map(p=>p[i])));
  const high=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
  return [low[0]-radius,low[1],low[2]-radius,
    high[0]-low[0]+radius*2+1,high[1]-low[1]+height,high[2]-low[2]+radius*2+1];
}

function cutGeometry(boxes,cuts) {
  return boxes.flatMap(box=>{
    let pieces=[box];
    for(const {box:cut} of cuts.query(box))pieces=pieces.flatMap(piece=>subtract(piece,cut));
    return pieces;
  });
}

function navigation(segments,world) {
  const boxes=[],ladders=[];
  for(const {a,axis,lo,hi} of segments) {
    if(axis===1) {
      const [x,,z]=a,bottom=Math.max(0,lo-3),top=Math.min(world.height-1,hi+1);
      const shaft=[x+2,bottom+1,z+2,1,top-bottom,1];
      boxes.push([x+2,bottom,z+3,1,top-bottom+1,1,'pipe_ladder_support']);
      ladders.push([...shaft,'pipe_ladder']);
      for(const y of [bottom,hi-3]) {
        const landing=[x-2,y,z-2,5,1,5,'pipe_walkway'];
        boxes.push(...subtract(landing,shaft));
      }
    }else {
      const p=[...a],size=[3,1,3];p[1]-=3;p[axis]=lo;size[axis]=hi-lo+1;
      p[axis===0?2:0]--;
      boxes.push([...p,...size,'pipe_walkway']);
    }
  }
  return {boxes:mergeBoxes(boxes),ladders};
}

function candidate(target,segment,along,point,neck=24) {
  const b=target.box,axis=segment.axis,normal=axis===0?2:0;
  const source=segment.a;
  const sign=Math.sign(point[normal]-source[normal])||1;
  const floor=source[1]-3,dy=b[1]-floor;
  const start=[...source];start[axis]=along;start[1]=floor;
  const corner=[...start];corner[normal]+=sign*Math.min(neck,Math.max(16,Math.abs(point[normal]-start[normal])));
  const last=[...corner];last[axis]=point[axis];
  const end=[point[0],floor,point[2]],points=compactPipePath([start,corner,last,end]);
  const reach=points.slice(1).reduce((n,p,i)=>n+Math.abs(p[0]-points[i][0])+Math.abs(p[2]-points[i][2]),0);
  if(reach<16||reach>MAX_REACH||Math.abs(dy)>Math.floor(Math.max(0,reach-20)/2))return null;
  return {type:'side',target,segment,axis,normal,sign,start,points,reach,floor,dy,
    distance:Math.abs(point[0]-start[0])+Math.abs(dy)+Math.abs(point[2]-start[2]),
    score:reach+Math.abs(dy)};
}

function passage(c) {
  const path=[],volumes=[];
  for(let j=1;j<c.points.length;j++) {
    const a=c.points[j-1],b=c.points[j],dx=Math.sign(b[0]-a[0]),dz=Math.sign(b[2]-a[2]);
    const length=Math.abs(b[0]-a[0])+Math.abs(b[2]-a[2]);
    for(let i=0;i<length;i++)path.push([a[0]+dx*i,c.floor,a[2]+dz*i]);
  }
  path.push([...c.points.at(-1)]);
  for(let i=0;i<path.length;i++) {
    path[i][1]+=Math.round(c.dy*Math.max(0,Math.min(1,(i-12)/Math.max(1,c.reach-18))));
  }
  for(let i=0;i<path.length;i++) {
    const p=path[i],height=(path[i-1]?.[1]>p[1]||path[i+1]?.[1]>p[1])?3:2;
    const radius=i>=7&&i<14?2:1;
    volumes.push([p[0]-radius,p[1],p[2]-radius,radius*2+1,height+2,radius*2+1]);
  }
  return {path,volumes};
}

function passageGeometry(c,{path}) {
  const air=new Map(),solids=new Map(),key=p=>p.join(',');
  for(let i=0;i<path.length;i++) {
    const p=path[i],height=(path[i-1]?.[1]>p[1]||path[i+1]?.[1]>p[1])?3:2;
    for(let h=1;h<=height;h++) {
      const q=[p[0],p[1]+h,p[2]];air.set(key(q),[...q,1,1,1,'air']);
    }
    solids.set(key(p),[...p,1,1,1,'pipe_access']);
  }
  for(let i=14;i<path.length-1;i++) {
    const p=path[i],height=(path[i-1]?.[1]>p[1]||path[i+1]?.[1]>p[1])?3:2;
    for(let h=1;h<=height;h++)for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const q=[p[0]+dx,p[1]+h+dy,p[2]+dz];
      if(!air.has(key(q)))solids.set(key(q),[...q,1,1,1,'pipe_access']);
    }
  }
  // A short open landing keeps the actual hatch visible from the side of the pipe.
  for(let i=7;i<Math.min(14,path.length);i++) {
    for(const offset of [-1,1]) {
      const p=[...path[i]];p[c.axis]+=offset;solids.set(key(p),[...p,1,1,1,'pipe_access']);
    }
    for(const side of [-2,2]) {
      const p=[...path[i]];p[c.axis]+=side;p[1]++;
      solids.set(key(p),[...p,1,1,1,'pipe_access_frame']);
    }
  }
  const boxes=[...solids.values()];
  const frame=[...c.start,1,1,1];frame[c.normal]+=8*c.sign;frame[1]+=3;
  frame[c.axis]--;frame[c.axis+3]=3;boxes.push([...frame,'pipe_access_frame']);
  for(const side of [-1,1]) {
    const post=[...c.start,1,2,1];post[c.normal]+=8*c.sign;post[c.axis]+=side;post[1]++;
    boxes.push([...post,'pipe_access_frame']);
  }
  // Keep the destination's existing interior open, including its other doorways.
  let trimmed=boxes;
  for(const interior of c.interiors)trimmed=trimmed.flatMap(box=>subtract(box,interior));
  return {air:mergeBoxes([...air.values()]).map(b=>b.slice(0,6)),boxes:mergeBoxes(trimmed),ladders:[]};
}

function targetPoints(target,start,axis) {
  const raw=target.box,normal=axis===0?2:0;
  const b=target.room?[raw[0]+1,raw[1],raw[2]+1,raw[3]-2,raw[4],raw[5]-2]:raw;
  const a=Math.max(b[axis],Math.min(b[axis]+b[axis+3]-1,start[axis]));
  const n=Math.max(b[normal],Math.min(b[normal]+b[normal+3]-1,start[normal]));
  const positions=[...new Set([a,b[axis],b[axis]+b[axis+3]-1])];
  const normals=[...new Set([n,b[normal],b[normal]+b[normal+3]-1])];
  return positions.flatMap(along=>normals.map(across=>{
    const p=[...start];p[axis]=along;p[normal]=across;p[1]=b[1];return p;
  }));
}

function ceilingCandidate(target,segment,along) {
  if(!target.room)return null;
  const b=target.box,axis=segment.axis,normal=axis===0?2:0,start=[...segment.a];
  start[axis]=Math.max(b[axis]+1,Math.min(b[axis]+b[axis+3]-2,along));start[1]-=3;
  // The shaft, its backing and a place to step off must fit inside the upstairs room.
  if(Math.abs(start[axis]-along)>32||start[0]<b[0]+1||start[0]>b[0]+b[3]-3||
    start[2]<b[2]+1||start[2]>b[2]+b[5]-3||b[4]<4||b[1]<segment.a[1]+12)return null;
  const end=[start[0],b[1],start[2]],rise=end[1]-start[1];
  return {type:'ceiling',target,segment,axis,normal,start,end,floor:start[1],
    distance:rise+Math.abs(start[axis]-along),score:rise};
}

function ceilingPassage(c) {
  const path=[],volumes=[];
  for(let y=c.start[1];y<=c.end[1];y++) {
    path.push([c.start[0],y,c.start[2]]);
    volumes.push([c.start[0]-1,y,c.start[2]-1,3,3,3]);
  }
  return {path,volumes};
}

function ceilingGeometry(c) {
  const [x,bottom,z]=c.start,top=c.end[1],air=[[x,bottom+1,z,1,top-bottom+2,1]];
  const boxes=[[x,bottom+1,z+1,1,top-bottom+1,1,'pipe_ladder_support']];
  // Above the pipe, enclose the climb until it opens through the room's floor.
  const base=c.segment.a[1]+5;
  for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]])
    boxes.push([x+dx,base,z+dz,1,top-base,1,'pipe_access']);
  return {air,boxes:mergeBoxes(boxes),
    ladders:[[x,bottom+1,z,1,top-bottom+1,1,'pipe_ladder']]};
}

function doorSlots(segments) {
  const slots=[];
  segments.forEach((segment,id)=>{
    if(segment.axis===1||segment.hi-segment.lo<64)return;
    const lo=segment.lo+32,hi=segment.hi-32;
    for(let along=lo;along<=hi;along+=PIPE_DOOR_INTERVAL) {
      slots.push({segment,id,along});
    }
  });
  return slots;
}

// Destinations are immutable: a new pipe exit can never become another exit's target.
export function createPipePlanner(data) {
  const pipe=data.globalPipe;
  const world=data.world,segments=pipeNetworkSegments(pipe.paths);
  const targets=(data.routes||[]).flatMap((route,id)=>{
    if(route.a[1]!==route.b[1]||route.a[0]!==route.b[0]&&route.a[2]!==route.b[2])return [];
    const box=[Math.min(route.a[0],route.b[0]),route.a[1],Math.min(route.a[2],route.b[2]),
      Math.abs(route.a[0]-route.b[0])+1,4,Math.abs(route.a[2]-route.b[2])+1];
    return [{kind:'tunnel',id,box,route}];
  });
  for(const [kind,rooms] of [['room',data.denseRooms||[]],['house',data.houses||[]]])
    for(const room of rooms)if(room.box[3]>=3&&room.box[4]>=4&&room.box[5]>=3)
      targets.push({kind,id:room.id,box:room.box,room});
  const inside=b=>[0,1,2].every(i=>b[i]>=1&&b[i]+b[i+3]<=[world.length,world.height,world.width][i]-1);
  const obstacles=spatial();
  for(const room of [...(data.denseRooms||[]),...(data.houses||[])])obstacles.add({box:room.box,owner:room});
  for(const z of data.zones||[])obstacles.add({box:zoneVolume(z,world)});
  for(const z of [...(data.buildingLong||[]),...(data.wideAreas||[]),...(data.settlements||[])]) {
    obstacles.add({box:z.box});
    for(const box of z.accessVolumes||[])obstacles.add({box});
  }
  for(const s of data.snakes||[])for(const box of s.volumes)obstacles.add({box});
  const network=spatial();
  for(const route of data.routes||[]) {
    const item={box:pathBounds([route.a,route.b],1,5),owner:route,route,floor:route.a[1]};
    obstacles.add(item);network.add(item);
  }
  for(const box of data.growthBounds||(data.growthConnections||[]).filter(c=>c.path.length).map(c=>pathBounds(c.path,1,5)))obstacles.add({box});
  for(const b of data.mainGalleries?.interiors||[]) {
    const item={box:[b[0]-1,b[1]-1,b[2]-1,b[3]+2,b[4]+2,b[5]+2],owner:b,gallery:b,floor:b[1]-1};
    obstacles.add(item);network.add(item);
  }
  for(const s of data.shafts||[])obstacles.add({box:[s.x-2,s.bottom,s.z-2,5,s.top-s.bottom+4,5]});
  for(const segment of segments) {
    const box=pathBounds([segment.a,segment.b],10,21);box[1]-=10;
    obstacles.add({box,owner:segment});
  }
  const goals=spatial(targets.map(target=>({box:target.box,target})),128);
  const slots=doorSlots(segments),accesses=[],allAir=[],accessBoxes=[],accessLadders=[],unserved=[];
  return {world,segments,inside,obstacles,network,goals,slots,accesses,allAir,accessBoxes,accessLadders,unserved};
}

export function planPipeSlot(planner,index,extra=[]) {
  const {world,inside,obstacles,network,goals,slots}=planner,slot=slots[index];
  const accesses=[...planner.accesses,...extra.map(p=>p.access)];
  const extraObstacles=spatial(extra.flatMap(p=>p.volumes.map(box=>({box,owner:p.access,floor:box[1]}))));
  const base=[...slot.segment.a];base[slot.segment.axis]=slot.along;
  for(const radius of [384,768,MAX_REACH]) {
    const nearby=goals.query([base[0]-radius,0,base[2]-radius,radius*2+1,world.height,radius*2+1]);
    for(const offset of [0,32,-32]) {
      const along=slot.along+offset,segment=slot.segment,axis=segment.axis;
      if(along<segment.lo+24||along>segment.hi-24)continue;
      const start=[...segment.a];start[axis]=along;start[1]-=3;
      if(accesses.some(a=>Math.abs(a.path[0][1]-start[1])<64&&
        Math.hypot(a.path[0][0]-start[0],a.path[0][2]-start[2])<PIPE_ACCESS_SPACING))continue;
      // The sort previously kept only 32 entries. Keep that same stable prefix while scanning.
      const choices=[],seen=new Set();
      const compare=(a,b)=>a.distance-b.distance||a.score-b.score;
      const offer=(c,deduplicate=false)=>{
        if(choices.length===32&&compare(c,choices.at(-1))>=0)return;
        const key=deduplicate?c.points.map(p=>p.join(',')).join(';')+':'+c.dy:null;
        if(key&&seen.has(key))return;
        let lo=0,hi=choices.length;
        while(lo<hi){const mid=(lo+hi)>>1;if(compare(c,choices[mid])<0)hi=mid;else lo=mid+1;}
        c.choiceKey=key;choices.splice(lo,0,c);if(key)seen.add(key);
        if(choices.length>32){const removed=choices.pop();if(removed.choiceKey)seen.delete(removed.choiceKey);}
      };
      for(const {target} of nearby) {
        const ceiling=ceilingCandidate(target,segment,along);
        if(ceiling&&Math.abs(ceiling.start[axis]-slot.along)<=32)offer(ceiling);
        for(const point of targetPoints(target,start,axis))for(const neck of [24,48]) {
          const c=candidate(target,segment,along,point,neck);if(!c||c.distance>radius)continue;
          offer(c,true);
        }
      }
      for(const c of choices) {
        if(accesses.some(a=>Math.abs(a.path[0][1]-c.start[1])<64&&
          Math.hypot(a.path[0][0]-c.start[0],a.path[0][2]-c.start[2])<PIPE_ACCESS_SPACING))continue;
        const p=c.type==='ceiling'?ceilingPassage(c):passage(c),end=p.path.at(-1),
          allowed=new Set([c.target.room||c.target.route]);
        const joins=network.query([end[0]-1,end[1],end[2]-1,3,4,3]);
        for(const item of joins) {
          if(item.route&&item.route.a[1]===end[1]&&item.route.b[1]===end[1])allowed.add(item.owner);
          if(item.gallery&&item.gallery[1]===end[1]+1)allowed.add(item.owner);
        }
        if(p.volumes.some((b,i)=>!inside(b)||[...obstacles.query(b),...extraObstacles.query(b)].some(item=>
          !(item.owner===segment&&(c.type==='ceiling'?p.path[i][1]<=segment.a[1]+10:i<16))&&
          !(c.target.room&&item.owner===c.target.room&&(c.type==='ceiling'||p.path[i][1]===end[1]))&&
          !(p.path[i][1]===end[1]&&allowed.has(item.owner)&&
            (item.floor===undefined||item.floor===end[1])))))continue;
        c.interiors=[];
        if(c.target.room) {
          const b=c.target.box;c.interiors.push([b[0]+1,b[1]+1,b[2]+1,b[3]-2,b[4]-2,b[5]-2]);
        }
        for(const item of joins)if(allowed.has(item.owner)) {
          if(item.gallery)c.interiors.push(item.gallery);
          else if(item.route&&item.route.a[1]===end[1]&&item.route.b[1]===end[1]) {
            const {a,b}=item.route;
            c.interiors.push([Math.min(a[0],b[0]),end[1]+1,Math.min(a[2],b[2]),
              Math.abs(a[0]-b[0])+1,2,Math.abs(a[2]-b[2])+1]);
          }
        }
        const geometry=c.type==='ceiling'?ceilingGeometry(c):passageGeometry(c,p),door=[...end];door[1]++;
        const source=[...c.start];
        if(c.type==='ceiling')source[1]=segment.a[1]+6;
        else {source[c.normal]+=8*c.sign;source[1]++;}
        const sector=`${Math.floor(start[0]/PIPE_ACCESS_SECTOR)},${Math.floor(start[2]/PIPE_ACCESS_SECTOR)},${Math.floor(start[1]/96)}`;
        const access={id:accesses.length,type:c.type,sector,pipeAxis:c.axis,normal:[0,0,0],pipeSegment:slot.id,
          plannedAlong:slot.along,along:c.start[axis],target:{kind:c.target.kind,id:c.target.id},
          join:{kind:c.target.room?c.target.kind:'map',id:c.target.id},
          pipeDoor:source,doorSize:c.type==='ceiling'?[1,1,1]:[...PIPE_DOOR_SIZE],tunnelDoor:door,path:p.path,air:geometry.air,
          ladders:geometry.ladders,
          spawn:[c.start[0]+.5,c.floor+2.6,c.start[2]+.5],lookAt:[c.start[0]+.5,c.floor+2.6,c.start[2]+.5]};
        if(c.type==='ceiling') {
          access.normal[1]=1;access.spawn[2]--;access.lookAt[1]+=8;
        }else {access.normal[c.normal]=c.sign;access.lookAt[c.normal]+=12*c.sign;}
        return {access,volumes:p.volumes,boxes:geometry.boxes,ladders:geometry.ladders,searchStart:start};
      }
    }
  }
  return null;
}

export function commitPipeProposal(planner,proposal,retainGeometry=true) {
  if(!proposal)return;
  const {access,volumes,boxes,ladders}=proposal;access.id=planner.accesses.length;
  planner.accesses.push(retainGeometry?access:{path:[access.path[0]]});
  if(retainGeometry){planner.allAir.push(...access.air);planner.accessBoxes.push(...boxes);planner.accessLadders.push(...ladders);}
  for(const box of volumes)planner.obstacles.add({box,owner:access,floor:box[1]});
}

export function pipeProposalConflicts(proposal,previous) {
  if(!proposal)return false;
  const close=start=>previous.some(p=>Math.abs(p.access.path[0][1]-start[1])<64&&
    Math.hypot(p.access.path[0][0]-start[0],p.access.path[0][2]-start[2])<PIPE_ACCESS_SPACING);
  if(close(proposal.searchStart)||close(proposal.access.path[0]))return true;
  const obstacles=spatial(previous.flatMap(p=>p.volumes.map(box=>({box}))));
  return proposal.volumes.some(b=>obstacles.query(b).length);
}

export function finishPipePlanner(data,planner) {
  const {world,segments,allAir,accessBoxes,accessLadders,accesses,unserved}=planner,pipe=data.globalPipe;
  const nav=navigation(segments,world);
  for(const [x,y,z,sx,sy,sz] of nav.ladders)
    allAir.push([x,y,z,sx,Math.min(world.height-y,sy+2),sz]);
  const cuts=spatial(allAir.map(box=>({box})));
  data.networkBoxes=cutGeometry(data.networkBoxes||[],cuts);
  data.wallGroups=(data.wallGroups||[]).map(group=>({...group,
    boxes:cutGeometry(group.boxes,cuts),walls:cutGeometry(group.walls,cuts)}));
  data.globalPipe={...pipe,boxes:cutGeometry(pipe.boxes,cuts),accesses,accessAir:allAir,
    pedestrianBoxes:cutGeometry(mergeBoxes([...nav.boxes,...accessBoxes]),cuts),pedestrianLadders:[...nav.ladders,...accessLadders],
    doorInterval:PIPE_DOOR_INTERVAL,unservedDoorSlots:unserved};
  data.stats={...data.stats,pipeAccesses:accesses.length,
    pipeAccessSectors:new Set(accesses.map(a=>a.sector.split(',').slice(0,2).join(','))).size};
  return data;
}

export function connectPipeTunnels(data,progress=()=>{}) {
  if(!data.globalPipe||data.globalPipe.accesses)return data;
  const planner=createPipePlanner(data);
  for(let i=0;i<planner.slots.length;i++) {
    if(i%20===0)progress(`Portes laterales des tuyaux : ${i}/${planner.slots.length}...`);
    const proposal=planPipeSlot(planner,i);
    if(proposal)commitPipeProposal(planner,proposal);
    else {const slot=planner.slots[i],pos=[...slot.segment.a];pos[slot.segment.axis]=slot.along;
      planner.unserved.push({segment:slot.id,along:slot.along,pos});}
  }
  return finishPipePlanner(data,planner);
}

export async function connectPipeTunnelsParallel(data,pool,progress=()=>{}) {
  if(!data.globalPipe||data.globalPipe.accesses)return data;
  const compact={world:data.world,zones:data.zones,routes:data.routes,shafts:data.shafts,
    denseRooms:(data.denseRooms||[]).map(r=>({id:r.id,box:r.box})),houses:(data.houses||[]).map(h=>({id:h.id,box:h.box})),
    buildingLong:(data.buildingLong||[]).map(z=>({box:z.box})),wideAreas:(data.wideAreas||[]).map(z=>({box:z.box})),
    settlements:(data.settlements||[]).map(z=>({box:z.box,accessVolumes:z.accessVolumes})),
    snakes:(data.snakes||[]).map(s=>({volumes:s.volumes})),mainGalleries:data.mainGalleries,
    growthBounds:(data.growthConnections||[]).filter(c=>c.path.length).map(c=>pathBounds(c.path,1,5)),
    globalPipe:{paths:data.globalPipe.paths}};
  const planner=createPipePlanner(compact);
  await pool.broadcast('pipeInit',compact);
  for(let start=0;start<planner.slots.length;start+=pool.size) {
    progress(`Portes laterales des tuyaux : ${start}/${planner.slots.length} · ${pool.size} workers...`);
    const indices=Array.from({length:Math.min(pool.size,planner.slots.length-start)},(_,i)=>start+i);
    const proposals=await pool.map('pipeSlot',indices.map(index=>({index}))),accepted=[];
    for(let j=0;j<indices.length;j++) {
      const index=indices[j];let proposal=proposals[j];
      // Earlier slots always win. Replan conflicts using every newly accepted corridor.
      if(pipeProposalConflicts(proposal,accepted))proposal=await pool.run('pipeSlot',{index,extra:accepted});
      if(proposal){commitPipeProposal(planner,proposal);accepted.push(proposal);}
      else {const slot=planner.slots[index],pos=[...slot.segment.a];pos[slot.segment.axis]=slot.along;
        planner.unserved.push({segment:slot.id,along:slot.along,pos});}
    }
    // Only new collision volumes and doorway positions are shared; mesh data stays here.
    if(accepted.length)await pool.broadcast('pipeCommit',accepted.map(p=>({
      access:{path:[p.access.path[0]]},volumes:p.volumes})));
  }
  return finishPipePlanner(data,planner);
}
