export const MIN_ROOM_LENGTH = 15;
export const MAX_ROOM_LENGTH = 30;
export const REAR_DOOR_CHANCE = 1 / 48;

// Unfold both sides along the route; corner cells stay in the adjoining room.
export function snakeRoomStations(route, cells, coords, depths) {
  const normals=route.points.slice(1).map((p,i)=>({x:-Math.sign(p.z-route.points[i].z),z:Math.sign(p.x-route.points[i].x)}));
  const segments=[],lengths=[];
  for(let side=0;side<2;side++) {
    const offset=(side===0?1:-1)*(15-depths[side]+.5);
    const points=route.points.map((p,i)=>{
      const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)];
      const n=i===0||i===route.points.length-1?a:{x:a.x+b.x,z:a.z+b.z};
      return {x:p.x+offset*n.x,z:p.z+offset*n.z};
    });
    let distance=0;
    points.slice(1).forEach((b,i)=>{
      const a=points[i],length=Math.abs(b.x-a.x)+Math.abs(b.z-a.z);
      segments.push({a,side,dx:Math.sign(b.x-a.x),dz:Math.sign(b.z-a.z),length,start:distance});
      distance+=length;
    });
    lengths.push(distance);
  }
  const stations=new Map();
  for(const cell of cells) {
    const [bx,bz]=coords(cell),x=bx+.5,z=bz+.5;
    let best=Infinity,result;
    for(const s of segments) {
      const along=Math.max(0,Math.min(s.length,(x-s.a.x)*s.dx+(z-s.a.z)*s.dz));
      const d=(x-s.a.x-s.dx*along)**2+(z-s.a.z-s.dz*along)**2;
      if(d<best) {
        best=d;
        result={distance:Math.min(lengths[s.side]-1,Math.floor(s.start+along)),side:s.side};
      }
    }
    stations.set(cell,result);
  }
  return {stations,lengths};
}

export function partitionSnakeRooms({level,stations,lengths,cells,interior,passage,facade,coords,width,random,bridgeDoors}) {
  const rooms=[],ranges=[];
  for(let side=0;side<2;side++) {
    const length=lengths[side];
    const count=Math.round(length/22),ids=new Int32Array(length);
    let remaining=length,start=0;
    for(let n=0;n<count;n++) {
      const left=count-n-1,low=Math.max(MIN_ROOM_LENGTH,remaining-left*MAX_ROOM_LENGTH);
      const high=Math.min(MAX_ROOM_LENGTH,remaining-left*MIN_ROOM_LENGTH);
      const size=low+Math.floor(random()*(high-low+1)),id=rooms.length;
      rooms.push({side,level,start,length:size,door:null,rearDoor:null});
      ids.fill(id,start,start+size);start+=size;remaining-=size;
    }
    ranges.push(ids);
  }
  const labels=new Map(),walls=new Set(),fronts=rooms.map(()=>[]),backs=rooms.map(()=>[]);
  for(const i of cells)if(interior[i]&&!passage[i]) {
    const s=stations.get(i);labels.set(i,ranges[s.side][s.distance]);
  }
  const neighbours=i=>[i-1,i+1,i-width,i+width];
  for(const [i,id] of labels)if(!facade[i]) {
    if(neighbours(i).some(j=>labels.has(j)&&labels.get(j)<id))walls.add(i);
  }
  for(const [i,id] of labels) {
    if(facade[i]) {
      const inside=neighbours(i).find(j=>labels.get(j)===id&&!facade[j]&&!walls.has(j));
      if(inside!==undefined&&neighbours(i).some(j=>passage[j]))fronts[id].push({cell:i,inside});
    } else if(!walls.has(i)) {
      const wall=neighbours(i).find(j=>{
        if(!stations.has(j)||interior[j])return false;
        const normal=j-i,tangent=Math.abs(normal)===1?width:1;
        // Leave a three-wide exterior landing clear of the next wall at a bend.
        for(let step=1;step<=6;step++)for(let side=-1;side<=1;side++)
          if(stations.has(j+normal*step+tangent*side))return false;
        return true;
      });
      if(wall!==undefined)backs[id].push({cell:wall,inside:i});
    }
  }
  const doors=new Set(),rearDoors=[];
  for(const [id,room] of rooms.entries()) {
    const candidates=fronts[id];
    if(!candidates.length)throw Error(`Piece snake sans entree : etage ${level}, piece ${id}`);
    const attached=candidates.filter(p=>bridgeDoors.has(p.cell));
    const entry=attached[0]||candidates[Math.floor(random()*candidates.length)];
    // A two-block-wide bridge opening remains a single doorway.
    for(const p of attached.length?attached:[entry])doors.add(p.cell);
    const [x,z]=coords(entry.cell),[ix,iz]=coords(entry.inside);
    room.door=[x,level*4+1,z];room.inside=[ix,level*4+1,iz];
    room.doorCells=(attached.length?attached:[entry]).map(p=>{const [x,z]=coords(p.cell);return [x,level*4+1,z];});
    const rearChance=backs[id].length?random():1;
    // Preserve the existing seeded layout while thinning the original door candidates.
    if(rearChance<1/6) {
      const back=backs[id][Math.floor(random()*backs[id].length)];
      if(rearChance>=REAR_DOOR_CHANCE)continue;
      const [rx,rz]=coords(back.cell),[bx,bz]=coords(back.inside);
      room.rearDoor={pos:[rx,level*4+1,rz],normal:[rx-bx,0,rz-bz]};
      rearDoors.push(room.rearDoor);
    }
  }
  return {rooms,walls,doors,rearDoors};
}
