import assert from 'node:assert/strict';
import {skinJobs,runSkinJob,runSkinTask,skinRunBoxes} from '../generation_demo_chunks_skin.js';
const world={length:1024,width:1024,height:1000},S=1024,key=(x,y,z)=>(y*S+z)*S+x;
const air=new Set([[511,30,511],[512,30,512],[511,31,512],[512,31,511]].map(p=>key(...p)));
const brickShell=new Set([key(512,34,515)]),snakeEntries=new Set([key(510,30,511)]);
const houses=[{box:[511,32,510,1,1,3]}],denseRooms=[{box:[512,28,511,2,5,2]}];
const galleries={outer:[[512,29,508,3,8,3]]},shafts=[{x:510,z:513,bottom:25,top:35}];
const inside=(b,x,y,z)=>x>=b[0]&&x<b[0]+b[3]&&y>=b[1]&&y<b[1]+b[4]&&z>=b[2]&&z<b[2]+b[5];
for(const skipDense of [false,true]) {
  const expected=new Map();
  for(const k of air){const x=k%S,y=Math.floor(k/(S*S)),z=Math.floor(k/S)%S;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)if(dx||dy||dz){
      const a=x+dx,b=y+dy,c=z+dz,n=key(a,b,c);
      if(!air.has(n)&&!snakeEntries.has(n)&&!houses.some(h=>inside(h.box,a,b,c))&&
        (skipDense||!denseRooms.some(r=>inside(r.box,a,b,c))))expected.set(n,brickShell.has(n)?'dense':'tunnel');
    }
  }
  for(const k of brickShell)if(!air.has(k))expected.set(k,'dense');
  for(const k of expected.keys()){
    const x=k%S,y=Math.floor(k/(S*S)),z=Math.floor(k/S)%S;
    if(galleries.outer.some(b=>inside(b,x,y,z))||shafts.some(s=>
      inside([s.x-1,s.bottom+1,s.z-1,3,s.top-s.bottom+2,3],x,y,z)||
      inside([s.x,s.bottom,s.z+1,1,s.top-s.bottom+3,1],x,y,z)))expected.delete(k);
  }
  const actual=new Map();
  for(const job of skinJobs({air,brickShell,snakeEntries,houses,denseRooms,galleries,shafts,world,skipDense})) {
    const part=runSkinJob(job);for(const k of part.tunnel)actual.set(k,'tunnel');for(const k of part.dense)actual.set(k,'dense');
  }
  const encodedJobs=skinJobs({air,brickShell,snakeEntries,houses,denseRooms,galleries,shafts,world,skipDense});
  const packed=new Map();let volume=0;
  for(const b of skinRunBoxes(encodedJobs.map(runSkinTask),world))for(let dx=0;dx<b[3];dx++){
    packed.set(key(b[0]+dx,b[1],b[2]),b[6]);volume++;
  }
  assert.equal(volume,expected.size,'Packed runs contain every voxel exactly once');
  assert.deepEqual([...packed].sort((a,b)=>a[0]-b[0]),[...expected].sort((a,b)=>a[0]-b[0]));
  assert.deepEqual([...actual].sort((a,b)=>a[0]-b[0]),[...expected].sort((a,b)=>a[0]-b[0]));
}
console.log('Skin tiles: exact voxel equivalence at diagonal seams, doors, houses, rooms, galleries and ladders');

// A dense tall tile is split around Y=128 without losing or duplicating a voxel.
const tallAir=new Set();
for(let x=192;x<256;x++)for(let z=192;z<256;z++)for(let y=120;y<=132;y++)tallAir.add(key(x,y,z));
const input={air:tallAir,brickShell:new Set(),snakeEntries:new Set(),houses:[],denseRooms:[],galleries:{outer:[]},shafts:[],world};
const split=skinJobs(input);
assert.equal(split.length,2);
assert(split.every(j=>j.bounds[5]-j.bounds[4]<=128));
const whole=runSkinTask({world,bounds:[0,0,512,512,0,1000],air:Float64Array.from(tallAir),brick:[],entries:[],houses:[],dense:[],excluded:[]});
assert.deepEqual(skinRunBoxes(split.map(runSkinTask),world),skinRunBoxes([whole],world));
console.log('Heavy skin tile: 53,248 air cells split vertically; exact same wall runs');
