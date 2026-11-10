import assert from 'node:assert/strict';
import {addCavityCrossBridges} from '../generation_demo_chunks_cross_bridges.js';
import {overlaps} from '../generation_demo_generator.js';

function fixture(axis=2,width=64,rise=0) {
  const houses=[],boxes=[];
  for(let level=0;level<4;level++)for(let side=0;side<2;side++) {
    const box=[20,30+level*40+side*rise,side?width-9:0,18,21,9];
    if(axis===0)[box[0],box[2],box[3],box[5]]=[box[2],box[0],box[5],box[3]];
    houses.push({id:houses.length,side:(axis===2?['north','south']:['west','east'])[side],box});
    const [x,y,z,sx,sy,sz]=box;
    for(let dy=0;dy<sy;dy+=5)boxes.push([x,y+dy,z,sx,1,sz,'house']);
    boxes.push([x,y,z,sx,sy,1,'house'],[x,y,z+sz-1,sx,sy,1,'house'],
      [x,y,z,1,sy,sz,'house'],[x+sx-1,y,z,1,sy,sz,'house']);
  }
  return {houses,boxes};
}
for(const axis of [0,2])for(const rise of [0,17])for(const width of [64,160,288]) {
  const zone={id:0,width:axis===0?width/32:30,depth:axis===2?width/32:30};
  const {houses,boxes}=fixture(axis,width,rise),original=structuredClone(boxes);
  const bridges=addCavityCrossBridges(zone,houses,boxes,42);
  assert.ok(bridges.length>=2 && bridges.length<=4);
  const again=structuredClone(original);
  assert.deepEqual(addCavityCrossBridges(zone,houses,again,42),bridges);
  assert.deepEqual(again,boxes);
  for(const b of bridges) {
    assert.equal(b.length,width-18);
    for(const d of b.doors)assert.ok(!boxes.some(box=>overlaps(box,d)),'Blocked facade door');
    for(const [x,y,z] of b.route) {
      const floor=[x,y,z,axis===2?2:1,1,axis===0?2:1];
      const head=[x,y+1,z,floor[3],3,floor[5]];
      assert.ok(boxes.some(box=>overlaps(box,floor)));
      assert.ok(!boxes.some(box=>overlaps(box,head)),'Blocked headroom');
    }
    for(let i=1;i<b.route.length;i++)assert.ok(Math.abs(b.route[i][1]-b.route[i-1][1])<=1);
  }
  for(let i=0;i<bridges.length;i++)for(let j=0;j<i;j++)
    assert.ok(bridges[i].low>bridges[j].high+10 || bridges[j].low>bridges[i].high+10);
}
{
  const {houses,boxes}=fixture();
  const obstruction=[0,0,30,64,300,4];
  assert.equal(addCavityCrossBridges({id:0},houses,boxes,42,[obstruction]).length,0);
  houses.push({id:100,side:'west',box:obstruction});
  assert.equal(addCavityCrossBridges({id:0},houses,boxes,42).length,0);
}
{
  const {houses,boxes}=fixture();
  boxes.push([0,0,30,64,300,1,'house_bridge']);
  assert.equal(addCavityCrossBridges({id:0},houses,boxes,42).length,0);
}
{
  const {houses,boxes}=fixture(2,960);
  assert.equal(addCavityCrossBridges({id:0,width:5,depth:30},houses,boxes,42).length,0,
    'Do not span the long axis of the hall');
}
console.log('PASS: crossings, doors, stairs, clearance, obstructions, length and deterministic seed');
