import * as THREE from './web/vendor/three.module.js';
import {overlaps,subtract} from './generation_demo_generator.js';
import {pipeNetworkSegments,GLOBAL_PIPE_RADIUS} from './generation_demo_chunks_pipe.js';

const frame=()=>new Promise(requestAnimationFrame);
const key=b=>`${Math.floor(b[0]/256)},${Math.floor(b[2]/256)}`;
function index(items,boxOf=b=>b) {
  const buckets=new Map();
  function* cells(b) {
    for(let x=Math.floor(b[0]/128);x<=Math.floor((b[0]+b[3]-1)/128);x++)
      for(let z=Math.floor(b[2]/128);z<=Math.floor((b[2]+b[5]-1)/128);z++)yield `${x},${z}`;
  }
  for(const item of items)for(const cell of cells(boxOf(item))) {
    if(!buckets.has(cell))buckets.set(cell,[]);buckets.get(cell).push(item);
  }
  return b=>{
    const found=new Set();
    for(const cell of cells(b))for(const item of buckets.get(cell)||[])
      if(overlaps(b,boxOf(item)))found.add(item);
    return [...found];
  };
}

export function pipePlacements(data) {
  const segments=pipeNetworkSegments(data.globalPipe?.paths||[]),radius=GLOBAL_PIPE_RADIUS;
  const protectedAccess=index(data.globalPipe?.accessAir||[]);
  const nearby=index(segments,s=>[...s.a.map((v,i)=>Math.min(v,s.b[i])-8),
    ...s.a.map((v,i)=>Math.abs(v-s.b[i])+17)]);
  const placements=[];
  for(const segment of segments) {
    const {axis,a,lo,hi}=segment;if(axis===1)continue;
    const side=axis===0?2:0;
    for(let start=lo;start+24<=hi+1;start+=24) {
      const box=[a[0]-radius,a[1]-radius,a[2]-radius,13,13,13];box[axis]=start;box[axis+3]=24;
      // Remove the old shell AND its wider dark collars. Leave bends, vertical
      // pipes and side/ceiling access points in their original procedural form.
      const cut=[...box];for(const i of [1,side]){cut[i]-=2;cut[i+3]+=4;}
      if(box.some((v,i)=>i<3&&v<0)||box[0]+box[3]>data.world.length||
        box[1]+box[4]>data.world.height||box[2]+box[5]>data.world.width||protectedAccess(cut).length)continue;
      if(nearby(cut).some(other=>other!==segment&&(other.axis!==axis||
        [1,side].some(i=>other.a[i]!==a[i]))))continue;
      placements.push({axis,box,cut,tile:key(box)});
    }
  }
  return placements;
}

function blockColor(name) {
  if(name.includes('soul_lantern'))return 0x49e5e4;
  if(name.includes('copper'))return 0x58866a;
  if(name.includes('moss')||name.includes('vines'))return 0x658341;
  if(name.includes('dripstone'))return 0x997f70;
  if(name.includes('basalt')||name.includes('chain'))return 0x4b5150;
  if(name.includes('tuff'))return name.includes('chiseled')?0x69736a:0x555f55;
  if(name.includes('coral'))return 0x79786d;
  return name.includes('stone_bricks')?0x777c78:0x858782;
}

function shape(state) {
  const name=state.Name,p=state.Properties||{},face=p.facing;
  if(name.endsWith('_stairs')) {
    const top=p.half==='top',bottom=[0,top?.5:0,0,1,.5,1],step=[0,top?0:.5,0,1,.5,1];
    if(face==='east'||face==='west'){step[3]=.5;if(face==='east')step[0]=.5;}
    else {step[5]=.5;if(face==='south')step[2]=.5;}
    return [bottom,step];
  }
  if(name.endsWith('_trapdoor')) {
    if(p.open!=='true')return [[0,p.half==='top'?.8125:0,0,1,.1875,1]];
    if(face==='east'||face==='west')return [[face==='west'?.8125:0,0,0,.1875,1,1]];
    return [[0,0,face==='north'?.8125:0,1,1,.1875]];
  }
  if(name.endsWith('_wall'))return [[.25,0,.25,.5,1,.5]];
  if(name.endsWith('lantern'))return [[.3,.15,.3,.4,.6,.4]];
  if(name.endsWith(':chain'))return [[.44,0,.44,.12,1,.12]];
  if(name.includes('vines')||name.endsWith('_coral')||name.endsWith('_coral_fan'))
    return [[.1,0,.45,.8,1,.1],[.45,0,.1,.1,1,.8]];
  if(name.includes('dripstone'))return [[.32,0,.32,.36,1,.36]];
  return [[0,0,0,1,1,1]];
}

