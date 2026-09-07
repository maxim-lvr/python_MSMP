import * as THREE from './web/vendor/three.module.js';
import { OrbitControls } from './web/vendor/OrbitControls.js';

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xedf0f2);
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 30000);
camera.rotation.order = 'YXZ';
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxDistance = 15000;
controls.minDistance = 5;
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8b959f, 2));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(-2000, 4000, 1000);
scene.add(light);
const ground = new THREE.GridHelper(5000, 50, 0xaebac2, 0xd4dde2);
ground.position.set(2500, -1, 2500);
scene.add(ground);
const plane = new THREE.PlaneGeometry(1, 1);
const cube = new THREE.BoxGeometry(1,1,1);
const cutPlane = new THREE.Plane(new THREE.Vector3(0,-1,0),300);
renderer.clippingPlanes = [cutPlane];
const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xa2adb7, transparent: true, opacity: 0.18, depthWrite: false });
const tunnelMaterial = new THREE.MeshLambertMaterial({ color: 0x7497a3, transparent: true, opacity: 0.3, depthWrite: false });
const materials = {
  wall: wallMaterial, tunnel: tunnelMaterial,
  house: new THREE.MeshLambertMaterial({color:0xb9c1c6}),
  window: new THREE.MeshBasicMaterial({color:0x38434b}),
  house_bridge: new THREE.MeshLambertMaterial({color:0x61717c}),
  house_stair: new THREE.MeshLambertMaterial({color:0x61717c}),
  dense: new THREE.MeshLambertMaterial({color:0xbfa4a0}),
  orange: new THREE.MeshBasicMaterial({color:0xff8800, transparent:true,opacity:0.7,depthWrite:false,toneMapped:false}),
  ladder: new THREE.MeshBasicMaterial({color:0xb87736}),
};
const colors = [0x91b9b2, 0xb5abc9, 0xd3b98c, 0x97b4cd];
const floorMaterials = colors.map(color => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x536874, transparent: true, opacity: 0.45 });
let content = new THREE.Group(), data, flying = false, worker;
let renderBatches=[];
scene.add(content);
const keys = new Set();

function overview() {
  flying = false;
  document.body.dataset.fly = 'false';
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  controls.enabled = true;
  $('overview').setAttribute('aria-pressed', 'true');
  $('fly').setAttribute('aria-pressed', 'false');
  const distance = 3500 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect);
  camera.position.set(2500 + distance*0.12, distance*0.88, 2500 + distance*0.47);
  controls.target.set(2500, 0, 2500);
  controls.update();
}

function visit() {
  if(!data)return;
  const [type,idText]=$('zone').value.split(':'), id=Number(idText);
  flying = true;
  document.body.dataset.fly = 'true';
  controls.enabled = false;
  $('overview').setAttribute('aria-pressed', 'false');
  $('fly').setAttribute('aria-pressed', 'true');
  const normals={north:[0,-1],south:[0,1],west:[-1,0],east:[1,0]};
  if(type==='room') {
    const b=data.denseRooms[id].box, x=b[0]+b[3]/2, y=b[1]+b[4]/2,z=b[2]+b[5]/2;
    camera.position.set(x+22,y+16,z-28);camera.lookAt(x,y,z);
  } else if(type==='door') {
    const p=data.ports[id],[nx,nz]=normals[p.side], [x,y,z]=p.door;
    camera.position.set(x+nx*14+nz*4,y+6,z+nz*14+nx*4);camera.lookAt(x+.5,y+1,z+.5);
  } else {
    const h=data.houses.find(h=>h.zone===id)||data.houses[0], b=h.box,[nx,nz]=normals[h.side];
    const x=b[0]+b[3]/2,y=b[1]+b[4]/2,z=b[2]+b[5]/2;
    camera.position.set(x-nx*48,y+7,z-nz*48);camera.lookAt(x,y,z);
  }
}

