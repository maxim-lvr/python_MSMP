import {WORLD_HEIGHT} from '../world_config.js';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateChunks } from '../generation_demo_chunks_generator.js';
import { generateDemoSnakes } from '../generation_demo_chunks_snakes.js';
import { placeBuildingLong, populateBuildingLong } from '../generation_demo_chunks_building_long.js';
import { populateChunks, NETWORK_FLOOR, DENSE_ROOMS_PER_SECTOR } from '../generation_demo_chunks_houses.js';

const S=5000;
const key=(x,y,z)=>(y*S+z)*S+x;
const contains=(b,x,y,z)=>x>=b[0]&&x<b[0]+b[3]&&y>=b[1]&&y<b[1]+b[4]&&z>=b[2]&&z<b[2]+b[5];
const densityTest=process.argv.includes('--density');
const seedOption=process.argv.find(arg=>arg.startsWith('--seed='));
for(const seed of densityTest?[seedOption?Number(seedOption.split('=')[1]):42]:[42,0,1234,98765,4294967295]) {
  const templates=JSON.parse(execFileSync('python3',['-c',
    `import json; from generation_demo_chunks_templates import wall_templates; print(json.dumps(wall_templates(${seed})))`],{maxBuffer:20_000_000}));
  const count=seed===42?54:18;
  const start=performance.now();
  const layout=generateChunks(seed);
  if(process.argv.includes('--buildings'))layout.buildingLong=placeBuildingLong(layout).map(zone=> {
    const template=JSON.parse(execFileSync('python3',['-c',
      `import json; from generation_demo_chunks_templates import building_long_template; print(json.dumps(building_long_template(${zone.seed},${zone.length})))`],{maxBuffer:30_000_000}));
    return populateBuildingLong(zone,template);
  });
  if(process.argv.includes('--snakes'))layout.snakes=generateDemoSnakes(layout);
  const d=populateChunks(layout,templates,count,true,densityTest?DENSE_ROOMS_PER_SECTOR:null);
  for(const zone of layout.buildingLong||[]) {
    const overlaps=b=>[0,1,2].every(i=>b[i]<zone.box[i]+zone.box[i+3]&&b[i]+b[i+3]>zone.box[i]);
    assert.ok(!d.networkBoxes.some(overlaps)&&!d.ladderBoxes.some(overlaps),'Network intersects Building Long');
    assert.ok(!d.denseRooms.some(r=>overlaps(r.box)),'Dense room inside Building Long');
    assert.ok(!(d.snakes||[]).some(s=>s.volumes.some(overlaps)),'Snake intersects Building Long');
    const ports=d.ports.filter(p=>p.buildingLong===zone.id);
    assert.equal(ports.length,4);
    for(const end of ['start','end']) {
      const selected=ports.filter(p=>p.end===end);
      assert.equal(selected.length,2);assert.equal(new Set(selected.map(p=>p.trail)).size,2);
    }
    for(const p of ports) {
      const y=p.door[1],shaft=d.shafts.find(s=>s.id===p.shaft);
      assert.ok(shaft.ports.includes(p.id));
      for(let i=1;i<p.access.length;i++) {
        const a=p.access[i-1],b=p.access[i],length=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
        for(let j=0;j<=length;j++) {
          const x=a[0]+Math.sign(b[0]-a[0])*j,z=a[1]+Math.sign(b[1]-a[1])*j;
          assert.ok(d.air.has(key(x,y,z))&&d.air.has(key(x,y+1,z)),'Disconnected Building Long access');
          assert.ok((x===shaft.x&&z===shaft.z)||d.solid.has(key(x,y-1,z))||zone.boxes.some(b=>contains(b,x,y-1,z)),`Missing Building Long access floor: ${x},${y-1},${z}`);
          assert.ok(!zone.boxes.some(b=>contains(b,x,y,z)||contains(b,x,y+1,z)),'Blocked Building Long access');
        }
      }
    }
  }
  assert.equal(d.stats.buildingConnections,(layout.buildingLong?.length||0)*4);
  if(layout.snakes) {
    const overlaps=(a,b)=>[0,1,2].every(i=>a[i]<b[i]+b[i+3]&&a[i]+a[i+3]>b[i]);
    // Accesses may use the two-block reservation margin, but not the actual building.
    const volumes=layout.snakes.flatMap(s=>s.volumes.map(([x,y,z,sx,sy,sz])=>[x+2,y,z+2,sx-4,sy,sz-4]));
    const snakePorts=d.ports.filter(p=>p.snake!==undefined);
    const necks=snakePorts.map(p=>[p.door[0]-3,p.door[1]-1,p.door[2]-3,7,4,7]);
    for(const box of [...d.networkBoxes,...d.ladderBoxes])for(const v of volumes)if(overlaps(box,v)) {
      const low=[0,1,2].map(i=>Math.max(box[i],v[i]));
      const high=[0,1,2].map(i=>Math.min(box[i]+box[i+3],v[i]+v[i+3]));
      assert.ok(necks.some(n=>[0,1,2].every(i=>low[i]>=n[i]&&high[i]<=n[i]+n[i+3])),`Dense construction intersects snake: ${box}`);
    }
    assert.equal(snakePorts.length,layout.snakes.reduce((n,s)=>n+s.rearDoors.length,0));
    for(const p of snakePorts) {
      const [x,y,z]=p.door,snake=layout.snakes[p.snake];
      const shaft=d.shafts.find(s=>s.id===p.shaft);
      assert.ok(!snake.boxes.some(b=>contains(b,x,y,z)||contains(b,x,y+1,z)),'Snake entrance is blocked');
      for(let i=1;i<p.access.length;i++) {
        const a=p.access[i-1],b=p.access[i],length=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
        for(let j=0;j<=length;j++) {
          const px=a[0]+Math.sign(b[0]-a[0])*j,pz=a[1]+Math.sign(b[1]-a[1])*j;
          assert.ok(d.air.has(key(px,y,pz))&&d.air.has(key(px,y+1,pz)),'Disconnected access');
          assert.ok((px===shaft.x&&pz===shaft.z)||d.solid.has(key(px,y-1,pz))||snake.boxes.some(b=>contains(b,px,y-1,pz)),`Missing access floor: ${px},${y-1},${pz}`);
        }
      }
      assert.ok(shaft.ports.includes(p.id));
      assert.ok(d.air.has(key(shaft.x,shaft.bottom+1,shaft.z)));
    }
    console.log({snakeDoors:snakePorts.length});
  }
  if(densityTest) {
    assert.ok(d.denseRooms.length>10000);
    assert.equal(d.stats.connectedDense,d.denseRooms.length);
    assert.equal(d.stats.connectedDoors,d.ports.filter(p=>p.buildingLong===undefined).length);
    assert.equal(d.stats.components,1);
    const sectors=new Map();
    for(const room of d.denseRooms) {
      const b=room.box,id=`${Math.floor(b[0]/128)},${Math.floor(b[2]/128)}`;
      sectors.set(id,(sectors.get(id)||0)+1);
      assert.ok(b[3]>=5&&b[3]<=30&&b[5]>=5&&b[5]<=30);
      assert.ok(b[1]+b[4]<=WORLD_HEIGHT);
    }
    assert.ok(new Set(d.denseRooms.map(r=>r.box[1])).size>100);
    assert.ok(new Set(d.denseRooms.map(r=>r.box[0]%32)).size>25);
    const heightBands=Array(Math.ceil(WORLD_HEIGHT/50)).fill(0);
    for(const room of d.denseRooms)heightBands[Math.floor(room.box[1]/50)]++;
    assert.ok(sectors.size>800,`Horizontal sectors: ${sectors.size}; height distribution: ${heightBands}`);
    assert.ok(heightBands.every((n,i)=>n>d.denseRooms.length*0.48*Math.min(50,WORLD_HEIGHT-i*50)/WORLD_HEIGHT),`Height distribution: ${heightBands}`);
    assert.ok(d.denseRooms.some(r=>r.box[1]<12));
    assert.ok(d.denseRooms.some(r=>r.box[1]+r.box[4]>288));
    const reached=new Set();
    for(const c of d.growthConnections) {
      assert.ok(c.from===null||reached.has(c.from));reached.add(c.to);
      assert.ok(c.path.every((p,i)=>!i||Math.abs(p[1]-c.path[i-1][1])<=1));
      for(const [i,p] of c.path.entries()) {
        assert.ok(d.air.has(key(p[0],p[1]+1,p[2]))&&d.air.has(key(p[0],p[1]+2,p[2])));
        assert.ok(!d.air.has(key(...p)),'Missing floor on growth route');
        if(c.path[i+1]?.[1]>p[1])assert.ok(d.air.has(key(p[0],p[1]+3,p[2])));
      }
    }
    assert.equal(reached.size,d.denseRooms.length);
    assert.ok(d.denseRooms.every(r=>Object.keys(r.openings).length<=3));
    console.log(JSON.stringify({rooms:d.denseRooms.length,sectors:sectors.size,
      average:d.denseRooms.length/sectors.size,heightBands,doors:d.ports.length,seconds:(performance.now()-start)/1000}));
    continue;
  }
  assert.equal(d.denseRooms.length,count);
  assert.equal(d.stats.components,1);
  const doorSet=new Set(d.ports.flatMap(p=>[key(...p.door),key(p.door[0],p.door[1]+1,p.door[2])]));
  for(const z of d.zones) for(const side of ['north','south','east','west'])
    assert.ok(d.houses.some(h=>h.zone===z.id&&h.side===side));
  for(const group of d.wallGroups)for(const b of [...group.boxes,...group.walls]) {
    assert.ok(b.slice(0,6).every(Number.isInteger));
    assert.ok(b[0]>=0&&b[1]>=0&&b[2]>=0&&b[0]+b[3]<=5000&&b[1]+b[4]<=WORLD_HEIGHT&&b[2]+b[5]<=5000);
    // Orange markers have really been removed from the solid house shell.
    for(const p of d.ports.filter(p=>p.zone===group.zone)) assert.ok(!contains(b,...p.door));
  }
  for(const room of d.denseRooms) {
    assert.ok(room.box[3]>=5&&room.box[5]>=5&&room.box[3]<=30&&room.box[5]<=30);
    assert.ok(d.shafts.some(s=>s.id===room.shaft));
    assert.ok(d.air.has(key(...room.door)));
    for(const z of d.zones)assert.ok(!(
      room.box[0]<(z.x+z.width)*32&&room.box[0]+room.box[3]>z.x*32&&
      room.box[2]<(z.z+z.depth)*32&&room.box[2]+room.box[5]>z.z*32));
  }
  for(const p of d.ports) {
    assert.ok(d.air.has(key(...p.door)));
    assert.ok(d.air.has(key(p.door[0],p.door[1]+1,p.door[2])));
    assert.ok(d.shafts.some(s=>s.id===p.shaft));
  }
  for(const shaft of d.shafts) {
    assert.ok(d.solid.has(key(shaft.x,NETWORK_FLOOR,shaft.z)));
    assert.ok(d.solid.has(key(shaft.x,shaft.top+3,shaft.z)));
    for(let y=NETWORK_FLOOR+1;y<=shaft.top;y++) {
      assert.ok(d.air.has(key(shaft.x,y,shaft.z)));
      assert.ok(d.solid.has(key(shaft.x,y,shaft.z+1)));
    }
  }
  // Flood-fill the actual excavated cells, not the declared room graph.
  const first=d.denseRooms[0].door, seen=new Set([key(...first)]), queue=[key(...first)];
  for(let i=0;i<queue.length;i++)for(const delta of [1,-1,S,-S,S*S,-S*S]) {
    const next=queue[i]+delta;
    if(d.air.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}
  }
  for(const room of d.denseRooms)assert.ok(seen.has(key(...room.door)));
  for(const door of doorSet)assert.ok(seen.has(door));
  assert.equal(seen.size,d.air.size);
  assert.ok([...d.solid.keys()].every(k=>!d.air.has(k)));
  const shaftColumns=new Map(d.shafts.map(s=>[s.z*S+s.x,s]));
  const standable=k=>{
    if(!d.air.has(k)||!d.air.has(k+S*S))return false;
    if(!d.air.has(k-S*S))return true;
    const shaft=shaftColumns.get(k%(S*S));
    return shaft && Math.floor(k/(S*S))<=shaft.top+1;
  };
  const walking=new Set([key(...first)]),walkQueue=[key(...first)];
  for(let i=0;i<walkQueue.length;i++) {
    const k=walkQueue[i], shaft=shaftColumns.get(k%(S*S));
    const deltas=shaft?[1,-1,S,-S,S*S,-S*S]:[1,-1,S,-S];
    for(const delta of deltas) {
      const next=k+delta;
      if(!walking.has(next)&&standable(next)){walking.add(next);walkQueue.push(next);}
    }
  }
  for(const room of d.denseRooms)assert.ok(walking.has(key(...room.door)),'Room requires flying');
  for(const p of d.ports)assert.ok(walking.has(key(...p.door)),'Orange door requires flying');
  console.log(`Seed ${seed}: ${d.houses.length} wall houses, ${d.ports.length} doors, ${d.denseRooms.length} dense rooms, physical air connected (${seen.size} cells).`);
}
