import {WORLD_HEIGHT} from '../world_config.js';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {noiseMask} from '../generation_noise_mask.js';
import {generateNoiseMap} from '../generation_noise_generator.js';
import {localTunnelNetwork} from '../generation_demo_chunks_network.js';

const blocked=new Uint8Array([0,0,0,1,1,1,0,0,0]);
assert.throws(()=>localTunnelNetwork(3,blocked,[0,2,6,8],42),/Disconnected/);
const forest=localTunnelNetwork(3,blocked,[0,2,6,8],42,true);
assert.equal(forest.roots.length,2);
assert.equal(forest.order.length,6);
for(const node of forest.order)assert(!blocked[node]);

const pixels=new Uint8Array(4*4*4).fill(255);
for(let z=0;z<4;z++)for(const x of [0,1,3])pixels.fill(0,(z*4+x)*4,(z*4+x)*4+3);
const mask=noiseMask(4,4,pixels,{length:64,width:64,height:30});
assert(mask.isSolid([0,0,0,32,30,64]));
assert(!mask.isSolid([31,0,0,2,1,1]));
assert(!mask.isSolid([-1,0,0,2,1,1]));
assert(!mask.isSolid([63,0,0,2,1,1]));
assert.equal(mask.voidBoxes.reduce((sum,b)=>sum+b[3]*b[5],0),16*64);
assert.equal(mask.floor.reduce((sum,b)=>sum+b[3]*b[5],0),48*64);

let image={width:4,height:4,data:pixels},density=.1;
if(process.argv.includes('--image')) {
  image=JSON.parse(execFileSync('python3',['-c',
    'from PIL import Image; import json,base64; im=Image.open("noisemap_10000_redone_16.png").convert("RGBA"); print(json.dumps(dict(width=im.width,height=im.height,data=base64.b64encode(im.tobytes()).decode())))'
  ],{maxBuffer:100e6}));
  image.data=Buffer.from(image.data,'base64');density=2;
}
const result=generateNoiseMap(42,image,density),shape=noiseMask(image.width,image.height,image.data);
assert(result.denseRooms.length>0);
assert.equal(result.stats.connectedDense,result.denseRooms.length);
for(const room of result.denseRooms) {
  assert(shape.isSolid(room.box),'Room crosses a fissure');
  assert(room.doors.length>=1);
}
for(const b of result.networkBoxes) {
  assert(b.slice(0,6).every(Number.isInteger));
  assert(b.slice(3,6).every(v=>v>0));
  assert(b[1]>=0&&b[1]+b[4]<=WORLD_HEIGHT);
  assert(shape.isSolid(b),'Structure crosses a fissure');
}
if(!process.argv.includes('--image')) {
  const again=generateNoiseMap(42,image,density);
  assert.deepEqual(result.networkBoxes,again.networkBoxes);
  assert.equal(result.noise.components,2);
}
console.log(`Noise: ${result.denseRooms.length} rooms, ${result.noise.components} sectors, ${result.noise.seconds.toFixed(2)}s; bounds and fissures OK`);
