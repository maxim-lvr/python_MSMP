import {overlaps} from './generation_demo_generator.js';
import {snakeAccessPlans} from './generation_demo_chunks_snake_ports.js';

export function connectVillageToWalls(area,mask,layout,occupied,settlements) {
  const axis=area.rotation?0:2,lateral=axis===0?2:0;
  const ports=[],decks=[],volumes=[];
  // Attach wall bridges to exposed two-wide edges of the existing walkway
  // network. House shells and their single entrance are never cut here.
  const cells=new Map();
  for(const b of area.boxes)if(['village_bridge','village_deck'].includes(b[6]))
    for(let x=b[0];x<b[0]+b[3];x++)for(let z=b[2];z<b[2]+b[5];z++) {
      const p=[x,b[1],z];cells.set(p.join(','),p);
    }
  for(const sign of [-1,1]) {
    const anchors=[...cells.values()].filter(p=>{
      const neighbor=[...p];neighbor[lateral]++;
      if(!cells.has(neighbor.join(',')))return false;
      return [p,neighbor].every(cell=>{
        const outside=[...cell];outside[axis]+=sign;
        return !cells.has(outside.join(','));
      });
    }).sort((a,b)=>sign*(b[axis]-a[axis]));
    let chosen;
    for(const anchor of anchors) {
        const headroom=[...anchor,1,3,1];headroom[1]++;headroom[lateral+3]=2;
        if(area.boxes.some(b=>overlaps(headroom,b)))continue;
        const start=[...anchor];start[axis]+=sign;
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
        const normal=[0,0,0];normal[axis]=sign;
        const port={village:area.id,side:sign<0?'first':'second',bridgeAnchor:[...anchor],
          pos:door.slice(0,3),normal,door,deck,volume};
        const candidate={...area,ports:[...ports,port],accessVolumes:[...volumes,volume]};
        try {
          snakeAccessPlans({...layout,settlements:[...settlements,candidate]},[],[],[],candidate.ports);
        }catch(error) {
          if(!error.message.startsWith('Aucun acces libre'))throw error;
          continue;
        }
        chosen=port;break;
    }
    if(!chosen)return null;
    ports.push(chosen);decks.push(chosen.deck);volumes.push(chosen.volume);
  }
  return {...area,boxes:[...area.boxes,...decks],ports,accessVolumes:volumes};
}
