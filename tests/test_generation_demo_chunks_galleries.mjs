import assert from 'node:assert/strict';
import {prepareGalleries,galleryMeshes} from '../generation_demo_chunks_galleries.js';
const layout={world:{length:500,width:500,height:100},zones:[]};
const routes=[{a:[30,10,60],b:[100,10,60],main:true},
  {a:[100,10,60],b:[100,10,140],main:true},
  {a:[60,10,60],b:[60,10,35]}];
const galleries=prepareGalleries(layout,[],[],routes);
const boxes=galleryMeshes(galleries,routes,[]);
const solid=(x,y,z)=>boxes.some(b=>x>=b[0]&&x<b[0]+b[3]&&y>=b[1]&&y<b[1]+b[4]&&z>=b[2]&&z<b[2]+b[5]);
for(let x=35;x<95;x++)for(let y=11;y<=16;y++)for(let z=58;z<=62;z++)assert.ok(!solid(x,y,z));
assert.ok(solid(40,10,60));assert.ok(solid(40,17,60));assert.ok(solid(40,12,57));
assert.ok(!solid(60,11,57),'Small branch opens a door in the main gallery');
for(let z=60;z<140;z++)assert.ok(!solid(100,11,z),'No wall across the bend');
for(let x=97;x<=103;x++)for(let z=57;z<=63;z++) {
  assert.ok(solid(x,10,z),'Continuous floor across the entire bend');
  assert.ok(solid(x,17,z),'Continuous ceiling across the entire bend');
}
for(let x=98;x<=102;x++)for(let z=58;z<=62;z++)for(let y=11;y<=16;y++)
  assert.ok(!solid(x,y,z),'Full-width clearance through the bend');
assert.ok(solid(103,13,57),'The outside corner must have a wall');
const protectedBox=[45,0,55,12,50,12];
const safe=prepareGalleries(layout,[{box:protectedBox}],[],routes);
assert.ok(!safe.contains(50,12,60),'Do not widen through houses');
assert.equal(prepareGalleries(layout,[],[],[{a:[20,10,20],b:[70,10,20]}]).outer.length,0);
const shaft={x:60,z:60,bottom:2,top:30};
const integrated=prepareGalleries(layout,[],[shaft],routes);
assert.ok(integrated.contains(60,12,60),'No narrow gap around ladder shafts');
const integratedBoxes=galleryMeshes(integrated,routes,[]);
const contains=(b,x,y,z)=>[x,y,z].every((n,i)=>n>=b[i]&&n<b[i]+b[i+3]);
const pillar=integratedBoxes.filter(b=>b[6]==='ladder_support');
assert.equal(pillar.length,1);assert.equal(pillar[0][3],1);assert.equal(pillar[0][5],1);
for(let y=shaft.bottom+1;y<=shaft.top+2;y++) {
  assert.ok(!integratedBoxes.some(b=>contains(b,60,y,60)),'Ladder and headroom remain open');
  assert.ok(pillar.some(b=>contains(b,60,y,61)),'Continuous north-facing ladder support');
}
const facade=prepareGalleries(layout,[{box:[101,10,50,20,20,20]}],[],[routes[0]]);
assert.ok(facade.contains(100,12,60),'Gallery reaches the facade without a three-block setback');
assert.ok(!facade.contains(101,12,60),'Gallery does not excavate the building');
const ending=[{a:[60,10,20],b:[60,10,60],main:true}];
const deadEnd=galleryMeshes(prepareGalleries(layout,[],[shaft],ending),ending,[]);
for(let x=57;x<=63;x++)for(let y=10;y<=17;y++)
  assert.ok(deadEnd.some(b=>contains(b,x,y,63)),'Close the complete end wall behind the ladder');
for(let y=11;y<=16;y++)assert.ok(!deadEnd.some(b=>contains(b,60,y,62)),
  'One empty block between the column and the end wall');
assert.ok(deadEnd.some(b=>contains(b,60,10,62)),'The space behind the ladder has a floor');
assert.ok(deadEnd.some(b=>contains(b,60,17,62)),'The space behind the ladder has a ceiling');
const through=[...ending,{a:[60,10,60],b:[60,10,90],main:true}];
const openEnd=galleryMeshes(prepareGalleries(layout,[],[shaft],through),through,[]);
assert.ok(!openEnd.some(b=>contains(b,60,12,63)),'Never close a tunnel continuing beyond the ladder');
console.log('Gallery width, height, floors, junctions, doors, obstacles and 50-block threshold: OK');
