const overlaps=(a,b)=>[0,1,2].every(i=>a[i]<b[i]+b[i+3]&&a[i]+a[i+3]>b[i]);
const corridor=(a,b,y)=>[Math.min(a[0],b[0])-1,y,Math.min(a[1],b[1])-1,
  Math.abs(a[0]-b[0])+3,4,Math.abs(a[1]-b[1])+3];

export function snakeAccessPlans(layout,houses,existingShafts,existingRoutes,requestedEntrances=null) {
  const world=layout.world||{length:5000,width:5000,height:300};
  const snakes=layout.snakes||[];
  const entrances=requestedEntrances||[...snakes.flatMap(s=>s.rearDoors.map(d=>({...d,snake:s.id}))),
    ...(layout.buildingLong||[]).flatMap(z=>(z.bridgePorts||[]).map(p=>({pos:p.door,normal:p.normal,
      buildingLong:z.id,bridgePort:p.id,trail:p.trail,end:p.end}))),
    ...(layout.settlements||[]).flatMap(z=>z.ports||[])];
  const obstacles=[...snakes.flatMap(s=>s.volumes.map(([x,y,z,sx,sy,sz])=>[x+2,y,z+2,sx-4,sy,sz-4])),...houses.map(h=>h.box),
    ...(layout.buildingLong||[]).map(z=>z.box),
    ...(layout.wideAreas||[]).map(z=>z.box),
    ...(layout.settlements||[]).flatMap(z=>[z.box,...(z.accessVolumes||[])]),
    ...(layout.globalPipe?.volumes||[]),
    ...layout.zones.map(z=>[z.x*32-4,0,z.z*32-4,z.width*32+8,300,z.depth*32+8])];
  const shafts=[...existingShafts],plans=[];
  const walks=existingRoutes.map(r=>[[r.a[0],r.a[2]],[r.b[0],r.b[2]]]);
  // Reserve every entrance before choosing any shaft, including doors processed later.
  for(const door of entrances) {
    const [x,,z]=door.pos,[nx,,nz]=door.normal;
    walks.push([[x-nx,z-nz],[x+nx*6,z+nz*6]]);
  }
  const cutsBacking=(points,s)=>points.slice(1).some((p,i)=>{
    const a=points[i];
    return s.x>=Math.min(a[0],p[0])&&s.x<=Math.max(a[0],p[0])&&
      s.z+1>=Math.min(a[1],p[1])&&s.z+1<=Math.max(a[1],p[1]);
  });
  const clear=box=>box[0]>1&&box[2]>1&&box[0]+box[3]<world.length-1&&box[2]+box[5]<world.width-1&&
    (!layout.isSolidBox||layout.isSolidBox(box))&&
    !obstacles.some(b=>overlaps(box,b));
  for(const door of entrances) {
    const [x,y,z]=door.pos,[nx,,nz]=door.normal,floor=y-1;
    const outside=[x+nx*6,z+nz*6];
    let chosen;
    for(const distance of (layout.isSolidBox?[16,24,40,64,96,128,176,240,320]:[40,64,96,128,176,240,320])) {
      if(chosen)break;
      for(const shift of [0,32,-32,64,-64,96,-96,128,-128,192,-192,256,-256]) {
        const sx=Math.floor((x+nx*distance+nz*shift)/32)*32+16;
        const sz=Math.floor((z+nz*distance+nx*shift)/32)*32+16;
        if(layout.isSolidBox&&![[0,-16],[-16,0],[16,0],[0,16]].some(([dx,dz])=>
          layout.isSolidBox([sx+dx-12,0,sz+dz-12,25,300,25])))continue;
        if(!clear([sx-2,0,sz-2,5,300,5])||shafts.some(s=>Math.abs(s.x-sx)<4&&Math.abs(s.z-sz)<4))continue;
        if(walks.some(points=>cutsBacking(points,{x:sx,z:sz})))continue;
        const end=[sx,sz-3];
        const paths=[
          [outside,[outside[0],end[1]],end,[sx,sz]],
          [outside,[end[0],outside[1]],end,[sx,sz]],
        ];
        for(const offset of [-16,16,-32,32]) {
          paths.push([outside,[outside[0]+offset,outside[1]],[outside[0]+offset,end[1]],end,[sx,sz]]);
          paths.push([outside,[outside[0],outside[1]+offset],[end[0],outside[1]+offset],end,[sx,sz]]);
        }
        for(const points of paths) {
          const fullPoints=[[x-nx,z-nz],[x,z],...points];
          const volumes=points.slice(1).map((p,i)=>corridor(points[i],p,floor));
          if(volumes.some(v=>!clear(v)))continue;
          if(shafts.some(s=>cutsBacking(fullPoints,s)))continue;
          // A ladder must retain its south backing, including at other entrances.
          if(volumes.some(v=>[...shafts,{x:sx,z:sz}].some(s=>
            s.x>=v[0]+1&&s.x<v[0]+v[3]-1&&s.z+1>=v[2]+1&&s.z+1<v[2]+v[5]-1)))continue;
          const neck=corridor([x,z],outside,floor);
          if(snakes.some(s=>s.id!==door.snake&&s.volumes.some(v=>overlaps(neck,v))))continue;
          chosen={snake:door.snake,buildingLong:door.buildingLong,bridgePort:door.bridgePort,trail:door.trail,end:door.end,
            village:door.village,
            room:door.room,door:door.pos,normal:door.normal,x:sx,z:sz,
            points:fullPoints};
          break;
        }
        if(chosen)break;
      }
    }
    if(!chosen)throw Error(`Aucun acces libre pour ${door.village!==undefined?`village ${door.village+1}`:door.snake!==undefined?`snake ${door.snake+1}`:`Building Long ${door.buildingLong+1}`} en ${door.pos} (seed ${layout.seed})`);
    plans.push(chosen);shafts.push({x:chosen.x,z:chosen.z});walks.push(chosen.points);
  }
  return plans;
}
