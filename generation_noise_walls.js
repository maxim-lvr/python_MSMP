import {subtract,overlaps} from './generation_demo_generator.js';
import {pipeBoreBoxes} from './generation_demo_chunks_pipe.js';

export function noiseWalls(mask,snakes,settlements=[],pipe=null) {
  let walls=mask.walls;
  for(const snake of snakes)for(const volume of snake.volumes)
    walls=walls.flatMap(wall=>subtract(wall,volume));
  for(const area of settlements)for(const port of area.ports||[])
    walls=walls.flatMap(wall=>subtract(wall,port.door));
  if(pipe?.paths?.length) {
    const buckets=new Map();
    function* keys(box) {
      for(let x=Math.floor(box[0]/128);x<=Math.floor((box[0]+box[3]-1)/128);x++)
        for(let z=Math.floor(box[2]/128);z<=Math.floor((box[2]+box[5]-1)/128);z++)yield `${x},${z}`;
    }
    for(const bore of [...pipeBoreBoxes(pipe.paths),...(pipe.accessAir||[])])for(const key of keys(bore)) {
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(bore);
    }
    walls=walls.flatMap(wall=>{
      const cuts=new Set();
      for(const key of keys(wall))for(const bore of buckets.get(key)||[])if(overlaps(wall,bore))cuts.add(bore);
      let pieces=[wall];
      for(const cut of cuts)pieces=pieces.flatMap(piece=>subtract(piece,cut));
      return pieces;
    });
  }
  return walls;
}

