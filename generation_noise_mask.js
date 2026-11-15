import {mergeBoxes} from './generation_demo_generator.js';
import {mapWorld} from './world_config.js';

export const NOISE_WORLD=mapWorld(10000);
export const NOISE_CELL=16;
export const EMPTY_BRIGHTNESS=0.94;

export function noiseMask(width,height,pixels,world=NOISE_WORLD) {
  const size=Math.ceil(world.length/NOISE_CELL),solid=new Uint8Array(size*size);
  const stride=size+1,prefix=new Uint32Array(stride*stride),empty=[],floor=[],walls=[];
  for(let z=0;z<size;z++)for(let x=0;x<size;x++) {
    const px=Math.min(width-1,Math.floor((x+.5)*NOISE_CELL/world.length*width));
    const pz=Math.min(height-1,Math.floor((z+.5)*NOISE_CELL/world.width*height));
    const p=(pz*width+px)*4,id=z*size+x;
    solid[id]=(pixels[p]+pixels[p+1]+pixels[p+2])/(255*3)<EMPTY_BRIGHTNESS?1:0;
    const k=(z+1)*stride+x+1;
    prefix[k]=(1-solid[id])+prefix[k-1]+prefix[k-stride]-prefix[k-stride-1];
    const sx=Math.min(NOISE_CELL,world.length-x*NOISE_CELL),sz=Math.min(NOISE_CELL,world.width-z*NOISE_CELL);
    (solid[id]?floor:empty).push([x*NOISE_CELL,0,z*NOISE_CELL,sx,solid[id]?1:world.height,sz,solid[id]?'noise_floor':'void']);
  }
  const emptyCount=box=>{
    const [x,,z,sx,,sz]=box;
    if(x<0||z<0||sx<=0||sz<=0||x+sx>world.length||z+sz>world.width)return null;
    const x0=Math.floor(x/NOISE_CELL),z0=Math.floor(z/NOISE_CELL),x1=Math.ceil((x+sx)/NOISE_CELL),z1=Math.ceil((z+sz)/NOISE_CELL);
    return [prefix[z1*stride+x1]-prefix[z0*stride+x1]-prefix[z1*stride+x0]+prefix[z0*stride+x0],(x1-x0)*(z1-z0)];
  };
  const isSolid=box=>emptyCount(box)?.[0]===0;
  const isVoid=box=>{const n=emptyCount(box);return n!==null&&n[0]===n[1];};
  for(let z=0;z<size;z++)for(let x=0;x<size;x++)if(solid[z*size+x]) {
    const bx=x*16,bz=z*16,sx=Math.min(16,world.length-bx),sz=Math.min(16,world.width-bz);
    if(x===0||!solid[z*size+x-1])walls.push([bx,1,bz,1,world.height-1,sz,'wall']);
    if(x===size-1||!solid[z*size+x+1])walls.push([bx+sx-1,1,bz,1,world.height-1,sz,'wall']);
    if(z===0||!solid[(z-1)*size+x])walls.push([bx,1,bz,sx,world.height-1,1,'wall']);
    if(z===size-1||!solid[(z+1)*size+x])walls.push([bx,1,bz+sz-1,sx,world.height-1,1,'wall']);
  }
  return {size,solid,isSolid,isVoid,voidBoxes:mergeBoxes(empty),floor:mergeBoxes(floor),walls:mergeBoxes(walls)};
}
