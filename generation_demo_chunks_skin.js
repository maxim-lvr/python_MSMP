// Every tile owns its output cells. The one-block halo preserves cross-tile air openings.
const TILE=512,VERTICAL_TILE=128,MAX_AIR_PER_JOB=50000;
const contains=(b,x,y,z)=>x>=b[0]&&x<b[0]+b[3]&&y>=b[1]&&y<b[1]+b[4]&&z>=b[2]&&z<b[2]+b[5];
function pointIndex(boxes,bounds) {
  const buckets=new Map();
  for(const b of boxes)for(let x=Math.max(Math.floor(b[0]/64),Math.floor(bounds[0]/64));x<=Math.min(Math.floor((b[0]+b[3]-1)/64),Math.floor((bounds[2]-1)/64));x++)
    for(let y=Math.max(Math.floor(b[1]/64),Math.floor(bounds[4]/64));y<=Math.min(Math.floor((b[1]+b[4]-1)/64),Math.floor((bounds[5]-1)/64));y++)
      for(let z=Math.max(Math.floor(b[2]/64),Math.floor(bounds[1]/64));z<=Math.min(Math.floor((b[2]+b[5]-1)/64),Math.floor((bounds[3]-1)/64));z++) {
        const k=`${x},${y},${z}`;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(b);
      }
  return (x,y,z)=>buckets.get(`${Math.floor(x/64)},${Math.floor(y/64)},${Math.floor(z/64)}`)?.some(b=>contains(b,x,y,z));
}

export function skinJobs({air,brickShell,snakeEntries,houses,denseRooms,galleries,shafts,world,skipDense=false,diagnostics=false}) {
  const jobs=new Map(),S=world.length,D=world.width;
  const job=(x,z)=>{
    const id=`${x},${z}`;
    if(!jobs.has(id))jobs.set(id,{world,diagnostics,bounds:[x*TILE,z*TILE,(x+1)*TILE,(z+1)*TILE,0,world.height],
      air:[],brick:[],entries:[],houses:[],dense:[],excluded:[]});
    return jobs.get(id);
  };
  const tileFor=k=>[Math.floor((k%S)/TILE),Math.floor((Math.floor(k/S)%D)/TILE)];
  for(const k of air) {
    const x=k%S,z=Math.floor(k/S)%D,tx=Math.floor(x/TILE),tz=Math.floor(z/TILE);
    const xs=[tx],zs=[tz];
    if(x%TILE===0&&tx>0)xs.push(tx-1);if(x%TILE===TILE-1&&x+1<S)xs.push(tx+1);
    if(z%TILE===0&&tz>0)zs.push(tz-1);if(z%TILE===TILE-1&&z+1<D)zs.push(tz+1);
    for(const a of xs)for(const b of zs)job(a,b).air.push(k);
  }
  for(const k of brickShell)job(...tileFor(k)).brick.push(k);
  for(const k of snakeEntries)jobs.get(tileFor(k).join(','))?.entries.push(k);
  const add=(box,field)=>{
    for(let x=Math.floor(box[0]/TILE);x<=Math.floor((box[0]+box[3]-1)/TILE);x++)
      for(let z=Math.floor(box[2]/TILE);z<=Math.floor((box[2]+box[5]-1)/TILE);z++)jobs.get(`${x},${z}`)?.[field].push(box);
  };
  for(const h of houses)add(h.box,'houses');
  if(!skipDense)for(const r of denseRooms)add(r.box,'dense');
  for(const b of galleries.outer)add(b,'excluded');
  for(const s of shafts) {
    add([s.x-1,s.bottom+1,s.z-1,3,s.top-s.bottom+2,3],'excluded');
    add([s.x,s.bottom,s.z+1,1,s.top-s.bottom+3,1],'excluded');
  }
  const result=[];
  for(const j of jobs.values()) {
    if(j.air.length<=MAX_AIR_PER_JOB){result.push({...j,air:Float64Array.from(j.air)});continue;}
    // Tall, populated tiles need bounded vertical tasks, with the same one-cell halo.
    const bands=new Map(),band=id=>{
      if(!bands.has(id))bands.set(id,{...j,bounds:[...j.bounds.slice(0,4),id*VERTICAL_TILE,
        Math.min(world.height,(id+1)*VERTICAL_TILE)],air:[],brick:[],entries:[]});
      return bands.get(id);
    };
    for(const k of j.air){const y=Math.floor(k/(S*D)),id=Math.floor(y/VERTICAL_TILE);band(id).air.push(k);
      if(y%VERTICAL_TILE===0&&id>0)band(id-1).air.push(k);
      if(y%VERTICAL_TILE===VERTICAL_TILE-1&&y+1<world.height)band(id+1).air.push(k);
    }
    for(const field of ['brick','entries'])for(const k of j[field])band(Math.floor(k/(S*D*VERTICAL_TILE)))[field].push(k);
    for(const b of bands.values()) {
      for(const field of ['houses','dense','excluded'])b[field]=j[field].filter(box=>box[1]<b.bounds[5]&&box[1]+box[4]>b.bounds[4]);
      result.push({...b,air:Float64Array.from(b.air)});
    }
  }
  return result;
}