function show(result) {
  scene.remove(content);
  content.traverse(object => {
    if (object.isLineSegments) object.geometry.dispose();
    if(object.isInstancedMesh)object.dispose();
  });
  content = new THREE.Group();
  renderBatches=[];
  scene.add(content);
  data = result;
  const lines = [];
  for (const zone of data.zones) {
    const x = zone.x*32, z = zone.z*32, w = zone.width*32, d = zone.depth*32;
    const floor = new THREE.Mesh(plane, floorMaterials[zone.id % colors.length]);
    floor.rotation.x = -Math.PI/2;
    floor.scale.set(w, d, 1);
    floor.position.set(x+w/2, 0, z+d/2);
    content.add(floor);
    for (const [wx, , wz, sx, sy, sz] of zone.walls) lines.push(wx, sy, wz, wx+sx, sy, wz+sz);
    for (let xx = x; xx <= x+w; xx += 32) lines.push(xx, 0.1, z, xx, 0.1, z+d);
    for (let zz = z; zz <= z+d; zz += 32) lines.push(x, 0.1, zz, x+w, 0.1, zz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  content.add(new THREE.LineSegments(geometry, lineMaterial));
  const batches=new Map();
  function add(box) {
    const id=`${box[6]}:${Math.floor(box[0]/256)}:${Math.floor(box[2]/256)}`;
    if(!batches.has(id))batches.set(id,[]);
    batches.get(id).push(box);
  }
  for(const group of data.wallGroups) {group.boxes.forEach(add);group.walls.forEach(add);}
  data.networkBoxes.forEach(add);
  for(const p of data.ports)add([...p.door,1,2,1,'orange']);
  for(const [x,y,z,,height] of data.ladderBoxes) {
    add([x+0.15,y,z+0.88,0.1,height,0.1,'ladder']);
    add([x+0.75,y,z+0.88,0.1,height,0.1,'ladder']);
    for(let dy=0;dy<height;dy++)add([x+0.15,y+dy+0.4,z+0.85,0.7,0.12,0.12,'ladder']);
  }
  const matrix=new THREE.Matrix4();
  for(const boxes of batches.values()) {
    const mesh=new THREE.InstancedMesh(cube,materials[boxes[0][6]]||materials.house,boxes.length);
    boxes.forEach(([x,y,z,sx,sy,sz],i)=>{
      matrix.makeScale(sx,sy,sz);matrix.setPosition(x+sx/2,y+sy/2,z+sz/2);mesh.setMatrixAt(i,matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();
    content.add(mesh);renderBatches.push(mesh);
  }
  $('zone').replaceChildren();
  for(const [label,values] of [
    ['Cavites',data.zones.map(z=>new Option(`Zone ${z.id+1} · ${z.width*32} x ${z.depth*32}`,`zone:${z.id}`))],
    ['Pieces denses',data.denseRooms.map(r=>new Option(`Dense ${r.id+1} · Y ${r.box[1]}`,`room:${r.id}`))],
    ['Portes orange',data.ports.map(p=>new Option(`Porte ${p.id+1} · Zone ${p.zone+1}`,`door:${p.id}`))],
  ]) {
    const group=document.createElement('optgroup');group.label=label;group.append(...values);$('zone').append(group);
  }
  const s=data.stats;
  $('stats').textContent = `${data.zones.length} zones · ${s.wallHouses} maisons · ${s.connectedDense}/${s.denseRooms} denses reliees · ${s.connectedDoors}/${s.orangeDoors} portes reliees`;
  overview();
}

function generate() {
  if(!$('settings').reportValidity())return;
  worker?.terminate();
  $('stats').textContent='Generation des maisons et connexions...';
  const seed=Number($('seed').value), density=Number($('count').value);
  worker=new Worker('./generation_demo_chunks_worker.js',{type:'module'});
  const current=worker;
  worker.onmessage=({data:message})=>{
    if(current!==worker)return;
    if(message.error)$('stats').textContent=`Generation impossible : ${message.error}`;
    else show(message.result);
    current.terminate();
  };
  worker.onerror=event=>{
    $('stats').textContent=`Erreur de generation : ${event.message}`;current.terminate();
  };
  worker.postMessage({seed,density});
}

function resize() {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (!flying) overview();
}
addEventListener('resize', resize);
$('settings').onsubmit = event => { event.preventDefault(); generate(); };
$('random').onclick = () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; generate(); };
$('overview').onclick = overview;
$('fly').onclick = visit;
$('zone').onchange = visit;
$('inspection').onchange=()=>{
  const active=$('inspection').checked;
  for(const [material,opacity] of [[wallMaterial,0.18],[tunnelMaterial,0.3]]) {
    material.opacity=active?opacity:1;material.depthWrite=!active;material.needsUpdate=true;
  }
};
$('cut').oninput=()=>{cutPlane.constant=Number($('cut').value);$('cut-value').textContent=$('cut').value;};
renderer.domElement.onclick = () => { if (flying && !matchMedia('(pointer: coarse)').matches) renderer.domElement.requestPointerLock(); };
addEventListener('keydown', event => {
  if (['INPUT','SELECT','BUTTON'].includes(event.target.tagName)) return;
  if (['z','q','s','d',' ','c','control','shift'].includes(event.key.toLowerCase())) {
    event.preventDefault(); keys.add(event.key.toLowerCase());
  }
});
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let touchPosition;
renderer.domElement.addEventListener('pointerdown', event => {
  if (flying && event.pointerType === 'touch') { touchPosition = [event.clientX, event.clientY]; renderer.domElement.setPointerCapture(event.pointerId); }
});
renderer.domElement.addEventListener('pointerup', () => { touchPosition = null; });
renderer.domElement.addEventListener('pointercancel', () => { touchPosition = null; });
addEventListener('pointermove', event => {
  if (!flying) return;
  let dx, dy;
  if (document.pointerLockElement === renderer.domElement) { dx = event.movementX; dy = event.movementY; }
  else if (touchPosition) { dx = event.clientX-touchPosition[0]; dy = event.clientY-touchPosition[1]; touchPosition = [event.clientX,event.clientY]; }
  else return;
  camera.rotation.y -= dx*0.002;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x-dy*0.002, -1.55, 1.55);
});
for (const button of document.querySelectorAll('[data-key]')) {
  button.onpointerdown = event => { event.preventDefault(); keys.add(button.dataset.key); button.setPointerCapture(event.pointerId); };
  button.onpointerup = button.onpointercancel = () => keys.delete(button.dataset.key);
}
const clock = new THREE.Clock(), direction = new THREE.Vector3(), right = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (flying) {
    const speed = dt*(keys.has('shift') ? 400 : 90);
    direction.set(-Math.sin(camera.rotation.y), 0, -Math.cos(camera.rotation.y));
    right.set(-direction.z, 0, direction.x);
    camera.position.addScaledVector(direction, speed*(Number(keys.has('z'))-Number(keys.has('s'))));
    camera.position.addScaledVector(right, speed*(Number(keys.has('d'))-Number(keys.has('q'))));
    camera.position.y += speed*(Number(keys.has(' '))-Number(keys.has('c') || keys.has('control')));
  } else controls.update();
  for(const mesh of renderBatches)mesh.visible=!flying || mesh.boundingBox.distanceToPoint(camera.position)<1000;
  renderer.render(scene, camera);
});
resize();
generate();
