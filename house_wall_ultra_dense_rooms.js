import {subtract} from './generation_demo_generator.js';

export function populateUltraDense(data,config,seed) {
  let state=seed>>>0;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const doors=[],rooms=[],facades=[],cuts=new Map();
  const spacing=Math.max(config.doorSpacing,config.roomWidth+1);
  const cornerMargin=Math.max(spacing,config.wallThickness+config.roomDepth-1+Math.floor(config.roomWidth/2));
  const [tx,,tz,tl,,tw]=data.tower.box,[cx,,cz,cl,,cw]=data.courtyard.box;
  function sides(prefix,x,z,length,width,inside) {
    for(const [side,axis,along,start,end,surface,sign] of [
      ['north',2,0,x,x+length,z,1],['south',2,0,x,x+length,z+width-1,-1],
      ['west',0,2,z,z+width,x,1],['east',0,2,z,z+width,x+length-1,-1],
    ])facades.push({group:`${prefix}_${side}`,side,axis,along,start,end,surface,
      sign:inside?sign:-sign,part:inside?'interior':'exterior'});
  }
  sides('tower',tx,tz,tl,tw,true);
  // Enclosure entrances face the courtyard; rooms extend behind the outside walls.
  sides('outer',cx-1,cz-1,cl+2,cw+2,false);
  for(const face of facades)for(let y=2;y+config.storeyHeight<=config.height;y+=config.storeyHeight)
    for(let along=face.start+cornerMargin;along<=face.end-cornerMargin;along+=spacing) {
      const transform=(u,v,d,su,sy,sd,kind)=>{
        const p=[0,y+v,0],size=[0,sy,0];p[face.along]=along+u;
        p[face.axis]=face.surface+face.sign*d+(face.sign<0?1-sd:0);
        size[face.along]=su;size[face.axis]=sd;return [...p,...size,kind];
      };
      doors.push({id:doors.length,group:face.group,side:face.side,part:face.part,y,along,
        position:transform(0,1,config.recessDepth,1,2,1).slice(0,3),normal:[face.axis===0?face.sign:0,0,face.axis===2?face.sign:0],
        room:null,transform});
    }
  const shuffled=[...doors];
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  const occupied=new Set(shuffled.slice(0,Math.round(doors.length*config.population)).map(d=>d.id));
  data.groups.rooms_interior=[];data.groups.rooms_exterior=[];
  for(const door of doors) {
    const box=door.transform,entry=config.recessDepth;
    const depth=occupied.has(door.id)?config.wallThickness-entry:config.recessDepth;
    const key=`${door.group}:${door.y+1}`;
    if(!cuts.has(key))cuts.set(key,[]);cuts.get(key).push(box(0,1,entry,1,2,depth).slice(0,6));
    door.lining=[];
    if(occupied.has(door.id)) {
      const half=Math.floor(config.roomWidth/2),start=config.wallThickness,depth=config.roomDepth-1;
      const shell=[box(-half,0,start,config.roomWidth,1,depth,'room_floor'),
        box(-half,5,start,config.roomWidth,1,depth,'room_wall'),
        box(-half,1,start,1,4,depth,'room_wall'),box(config.roomWidth-half-1,1,start,1,4,depth,'room_wall'),
        box(1-half,1,start+depth-1,config.roomWidth-2,4,1,'room_wall')];
      if(door.part==='interior'&&door.y===0)shell.shift(); // The tower's ground already supplies this floor.
      data.groups[`rooms_${door.part}`].push(...shell);
      const spawn=box(0,0,entry-2,1,1,1).slice(0,3),lookAt=box(0,0,start+2,1,1,1).slice(0,3);
      spawn[0]+=.5;spawn[1]+=2.6;spawn[2]+=.5;lookAt[0]+=.5;lookAt[1]+=2.6;lookAt[2]+=.5;
      door.room=rooms.length;
      rooms.push({id:rooms.length,door:door.id,part:door.part,
        box:box(-half,0,config.wallThickness-1,config.roomWidth,config.storeyHeight,config.roomDepth).slice(0,6),spawn,lookAt});
    }else{
      // Empty doors remain blind niches behind the recessed facade.
      door.lining=[box(0,0,entry+1,1,1,3,'outer_recess'),box(0,3,entry+1,1,1,3,'outer_recess'),
        box(-1,1,entry+1,1,2,3,'outer_recess'),box(1,1,entry+1,1,2,3,'outer_recess'),
        box(0,1,entry+3,1,2,1,'outer_recess')];
    }
  }
  for(const face of facades) {
    data.groups[face.group]=data.groups[face.group].flatMap(b=>{
      let pieces=[b];for(const cut of cuts.get(`${face.group}:${b[1]}`)||[])pieces=pieces.flatMap(p=>subtract(p,cut));
      return pieces;
    });
  }
  for(const door of doors){data.groups[door.group].push(...door.lining);delete door.transform;delete door.lining;}
  data.boxes=Object.values(data.groups).flat();
  data.doors=doors;data.rooms=rooms;
  const low=[0,1,2].map(i=>Math.min(...data.boxes.map(b=>b[i])));
  const high=[0,1,2].map(i=>Math.max(...data.boxes.map(b=>b[i]+b[i+3])));
  data.bounds=[...low,...high.map((v,i)=>v-low[i])];
  Object.assign(data.stats,{doors:doors.length,houses:rooms.length,solidBoxes:data.boxes.length,
    population:rooms.length/doors.length,doorSpacing:spacing});
  return data;
}
