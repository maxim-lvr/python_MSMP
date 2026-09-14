import assert from 'node:assert/strict';
import { snakeAccessPlans } from '../generation_demo_chunks_snake_ports.js';

// The first door used to choose (4720, 3600), blocking the second door's exit.
const doors=[
  {room:0,pos:[4680,100,3600],normal:[1,0,0]},
  {room:1,pos:[4724,128,3601],normal:[-1,0,0]},
];
for(const rearDoors of [doors,[...doors].reverse()]) {
  const layout={seed:4141286262,zones:[],snakes:[{id:0,volumes:[],rearDoors}]};
  const plans=snakeAccessPlans(layout,[],[],[]);
  assert.equal(plans.length,2);
  assert.deepEqual(plans,snakeAccessPlans(layout,[],[],[]),'Access plans must be deterministic');
  for(const {pos:[x,,z],normal:[nx,,nz]} of doors)for(let step=-1;step<=6;step++)
    assert.ok(!plans.some(p=>p.x===x+nx*step&&p.z+1===z+nz*step),'A shaft blocks a door exit');
}
console.log('Future door exits preserved in both placement orders.');
