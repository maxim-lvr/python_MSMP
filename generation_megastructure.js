import {generateWideOpenArea} from './wide_open_area.js';
import {generateWideRestrictArea} from './wide_restrict_area.js';
import {generateVillagerCity} from './villager_city.js';
import {generateWaterRoomZone} from './water_room_zone.js';
import {generateSnake} from './house_tunnel_snake_generator.js';
import {mergeBoxes,subtract,overlaps} from './generation_demo_generator.js';
import {localTunnelNetwork} from './generation_demo_chunks_network.js';
import {galleryMeshes} from './generation_demo_chunks_galleries.js';
import {growDense} from './generation_demo_chunks_growth.js';
import {pipeNetworkBoxes} from './generation_demo_chunks_pipe.js';
import {mapWorld} from './world_config.js';

export const WORLD=mapWorld(5000);
const GRID=78,STEP=64;
const move=(b,p,prefix='')=>[b[0]+p[0],b[1]+p[1],b[2]+p[2],...b.slice(3,6),prefix+b[6]];
const point=(p,o)=>p.map((n,i)=>n+o[i]);
const distance=(a,b)=>a.reduce((s,n,i)=>s+Math.abs(n-b[i]),0);

function indexBoxes(boxes,size=64) {
  const buckets=new Map();
  const keys=function*(b){for(let x=Math.floor(b[0]/size);x<=Math.floor((b[0]+b[3]-1)/size);x++)
    for(let z=Math.floor(b[2]/size);z<=Math.floor((b[2]+b[5]-1)/size);z++)yield x+','+z;};
  for(const b of boxes)for(const k of keys(b)){if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(b);}
  return b=>[...new Set([...keys(b)].flatMap(k=>buckets.get(k)||[]))].filter(c=>overlaps(b,c));
}

function wallQuarter(template,w=768,d=160) {
  const boxes=[];
  for(const side of [0,1,2,3]) {
    const length=side<2?w:d,strip=length===64?64:side<2?256:128;
    for(let offset=length===64?0:16;offset+strip<=length;offset+=strip)for(const r of template.strips[strip].runs) {
      if(r.kind==='rear_door')continue;
      const [x,y,z]=r.pos,[sx,sy,sz]=r.size;
      boxes.push(side===0?[x+offset,y+28,z,sx,sy,sz,r.kind]:side===1?
        [x+offset,y+28,d-z-sz,sx,sy,sz,r.kind]:side===2?
        [z,y+28,x+offset,sz,sy,sx,r.kind]:[w-z-sz,y+28,x+offset,sz,sy,sx,r.kind]);
    }
  }
  boxes.push([0,0,0,w,1,d,'ground']);
  return {boxes,world:{length:w,width:d,height:280},spawn:[w===64?32:48,146,d/2],lookAt:[w-12,125,d/2]};
}

function cathedral(seed) {
  const boxes=[],add=b=>boxes.push(b);
  add([0,0,0,720,1,720,'ground']);
  add([270,84,170,180,1,420,'deck']);
  add([0,84,341,270,1,13,'bridge']);
  for(const z of [341,353])add([0,85,z,270,1,1,'trim']);
  let upper=[[0,170,342,720,1,11,'bridge'],[0,171,342,720,1,1,'trim'],[0,171,352,720,1,1,'trim']];
  for(let i=0;i<=86;i++) {
    add([10+i,84+i,346,1,1,3,'stair']);
    upper=upper.flatMap(b=>subtract(b,[10+i,85+i,346,1,3,3]));
  }
  for(const b of upper)add(b);
  for(const x of [300,352,404]) {
    add([x,85,430,28,177,28,'pillar']);
    for(const y of [85,140,210,258])add([x-4,y,426,36,4,36,'trim']);
    for(const dx of [0,26])for(const dz of [0,26])add([x+dx,262,430+dz,2,37,2,'trim']);
  }
  for(const [x,z,y,h] of [[110,80,0,212],[550,110,110,190],[110,550,180,120],[530,540,0,158]]) {
    add([x,y,z,54,h,70,'mass']);
    for(let yy=y+20;yy<y+h-12;yy+=38)add([x-3,yy,z-3,60,2,76,'trim']);
  }
  const city=generateVillagerCity(seed),cityPos=[260,40,220];
  for(const b of city.boxes)add(move(b,cityPos,'city_'));
  return {boxes,world:{length:720,width:720,height:300},spawn:[90,89.6,347],lookAt:[364,174,444]};
}

