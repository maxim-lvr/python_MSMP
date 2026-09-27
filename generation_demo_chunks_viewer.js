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
  main_tunnel: new THREE.MeshLambertMaterial({color:0x77828a}),
  main_tunnel_frame: new THREE.MeshLambertMaterial({color:0x3d474f}),
  ladder_support: new THREE.MeshLambertMaterial({color:0x61717c}),
  zone_main_bridge: new THREE.MeshBasicMaterial({color:0x1d78ff}),
  zone_small_bridge: new THREE.MeshLambertMaterial({color:0x8b929b}),
  zone_tower: new THREE.MeshLambertMaterial({color:0x22c55e}),
  zone_door: new THREE.MeshBasicMaterial({color:0xff8800}),
  dense: new THREE.MeshLambertMaterial({color:0xbfa4a0}),
  orange: new THREE.MeshBasicMaterial({color:0xff8800, transparent:true,opacity:0.7,depthWrite:false,toneMapped:false}),
  ladder: new THREE.MeshBasicMaterial({color:0xb87736}),
  global_pipe: new THREE.MeshLambertMaterial({color:0x986d4f}),
  global_pipe_band: new THREE.MeshLambertMaterial({color:0x49484a}),
  snake_wall: wallMaterial,
  snake_floor: new THREE.MeshLambertMaterial({color:0x6f8986}),
  snake_facade: new THREE.MeshLambertMaterial({color:0xb0c8c0}),
  snake_alternate: new THREE.MeshLambertMaterial({color:0x91aaa2}),
  snake_window: new THREE.MeshBasicMaterial({color:0x38434b}),
  snake_lit: new THREE.MeshBasicMaterial({color:0xffe7a1}),
  snake_bridge: new THREE.MeshLambertMaterial({color:0x61717c}),
  snake_partition: new THREE.MeshLambertMaterial({color:0x91aaa2}),
  long_building: new THREE.MeshLambertMaterial({color:0x535b63}),
  long_building_dark: new THREE.MeshLambertMaterial({color:0x383e45}),
  long_column: new THREE.MeshLambertMaterial({color:0x424950}),
  long_floor: new THREE.MeshLambertMaterial({color:0x626b73}),
  long_stair: new THREE.MeshLambertMaterial({color:0x7d8790}),
  long_trail: new THREE.MeshBasicMaterial({color:0xff2d2d}),
  long_window: new THREE.MeshBasicMaterial({color:0xfff1bd}),
  long_window_dim: new THREE.MeshBasicMaterial({color:0x9da7a9}),
};
const colors = [0x91b9b2, 0xb5abc9, 0xd3b98c, 0x97b4cd];
const wideColors = {
  open: {tower:0x4e5656,trim:0x69716f,house:0x9aa9a1,roof:0x758b81,deck:0x88928b,
    bridge:0x879b9a,rail:0x434c4c,boundary:0x6f7c78,ground:0x8a9690,window:0x254944,
    pipe:0x986d4f,pipe_band:0x49484a,industrial:0x85877f,suspended:0x777c89,detail_trim:0x575858,detail_pillar:0x5f6668},
  restrict: {wall:0x79838a,floor:0x91979b,window:0x31434b,trim:0x555f68,stair:0x718b88,
    bridge:0x91a49d,rail:0x454e52,ground:0x777e84,mass_wall:0x84868c,mass_dark:0x616970,
    mass_light:0xa2a5a1,infill:0x52565a,ladder:0xbb9470},
};
for(const [type,palette] of Object.entries(wideColors)) {
  for(const [kind,color] of Object.entries(palette))materials[`wide_${type}_${kind}`]=new THREE.MeshLambertMaterial({color});
  materials[`wide_${type}_light`]=new THREE.MeshBasicMaterial({color:0xffdda3});
}
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
  if(type==='gallery') {
    const b=data.mainGalleries.interiors[id],x=b[0]+b[3]/2,z=b[2]+b[5]/2;
    camera.position.set(x,b[1]+1.6,z);
    camera.lookAt(x+(b[3]>b[5]?20:0),b[1]+1.6,z+(b[3]>b[5]?0:20));
  } else if(type==='pipe') {
    const a=data.globalPipe.visits[id].pos;
    camera.position.set(a[0]+24,a[1]+18,a[2]+24);camera.lookAt(...a);
  } else if(type==='wide') {
    const zone=data.wideAreas[id];
    camera.position.set(...zone.spawn);camera.lookAt(...zone.lookAt);
  } else if(type==='long') {
    const zone=data.buildingLong[id];
    camera.position.set(...zone.spawn);camera.lookAt(...zone.lookAt);
  } else if(type==='snake') {
    const snake=data.snakes[id],a=snake.route.points[0],b=snake.route.points[1];
    const dx=Math.sign(b.x-a.x),dz=Math.sign(b.z-a.z);
    camera.position.set(a.x+dx*12,snake.y+18,a.z+dz*12);
    camera.lookAt(a.x+dx*60,snake.y+18,a.z+dz*60);
  } else if(type==='room') {
    const b=data.denseRooms[id].box, x=b[0]+b[3]/2, y=b[1]+b[4]/2,z=b[2]+b[5]/2;
    camera.position.set(x+22,y+16,z-28);camera.lookAt(x,y,z);
  } else if(type==='door') {
    const p=data.ports[id],[nx,nz]=normals[p.side], [x,y,z]=p.door;
    camera.position.set(x+nx*14+nz*4,y+6,z+nz*14+nx*4);camera.lookAt(x+.5,y+1,z+.5);
  } else {
    const zone=data.zones.find(z=>z.id===id);
    if(zone?.type==='house_wall'||zone?.type==='bridge_zone') {
      const x=zone.x*32+zone.width*16,z=zone.z*32+zone.depth*16;
      const house=data.houses.find(h=>h.zone===id);
      const y=house?house.box[1]+Math.min(8,house.box[4]/2):160;
      camera.position.set(x,y,z);
      if(house)camera.lookAt(house.box[0]+house.box[3]/2,y,house.box[2]+house.box[5]/2);
      else camera.lookAt(x+(zone.rotated?0:100),y-5,z+(zone.rotated?100:0));
      return;
    }
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
  for(const {box:[x,y,z,sx,sy,sz]} of [...(data.buildingLong||[]),...(data.wideAreas||[])]) {
    for(const yy of [y,y+sy])lines.push(x,yy,z,x+sx,yy,z,x+sx,yy,z,x+sx,yy,z+sz,
      x+sx,yy,z+sz,x,yy,z+sz,x,yy,z+sz,x,yy,z);
    for(const xx of [x,x+sx])for(const zz of [z,z+sz])lines.push(xx,y,zz,xx,y+sy,zz);
  }
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
  for(const snake of data.snakes||[])snake.boxes.forEach(add);
  for(const zone of data.buildingLong||[])zone.boxes.forEach(add);
  for(const box of data.globalPipe?.boxes||[])add(box);
  for(const zone of data.wideAreas||[])for(const box of zone.boxes) {
    if(data.globalPipe?.connectedZones.includes(zone.id)&&['wide_open_pipe','wide_open_pipe_band'].includes(box[6]))continue;
    if(box[6]!=='wide_restrict_ladder'){add(box);continue;}
    const [x,y,z,,,]=box,kind=box[6];
    // Ladder voxels keep their grid coordinates; only the viewer draws the thinner rungs.
    for(const [dx,dy,sx,sy] of [[0.1,0,0.12,1],[0.78,0,0.12,1],[0.1,0.2,0.8,0.12],[0.1,0.7,0.8,0.12]])
      add(zone.rotation?[x+0.87,y+dy,z+dx,0.12,sy,sx,kind]:[x+dx,y+dy,z+0.01,sx,sy,0.12,kind]);
  }
  for(const p of data.ports)if(p.buildingLong===undefined)add([...p.door,1,2,1,'orange']);
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
    ['House Wall 64 x 64',data.zones.filter(z=>z.type==='house_wall').map((z,i)=>new Option(`House Wall ${i+1} · 64 x 64`, `zone:${z.id}`))],
    ['Bridges',data.zones.filter(z=>z.type==='bridge_zone').map((z,i)=>new Option(`Bridges ${i+1} · ${z.width*32} x ${z.depth*32}`, `zone:${z.id}`))],
    ['Cavites',data.zones.filter(z=>!z.type).map(z=>new Option(`Zone ${z.id+1} · ${z.width*32} x ${z.depth*32}`,`zone:${z.id}`))],
    ['House tunnel snake',(data.snakes||[]).map(s=>new Option(`Snake ${s.id+1} · ${s.length} blocs · Y ${s.y}`,`snake:${s.id}`))],
    ['Building Long',(data.buildingLong||[]).map(z=>new Option(`Building Long ${z.id+1} · ${z.length} blocs · Y ${z.box[1]}`,`long:${z.id}`))],
    ['Wide Open Area',(data.wideAreas||[]).filter(z=>z.type==='open').map(z=>new Option(`Wide Open ${z.index+1} · ${z.box[3]} x ${z.box[5]} · Y ${z.box[1]}`,`wide:${z.id}`))],
    ['Wide Restrict Area',(data.wideAreas||[]).filter(z=>z.type==='restrict').map(z=>new Option(`Wide Restrict ${z.index+1} · ${z.box[3]} x ${z.box[5]} · Y ${z.box[1]}`,`wide:${z.id}`))],
    ['Reseau de tuyaux',(data.globalPipe?.visits||[]).map((v,i)=>new Option(`${v.label} · Y ${v.pos[1]}`,`pipe:${i}`))],
    ['Galeries principales',(data.mainGalleries?.interiors||[]).map((b,i)=>({b,i})).filter(({b})=>Math.max(b[3],b[5])>=12).slice(0,60)
      .map(({b,i},n)=>new Option(`Galerie ${n+1} · Y ${b[1]}`,`gallery:${i}`))],
    ['Pieces denses',data.denseRooms.map(r=>new Option(`Dense ${r.id+1} · Y ${r.box[1]}`,`room:${r.id}`))],
    ['Acces Building Long',data.ports.filter(p=>p.buildingLong!==undefined).map(p=>new Option(`Building Long ${p.buildingLong+1} · ${p.end==='start'?'debut':'fin'} · chemin ${p.trail+1}`,`door:${p.id}`))],
    ['Portes orange',data.ports.filter(p=>p.buildingLong===undefined).map(p=>new Option(`Porte ${p.id+1} · ${p.snake===undefined?`Zone ${p.zone+1}`:`Snake ${p.snake+1}`}`,`door:${p.id}`))],
  ]) {
    const group=document.createElement('optgroup');group.label=label;group.append(...values);$('zone').append(group);
  }
  const s=data.stats;
  $('stats').textContent = `${data.zones.length} zones · ${(data.wideAreas||[]).filter(z=>z.type==='open').length} Wide Open · ${(data.wideAreas||[]).filter(z=>z.type==='restrict').length} Wide Restrict · ${(data.snakes||[]).length} snakes · ${(data.buildingLong||[]).length} Building Long (${s.buildingConnections} acces) · ${s.wallHouses} maisons · ${s.connectedDense}/${s.denseRooms} denses reliees · ${s.connectedDoors}/${s.orangeDoors} portes reliees`;
  if(data.globalPipe)$('stats').textContent+=` · tuyaux ${data.globalPipe.length} blocs · ${data.globalPipe.branches.length} branches · ${data.globalPipe.connectedZones.length} Wide Open raccordes`;
  $('stats').textContent=`${data.zones.filter(z=>z.type==='house_wall').length} House Wall 64 x 64 · ${data.zones.filter(z=>z.type==='bridge_zone').length} Bridges · `+$('stats').textContent;
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
