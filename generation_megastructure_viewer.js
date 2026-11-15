import * as THREE from './web/vendor/three.module.js';
import {OrbitControls} from './web/vendor/OrbitControls.js';
import {WORLD_MIN_Y, WORLD_MAX_Y, WORLD_HEIGHT} from './world_config.js';

const $=id=>document.getElementById(id),scene=new THREE.Scene();
const renderer=new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));document.body.prepend(renderer.domElement);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
scene.background=new THREE.Color(0x87918d);
scene.fog=new THREE.FogExp2(0x87918d,0.0015);
const camera=new THREE.PerspectiveCamera(65,1,.1,18000);camera.rotation.order='YXZ';
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enabled=false;
scene.add(new THREE.HemisphereLight(0xe3e9db,0x66776d,2.4));
const sun=new THREE.DirectionalLight(0xffecd7,2.5);sun.position.set(-400,600,280);scene.add(sun);
const fill=new THREE.DirectionalLight(0xc2d7d7,.7);fill.position.set(500,160,-300);scene.add(fill);
const cutPlane=new THREE.Plane(new THREE.Vector3(0,-1,0),WORLD_MAX_Y+.02);renderer.clippingPlanes=[cutPlane];
const cube=new THREE.BoxGeometry(1,1,1),materials=new Map();
let meshes=[],result,flying=true,worker,ready=false;
let overviewMeshes=[];
const colorFor=kind=>{
  if(kind.includes('water_water'))return 0x5caaa5;
  if(kind.includes('light')||kind.includes('lit')||kind==='long_window')return 0xe7dba9;
  if(kind.includes('window'))return 0x536766;
  if(kind.includes('ladder'))return 0xae9574;
  if(kind.includes('pipe'))return kind.includes('band')?0x4c5555:0x82705f;
  if(kind.includes('roof')||kind.includes('shell_wall'))return 0x707b78;
  if(kind.includes('house')||kind.includes('facade')||kind==='dense')return 0x96a49b;
  if(kind.includes('trim')||kind.includes('frame')||kind==='rib')return 0x465451;
  if(kind.includes('bridge')||kind.includes('trail')||kind.includes('deck'))return 0x808e88;
  return 0x6b7773;
};
function material(kind) {
  if(!materials.has(kind)) {
    const emissive=/light|lit/.test(kind),water=kind==='water_water';
    const m=emissive?new THREE.MeshBasicMaterial({color:colorFor(kind)}):new THREE.MeshLambertMaterial({color:colorFor(kind),transparent:water,opacity:water?.65:1});
    materials.set(kind,m);
  }
  return materials.get(kind);
}
function inspection() {
  for(const [kind,m] of materials) {
    const shell=kind.startsWith('shell_');
    if(shell){m.transparent=$('inspection').checked;m.opacity=m.transparent?.12:1;m.depthWrite=!m.transparent;m.needsUpdate=true;}
  }
}
function visit() {
  if(!result)return;
  flying=true;controls.enabled=false;scene.fog.density=.0015;
  const v=result.visits[Number($('visit').value)||0];
  camera.position.set(v.spawn[0],WORLD_MIN_Y+v.spawn[1],v.spawn[2]);
  camera.lookAt(v.lookAt[0],WORLD_MIN_Y+v.lookAt[1],v.lookAt[2]);
  $('fly').setAttribute('aria-pressed','true');$('plan').setAttribute('aria-pressed','false');
}
function overview() {
  flying=false;controls.enabled=true;scene.fog.density=0;
  if(document.pointerLockElement)document.exitPointerLock();
  const d=5500/Math.min(1,camera.aspect);
  camera.position.set(2500+d*.12,WORLD_MIN_Y+d*.7,2500+d*.65);controls.target.set(2500,WORLD_MIN_Y+100,2500);controls.update();
  $('fly').setAttribute('aria-pressed','false');$('plan').setAttribute('aria-pressed','true');
}
function show(data) {
  for(const mesh of meshes){scene.remove(mesh);mesh.dispose();}meshes=[];result=data;
  for(const mesh of overviewMeshes){scene.remove(mesh);mesh.dispose();mesh.material.dispose();}overviewMeshes=[];
  const groups=new Map(),matrix=new THREE.Matrix4();
  const add=b=>{
    const key=`${Math.floor(b[0]/256)},${Math.floor(b[2]/256)},${b[6]}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b);
  };
  for(const b of data.boxes) {
    if(b[6]==='ladder'||b[6]==='restrict_ladder') {
      const [x,y,z,,h]=b;
      for(const dx of [.1,.8])add([x+dx,y,z+.88,.1,h,.1,'ladder']);
      for(let dy=0;dy<h;dy++)add([x+.1,y+dy+.4,z+.85,.8,.12,.12,'ladder']);
    }else add(b);
  }
  for(const boxes of groups.values()) {
    const kind=boxes[0][6],mesh=new THREE.InstancedMesh(cube,material(kind),boxes.length);
    boxes.forEach(([x,y,z,sx,sy,sz],i)=>{matrix.makeScale(sx,sy,sz);matrix.setPosition(x+sx/2,WORLD_MIN_Y+y+sy/2,z+sz/2);mesh.setMatrixAt(i,matrix);});
    mesh.computeBoundingBox();mesh.computeBoundingSphere();mesh.userData.kind=kind;scene.add(mesh);meshes.push(mesh);
  }
  const overviewBoxes=[...data.denseRooms.map(r=>[...r.box,'dense']),...data.rooms.map(r=>[...r.box,'landmark'])];
  for(const {points,width} of data.paths)for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i];overviewBoxes.push([Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.min(a[2],b[2]),
      Math.max(width,Math.abs(a[0]-b[0])),Math.max(2,Math.abs(a[1]-b[1])),Math.max(width,Math.abs(a[2]-b[2])),'route']);
  }
  for(const [kind,color] of [['dense',0x89968d],['landmark',0x576b65],['route',0x393f3e]]) {
    const boxes=overviewBoxes.filter(b=>b[6]===kind),mesh=new THREE.InstancedMesh(cube,new THREE.MeshLambertMaterial({color}),boxes.length);
    boxes.forEach(([x,y,z,sx,sy,sz],i)=>{matrix.makeScale(sx,sy,sz);matrix.setPosition(x+sx/2,WORLD_MIN_Y+y+sy/2,z+sz/2);mesh.setMatrixAt(i,matrix);});
    mesh.computeBoundingSphere();scene.add(mesh);overviewMeshes.push(mesh);
  }
  $('visit').replaceChildren(...data.visits.map((v,i)=>new Option(v.name,i)));
  const s=data.stats;
  $('stats').textContent=`5000 x 5000 x ${WORLD_HEIGHT} · Y ${WORLD_MIN_Y} a ${WORLD_MAX_Y} · ${s.rooms} grands ensembles · ${s.dense} pieces · ${s.snakes} Snake · ${s.seconds.toFixed(1)}\u00a0s`;
  inspection();visit();ready=true;
}
function generate() {
  if(!$('settings').reportValidity())return;
  worker?.terminate();ready=false;$('stats').textContent='Generation...';$('generate').disabled=true;
  worker=new Worker('./generation_megastructure_worker.js',{type:'module'});
  worker.onmessage=({data})=>{
    if(data.progress){$('stats').textContent=data.progress;return;}
    $('generate').disabled=false;
    if(data.error){$('stats').textContent='Generation impossible : '+data.error;console.error(data.error);}else show(data.result);
    worker.terminate();
  };
  worker.onerror=e=>{$('generate').disabled=false;$('stats').textContent=e.message;};
  worker.postMessage({seed:Number($('seed').value),density:3});
}
const keys=new Set();
addEventListener('keydown',e=>{
  if(/INPUT|SELECT|BUTTON/.test(e.target.tagName))return;
  if(['z','q','s','d','w','a',' ','c','shift','control','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());}
});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>keys.clear());
renderer.domElement.onclick=()=>{if(flying&&!matchMedia('(pointer: coarse)').matches)renderer.domElement.requestPointerLock();};
let touch;
renderer.domElement.onpointerdown=e=>{if(flying&&e.pointerType==='touch'){touch=[e.clientX,e.clientY];renderer.domElement.setPointerCapture(e.pointerId);}};
renderer.domElement.onpointerup=renderer.domElement.onpointercancel=()=>touch=null;
addEventListener('pointermove',e=>{
  if(!flying)return;let dx,dy;
  if(document.pointerLockElement===renderer.domElement){dx=e.movementX;dy=e.movementY;}
  else if(touch){dx=e.clientX-touch[0];dy=e.clientY-touch[1];touch=[e.clientX,e.clientY];}else return;
  camera.rotation.y-=dx*.002;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-dy*.002,-1.55,1.55);
});
for(const b of document.querySelectorAll('[data-key]')){
  b.onpointerdown=e=>{e.preventDefault();keys.add(b.dataset.key);b.setPointerCapture(e.pointerId);};
  b.onpointerup=b.onpointercancel=()=>keys.delete(b.dataset.key);
}
$('settings').onsubmit=e=>{e.preventDefault();generate();};
$('random').onclick=()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];generate();};
$('plan').onclick=overview;$('fly').onclick=visit;$('visit').onchange=visit;
$('inspection').onchange=inspection;$('cut').oninput=()=>{cutPlane.constant=Number($('cut').value)+.02;$('height').textContent=$('cut').value;};
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(!flying)overview();}
addEventListener('resize',resize);
const clock=new THREE.Clock(),forward=new THREE.Vector3(),right=new THREE.Vector3();
renderer.setAnimationLoop(()=>{
  const dt=Math.min(clock.getDelta(),.05);
  if(flying) {
    const speed=Number($('speed').value)*dt*(keys.has('shift')?5:1);
    forward.set(-Math.sin(camera.rotation.y),0,-Math.cos(camera.rotation.y));right.set(-forward.z,0,forward.x);
    camera.position.addScaledVector(forward,speed*(Number(keys.has('z')||keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'))));
    camera.position.addScaledVector(right,speed*(Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('q')||keys.has('a')||keys.has('arrowleft'))));
    camera.position.y+=speed*(Number(keys.has(' '))-Number(keys.has('c')||keys.has('control')));
  }else controls.update();
  for(const m of meshes)m.visible=flying&&m.boundingBox.distanceToPoint(camera.position)<1000;
  for(const m of overviewMeshes)m.visible=!flying;
  $('position').textContent=`X ${Math.floor(camera.position.x)} · Y ${Math.floor(camera.position.y)} · Z ${Math.floor(camera.position.z)}`;
  renderer.render(scene,camera);
});
window.__mega={get ready(){return ready;},get stats(){return result?.stats;},get position(){return camera.position.toArray();},visit:i=>{$('visit').value=i;visit();}};
resize();generate();
