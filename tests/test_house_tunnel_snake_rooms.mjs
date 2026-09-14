import assert from 'node:assert/strict';
import { generateSnake } from '../house_tunnel_snake_generator.js';

for(const seed of [42,0,1234]) {
  const d=generateSnake(seed,undefined,null,true),b=d.bounds;
  const boxes=Object.values(d.boxes).flat(),index=(x,z)=>(z-b.minZ)*b.width+x-b.minX;
  assert.ok(d.rooms.length>1000&&d.rearDoors.length>0&&d.rearDoors.length<60);
  assert.ok(d.rooms.every(r=>r.length>=15&&r.length<=30));
  const plane=y=>{
    const solid=new Uint8Array(b.width*b.depth);
    for(const [x,by,z,sx,sy,sz] of boxes)if(y>=by&&y<by+sy)
      for(let zz=z;zz<z+sz;zz++)solid.fill(1,index(x,zz),index(x+sx,zz));
    return solid;
  };
  for(let level=0;level<10;level++) {
    const rooms=d.rooms.filter(r=>r.level===level),floor=plane(level*4),roof=plane(level*4+4);
    const solid=plane(level*4+1),upper=plane(level*4+2),seen=new Set();
    for(const room of rooms)for(const [x,,z] of room.doorCells) {
      assert.equal(solid[index(x,z)],0,'Front door obstructed');
      assert.equal(upper[index(x,z)],0,'Door needs two air blocks');
      solid[index(x,z)]=1;
    }
    for(const room of rooms) {
      const [x,,z]=room.inside,start=index(x,z);
      assert.equal(solid[start],0);assert.ok(!seen.has(start),'Rooms are not separated');
      const queue=[start];seen.add(start);
      for(let k=0;k<queue.length;k++) {
        const i=queue[k];
        assert.ok(i%b.width>0&&i%b.width<b.width-1&&i>=b.width&&i<solid.length-b.width,'Unclosed room');
        assert.equal(floor[i],1,'Missing room floor');assert.equal(roof[i],1,'Missing room ceiling');
        for(const n of [i-1,i+1,i-b.width,i+b.width])if(!solid[n]&&!seen.has(n)){seen.add(n);queue.push(n);}
      }
      assert.ok(queue.length>=20,'Room too small');
    }
  }
  for(const {pos:[x,y,z],normal:[nx,,nz]} of d.rearDoors) {
    assert.equal(plane(y)[index(x,z)],1,'Orange marker missing');
    assert.equal(plane(y)[index(x-nx,z-nz)],0,'Rear door opens into a partition');
  }
  console.log({seed,rooms:d.rooms.length,rearDoors:d.rearDoors.length});
}
