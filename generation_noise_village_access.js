import {overlaps,subtract} from './generation_demo_generator.js';
import {snakeAccessPlans} from './generation_demo_chunks_snake_ports.js';

export function connectVillageToWalls(area,mask,layout,occupied,settlements) {
  const axis=area.rotation?0:2,lateral=axis===0?2:0;
  const ports=[],decks=[],volumes=[],cuts=[];
  for(const sign of [-1,1]) {
    const houses=[...area.houses].sort((a,b)=>sign*(b.box[axis]-a.box[axis]));
    let chosen;
    for(const house of houses) {
      const h=house.box,facade=h[axis]+(sign>0?h[axis+3]-1:0);
      for(let along=h[lateral]+1;along<=h[lateral]+h[lateral+3]-3;along++) {
        const start=[0,h[1],0];start[axis]=facade+sign;start[lateral]=along;
        let wall;
        for(let step=0;step<400;step++) {
          const p=[...start];p[axis]+=step*sign;
          const b=[...p,1,4,1];b[lateral+3]=2;
          if(mask.isVoid(b))continue;
          // The full bridge width must meet a solid bank, with room for the tunnel neck.
          const bank=[...p,1,4,1];bank[axis+3]=24;bank[lateral]-=1;bank[lateral+3]=4;
          if(sign<0)bank[axis]-=23;
          if(mask.isSolid(bank))wall=p;
          break;
        }
        if(!wall)continue;
        const deck=[...start,1,1,1,'village_bridge'];deck[lateral+3]=2;
        deck[axis]=Math.min(start[axis],wall[axis]-sign);
        deck[axis+3]=Math.abs(wall[axis]-start[axis]);
        if(deck[axis+3]<1)continue;
        const volume=deck.slice(0,6);volume[4]=4;
        if([...occupied,...area.boxes,...volumes].some(b=>overlaps(volume,b)))continue;
        const door=[...wall,1,3,1];door[1]++;door[lateral+3]=2;
        const houseDoor=[...door];houseDoor[axis]=facade;
        const normal=[0,0,0];normal[axis]=sign;
        const port={village:area.id,side:sign<0?'first':'second',house:house.id,
          pos:door.slice(0,3),normal,door,houseDoor,deck,volume};
        const candidate={...area,ports:[...ports,port],accessVolumes:[...volumes,volume]};
        try {
          snakeAccessPlans({...layout,settlements:[...settlements,candidate]},[],[],[],candidate.ports);
        }catch(error) {
          if(!error.message.startsWith('Aucun acces libre'))throw error;
          continue;
        }
        chosen=port;break;
      }
      if(chosen)break;
    }
    if(!chosen)return null;
    ports.push(chosen);decks.push(chosen.deck);volumes.push(chosen.volume);cuts.push(chosen.houseDoor);
  }
  let boxes=area.boxes;
  for(const cut of cuts)boxes=boxes.flatMap(b=>subtract(b,cut));
  return {...area,boxes:[...boxes,...decks],ports,accessVolumes:volumes};
}