function skeleton(seed,templates,longModels) {
  let state=seed>>>0;
  const int=(a,b)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+Math.floor(state/4294967296*(b-a+1));};
  const rooms=[];
  const specs=[
    ['restrict','Faille des ateliers',850,850,24],['wall','Puits habite',2450,750,0],
    ['long','Nef des colonnes',4070,780,90],['open','Halle suspendue',820,2480,12],
    ['cathedral','Cathedrale des trois noyaux',2450,2420,0],['open','Cour des machines',4110,2390,12],
    ['bridge','Gouffre des passerelles',880,4130,0],['restrict','Strates profondes',2460,4090,24],
    ['long','Galerie des hauts immeubles',4020,4160,38],
  ];
  let longId=0;
  for(const [type,name,cx,cz,y] of specs) {
    const modelSeed=int(0,0xffffffff);
    let model;
    if(type==='open')model=generateWideOpenArea(modelSeed);
    if(type==='restrict')model=generateWideRestrictArea(modelSeed);
    if(type==='wall')model=wallQuarter(templates);
    if(type==='cathedral')model=cathedral(modelSeed);
    if(type==='long') {
      const t=longModels[longId++];model={boxes:t.boxes,world:{length:t.size[0],height:t.size[1],width:t.size[2]},spawn:[45,58,158],lookAt:[500,76,158]};
    }
    if(type==='bridge')model={boxes:templates.bridges[0].runs.map(r=>[...r.pos,...r.size,r.kind]),
      world:{length:1024,width:320,height:300},spawn:[30,150,160],lookAt:[750,140,160]};
    const o=[Math.floor(cx-model.world.length/2)+int(-2,2)*16,y,Math.floor(cz-model.world.width/2)+int(-2,2)*16];
    const box=[o[0]-48,0,o[2]-48,model.world.length+96,WORLD.height,model.world.width+96];
    const boxes=mergeBoxes(model.boxes.map(b=>move(b,o,type+'_')));
    rooms.push({id:rooms.length,type,name,box,boxes,spawn:point(model.spawn,o),lookAt:point(model.lookAt,o),origin:o});
  }
  for(const [i,x,z] of [[0,1800,2330],[1,3120,2500],[2,2440,3090],[3,1800,3350]]) {
    const m=wallQuarter(templates,64,64),o=[x,0,z];
    rooms.push({id:rooms.length,type:'wall',name:`Puits de service ${i+1}`,box:[x-32,0,z-32,128,WORLD.height,128],
      boxes:mergeBoxes(m.boxes.map(b=>move(b,o,'wall_'))),spawn:point(m.spawn,o),lookAt:point(m.lookAt,o),origin:o});
  }
  // Service habitats nest in the thickness between the main halls, at distinct elevations.
  for(const [i,cx,cz,y] of [[0,1380,1550,30],[1,4100,3290,212]]) {
    const m=generateWaterRoomZone(int(0,0xffffffff)),o=[cx,y,cz];
    rooms.push({id:rooms.length,type:'water',name:`Citerne ${i+1}`,box:[cx-24,y-8,cz-24,248,44,248],
      boxes:m.boxes.map(b=>move(b,o,'water_')),spawn:point(m.spawn,o),lookAt:point(m.lookAt,o),origin:o});
  }
  // Independent short snakes thread through the gaps between superblocks.
  for(const [i,x,z,y,sign] of [[0,520,1620,188,1],[1,2720,1640,32,1],[2,620,3310,144,1],[3,2940,3290,220,1]]) {
    const points=[{x,z},{x:x+sign*320,z},{x:x+sign*320,z:z+180},{x:x+sign*730,z:z+180}];
    const route={points,lengths:[320,180,410]};
    const m=generateSnake(int(0,0xffffffff),10,route,true),o=[0,y,0];
    const boxes=Object.entries(m.boxes).flatMap(([kind,values])=>values.map(b=>move([...b,kind],o,'snake_')));
    const volumes=points.slice(1).map((p,j)=>[Math.min(p.x,points[j].x)-18,y,Math.min(p.z,points[j].z)-18,
      Math.abs(p.x-points[j].x)+36,41,Math.abs(p.z-points[j].z)+36]);
    rooms.push({id:rooms.length,type:'snake',name:`Rue suspendue ${i+1}`,boxes,volumes,
      box:[x-18,y,z-18,766,41,216],spawn:[x+20,y+3,z],lookAt:[x+200,y+12,z],origin:o,
      explicitEntry:{anchor:[x,y,z],exit:[x-64,y,z]}});
  }
  return {rooms,int};
}

