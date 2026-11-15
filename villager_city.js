import {subtract,mergeBoxes,overlaps} from './generation_demo_generator.js';

export const VILLAGER_CITY_AREA={length:200,width:80,height:100};
// Width, total height (including floor and roof), depth; equiprobable models.
export const VILLAGER_HOUSE_TYPES=[[8,6,8],[6,6,8],[7,6,8],[7,11,8]];
export function generateVillagerCity(seed=42) {
  let state=Number(seed)>>>0;
  const integer=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const houses=[],bridges=[],boxes=[];
  const plaza=[94,44,34,12,1,12,'deck'],reserved=[{box:[94,44,34,12,5,12],owner:-1}];
  boxes.push(plaza);
  const deckCells=new Map(),anchors=[];
  const inside=b=>b[0]>=3&&b[2]>=3&&b[0]+b[3]<=197&&b[2]+b[5]<=77&&b[1]>=4&&b[1]+b[4]<96;
  function branch(anchor,axis,sign,length,central=false) {
    const side=axis===0?2:0,start=anchor.point;
    const [sx,sy,sz]=VILLAGER_HOUSE_TYPES[integer(0,VILLAGER_HOUSE_TYPES.length-1)];
    const floor=central?44:start[1]+integer(-3,3),end=[...start];end[axis]+=sign*length;end[1]=floor;
    const house=[end[0]-Math.floor(sx/2),floor,end[2]-Math.floor(sz/2),sx,sy,sz];
    house[axis]=end[axis]-(sign<0?house[axis+3]-1:0);
    const padding=[house[0]-1,floor,house[2]-1,sx+2,sy,sz+2];
    if(!inside(padding)||reserved.some(r=>overlaps(padding,r.box)))return false;
    const path=[],decks=[],volumes=[];
    for(let i=0;i<=length;i++) {
      const p=[...start];p[axis]+=sign*i;
      p[1]=start[1]+Math.round((floor-start[1])*Math.max(0,Math.min(1,(i-3)/Math.max(1,length-5))));
      path.push(p);if(i===length)continue;
      const deck=[...p,1,1,1,'bridge'];deck[side]--;deck[side+3]=2;
      const v=[deck[0]-1,deck[1],deck[2]-1,deck[3]+2,5,deck[5]+2];
      if(!inside(v)||reserved.some(r=>overlaps(v,r.box)&&!(i<=3&&r.owner===anchor.owner)))return false;
      decks.push(deck);volumes.push(v);
    }
    const door=[...end,1,2,1];door[1]++;door[side]--;door[side+3]=2;
    const id=bridges.length;
    houses.push({id:houses.length,cx:house[0]+Math.floor(sx/2),cz:house[2]+Math.floor(sz/2),box:house,
      floors:sy===11?2:1,doors:[door],central});
    bridges.push({id,parent:anchor.owner,to:houses.length-1,path});
    reserved.push({box:house,owner:`house:${houses.length-1}`},...volumes.map(box=>({box,owner:id})));
    for(const deck of decks)for(let j=0;j<2;j++) {
      const p=deck.slice(0,3);p[side]+=j;
      if(!overlaps([...p,1,1,1],plaza))deckCells.set(p.join(','),[...p,1,1,1,'bridge']);
    }
    for(let i=3;i<path.length-4;i++)anchors.push({point:path[i],owner:id,axis:side});
    return true;
  }
  for(const [x,z,axis,sign] of [[95,34,2,-1],[104,34,2,-1],[95,45,2,1],[104,45,2,1],[94,40,0,-1],[105,40,0,1]])
    for(let attempt=0;attempt<20;attempt++)if(branch({point:[x,44,z],owner:-1},axis,sign,integer(8,10),true))break;
  for(let attempt=0;attempt<4000&&houses.length<30&&anchors.length;attempt++) {
    const anchor=anchors[integer(0,anchors.length-1)];
    branch(anchor,anchor.axis,integer(0,1)?1:-1,integer(10,28));
  }
  boxes.push(...deckCells.values());
  for(const house of houses) {
    const [x,y,z,sx,sy,sz]=house.box;
    let shell=[
      [x,y,z,sx,1,sz,'house'],[x,y+sy-1,z,sx,1,sz,'roof'],
      [x,y+1,z,sx,sy-2,1,'house'],[x,y+1,z+sz-1,sx,sy-2,1,'house'],
      [x,y+1,z+1,1,sy-2,sz-2,'house'],[x+sx-1,y+1,z+1,1,sy-2,sz-2,'house'],
    ];
    if(house.floors===2) {
      const door=house.doors[0];
      // Place stairs along a side wall, clear of the entrance. Both floors have four clear blocks.
      const stairX=door[0]===x?x+sx-2:x+1;
      const reverse=door[2]===z+sz-1,startZ=reverse?z+sz-2:z+1,sign=reverse?-1:1;
      let landing=[[x+1,y+5,z+1,sx-2,1,sz-2,'house']];
      for(let step=1;step<=5;step++) {
        const stairZ=startZ+sign*(step-1);
        shell.push([stairX,y+1,stairZ,1,step,1,'house']);
        if(step>=3)landing=landing.flatMap(b=>subtract(b,[stairX,y+5,stairZ,1,1,1]));
      }
      shell.push(...landing);
    }
    for(const door of house.doors)shell=shell.flatMap(b=>subtract(b,door));
    const windows=[];
    for(let floor=0;floor<house.floors;floor++)windows.push(
      [house.cx,y+3+floor*5,z,1,2,1,'window'],[house.cx,y+3+floor*5,z+sz-1,1,2,1,'window']);
    for(const window of windows)shell=shell.flatMap(b=>subtract(b,window));
    boxes.push(...shell,...windows);
  }
  const visited=new Set([-1]);
  for(const b of bridges) {
    if(!visited.has(b.parent))throw Error('Pont non relie a la place centrale');
    visited.add(b.id);
  }
  return {seed:Number(seed)>>>0,boxes:mergeBoxes(boxes),houses,bridges,
    spawn:[100,46.6,40],lookAt:[140,46.6,40],plaza,
    stats:{houses:houses.length,bridges:bridges.length}};
}