function templateGeometry(template) {
  const unit=new THREE.BoxGeometry(1,1,1),p=unit.attributes.position,n=unit.attributes.normal;
  const positions=[],normals=[],colors=[],full=new Set(),palette=template.palette.map(state=>({
    shapes:shape(state),color:new THREE.Color(blockColor(state.Name))}));
  for(const [x,y,z,s] of template.blocks)if(palette[s].shapes.length===1&&palette[s].shapes[0].join()==='0,0,0,1,1,1')full.add(`${x},${y},${z}`);
  for(const [x,y,z,s] of template.blocks)for(const [ox,oy,oz,sx,sy,sz] of palette[s].shapes) {
    const color=palette[s].color,whole=sx===1&&sy===1&&sz===1;
    for(let face=0;face<6;face++) {
      const ni=face*4,nx=n.getX(ni),ny=n.getY(ni),nz=n.getZ(ni);
      if(whole&&full.has(`${x+nx},${y+ny},${z+nz}`))continue;
      for(let j=face*6;j<face*6+6;j++) {
        const i=unit.index.getX(j);
        positions.push(x+ox+(p.getX(i)+.5)*sx,y+oy+(p.getY(i)+.5)*sy,z+oz+(p.getZ(i)+.5)*sz);
        normals.push(nx,ny,nz);colors.push(color.r,color.g,color.b);
      }
    }
  }
  unit.dispose();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeBoundingSphere();return geometry;
}

export async function buildNbtPreview({data,template,sources,cube,materials,minY,placements=pipePlacements(data),cancelled=()=>false}) {
  const root=new THREE.Group(),fallback=new THREE.Group(),tiles=new Map(),matrix=new THREE.Matrix4();
  root.add(fallback);
  const geometry=templateGeometry(template),material=new THREE.MeshLambertMaterial({vertexColors:true});
  const query=index(placements,p=>p.cut),remaining=new Map();
  for(const p of placements) {
    if(!tiles.has(p.tile))tiles.set(p.tile,{placements:[],lowBoxes:new Map(),low:new THREE.Group(),high:new THREE.Group()});
    tiles.get(p.tile).placements.push(p);
  }
  function add(groups,b) {if(!groups.has(b[6]))groups.set(b[6],[]);groups.get(b[6]).push(b);}
  let processed=0;
  for(const source of sources)for(const b of source.userData.nbtSource) {
    let parts=[b];
    for(const p of query(b)) {
      const low=b.slice(0,3).map((v,i)=>Math.max(v,p.cut[i]));
      const size=low.map((v,i)=>Math.min(b[i]+b[i+3],p.cut[i]+p.cut[i+3])-v);
      add(tiles.get(p.tile).lowBoxes,[...low,...size,b[6]]);
      parts=parts.flatMap(part=>subtract(part,p.cut));
    }
    parts.forEach(part=>add(remaining,part));
    if(++processed%4000===0){await frame();if(cancelled()){geometry.dispose();material.dispose();return null;}}
  }
  function boxesMesh(groups,parent) {
    for(const [kind,boxes] of groups) {
      const mesh=new THREE.InstancedMesh(cube,materials[kind],boxes.length);
      boxes.forEach(([x,y,z,sx,sy,sz],i)=>{
        matrix.makeScale(sx,sy,sz);matrix.setPosition(x+sx/2,minY+y+sy/2,z+sz/2);mesh.setMatrixAt(i,matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingBox();mesh.computeBoundingSphere();parent.add(mesh);
    }
  }
  boxesMesh(remaining,fallback);
  for(const tile of tiles.values()) {
    boxesMesh(tile.lowBoxes,tile.low);tile.lowBoxes.clear();
    const mesh=new THREE.InstancedMesh(geometry,material,tile.placements.length);
    tile.placements.forEach(({axis,box},i)=>{
      matrix.makeRotationY(axis===0?Math.PI/2:0);
      matrix.setPosition(box[0],minY+box[1],box[2]+(axis===0?13:0));mesh.setMatrixAt(i,matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingBox();mesh.computeBoundingSphere();tile.bounds=mesh.boundingBox;
    tile.high.add(mesh);root.add(tile.low,tile.high);
  }
  return {root,placements,revision:template.revision,
    update(camera,enabled) {
      root.visible=enabled;
      for(const source of sources)source.userData.nbtHidden=enabled;
      if(enabled)for(const tile of tiles.values()) {
        const close=placements.length<=256||tile.bounds.distanceToPoint(camera.position)<350;
        tile.high.visible=close;tile.low.visible=!close;
      }
    },
    dispose() {
      for(const source of sources)source.userData.nbtHidden=false;
      root.removeFromParent();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometry.dispose();material.dispose();
    },
  };
}
