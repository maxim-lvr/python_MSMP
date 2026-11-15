import * as THREE from './web/vendor/three.module.js';
import {OrbitControls} from './web/vendor/OrbitControls.js';
import {generateHouseWallUltraDense,ULTRA_DENSE} from './house_wall_ultra_dense.js';

const $=id=>document.getElementById(id),data=generateHouseWallUltraDense(),scene=new THREE.Scene();
const centerX=data.area.length/2,centerZ=data.area.width/2;
const span=Math.max(data.area.length,data.area.width,data.area.height),shadowExtent=span*1.15;
const background=0xdce1df;scene.background=new THREE.Color(background);
const fog=new THREE.Fog(background,90,Math.max(310,span*1.5));
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,0.1,Math.max(1200,span*8));camera.rotation.order='YXZ';
scene.add(new THREE.HemisphereLight(0xf4f8ff,0x626d64,1.5));
const light=new THREE.DirectionalLight(0xfff4df,2.1);
light.position.set(centerX-155,data.area.height+160,centerZ-145);light.target.position.set(centerX,90,centerZ);
light.castShadow=true;light.shadow.mapSize.set(2048,2048);
Object.assign(light.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent,near:1,far:750});
light.shadow.bias=-0.0002;scene.add(light,light.target);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.minDistance=5;controls.maxDistance=Math.max(700,span*3);controls.maxPolarAngle=Math.PI*.94;
const cube=new THREE.BoxGeometry(1,1,1),materials={};
for(const [kind,color] of Object.entries({outer_wall:0xa2aaa6,outer_recess:0x7d8881,
  tower_wall:0x9ba39f,tower_recess:0x7d8781,ground:0x68746b,
  room_wall:0xbfa4a0,room_floor:0x8e9991,door_lintel:0x68736c}))
  materials[kind]=new THREE.MeshLambertMaterial({color});
const groups={};
for(const [name,boxes] of Object.entries(data.groups)) {
  const group=new THREE.Group();group.name=name;scene.add(group);groups[name]=group;
  const batches=new Map();
  for(const b of boxes){if(!batches.has(b[6]))batches.set(b[6],[]);batches.get(b[6]).push(b);}
  for(const [kind,batch] of batches) {
    const mesh=new THREE.InstancedMesh(cube,materials[kind],batch.length),matrix=new THREE.Matrix4();
    batch.forEach(([x,y,z,sx,sy,sz],i)=>{
      matrix.makeScale(sx,sy,sz);matrix.setPosition(x+sx/2,y+sy/2,z+sz/2);mesh.setMatrixAt(i,matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
}
const keys=new Set(),forward=new THREE.Vector3(),right=new THREE.Vector3(),movement=new THREE.Vector3();
let mode='overview';
function updateWalls(){for(const name of ['outer_south','outer_east'])groups[name].visible=!$('open-walls').checked;}
function switchMode(next) {
  mode=next;keys.clear();controls.enabled=mode==='overview';scene.fog=controls.enabled?null:fog;
  document.body.dataset.mode=mode;
  $('overview').setAttribute('aria-pressed',String(controls.enabled));$('fly').setAttribute('aria-pressed',String(!controls.enabled));
  if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
  $('open-walls').checked=false;updateWalls();
  if(controls.enabled){
    camera.position.set(centerX+data.area.length*.75,Math.max(data.area.height*2.4,span*1.4),centerZ+span*.85);
    controls.target.set(centerX,data.area.height*.47,centerZ);controls.update();
  }
  else{camera.position.fromArray(data.spawn);camera.lookAt(...data.lookAt);}
}
$('open-walls').onchange=updateWalls;$('overview').onclick=()=>switchMode('overview');$('fly').onclick=()=>switchMode('fly');
$('room').onclick=()=>{const room=data.rooms[0];if(room){switchMode('fly');camera.position.fromArray(room.spawn);camera.lookAt(...room.lookAt);}};
renderer.domElement.onclick=()=>{if(mode==='fly'&&matchMedia('(pointer:fine)').matches)renderer.domElement.requestPointerLock();};
const rotate=(dx,dy)=>{
  camera.rotation.y-=dx*.0022;camera.rotation.x=Math.max(-1.54,Math.min(1.54,camera.rotation.x-dy*.0022));
};
document.addEventListener('mousemove',event=>{if(document.pointerLockElement===renderer.domElement)rotate(event.movementX,event.movementY);});
const keyName=event=>event.key===' '?'space':event.key.toLowerCase();
document.addEventListener('keydown',event=>{
  if(mode!=='fly'||document.pointerLockElement!==renderer.domElement)return;
  const key=keyName(event);if(['z','q','s','d','space','c','control','shift'].includes(key)){event.preventDefault();keys.add(key);}
});
document.addEventListener('keyup',event=>keys.delete(keyName(event)));
document.addEventListener('pointerlockchange',()=>keys.clear());addEventListener('blur',()=>keys.clear());
for(const button of document.querySelectorAll('[data-key]')) {
  button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(button.dataset.key);};
  button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>keys.delete(button.dataset.key);
}
let touch;
renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'&&mode==='fly'){touch=[event.clientX,event.clientY];renderer.domElement.setPointerCapture(event.pointerId);}
});
renderer.domElement.addEventListener('pointermove',event=>{
  if(touch){rotate(event.clientX-touch[0],event.clientY-touch[1]);touch=[event.clientX,event.clientY];}
});
renderer.domElement.addEventListener('pointerup',()=>touch=null);renderer.domElement.addEventListener('pointercancel',()=>touch=null);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
$('stats').textContent=`Hauteur ${ULTRA_DENSE.height} · Tour ${ULTRA_DENSE.towerWidth} × ${ULTRA_DENSE.towerLength} · Vide ${ULTRA_DENSE.gap} · ${data.stats.doors} portes (tous les ${data.stats.doorSpacing} blocs) · ${data.stats.houses} pieces ${ULTRA_DENSE.roomWidth} × ${ULTRA_DENSE.roomDepth} (${(data.stats.population*100).toFixed(1)} %)`;
document.body.dataset.ready='true';
switchMode('overview');
let previous=performance.now(),lastLabel=0;
renderer.setAnimationLoop(now=>{
  const dt=Math.min((now-previous)/1000,.05);previous=now;
  if(controls.enabled)controls.update();
  else{
    camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,camera.up).normalize();movement.set(0,0,0);
    if(keys.has('z'))movement.add(forward);if(keys.has('s'))movement.sub(forward);
    if(keys.has('d'))movement.add(right);if(keys.has('q'))movement.sub(right);
    if(keys.has('space'))movement.y++;if(keys.has('c')||keys.has('control'))movement.y--;
    if(movement.lengthSq())camera.position.addScaledVector(movement.normalize(),Number($('speed').value)*dt*(keys.has('shift')?3:1));
  }
  if(now-lastLabel>200){$('position').textContent=`X ${camera.position.x.toFixed(1)} · Y ${camera.position.y.toFixed(1)} · Z ${camera.position.z.toFixed(1)}`;lastLabel=now;}
  renderer.render(scene,camera);
});
