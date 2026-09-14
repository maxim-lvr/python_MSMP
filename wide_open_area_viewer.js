import * as THREE from './web/vendor/three.module.js';
import {OrbitControls} from './web/vendor/OrbitControls.js';
import {generateWideOpenArea,AREA} from './wide_open_area.js';

const $=id=>document.getElementById(id),scene=new THREE.Scene();
scene.background=new THREE.Color(0xcbd4d1);scene.fog=new THREE.Fog(0xcbd4d1,260,1150);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,0.08,2200);camera.rotation.order='YXZ';
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x7a827b,2.1));
const sun=new THREE.DirectionalLight(0xfff3df,1.8);sun.position.set(-150,340,170);scene.add(sun);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enabled=false;orbit.enableDamping=true;orbit.maxDistance=1500;orbit.minDistance=5;
const geometry=new THREE.BoxGeometry(1,1,1),materials={};
for(const [kind,color] of Object.entries({tower:0x4e5656,trim:0x69716f,house:0x9aa9a1,roof:0x758b81,deck:0x88928b,
  bridge:0x879b9a,rail:0x434c4c,boundary:0x6f7c78,ground:0x8a9690,window:0x254944,
  pipe:0x986d4f,pipe_band:0x49484a,industrial:0x85877f,suspended:0x777c89,detail_trim:0x575858,detail_pillar:0x5f6668}))
  materials[kind]=new THREE.MeshLambertMaterial({color});
materials.light=new THREE.MeshBasicMaterial({color:0xffd59a});
let model,layout,mode='fly';
const keys=new Set(),forward=new THREE.Vector3(),right=new THREE.Vector3(),movement=new THREE.Vector3();
function switchMode(next) {
  mode=next;keys.clear();orbit.enabled=mode==='overview';
  $('fly').setAttribute('aria-pressed',String(mode==='fly'));$('overview').setAttribute('aria-pressed',String(mode==='overview'));
  if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
  if(mode==='overview') {
    camera.position.set(AREA.length*1.15,AREA.height*2.3,AREA.width*1.3);orbit.target.set(AREA.length/2,90,AREA.width/2);orbit.update();
  } else {camera.position.fromArray(layout.spawn);camera.lookAt(...layout.lookAt);}
}
function rebuild() {
  try {
    const data=generateWideOpenArea(Number($('seed').value));
    if(model){scene.remove(model);model.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});}
    layout=data;model=new THREE.Group();scene.add(model);
    const buckets=new Map();
    for(const b of data.boxes) {
      const id=`${b[6]}:${Math.floor(b[0]/128)}:${Math.floor(b[2]/128)}`;
      if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(b);
    }
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
    for(const boxes of buckets.values()) {
      const mesh=new THREE.InstancedMesh(geometry,materials[boxes[0][6]],boxes.length);
      boxes.forEach(([x,y,z,sx,sy,sz],i)=> {
        position.set(x+sx/2,y+sy/2,z+sz/2);scale.set(sx,sy,sz);matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();model.add(mesh);
    }
    const s=data.stats;
    $('stats').textContent=`720 x 560 x 260 · ${s.houses} maisons · ${s.bridges} ponts · ${s.groundBuildings+s.suspendedBuildings} batiments · ${s.decorativePillars} piliers · ${s.pipe} tuyau`;
    document.body.dataset.ready='true';switchMode(mode);
  } catch(error){$('stats').textContent=error.message;document.body.dataset.ready='error';console.error(error);}
}
$('settings').addEventListener('submit',event=>{event.preventDefault();rebuild();});
$('random').onclick=()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];rebuild();};
$('fly').onclick=()=>switchMode('fly');$('overview').onclick=()=>switchMode('overview');
renderer.domElement.addEventListener('click',()=>{if(mode==='fly'&&matchMedia('(pointer:fine)').matches)renderer.domElement.requestPointerLock();});
const rotate=(dx,dy)=>{camera.rotation.y-=dx*0.0022;camera.rotation.x=Math.max(-1.54,Math.min(1.54,camera.rotation.x-dy*0.0022));};
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer.domElement)rotate(e.movementX,e.movementY);});
const name=e=>e.key===' '?'space':e.key.toLowerCase();
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.pointerLockElement===renderer.domElement){document.exitPointerLock();return;}
  if(mode!=='fly'||document.pointerLockElement!==renderer.domElement)return;
  if(['z','q','s','d','space','c','control','shift'].includes(name(e))){keys.add(name(e));e.preventDefault();}
});
document.addEventListener('keyup',e=>keys.delete(name(e)));
document.addEventListener('pointerlockchange',()=>keys.clear());window.addEventListener('blur',()=>keys.clear());
for(const button of document.querySelectorAll('[data-key]')) {
  button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(button.dataset.key);};
  button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>keys.delete(button.dataset.key);
}
let touch;
renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&mode==='fly'){touch=[e.clientX,e.clientY];renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{if(touch){rotate(e.clientX-touch[0],e.clientY-touch[1]);touch=[e.clientX,e.clientY];}});
renderer.domElement.addEventListener('pointerup',()=>touch=null);renderer.domElement.addEventListener('pointercancel',()=>touch=null);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let previous=performance.now(),lastLabel=0;
function animate(now) {
  const dt=Math.min((now-previous)/1000,0.05);previous=now;
  if(orbit.enabled)orbit.update();
  else {
    camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,camera.up).normalize();movement.set(0,0,0);
    if(keys.has('z'))movement.add(forward);if(keys.has('s'))movement.sub(forward);
    if(keys.has('d'))movement.add(right);if(keys.has('q'))movement.sub(right);
    if(keys.has('space'))movement.y++;if(keys.has('c')||keys.has('control'))movement.y--;
    if(movement.lengthSq())camera.position.addScaledVector(movement.normalize(),Number($('speed').value)*dt*(keys.has('shift')?3:1));
  }
  if(now-lastLabel>200){$('position').textContent=`X ${Math.round(camera.position.x)} · Y ${Math.round(camera.position.y)} · Z ${Math.round(camera.position.z)}`;lastLabel=now;}
  renderer.render(scene,camera);requestAnimationFrame(animate);
}
rebuild();requestAnimationFrame(animate);
