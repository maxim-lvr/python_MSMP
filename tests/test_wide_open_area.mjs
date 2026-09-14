import assert from 'node:assert/strict';
import {generateWideOpenArea,AREA,LEVELS} from '../wide_open_area.js';
import {overlaps} from '../generation_demo_generator.js';

const requestedSeeds=process.argv.slice(2).map(Number);
for(const seed of requestedSeeds.length?requestedSeeds:[42,0,1234,4141286262,4294967295,10182426]) {
  const a=generateWideOpenArea(seed),b=generateWideOpenArea(seed);
  assert.deepEqual(a,b);
  assert.ok(a.towers.length>=18);assert.ok(a.houses.length>100);assert.ok(a.bridges.length>25);
  assert.ok(a.towers.every(t=>t.levels.length>=2&&t.levels.length<=5));
  assert.ok(new Set(a.towers.map(t=>t.levels.length)).size>1);
  const limits=[AREA.length,AREA.height,AREA.width];
  for(const box of a.boxes)assert.ok(box.slice(0,6).every(Number.isInteger)&&
    [0,1,2].every(i=>box[i]>=0&&box[i+3]>0&&box[i]+box[i+3]<=limits[i]),`Invalid box ${box}`);
  for(const [i,h] of a.houses.entries()) {
    assert.ok(!a.houses.slice(i+1).some(other=>overlaps(h.box,other.box)));
    assert.ok(!a.boxes.some(box=>overlaps(box,h.door)),`Blocked house entrance ${h.door}`);
  }
  const sample=point=>a.boxes.some(b=>[0,1,2].every(i=>point[i]>=b[i]&&point[i]<b[i]+b[i+3]));
  assert.ok(!sample(a.spawn),'Spawn inside geometry');
  const occupiedLevels=new Set();
  for(const bridge of a.bridges) {
    const start=a.terraces[bridge.from],end=a.terraces[bridge.to];
    occupiedLevels.add(start.level);
    assert.equal(bridge.path[0][1],start.y);assert.equal(bridge.path.at(-1)[1],end.y);
    for(const [i,p] of bridge.path.entries()) {
      if(i) {
        const previous=bridge.path[i-1];
        assert.equal(Math.abs(p[0]-previous[0])+Math.abs(p[2]-previous[2]),1);
        assert.ok(Math.abs(p[1]-previous[1])<=1);
      }
      // Test headroom at regular samples and at both landings.
      if(i%12===0||i===bridge.path.length-1) {
        assert.ok(sample(p),`Missing bridge floor ${p}`);
        for(const dy of [1,2])assert.ok(!sample([p[0],p[1]+dy,p[2]]),`Blocked bridge ${p}`);
      }
    }
  }
  assert.equal(occupiedLevels.size,LEVELS.length);
  const details=a.details;
  assert.equal(details.pipe.points.length,4); // Two elbows, no meandering route.
  assert.equal(details.pipe.points[0][details.pipe.axis],0);
  assert.equal(details.pipe.points.at(-1)[details.pipe.axis],(details.pipe.axis===0?AREA.length:AREA.width)-1);
  assert.equal(details.buildings.filter(b=>b.anchor==='ground').length,7);
  assert.equal(details.buildings.filter(b=>b.anchor==='ceiling').length,7);
  assert.equal(details.pillars.length,18);
  for(const [i,p] of details.pillars.entries())for(const q of details.pillars.slice(i+1))assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=90);
  for(const [i,p] of details.buildings.entries())for(const q of details.buildings.slice(i+1)) {
    const a=p.reservation,b=q.reservation;
    assert.ok(Math.hypot(Math.max(0,a[0]-b[0]-b[3],b[0]-a[0]-a[3]),Math.max(0,a[2]-b[2]-b[5],b[2]-a[2]-a[5]))>=22);
  }
  for(const building of details.buildings) {
    const box=building.box;
    assert.ok(box[4]<AREA.height);
    assert.equal(building.anchor==='ground'?box[1]:box[1]+box[4],building.anchor==='ground'?1:AREA.height);
  }
  const reservations=[...details.pipe.volumes,...details.buildings.map(b=>b.reservation),...details.pillars.map(p=>p.reservation)];
  for(const detail of [...details.buildings,...details.pillars])
    assert.ok(!reservations.some(b=>b!==detail.reservation&&overlaps(b,detail.reservation)),'Decorations collide');
  for(const t of a.terraces)assert.ok(!reservations.some(b=>overlaps(b,[t.x-t.radius,t.y,t.z-t.radius,t.radius*2+1,4,t.radius*2+1])),'Terrace blocked');
  for(const bridge of a.bridges)for(const [x,y,z] of bridge.path)
    assert.ok(!reservations.some(b=>overlaps(b,[x-2,y,z-2,5,4,5])),'Bridge blocked by decoration');
  const pipeBoxes=details.boxes.filter(b=>b[6]==='pipe'||b[6]==='pipe_band');
  for(let i=1;i<details.pipe.points.length;i++) {
    const start=details.pipe.points[i-1],end=details.pipe.points[i],axis=start[0]===end[0]?2:0;
    for(let step=0;step<=Math.abs(end[axis]-start[axis]);step++) {
      const p=[...start];p[axis]+=Math.sign(end[axis]-start[axis])*step;
      assert.ok(!pipeBoxes.some(b=>[0,1,2].every(j=>p[j]>=b[j]&&p[j]<b[j]+b[j+3])),'Pipe bore capped');
    }
  }
  console.log({seed,...a.stats,boxes:a.boxes.length});
}
assert.throws(()=>generateWideOpenArea(-1));
