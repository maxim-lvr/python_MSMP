import {subtract} from './generation_demo_generator.js';

// Open existing unused enclosure doors; preserve the 20% room population.
export function addUltraDenseEntrances(model,seed,padding) {
  let state=(seed^0x554c5452)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const sides=['north','south','west','east'],quota=Object.fromEntries(sides.map(s=>[s,1]));
  const target=integer(4,8);
  for(let extra=4;extra<target;extra++) {
    const eligible=sides.filter(s=>quota[s]<3);quota[eligible[integer(0,eligible.length-1)]]++;
  }
  const ports=[],air=[],shell=[];
  for(const side of sides) {
    const candidates=model.doors.filter(d=>d.part==='exterior'&&d.room===null&&d.side===side);
    for(let i=candidates.length-1;i>0;i--){const j=integer(0,i);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    const selected=[];
    for(const door of candidates) {
      if(selected.some(other=>Math.abs(other.along-door.along)<30))continue;
      selected.push(door);if(selected.length===quota[side])break;
    }
    if(selected.length!==quota[side])throw Error(`Pas assez de portes disponibles au cote ${side}`);
    for(const door of selected) {
      const axis=door.normal[0]?0:2,along=axis===0?2:0,start=door.position;
      const end=start.map((v,i)=>v+door.normal[i]*padding),floor=start[1]-1;
      const opening=[Math.min(start[0],end[0]),start[1],Math.min(start[2],end[2]),1,2,1];opening[axis+3]=padding+1;
      air.push(opening);
      const base=[...opening];base[1]=floor;base[4]=1;
      // Floors, ceiling and side walls form a supported, uncapped neck to the map network.
      for(const y of [floor,floor+3]){const b=[...base];b[1]=y;shell.push([...b,'outer_recess']);}
      for(const offset of [-1,1]){const b=[...opening];b[along]+=offset;shell.push([...b,'outer_recess']);}
      ports.push({id:ports.length,sourceDoor:door.id,side,entry:[...start],pos:end,normal:[...door.normal]});
      door.connected=true;
    }
  }
  model.boxes=model.boxes.flatMap(box=>{
    let pieces=[box];for(const cut of air)pieces=pieces.flatMap(piece=>subtract(piece,cut));return pieces;
  }).concat(shell);
  model.ports=ports;model.stats.entrances=ports.length;
  return model;
}
