import {populateUltraDense} from './house_wall_ultra_dense_rooms.js';
// Prototype autonome, avant integration a la generation finale.
export const ULTRA_DENSE = Object.freeze({
  height:200,towerLength:300,towerWidth:150,gap:30,wallThickness:4,
  storeyHeight:6,solidHeight:3,recessDepth:3,
  doorSpacing:15,population:.2,roomWidth:12,roomDepth:12,
});

export function generateHouseWallUltraDense(seed=42,{populate=true,height=ULTRA_DENSE.height}={}) {
  const c={...ULTRA_DENSE,height},courtLength=c.towerLength+c.gap*2,courtWidth=c.towerWidth+c.gap*2;
  const length=courtLength+c.wallThickness*2,width=courtWidth+c.wallThickness*2;
  const towerStart=c.wallThickness+c.gap,towerEndX=towerStart+c.towerLength,towerEndZ=towerStart+c.towerWidth;
  const boxes=[],bands=[],groups={ground:[]};
  for(const prefix of ['outer','tower'])for(const side of ['north','south','west','east'])groups[`${prefix}_${side}`]=[];
  const add=(group,box)=>{boxes.push(box);groups[group].push(box);};
  function ring(prefix,outer,inner,y,height,kind) {
    const [x0,z0,x1,z1]=outer,[ix0,iz0,ix1,iz1]=inner;
    add(`${prefix}_north`,[x0,y,z0,x1-x0,height,iz0-z0,kind]);
    add(`${prefix}_south`,[x0,y,iz1,x1-x0,height,z1-iz1,kind]);
    add(`${prefix}_west`,[x0,y,iz0,ix0-x0,height,iz1-iz0,kind]);
    add(`${prefix}_east`,[ix1,y,iz0,x1-ix1,height,iz1-iz0,kind]);
  }
  for(let y=0;y<c.height;y+=c.solidHeight) {
    const recess=y%c.storeyHeight>=c.solidHeight?c.recessDepth:0;
    const height=Math.min(c.solidHeight,c.height-y),thickness=c.wallThickness-recess;
    bands.push({y,height,recess});
    // The enclosure recedes outward; the tower's four faces recede inward.
    ring('outer',[0,0,length,width],[thickness,thickness,length-thickness,width-thickness],
      y,height,recess?'outer_recess':'outer_wall');
    ring('tower',[towerStart+recess,towerStart+recess,towerEndX-recess,towerEndZ-recess],
      [towerStart+c.wallThickness,towerStart+c.wallThickness,towerEndX-c.wallThickness,towerEndZ-c.wallThickness],
      y,height,recess?'tower_recess':'tower_wall');
  }
  // Ground at Y=0, without overlapping either facade shell.
  add('ground',[c.wallThickness,0,c.wallThickness,courtLength,1,c.gap,'ground']);
  add('ground',[c.wallThickness,0,towerEndZ,courtLength,1,c.gap,'ground']);
  add('ground',[c.wallThickness,0,towerStart,c.gap,1,c.towerWidth,'ground']);
  add('ground',[towerEndX,0,towerStart,c.gap,1,c.towerWidth,'ground']);
  add('ground',[towerStart+c.wallThickness,0,towerStart+c.wallThickness,
    c.towerLength-c.wallThickness*2,1,c.towerWidth-c.wallThickness*2,'ground']);
  const data={
    name:'House wall ultra dense',area:{length,width,height:c.height},
    courtyard:{box:[c.wallThickness,0,c.wallThickness,courtLength,c.height,courtWidth],gap:c.gap},
    tower:{box:[towerStart,0,towerStart,c.towerLength,c.height,c.towerWidth]},
    groups,boxes,bands,
    spawn:[c.wallThickness+c.gap/2,82,c.wallThickness+c.gap/2],
    lookAt:[towerStart+15,106,towerStart+15],
    stats:{fullStoreys:Math.floor(c.height/c.storeyHeight),remainingHeight:c.height%c.storeyHeight,
      bandCount:bands.length,solidBoxes:boxes.length,houses:0},
  };
  return populate?populateUltraDense(data,c,seed):data;
}