export function runSkinJob(job) {
  const {world,bounds}=job,S=world.length,D=world.width;
  const key=(x,y,z)=>(y*D+z)*S+x;
  const air=new Set(job.air),entries=new Set(job.entries),brick=new Set(job.brick),solid=new Map();
  const occupied=pointIndex([...job.houses,...job.dense],bounds),excluded=pointIndex(job.excluded,bounds);
  const allowed=k=>{const x=k%S,y=Math.floor(k/(S*D)),z=Math.floor(k/S)%D;return !excluded(x,y,z);};
  for(const k of air) {
    const x=k%S,y=Math.floor(k/(S*D)),z=Math.floor(k/S)%D;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)if(dx||dy||dz) {
      const nx=x+dx,ny=y+dy,nz=z+dz;
      if(nx<bounds[0]||nx>=bounds[2]||nz<bounds[1]||nz>=bounds[3]||ny<bounds[4]||ny>=bounds[5])continue;
      const nk=key(nx,ny,nz);
      if(!air.has(nk)&&!solid.has(nk)&&!entries.has(nk)&&!occupied(nx,ny,nz))solid.set(nk,brick.has(nk)?1:0);
    }
  }
  for(const k of brick)if(!air.has(k))solid.set(k,1);
  const tunnel=[],denseKeys=[];
  for(const [k,type] of solid)if(allowed(k))(type?denseKeys:tunnel).push(k);
  return {tunnel:Float64Array.from(tunnel),dense:Float64Array.from(denseKeys)};
}

// Return sorted X runs instead of millions of cell entries to the coordinator.
export function runSkinTask(job) {
  const cells=runSkinJob(job),dense=new Set(cells.dense),keys=[...cells.tunnel,...cells.dense].sort((a,b)=>a-b);
  const runs=[];let previous=-2,lastType=-1;
  for(const k of keys){const type=dense.has(k)?1:0;
    if(k===previous+1&&k%job.world.length!==0&&type===lastType)runs[runs.length-2]++;
    else runs.push(k,1,type);
    previous=k;lastType=type;
  }
  return {runs:Float64Array.from(runs),...(job.diagnostics?cells:{})};
}

export function skinRunBoxes(parts,world) {
  const heap=[],boxes=[],S=world.length,D=world.width;
  const push=item=>{let i=heap.length;heap.push(item);while(i>0){const p=(i-1)>>1;
    if(heap[p].key<=item.key)break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;
    while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].key<heap[c].key)c++;
      if(heap[c].key>=last.key)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
  for(const part of parts)if(part.runs.length)push({runs:part.runs,index:0,key:part.runs[0]});
  let last,previous=-2;
  while(heap.length) {
    const item=pop(),{runs,index}=item,k=runs[index],length=runs[index+1],kind=runs[index+2]?'dense':'tunnel';
    const x=k%S,y=Math.floor(k/(S*D)),z=Math.floor(k/S)%D;
    if(last&&k===previous+1&&x!==0&&last[6]===kind)last[3]+=length;
    else{last=[x,y,z,length,1,1,kind];boxes.push(last);}
    previous=k+length-1;item.index+=3;
    if(item.index<runs.length){item.key=runs[item.index];push(item);}
  }
  return boxes;
}
