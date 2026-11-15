import assert from 'node:assert/strict';
import {generateHouseWallUltraDense,ULTRA_DENSE} from '../house_wall_ultra_dense.js';

const data=generateHouseWallUltraDense(42,{populate:false}),c=ULTRA_DENSE;
const contains=(b,p)=>p.every((n,i)=>n>=b[i]&&n<b[i]+b[i+3]);
const solid=(x,y,z)=>data.boxes.some(b=>contains(b,[x,y,z]));
assert.deepEqual(data.area,{length:368,width:218,height:200});
assert.deepEqual(data.tower.box,[34,0,34,300,200,150]);
assert.deepEqual(data.courtyard.box,[4,0,4,360,200,210]);
assert.equal(data.stats.houses,0);assert.equal(data.stats.fullStoreys,33);assert.equal(data.stats.remainingHeight,2);
for(const b of data.boxes){
  assert(b.slice(0,6).every(Number.isInteger));assert(b.slice(3,6).every(n=>n>0));
  assert(b[0]>=0&&b[1]>=0&&b[2]>=0&&b[0]+b[3]<=368&&b[1]+b[4]<=200&&b[2]+b[5]<=218);
}
for(let y=1;y<200;y++) {
  const recess=y%6>=3,wallEnd=recess?1:4,towerStart=recess?37:34;
  // Each horizontal cross-section contains exactly the required gap and 3-block setbacks.
  for(let x=0;x<368;x++){
    const expected=x<wallEnd||x>=368-wallEnd||x>=towerStart&&x<38||x>=330&&x<368-towerStart;
    assert.equal(solid(x,y,109),expected,`Wrong profile at X=${x},Y=${y}`);
  }
  for(let z=0;z<218;z++){
    const expected=z<wallEnd||z>=218-wallEnd||z>=towerStart&&z<38||z>=180&&z<218-towerStart;
    assert.equal(solid(184,y,z),expected,`Wrong profile at Z=${z},Y=${y}`);
  }
  assert.equal(towerStart-wallEnd,recess?36:30);
  for(const p of [[0,y,0],[367,y,0],[0,y,217],[367,y,217]])assert(data.boxes.some(b=>contains(b,p)),'Enclosure corners stay closed');
  assert(solid(towerStart,y,towerStart),'Tower corners follow the setback');
  assert(!solid(184,y,109),'The tower remains empty for later interiors');
}
for(const [x,z] of [[19,19],[349,19],[19,199],[349,199],[184,19],[19,109],[349,109],[184,199],[184,109]])assert(solid(x,0,z),'Ground beneath courtyard and tower');
assert(!data.boxes.some(b=>contains(b,[19,200,19])),'Height 200 is exclusive');
assert.deepEqual(generateHouseWallUltraDense(42,{populate:false}),data);
console.log('House wall ultra dense: 200 high, 150 wide x 300 long tower, 30-block gaps, four-sided 3x3 setbacks, closed corners, empty interiors and capped final band OK');

const populated=generateHouseWallUltraDense();
assert.equal(populated.rooms.length,Math.round(populated.doors.length*.2));
assert(populated.rooms.some(r=>r.part==='interior')&&populated.rooms.some(r=>r.part==='exterior'));
for(let i=0;i<populated.rooms.length;i++){
 const a=populated.rooms[i].box;assert.equal(a[3],12);assert.equal(a[5],12);
 for(let j=0;j<i;j++){
  const b=populated.rooms[j].box;
  assert(![0,1,2].every(k=>a[k]<b[k]+b[k+3]&&a[k]+a[k+3]>b[k]),'Rooms must not overlap, including at corners');
 }
}
const buckets=new Map();
for(const b of populated.boxes)for(let x=Math.floor(b[0]/16);x<=Math.floor((b[0]+b[3]-1)/16);x++)
 for(let y=Math.floor(b[1]/6);y<=Math.floor((b[1]+b[4]-1)/6);y++)
  for(let z=Math.floor(b[2]/16);z<=Math.floor((b[2]+b[5]-1)/16);z++){
   const key=`${x},${y},${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(b);
  }
const occupied=p=>(buckets.get(`${Math.floor(p[0]/16)},${Math.floor(p[1]/6)},${Math.floor(p[2]/16)}`)||[]).some(b=>contains(b,p));
const previous=new Map();
for(const door of populated.doors){
 assert.equal(door.position[1]%6,3,'Door starts two blocks higher, in the recessed band');
 const recessedFace={tower_north:37,tower_south:180,tower_west:37,tower_east:330,
  outer_north:0,outer_south:217,outer_west:0,outer_east:367};
 assert.equal(door.position[door.normal[0]?0:2],recessedFace[door.group],'Door is at the back of the three-block recess');
 const key=`${door.group}:${door.y}`,last=previous.get(key);
 if(last!==undefined)assert.equal(door.along-last,populated.stats.doorSpacing);previous.set(key,door.along);
 for(let d=0;d<(door.room===null?3:c.roomDepth-1);d++){
  const p=door.position.map((v,i)=>v+door.normal[i]*d);
  assert(!occupied(p)&&!occupied([p[0],p[1]+1,p[2]]),'Door and room passage remain open');
  assert(occupied([p[0],p[1]-1,p[2]]),'Supported threshold and room floor');
 }
 if(door.room===null){const back=door.position.map((v,i)=>v+door.normal[i]*3);assert(occupied(back),'Unused doorway stays a blind recess');}
}
assert.deepEqual(generateHouseWallUltraDense(),populated);
console.log(`${populated.doors.length} doors, ${populated.rooms.length} rooms; 20% occupancy, 15-block spacing, supported 1x2 openings and deterministic placement OK`);
