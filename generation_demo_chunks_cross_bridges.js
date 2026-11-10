import {mergeBoxes, overlaps, subtract} from './generation_demo_generator.js';

export const CROSS_BRIDGE_MAX_LENGTH = 100;
const WIDTH = 2, HEADROOM = 3, FLOOR_STEP = 5;
const isBridge = b => b[6] === 'house_bridge' || b[6] === 'house_stair';
const clearance = b => [b[0]-2,b[1]-2,b[2]-2,b[3]+4,b[4]+4,b[5]+4];

// Wall strips cannot create crossings until both opposing facades have been placed.
export function addCavityCrossBridges(zone, houses, boxes, seed, obstacles = []) {
  let state = (seed ^ Math.imul(zone.id+1, 0x45d9f3b)) >>> 0;
  const integer = (a,b) => {
    state = (Math.imul(state,1664525)+1013904223) >>> 0;
    return a+Math.floor(state/4294967296*(b-a+1));
  };
  const target = integer(2,4), candidates = [], connections = [], doors = [], decks = [];
  // Cross the cavity's short axis, including wide halls, without spanning its full length.
  const maxLength=Math.max(CROSS_BRIDGE_MAX_LENGTH,
    Math.min(zone.width||0,zone.depth||0)*32);
  const bridgeObstacles=boxes.filter(isBridge).map(clearance);
  const solids=[...obstacles,...boxes.map(b=>isBridge(b)?clearance(b):b)];
  for(const [near,far,axis] of [['north','south',2],['west','east',0]]) {
    const lateral = axis === 0 ? 2 : 0;
    for(const first of houses.filter(h=>h.side===near))for(const second of houses.filter(h=>h.side===far)) {
      const a=first.box,b=second.box,start=a[axis]+a[axis+3],end=b[axis]-1;
      const length=end-start+1;
      if(length<3 || length>maxLength)continue;
      const lo=Math.max(a[lateral],b[lateral])+1;
      const hi=Math.min(a[lateral]+a[lateral+3],b[lateral]+b[lateral+3])-WIDTH-1;
      if(lo>hi)continue;
      const levels=[];
      for(let y=a[1];y+FLOOR_STEP<a[1]+a[4];y+=FLOOR_STEP)
        for(let v=b[1];v+FLOOR_STEP<b[1]+b[4];v+=FLOOR_STEP)
          if(Math.abs(v-y)<=Math.floor((length-1)/3))levels.push([y,v]);
      if(levels.length)candidates.push({first,second,axis,lateral,start,end,lo,hi,levels});
    }
  }
  for(let i=candidates.length-1;i>0;i--) {
    const j=integer(0,i);[candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  const used=new Set();
  for(const c of candidates) {
    if(connections.length>=target)break;
    if(used.has(c.first.id)||used.has(c.second.id))continue;
    const {axis,lateral,start,end}=c;
    const levels=[...c.levels];
    const otherHouses=houses.filter(h=>h!==c.first && h!==c.second).map(h=>h.box);
    for(let attempt=0;attempt<Math.min(16,c.levels.length);attempt++) {
      const [y,v]=levels.splice(integer(0,levels.length-1),1)[0];
      const low=Math.min(y,v),high=Math.max(y,v);
      if(connections.some(b=>low<=b.high+10 && high>=b.low-10))continue;
      const along=integer(c.lo,c.hi),route=[],volumes=[];
      for(let p=start;p<=end;p++) {
        const pos=[0,y+Math.sign(v-y)*Math.floor(Math.abs(v-y)*(p-start)/(end-start)),0];
        pos[axis]=p;pos[lateral]=along;
        const deck=[...pos,1,1,1,'house_bridge'];deck[lateral+3]=WIDTH;
        route.push(deck);
        const volume=deck.slice(0,6);volume[4]+=HEADROOM;volumes.push(volume);
      }
      const bounds=[0,low,0,1,high-low+HEADROOM+1,1];
      bounds[axis]=start;bounds[axis+3]=end-start+1;
      bounds[lateral]=along;bounds[lateral+3]=WIDTH;
      const blocked=[...otherHouses,...solids]
        .filter(b=>overlaps(bounds,b));
      if(volumes.some(s=>blocked.some(b=>overlaps(s,b))))continue;
      const entrances=[[start-1,y],[end+1,v]].map(([p,floor])=> {
        const door=[0,floor+1,0,1,HEADROOM,1];
        door[axis]=p;door[lateral]=along;door[lateral+3]=WIDTH;return door;
      });
      // Doors may remove facade blocks, but never another bridge or another building.
      if(entrances.some(d=>[...otherHouses,...obstacles,...bridgeObstacles]
        .some(b=>overlaps(d,b))))continue;
      doors.push(...entrances);decks.push(...route);
      connections.push({from:c.first.id,to:c.second.id,low,high,
        length:route.length,route:route.map(b=>b.slice(0,3)),doors:entrances});
      used.add(c.first.id);used.add(c.second.id);
      break;
    }
  }
  if(connections.length) {
    let opened=boxes;
    for(const door of doors)opened=opened.flatMap(b=>subtract(b,door));
    boxes.length=0;
    for(const b of opened)boxes.push(b);
    boxes.push(...mergeBoxes(decks));
  }
  return connections;
}