function access(room) {
  const query=indexBoxes(room.boxes);
  if(room.explicitEntry)return room.explicitEntry;
  const candidates=[];
  for(const b of room.boxes) {
    if(b[4]>2||!/floor|ground|deck|bridge|trail|stair|house$/.test(b[6]))continue;
    const y=b[1]+b[4]-1;
    for(const [axis,sign] of [[0,-1],[0,1],[2,-1],[2,1]]) {
      const p=[Math.floor(b[0]+b[3]/2),y,Math.floor(b[2]+b[5]/2)];
      const inset=b[axis+3]>=3?1:0;
      p[axis]=sign<0?b[axis]+inset:b[axis]+b[axis+3]-1-inset;
      const end=[...p];end[axis]=room.box[axis]+(sign<0?-32:room.box[axis+3]+32);
      const clear=[Math.min(p[0],end[0]),y+1,Math.min(p[2],end[2]),Math.abs(p[0]-end[0])+1,3,Math.abs(p[2]-end[2])+1];
      candidates.push({anchor:p,exit:end,cut:clear,score:distance(p,end)+Math.abs(y-104)*2+(y<10?180:0)});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  const chosen=candidates.find(c=>{
    const collisions=query(c.cut);
    // Water-room boundary gets one actual doorway; other models retain their geometry.
    return !collisions.length||(room.type==='water'&&collisions.every(b=>['water_boundary','water_water'].includes(b[6])));
  });
  if(!chosen)throw Error(`Aucun seuil libre : ${room.name}`);
  if(room.type==='water')room.boxes=room.boxes.flatMap(b=>subtract(b,chosen.cut));
  return chosen;
}

function roomEnvelope(room,doorway) {
  if(room.type==='snake')return [];
  const [x,y,z,sx,sy,sz]=room.box;
  let shells=[
    [x,y,z,sx,1,sz,'shell_floor'],[x,y+sy-1,z,sx,1,sz,'shell_roof'],
    [x,y+1,z,sx,sy-2,2,'shell_wall'],[x,y+1,z+sz-2,sx,sy-2,2,'shell_wall'],
    [x,y+1,z+2,2,sy-2,sz-4,'shell_wall'],[x+sx-2,y+1,z+2,2,sy-2,sz-4,'shell_wall'],
  ];
  const a=doorway.anchor,b=doorway.exit;
  const cut=[Math.min(a[0],b[0])-2,a[1]+1,Math.min(a[2],b[2])-2,Math.abs(a[0]-b[0])+5,7,Math.abs(a[2]-b[2])+5];
  const ribs=[];
  for(let xx=x+32;xx<x+sx-16;xx+=64)for(const zz of [z+2,z+sz-5])ribs.push([xx,y+1,zz,3,sy-2,3,'rib']);
  for(let yy=y+48;yy<y+sy-16;yy+=72)for(const zz of [z+2,z+sz-3])ribs.push([x+2,yy,zz,sx-4,2,1,'rib']);
  shells=shells.concat(ribs).flatMap(s=>subtract(s,cut));
  return shells;
}

function routesFor(rooms,seed) {
  const obstacles=rooms.flatMap(r=>r.volumes||[r.box]);
  const query=indexBoxes(obstacles);
  const blocked=new Uint8Array(GRID*GRID);
  const p=id=>[(id%GRID)*STEP+32,Math.floor(id/GRID)*STEP+32];
  for(let id=0;id<blocked.length;id++) {
    const [x,z]=p(id);
    if(x<96||z<96||x>4900||z>4900||query([x-40,0,z-40,81,WORLD.height,81]).length)blocked[id]=1;
  }
  const entries=rooms.map(room=>{
    const door=access(room),end=door.exit;
    const choices=[];
    for(let id=0;id<blocked.length;id++)if(!blocked[id]) {
      const [x,z]=p(id),d=Math.abs(x-end[0])+Math.abs(z-end[2]);
      if(d>256)continue;
      for(const corner of [[x,end[2]],[end[0],z]]) {
        const pts=[[end[0],end[2]],corner,[x,z]];
        if(pts.slice(1).every((b,i)=>!query([Math.min(b[0],pts[i][0])-2,0,Math.min(b[1],pts[i][1])-2,
          Math.abs(b[0]-pts[i][0])+5,WORLD.height,Math.abs(b[1]-pts[i][1])+5]).length)) {
          choices.push({id,pts,d});break;
        }
      }
    }
    choices.sort((a,b)=>a.d-b.d);
    if(!choices.length)throw Error(`Seuil sans galerie : ${room.name}`);
    return {room:room.id,...door,...choices[0]};
  });
  let state=(seed^0x43495459)>>>0;
  const random=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
  const coverage=[];
  // Seed inhabited streets throughout the footprint, not only between landmarks.
  for(let z=2;z<GRID-2;z+=4)for(let x=2;x<GRID-2;x+=4) {
    const choices=[];
    for(let dz=0;dz<4;dz++)for(let dx=0;dx<4;dx++) {
      const id=(z+dz)*GRID+x+dx;
      if(x+dx<GRID-2&&z+dz<GRID-2&&!blocked[id])choices.push(id);
    }
    if(choices.length)coverage.push(choices[random(choices.length)]);
  }
  const graph=localTunnelNetwork(GRID,blocked,[...entries.map(e=>e.id),...coverage],seed);
  const used=new Set(),edges=[];
  const connect=node=>{for(let id=node;graph.parents[id]>=0;id=graph.parents[id]) {
    if(used.has(id))break;used.add(id);edges.push([id,graph.parents[id]]);
  }};
  entries.forEach(e=>connect(e.id));const pipeEdges=[...edges];coverage.forEach(connect);
  const nodes=new Set(edges.flat()),pairs=new Set(edges.map(([a,b])=>[Math.min(a,b),Math.max(a,b)].join(',')));
  for(const id of nodes)for(const next of [id+1,id+GRID])if(nodes.has(next)&&
    (next!==id+1||Math.floor(next/GRID)===Math.floor(id/GRID))) {
    const pair=[id,next].join(',');
    if(!pairs.has(pair)){edges.push([id,next]);pairs.add(pair);}
  }
  const level=id=>{const [x,z]=p(id);return 132+Math.round(88*Math.sin(x/1200+seed%9)*Math.cos(z/1400));};
  return {entries,edges,pipeEdges,coverage,point:id=>{const [x,z]=p(id);return [x,level(id),z];}};
}

function* walkingPoints(paths) {
  for(const {points} of paths)for(let j=1;j<points.length;j++) {
    const a=points[j-1],b=points[j],n=Math.abs(a[0]-b[0])+Math.abs(a[2]-b[2]);
    if(!n)continue;
    const pad=Math.min(6,Math.max(0,Math.floor((n-Math.abs(b[1]-a[1]))/2)));
    for(let i=0;i<=n;i++)yield [a[0]+Math.sign(b[0]-a[0])*i,
      Math.round(a[1]+(b[1]-a[1])*Math.max(0,Math.min(1,(i-pad)/Math.max(1,n-2*pad)))),a[2]+Math.sign(b[2]-a[2])*i];
  }
}

export function corridorSections(paths) {
  const outer=[],inner=[];
  for(const {points,width=11,height=12} of paths)for(let j=1;j<points.length;j++) {
    const a=points[j-1],b=points[j],n=Math.abs(a[0]-b[0])+Math.abs(a[2]-b[2]);
    if(!n)continue;
    if(a[0]!==b[0]&&a[2]!==b[2])throw Error('Non axial gallery');
    const half=Math.floor(width/2);
    let last;
    for(let i=0;i<=n;i++) {
      const pad=Math.min(6,Math.max(0,Math.floor((n-Math.abs(b[1]-a[1]))/2)));
      const level=t=>Math.round(a[1]+(b[1]-a[1])*Math.max(0,Math.min(1,(t-pad)/Math.max(1,n-2*pad))));
      const p=[a[0]+Math.sign(b[0]-a[0])*i,level(i),a[2]+Math.sign(b[2]-a[2])*i];
      const box=[p[0]-half,p[1],p[2]-half,width,height,width,'main_tunnel'];
      const nextY=level(i+1);
      const air=[p[0]-half+1,p[1]+1,p[2]-half+1,width-2,height-2+(nextY>p[1]?1:0),width-2,'air'];
      // Keep stair surfaces local to their step; square footprints are reserved for flat landings.
      const axis=a[0]!==b[0]?0:2;
      if(a[1]!==b[1]){box[axis]=p[axis];box[axis+3]=1;air[axis]=p[axis];air[axis+3]=1;}
      if(last&&last.box[1]===box[1]&&a[1]!==b[1]&&last.air[4]===air[4]) {
        const min=Math.min(last.box[axis],box[axis]);
        last.box[axis+3]++;last.air[axis+3]++;last.box[axis]=last.air[axis]=min;
      }else{outer.push(box);inner.push(air);last={box,air};}
      if(a[1]===b[1]){box[axis]=Math.min(a[axis],b[axis])-half;box[axis+3]=n+width;
        air[axis]=box[axis]+1;air[axis+3]=box[axis+3]-2;break;}
    }
  }
  const shells=mergeBoxes(outer),air=mergeBoxes(inner),query=indexBoxes(shells);
  return {outer:shells,inner:air,contains:(x,y,z)=>query([x,y,z,1,1,1]).length>0,shafts:[]};
}

export function generateMegastructure(seed,templates,longModels,progress=()=>{},density=3) {
  const started=performance.now();
  progress('Composition des salles et des failles...');
  const {rooms,int}=skeleton(seed,templates,longModels),circulation=routesFor(rooms,seed);
  const paths=circulation.edges.map(([a,b],i)=>({points:[circulation.point(a),circulation.point(b)],width:i%9===0?17:11,height:i%9===0?22:12}));
  const boxes=[],shafts=[],visits=rooms.map(r=>({name:r.name,spawn:r.spawn,lookAt:r.lookAt}));
  for(const e of circulation.entries) {
    const room=rooms[e.room],target=circulation.point(e.id),y=e.anchor[1];
    const raw=[e.anchor,e.exit,...e.pts.slice(1).map(p=>[p[0],y,p[1]])];
    const points=raw.filter((p,i)=>!i||distance(p,raw[i-1])>0).map(p=>[...p]);
    const stair=Math.abs(y-target[1])<4;
    if(stair)points[points.length-1]=[...target];
    else {
      const previous=points.at(-2);
      if(previous[0]===target[0]&&previous[2]>target[2]) {
        points.pop();
        const z=Math.min(previous[2],target[2]+8);
        points.push([target[0],y,z],[target[0]+8,y,z],[target[0]+8,y,target[2]-4],
          [target[0],y,target[2]-4],[target[0],y,target[2]]);
      }
    }
    paths.push({points,width:3,height:5});
    const bottom=Math.min(y,target[1]),top=Math.max(y,target[1]);
    if(!stair) {
      const s={x:target[0],z:target[2],bottom,top};shafts.push(s);
      boxes.push([s.x,bottom+1,s.z,1,top-bottom,1,'ladder']);
      for(const yy of [bottom,top])for(const b of subtract([s.x-3,yy,s.z-3,7,1,7,'landing'],[s.x,yy,s.z,1,1,1]))boxes.push(b);
    }
    for(const b of roomEnvelope(room,e))boxes.push(b);
    visits.push({name:`Seuil : ${room.name}`,spawn:[target[0]-2,target[1]+2.6,target[2]],lookAt:[...e.exit.slice(0,1),y+2,e.exit[2]]});
  }
  progress('Galeries traversantes et logements dans l\'epaisseur...');
  const galleries=corridorSections(paths);galleries.shafts=shafts;
  const air=new Set(),key=(x,y,z)=>(y*WORLD.width+z)*WORLD.length+x;
  const galleryIndex=indexBoxes(galleries.outer);
  const pipeLevel=p=>Math.max(p[1]+38,...galleryIndex([p[0]-10,0,p[2]-10,21,WORLD.height,21]).map(b=>b[1]+b[4]+12));
  const pipePaths=circulation.pipeEdges.map(([a,b])=>{
    const p=circulation.point(a),q=circulation.point(b),pa=pipeLevel(p),pb=pipeLevel(q);
    const crossed=galleryIndex([Math.min(p[0],q[0])-10,0,Math.min(p[2],q[2])-10,Math.abs(p[0]-q[0])+21,WORLD.height,Math.abs(p[2]-q[2])+21]);
    const y=Math.max(pa,pb,...crossed.map(b=>b[1]+b[4]+12));
    return [[p[0],pa,p[2]],[p[0],y,p[2]],[q[0],y,q[2]],[q[0],pb,q[2]]];
  });
  const pipeVolumes=pipePaths.flatMap(path=>path.slice(1).map((b,i)=>[...b.map((n,j)=>Math.min(n,path[i][j])-9),
    ...b.map((n,j)=>Math.abs(n-path[i][j])+19)]));
  const layout={seed,world:WORLD,zones:[],wideAreas:rooms.map(r=>({box:r.box})),snakes:[],buildingLong:[],
    globalPipe:{volumes:pipeVolumes},denseSizeRanges:[[32,88,12,32],[32,88,12,32],[32,88,12,32],[16,40,8,16],[5,18,5,8]]};
  const growth=growDense({layout,houses:[],shafts,routes:[],galleries,target:Math.round(2400*density),integer:int,
    sizes:[5,22,5,9],addAir:(x,y,z)=>air.add(key(x,y,z))});
  for(const room of growth.rooms) {
    const [x,y,z,sx,sy,sz]=room.box;
    let shell=[[x,y,z,sx,1,sz,'dense'],[x,y+sy-1,z,sx,1,sz,'dense'],
      [x,y+1,z,sx,sy-2,1,'dense'],[x,y+1,z+sz-1,sx,sy-2,1,'dense'],
      [x,y+1,z+1,1,sy-2,sz-2,'dense'],[x+sx-1,y+1,z+1,1,sy-2,sz-2,'dense']];
    if(sx>=32&&sy>=12)for(let xx=x+8;xx<x+sx-4;xx+=16)
      for(const zz of [z-1,z+sz])shell.push([xx,y+1,zz,1,sy-2,1,'dense_rib']);
    for(const door of room.doors)shell=shell.flatMap(b=>subtract(b,[...door,1,2,1]));
    for(const door of room.doors)shell=shell.flatMap(b=>b[6]==='dense_rib'?subtract(b,[door[0]-1,door[1],door[2]-1,3,3,3]):[b]);
    boxes.push(...shell);
  }
  const tunnelCells=new Map();
  const insideRoom=indexBoxes(growth.rooms.map(r=>r.box));
  for(const k of air) {
    const x=k%5000,y=Math.floor(k/25000000),z=Math.floor(k/5000)%5000;
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const p=[x+dx,y+dy,z+dz],id=key(...p);
      if(!air.has(id)&&!galleries.contains(...p)&&!insideRoom([...p,1,1,1]).length)
        tunnelCells.set(id,[...p,1,1,1,'tunnel']);
    }
  }
  for(const b of mergeBoxes([...tunnelCells.values()]))boxes.push(b);
  for(const b of galleryMeshes(galleries,[],growth.connections))boxes.push(b);
  // A high access crossing a tall hall needs a landing, even inside the hall's carved volume.
  const innerIndex=indexBoxes(galleries.inner),headroom=new Set(),landings=new Map();
  for(const p of walkingPoints(paths))for(const h of [1,2])headroom.add(key(p[0],p[1]+h,p[2]));
  for(const p of walkingPoints(paths)) {
    if(!innerIndex([...p,1,1,1]).length||shafts.some(s=>p[0]===s.x&&p[2]===s.z&&p[1]>s.bottom&&p[1]<=s.top+2))continue;
    if(headroom.has(key(...p)))throw Error(`Galeries trop proches en ${p}`);
    landings.set(key(...p),[...p,1,1,1,'landing']);
  }
  for(const b of mergeBoxes([...landings.values()]))boxes.push(b);
  for(const room of rooms)for(const b of room.boxes)boxes.push(b);
  // The same connected circulation tree carries a higher industrial pipe network.
  progress('Reseau technique et assemblage...');
  for(const b of pipeNetworkBoxes(pipePaths,WORLD))boxes.push(b);
  visits.unshift({name:'Arrivee dans la cathedrale',spawn:rooms[4].spawn,lookAt:rooms[4].lookAt});
  return {seed,world:WORLD,boxes:boxes.filter(b=>b[3]>0&&b[4]>0&&b[5]>0),rooms:rooms.map(({boxes,...r})=>r),
    visits,paths,entries:circulation.entries,growthConnections:growth.connections,denseRooms:growth.rooms,
    stats:{rooms:rooms.length,dense:growth.rooms.length,galleries:paths.length,snakes:4,sectors:circulation.coverage.length,
      components:1,seconds:(performance.now()-started)/1000}};
}
