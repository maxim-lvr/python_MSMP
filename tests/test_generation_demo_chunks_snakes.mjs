import assert from 'node:assert/strict';
import { generateChunks } from '../generation_demo_chunks_generator.js';
import { generateDemoSnakes } from '../generation_demo_chunks_snakes.js';
import { generateRoute } from '../house_tunnel_snake_generator.js';

const overlaps=(a,b)=>[0,1,2].every(i=>a[i]<b[i]+b[i+3]&&a[i]+a[i+3]>b[i]);
assert.equal(generateRoute(42).lengths.reduce((a,b)=>a+b,0),1500);
for(const seed of [42,0,27195957]) {
  const layout=generateChunks(seed),snakes=generateDemoSnakes(layout);
  assert.equal(snakes.length,4);
  assert.equal(new Set(snakes.map(s=>JSON.stringify(s.route.points))).size,4);
  for(const s of snakes) {
    assert.ok(s.length>4500&&s.bridges>0);
    assert.ok(Math.abs(s.route.points.at(-1).x-s.route.points[0].x)>4000);
    assert.ok(s.route.points.length>4);
    for(const b of s.boxes) {
      assert.ok(b.slice(0,6).every(Number.isInteger));
      assert.ok(b[0]>=0&&b[2]>=0&&b[1]>=0&&b[0]+b[3]<=5000&&b[2]+b[5]<=5000&&b[1]+b[4]<=300);
    }
    for(let i=0;i<s.volumes.length;i++) {
      const b=s.volumes[i];
      assert.ok(!s.volumes.slice(i+2).some(v=>overlaps(b,v)));
      assert.ok(!layout.zones.some(z=>overlaps(b,[z.x*32,0,z.z*32,z.width*32,300,z.depth*32])));
      assert.ok(!snakes.filter(t=>t.id!==s.id).some(t=>t.volumes.some(v=>overlaps(b,v))));
    }
  }
  console.log({seed,snakes:snakes.map(s=>({height:s.y,length:s.length,boxes:s.boxes.length}))});
}
