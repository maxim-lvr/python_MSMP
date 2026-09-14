import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {generateChunks} from '../generation_demo_chunks_generator.js';
import {placeBuildingLong,populateBuildingLong} from '../generation_demo_chunks_building_long.js';

for(const seed of [42,0,4141286262,...Array.from({length:30},(_,i)=>i+1)]) {
  const layout=generateChunks(seed),zones=placeBuildingLong(layout);
  assert.equal(zones.length,4);assert.deepEqual(zones,placeBuildingLong(layout));
  const occupied=layout.zones.map(z=>[z.x*32,0,z.z*32,z.width*32,300,z.depth*32]);
  for(const z of zones) {
    const b=z.box;
    assert.ok(z.length>=800&&z.length<=1280);
    assert.ok(b.every(Number.isInteger));
    assert.ok(b[0]>=0&&b[2]>=0&&b[0]+b[3]<=5000&&b[2]+b[5]<=5000&&b[1]+b[4]<=300);
    assert.ok(!occupied.some(a=>b[0]<a[0]+a[3]+256&&b[0]+b[3]+256>a[0]&&b[2]<a[2]+a[5]+256&&b[2]+b[5]+256>a[2]));
    occupied.push(b);
    if(seed!==42)continue;
    const template=JSON.parse(execFileSync('python3',['-c',
      `import json; from generation_demo_chunks_templates import building_long_template; print(json.dumps(building_long_template(${z.seed},${z.length})))`],{maxBuffer:30_000_000}));
    for(const rotation of [0,1]) {
      const box=[0,16,0,rotation?280:z.length,150,rotation?z.length:280];
      const result=populateBuildingLong({...z,rotation,box},template);
      assert.deepEqual(result.bridgePorts,populateBuildingLong({...z,rotation,box},template).bridgePorts);
      assert.equal(result.bridgePorts.length,4);
      for(const end of ['start','end']) {
        const ports=result.bridgePorts.filter(p=>p.end===end);
        assert.equal(ports.length,2);assert.equal(new Set(ports.map(p=>p.trail)).size,2);
      }
      const contains=(b,p)=>[0,1,2].every(i=>p[i]>=b[i]&&p[i]<b[i]+b[i+3]);
      for(const port of result.bridgePorts) {
        const {anchor,door,normal}=port,axis=rotation?2:0;
        assert.equal(anchor[axis],port.end==='start'?box[axis]:box[axis]+box[axis+3]-1);
        assert.deepEqual(door,[anchor[0]+normal[0],anchor[1]+1,anchor[2]+normal[2]]);
        assert.ok(result.boxes.some(b=>b[6]==='long_trail'&&contains(b,anchor)));
        for(const dy of [1,2])assert.ok(!result.boxes.some(b=>contains(b,[anchor[0],anchor[1]+dy,anchor[2]])));
      }
      assert.ok(result.stats.buildings>30&&result.stats.columns>=160&&result.stats.accepted_trails>0);
      for(const item of result.boxes)assert.ok([0,1,2].every(i=>Number.isInteger(item[i])&&Number.isInteger(item[i+3])&&item[i]>=box[i]&&item[i]+item[i+3]<=box[i]+box[i+3]));
      for(const kind of ['building','column','floor','stair','trail','window'])assert.ok(result.boxes.some(b=>b[6]===`long_${kind}`));
    }
  }
}
console.log('Four zones placed without overlaps; real templates, voxel bounds and both rotations verified.');
