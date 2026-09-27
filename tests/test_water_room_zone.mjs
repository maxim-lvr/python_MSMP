import assert from 'node:assert/strict';
import {generateWaterRoomZone} from '../water_room_zone.js';
import {overlaps} from '../generation_demo_generator.js';
const model=generateWaterRoomZone(42);
assert.equal(model.towers.length,196);
assert.deepEqual(model,generateWaterRoomZone(42));
assert.notDeepEqual(model.towers,generateWaterRoomZone(43).towers);
for(const box of model.boxes) {
  assert.ok(box.slice(0,6).every(Number.isInteger));
  assert.ok([200,20,200].every((max,i)=>box[i]>=0&&box[i]+box[i+3]<=max));
}
for(let i=0;i<model.boxes.length;i++)for(let j=0;j<i;j++)assert.ok(!overlaps(model.boxes[i],model.boxes[j]));
for(let i=0;i<196;i++) {
  if(i%14<13)assert.ok(model.towers[i+1][2]-model.towers[i][2]-6>=6);
  if(i<182)assert.ok(model.towers[i+14][0]-model.towers[i][0]-6>=6);
  const [x,,z]=model.towers[i];
  assert.ok(!model.boxes.some(b=>overlaps(b,[x+1,2,z+1,4,17,4])),'Hollow interior');
  assert.ok(!model.boxes.some(b=>overlaps(b,model.doors[i])),'Open door');
}
assert.ok(!model.boxes.some(b=>overlaps(b,[...model.spawn,0.6,1.8,0.6])));
console.log('Water Room: 196 hollow towers, doors, seed, bounds, spacing and non-overlap OK');
