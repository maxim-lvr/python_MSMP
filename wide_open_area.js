import {mergeBoxes,subtract,overlaps} from './generation_demo_generator.js';
import {decorateWideOpenArea} from './wide_open_area_details.js';

export const AREA={length:720,width:560,height:260};
export const LEVELS=[26,64,102,140,178,216];
const faces=[[1,0],[-1,0],[0,1],[0,-1]];

export function generateWideOpenArea(seed=42) {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Seed invalide');
  let state=seed>>>0;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const integer=(a,b)=>a+Math.floor(random()*(b-a+1));
  const boxes=[],towers=[],terraces=[],houses=[],bridges=[];
  const add=(box)=>{if(box[3]>0&&box[4]>0&&box[5]>0)boxes.push(box);};
  for(let attempt=0;attempt<4000&&towers.length<22;attempt++) {
    const x=integer(58,AREA.length-58),z=integer(58,AREA.width-58),size=integer(9,15)*2;
    if(x>285&&x<425&&z>175&&z<385)continue;
    if(towers.some(t=>Math.hypot(x-t.x,z-t.z)<94))continue;
    const tower={id:towers.length,x,z,size,box:[x-size/2,0,z-size/2,size,AREA.height,size]};
    towers.push(tower);add([...tower.box,'tower']);
    // Stepped feet and crowns give the full-height masses a readable scale.
    for(const y of [0,AREA.height-4]) {
      for(const b of subtract([x-size/2-3,y,z-size/2-3,size+6,4,size+6,'trim'],tower.box))add(b);
    }
  }
  for(const tower of towers) {
    const choices=LEVELS.map((_,i)=>i);
    for(let i=choices.length-1;i>0;i--){const j=integer(0,i);[choices[i],choices[j]]=[choices[j],choices[i]];}
    tower.levels=choices.slice(0,integer(2,5)).sort((a,b)=>a-b);
  }
  for(const tower of towers)for(const [level,base] of LEVELS.entries()) {
    if(!tower.levels.includes(level))continue;
    const y=base+integer(-4,4),radius=tower.size/2+16;
    const terrace={id:terraces.length,tower:tower.id,level,x:tower.x,z:tower.z,y,radius,
      box:[tower.x-radius,y,tower.z-radius,radius*2+1,1,radius*2+1],doors:[]};
    terraces.push(terrace);
    for(const b of subtract([...terrace.box,'deck'],tower.box))add(b);
    // Corbels widen toward the terrace without becoming full-height supports.
    for(const [nx,nz] of faces)for(let step=0;step<5;step++) {
      const distance=tower.size/2+step*3;
      add([tower.x+nx*distance-(nx<0?3:0)-(nz?2:0),y-5+step,
        tower.z+nz*distance-(nz<0?3:0)-(nx?2:0),nx?3:4,1,nz?3:4,'trim']);
    }
    const chosen=integer(0,3),count=integer(1,3);
    for(let n=0;n<count;n++) {
      const side=(chosen+n)%4,[nx,nz]=faces[side],w=integer(10,tower.size-2),d=integer(8,11),h=integer(0,1)?11:16;
      const x=nx>0?tower.x+tower.size/2:nx<0?tower.x-tower.size/2-d:tower.x-Math.floor(w/2);
      const z=nz>0?tower.z+tower.size/2:nz<0?tower.z-tower.size/2-d:tower.z-Math.floor(w/2);
      const sx=nx?d:w,sz=nz?d:w,box=[x,y,z,sx,h,sz];
      let shell=[
        [x,y+1,z,sx,h-2,1,'house'],[x,y+1,z+sz-1,sx,h-2,1,'house'],
        [x,y+1,z+1,1,h-2,sz-2,'house'],[x+sx-1,y+1,z+1,1,h-2,sz-2,'house'],
      ];
      const fx=nx>0?x+sx-1:x,fz=nz>0?z+sz-1:z;
      const door=nx?[fx,y+1,z+Math.floor(sz/2)-1,1,2,2]:[x+Math.floor(sx/2)-1,y+1,fz,2,2,1];
      shell=shell.flatMap(b=>subtract(b,door));
      for(let floor=0;floor<h-1;floor+=5)for(let along=2;along<w-2;along+=4) {
        const window=nx?[fx,y+floor+2,z+along,1,2,1]:[x+along,y+floor+2,fz,1,2,1];
        if(overlaps(window,door))continue;
        shell=shell.flatMap(b=>subtract(b,window));
        add([...window,random()<0.22?'light':'window']);
      }
      shell.forEach(add);
      for(let floor=5;floor<h;floor+=5)add([x,y+floor,z,sx,1,sz,'roof']);
      houses.push({box,door,terrace:terrace.id});
    }
  }

  const bridgeCells=new Map(),railCells=new Map();
  const key=(x,y,z)=>`${x},${y},${z}`;
  const line=(a,b)=> {
    const length=Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
    return Array.from({length:length+1},(_,i)=>[a[0]+Math.sign(b[0]-a[0])*i,a[1]+Math.sign(b[1]-a[1])*i]);
  };
  for(let level=0;level<LEVELS.length;level++) {
    const nodes=terraces.filter(t=>t.level===level),degree=new Map(),reserved=[];
    const candidates=[];
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++) {
      const a=nodes[i],b=nodes[j],distance=Math.hypot(a.x-b.x,a.z-b.z);
      if(distance<320)candidates.push({a,b,weight:distance*(0.9+random()*0.25)});
    }
    candidates.sort((a,b)=>a.weight-b.weight);
    for(const {a,b} of candidates) {
      if((degree.get(a.id)||0)>=3||(degree.get(b.id)||0)>=3)continue;
      let selected;
      for(const xFirst of [random()<0.5,true,false]) {
        const dx=Math.sign(b.x-a.x),dz=Math.sign(b.z-a.z);
        const start=xFirst?[a.x+dx*(a.radius+1),a.z]:[a.x,a.z+dz*(a.radius+1)];
        const end=xFirst?[b.x,b.z-dz*(b.radius+1)]:[b.x-dx*(b.radius+1),b.z];
        const corner=xFirst?[end[0],start[1]]:[start[0],end[1]];
        if((xFirst?Math.abs(b.x-a.x):Math.abs(b.z-a.z))<a.radius+8||
          (xFirst?Math.abs(b.z-a.z):Math.abs(b.x-a.x))<b.radius+8)continue;
        const points=[...line(start,corner),...line(corner,end).slice(1)];
        if(points.length<Math.abs(b.y-a.y)*3+8)continue;
        const firstLength=Math.abs(start[0]-corner[0])+Math.abs(start[1]-corner[1]);
        const secondLength=points.length-1-firstLength,needed=Math.abs(b.y-a.y)*3+12;
        const slopeStart=firstLength>=needed?5:firstLength+5;
        const slopeEnd=firstLength>=needed?firstLength-5:points.length-6;
        if(b.y!==a.y&&Math.max(firstLength,secondLength)<needed)continue;
        // Keep the elbow level so the wide turning deck cannot cover an incoming step.
        const path=points.map(([x,z],i)=>[x,a.y+Math.round((b.y-a.y)*Math.max(0,Math.min(1,(i-slopeStart)/Math.max(1,slopeEnd-slopeStart)))),z]);
        const volumes=[start,corner].map((p,i)=> {
          const q=i?end:corner;
          return [Math.min(p[0],q[0])-3,Math.min(a.y,b.y),Math.min(p[1],q[1])-3,
            Math.abs(p[0]-q[0])+7,Math.abs(a.y-b.y)+5,Math.abs(p[1]-q[1])+7];
        });
        if(volumes.some(v=>nodes.some(t=>t!==a&&t!==b&&overlaps(v,[t.x-t.radius,t.y-8,t.z-t.radius,t.radius*2+1,30,t.radius*2+1]))||
          towers.some(t=>overlaps(v,t.box))||reserved.some(r=>overlaps(v,r))))continue;
        // The complete route must stay outside both endpoint terraces until its doorway.
        if(path.some(([x,,z],i)=>(i>3&&Math.abs(x-a.x)<=a.radius+2&&Math.abs(z-a.z)<=a.radius+2)||
          (i<path.length-4&&Math.abs(x-b.x)<=b.radius+2&&Math.abs(z-b.z)<=b.radius+2)))continue;
        selected={path,volumes,start,end};break;
      }
      if(!selected)continue;
      const {path,volumes,start,end}=selected;
      reserved.push(...volumes);degree.set(a.id,(degree.get(a.id)||0)+1);degree.set(b.id,(degree.get(b.id)||0)+1);
      a.doors.push(start);b.doors.push(end);
      bridges.push({from:a.id,to:b.id,path});
      const walk=new Set();
      for(const [x,y,z] of path)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)walk.add(`${x+dx},${z+dz}`);
      for(const [i,[x,y,z]] of path.entries()) {
        const next=path[i+1]||path[i-1],alongX=next[0]!==x;
        for(let w=-2;w<=2;w++) {
          const px=x+(alongX?0:w),pz=z+(alongX?w:0);
          bridgeCells.set(key(px,y,pz),[px,y,pz,1,1,1,'bridge']);
          if(Math.abs(w)===2&&!walk.has(`${px},${pz}`)) {
            railCells.set(key(px,y+2,pz),[px,y+2,pz,1,1,1,'rail']);
            if(i%6===0)railCells.set(key(px,y+1,pz),[px,y+1,pz,1,1,1,'rail']);
          }
        }
      }
    }
  }
  boxes.push(...bridgeCells.values(),...railCells.values());
  for(const t of terraces)for(const [nx,nz] of faces)for(let along=-t.radius;along<=t.radius;along++) {
    const x=t.x+nx*t.radius+(nz?along:0),z=t.z+nz*t.radius+(nx?along:0);
    if(t.doors.some(p=>Math.abs(x-p[0])<=4&&Math.abs(z-p[1])<=4))continue;
    add([x,t.y+2,z,1,1,1,'rail']);
    if((along+t.radius)%6===0)add([x,t.y+1,z,1,1,1,'rail']);
  }
  // Massive boundary piers frame the space without closing the long sight lines.
  for(let x=20;x<AREA.length;x+=64)for(const z of [0,AREA.width-8])add([x,0,z,12,AREA.height,8,'boundary']);
  for(let z=20;z<AREA.width;z+=64)for(const x of [0,AREA.length-8])add([x,0,z,8,AREA.height,12,'boundary']);
  add([0,0,0,AREA.length,1,AREA.width,'ground']);
  const entrances=terraces.flatMap(t=>t.doors.map(p=> {
    const nx=Math.sign(p[0]-t.x),nz=Math.sign(p[1]-t.z);
    return {t,p,nx,nz,score:nx*(AREA.length/2-t.x)+nz*(AREA.width/2-t.z)-Math.abs(t.level-2)*1000};
  })).sort((a,b)=>b.score-a.score);
  const {t:arrival,p,nx,nz}=entrances[0];
  const spawn=[p[0]-nx*3+0.5,arrival.y+2.8,p[1]-nz*3+0.5];
  const layout={seed,world:AREA,boxes:mergeBoxes(boxes),towers,terraces,houses,bridges,spawn,
    lookAt:[spawn[0]+nx*130,arrival.y+12,spawn[2]+nz*130],stats:{towers:towers.length,houses:houses.length,bridges:bridges.length,terraces:terraces.length}};
  layout.details=decorateWideOpenArea(layout);
  layout.boxes.push(...layout.details.boxes);
  Object.assign(layout.stats,{pipe:layout.details.pipe.points.length?1:0,groundBuildings:layout.details.buildings.filter(b=>b.anchor==='ground').length,
    suspendedBuildings:layout.details.buildings.filter(b=>b.anchor==='ceiling').length,decorativePillars:layout.details.pillars.length});
  return layout;
}
