import assert from 'node:assert/strict';
import {generateMegastructure} from '../generation_megastructure.js';
import {overlaps} from '../generation_demo_generator.js';

const seed=Number(process.env.SEED||42);
const json=async url=>{const r=await fetch('http://127.0.0.1:5173'+url);assert(r.ok);return r.json();};
const templates=await json(`/api/demo-chunks-templates?seed=${seed}`),models=[];
for(const i of [0,1])models.push(await json(`/api/demo-building-long?seed=${(seed+i)>>>0}&length=960`));
const data=generateMegastructure(seed,templates,models,console.log,Number(process.env.DENSITY||3));
const limits=[5000,300,5000];
for(const b of data.boxes)assert(b.slice(0,6).every((n,i)=>Number.isInteger(n)&&
  (i<3?n>=0:n>0&&n+b[i-3]<=limits[i-3])),`Bad box ${b}`);
for(let i=0;i<data.rooms.length;i++)for(let j=0;j<i;j++)
  assert(!overlaps(data.rooms[i].box,data.rooms[j].box),`Rooms overlap: ${i}/${j}`);
assert.equal(data.entries.length,data.rooms.length);
const reachable=new Set();
for(const c of data.growthConnections){assert(c.from===null||reachable.has(c.from));reachable.add(c.to);}
assert.equal(reachable.size,data.denseRooms.length);
assert.equal(data.rooms.filter(r=>r.type==='snake').length,4);
assert(data.rooms.some(r=>r.type==='water'));
assert(data.boxes.some(b=>b[6]==='cathedral_city_house'));
const buckets=new Map();
for(const b of data.boxes)for(let x=Math.floor(b[0]/64);x<=Math.floor((b[0]+b[3]-1)/64);x++)
  for(let z=Math.floor(b[2]/64);z<=Math.floor((b[2]+b[5]-1)/64);z++){
    const k=x+','+z;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(b);
  }
const solid=p=>(buckets.get(Math.floor(p[0]/64)+','+Math.floor(p[2]/64))||[]).filter(b=>
  b[6]!=='ladder'&&!b[6].endsWith('_water')&&p.every((n,i)=>n>=b[i]&&n<b[i]+b[i+3]));
const ladders=data.boxes.filter(b=>b[6]==='ladder');
for(const {points} of data.paths)for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],n=Math.abs(a[0]-b[0])+Math.abs(a[2]-b[2]);
  for(let t=0;t<=n;t+=8){
    const pad=Math.min(6,Math.max(0,Math.floor((n-Math.abs(b[1]-a[1]))/2)));
    const y=Math.round(a[1]+(b[1]-a[1])*Math.max(0,Math.min(1,(t-pad)/Math.max(1,n-2*pad))));
    const p=[a[0]+Math.sign(b[0]-a[0])*t,y,a[2]+Math.sign(b[2]-a[2])*t];
    const ladder=ladders.some(b=>p.every((n,i)=>n>=b[i]&&n<b[i]+b[i+3]));
    assert(solid(p).length||ladder,`Missing gallery floor ${p}: ${JSON.stringify([-3,-2,-1,1,2,3].map(d=>[d,solid([p[0],p[1]+d,p[2]])]))}`);
    for(let h=1;h<=2;h++)assert.equal(solid([p[0],y+h,p[2]]).length,0,`Blocked gallery ${p} by ${solid([p[0],y+h,p[2]])}`);
  }
}
console.log(data.stats,'boxes',data.boxes.length);
