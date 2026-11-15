import * as THREE from './web/vendor/three.module.js';
import { OrbitControls } from './web/vendor/OrbitControls.js';
import {WORLD_MIN_Y as DEFAULT_MIN_Y, WORLD_MAX_Y as DEFAULT_MAX_Y} from './world_config.js';

const $ = id => document.getElementById(id);
const noiseMode = document.body.dataset.map === 'noise';
const cubeTest=noiseMode&&document.body.dataset.profile==='cube1000';
const WORLD_MIN_Y=cubeTest?0:DEFAULT_MIN_Y,WORLD_MAX_Y=cubeTest?1000:DEFAULT_MAX_Y;
const mapSize=noiseMode?10000:5000;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xedf0f2);
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, mapSize*12);
camera.rotation.order = 'YXZ';
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxDistance = mapSize*3;
controls.minDistance = 5;
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8b959f, 2));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(-2000, 4000, 1000);
scene.add(light);
const ground = new THREE.GridHelper(mapSize, mapSize/100, 0xaebac2, 0xd4dde2);
ground.position.set(mapSize/2, WORLD_MIN_Y-1, mapSize/2);
scene.add(ground);
const plane = new THREE.PlaneGeometry(1, 1);
const cube = new THREE.BoxGeometry(1,1,1);
const cutPlane = new THREE.Plane(new THREE.Vector3(0,-1,0),WORLD_MAX_Y);
renderer.clippingPlanes = [cutPlane];
const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xa2adb7, transparent: true, opacity: 0.18, depthWrite: false });
const tunnelMaterial = new THREE.MeshLambertMaterial({ color: 0x7497a3, transparent: true, opacity: 0.3, depthWrite: false });
const materials = {
  noise_floor: new THREE.MeshLambertMaterial({color:0x89968d}),
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
  pipe_walkway: new THREE.MeshLambertMaterial({color:0x657876}),
  pipe_access: new THREE.MeshLambertMaterial({color:0x879e94}),
  pipe_access_frame: new THREE.MeshLambertMaterial({color:0x455e58}),
  pipe_ladder_support: new THREE.MeshLambertMaterial({color:0x61717c}),
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
  ultra_dense:{outer_wall:0xa2aaa6,outer_recess:0x7d8881,tower_wall:0x9ba39f,tower_recess:0x7d8781,
    ground:0x68746b,room_wall:0xbfa4a0,room_floor:0x8e9991},
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
for(const [type,palette] of Object.entries({
  water:{tower:0x738780,ground:0x687671,ceiling:0x83918c,boundary:0x83918c},
  village:{house:0xb1b6a5,roof:0x78877b,bridge:0x61717c,deck:0x8d9990,window:0x38434b},
}))for(const [kind,color] of Object.entries(palette))
  materials[`${type}_${kind}`]=new THREE.MeshLambertMaterial({color});
materials.water_water=new THREE.MeshLambertMaterial({color:0x358fba,transparent:true,opacity:0.75});
const floorMaterials = colors.map(color => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x536874, transparent: true, opacity: 0.45 });
let content = new THREE.Group(), data, flying = false, worker;
let renderBatches=[];
let generationRevision=0;
scene.add(content);
const keys = new Set();

function overview() {
  flying = false;
  document.body.dataset.fly = 'false';
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  controls.enabled = true;
  $('overview').setAttribute('aria-pressed', 'true');
  $('fly').setAttribute('aria-pressed', 'false');
  const distance = mapSize*.7 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect);
  camera.position.set(mapSize/2 + distance*0.12, WORLD_MIN_Y+distance*0.88+(cubeTest?400:0), mapSize/2 + distance*0.47);
  controls.target.set(mapSize/2, cubeTest?500:WORLD_MIN_Y, mapSize/2);
  controls.update();
}

function visit() {
  if(!data)return;
  visitLocal();
  camera.position.y+=WORLD_MIN_Y;
}

function visitLocal() {
  if(!data)return;
  const [type,idText]=$('zone').value.split(':'), id=Number(idText);
  flying = true;
  document.body.dataset.fly = 'true';
  controls.enabled = false;
  $('overview').setAttribute('aria-pressed', 'false');
  $('fly').setAttribute('aria-pressed', 'true');
  const normals={north:[0,-1],south:[0,1],west:[-1,0],east:[1,0]};
  if(type==='pipe_access') {
    const access=data.globalPipe.accesses[id];
    camera.position.set(...access.spawn);camera.lookAt(...access.lookAt);
  } else if(type==='gallery') {
    const b=data.mainGalleries.interiors[id],x=b[0]+b[3]/2,z=b[2]+b[5]/2;
    camera.position.set(x,b[1]+1.6,z);
    camera.lookAt(x+(b[3]>b[5]?20:0),b[1]+1.6,z+(b[3]>b[5]?0:20));
  } else if(type==='pipe') {
    const a=data.globalPipe.visits[id].pos;
    camera.position.set(a[0]+24,a[1]+18,a[2]+24);camera.lookAt(...a);
  } else if(type==='wide') {
    const zone=data.wideAreas[id];
    camera.position.set(...zone.spawn);camera.lookAt(...zone.lookAt);
  } else if(type==='settlement') {
    const zone=data.settlements[id];
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
      const y=house?house.box[1]+Math.min(8,house.box[4]/2):(zone.y||0)+160;
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

function inspectPipeDoor() {
  const accesses=data?.globalPipe?.accesses;
  if(!accesses?.length)return;
  const selected=$('zone').value.startsWith('pipe_access:')?Number($('zone').value.split(':')[1]):0;
  const access=accesses[selected]||accesses[0],p=access.pipeDoor,n=access.normal;
  $('zone').value=`pipe_access:${access.id}`;visit();
  camera.position.set(p[0]+.5+n[0]*10,p[1]+WORLD_MIN_Y+4+n[1]*10,p[2]+.5+n[2]*10);
  if(access.pipeAxis===0)camera.position.x+=6;else camera.position.z+=6;
  camera.lookAt(p[0]+.5,p[1]+WORLD_MIN_Y+1,p[2]+.5);
}

async function show(result,revision,generationSeconds) {
  if(revision!==generationRevision)return;
  const renderStarted=performance.now();let sliceStarted=renderStarted;
  scene.remove(content);
  content.traverse(object => {
    if (object.isLineSegments) object.geometry.dispose();
    if(object.isInstancedMesh)object.dispose();
  });
  content = new THREE.Group();
  renderBatches=[];
  scene.add(content);
  data = result;
  overview();
  if($('pipe-door'))$('pipe-door').disabled=!data.globalPipe?.accesses?.length;
  const lines = [];
  for(const {box:[x,y,z,sx,sy,sz]} of [...(data.buildingLong||[]),...(data.wideAreas||[]),...(data.settlements||[])]) {
    for(const yy of [y,y+sy])lines.push(x,yy,z,x+sx,yy,z,x+sx,yy,z,x+sx,yy,z+sz,
      x+sx,yy,z+sz,x,yy,z+sz,x,yy,z+sz,x,yy,z);
    for(const xx of [x,x+sx])for(const zz of [z,z+sz])lines.push(xx,y,zz,xx,y+sy,zz);
  }
  for (const zone of data.zones) {
    const x = zone.x*32, z = zone.z*32, w = zone.width*32, d = zone.depth*32;
    const floor = new THREE.Mesh(plane, floorMaterials[zone.id % colors.length]);
    floor.rotation.x = -Math.PI/2;
    floor.scale.set(w, d, 1);
    floor.position.set(x+w/2, WORLD_MIN_Y+(zone.y||0), z+d/2);
    content.add(floor);
    for (const [wx, wy, wz, sx, sy, sz] of zone.walls) lines.push(wx, wy+sy, wz, wx+sx, wy+sy, wz+sz);
    for (let xx = x; xx <= x+w; xx += 32) lines.push(xx, (zone.y||0)+0.1, z, xx, (zone.y||0)+0.1, z+d);
    for (let zz = z; zz <= z+d; zz += 32) lines.push(x, (zone.y||0)+0.1, zz, x+w, (zone.y||0)+0.1, zz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  geometry.translate(0,WORLD_MIN_Y,0);
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
  for(const zone of data.settlements||[])zone.boxes.forEach(add);
  for(const box of data.globalPipe?.boxes||[])add(box);
  for(const box of data.globalPipe?.pedestrianBoxes||[])add(box);
  for(const zone of data.wideAreas||[])for(const box of zone.boxes) {
    if(data.globalPipe?.connectedZones.includes(zone.id)&&['wide_open_pipe','wide_open_pipe_band'].includes(box[6]))continue;
    if(box[6]!=='wide_restrict_ladder'){add(box);continue;}
    const [x,y,z,,,]=box,kind=box[6];
    // Ladder voxels keep their grid coordinates; only the viewer draws the thinner rungs.
    for(const [dx,dy,sx,sy] of [[0.1,0,0.12,1],[0.78,0,0.12,1],[0.1,0.2,0.8,0.12],[0.1,0.7,0.8,0.12]])
      add(zone.rotation?[x+0.87,y+dy,z+dx,0.12,sy,sx,kind]:[x+dx,y+dy,z+0.01,sx,sy,0.12,kind]);
  }
  for(const p of data.ports)if(p.buildingLong===undefined)add([...p.door,1,2,1,'orange']);
  for(const [x,y,z,,height] of [...data.ladderBoxes,...(data.globalPipe?.pedestrianLadders||[])]) {
    add([x+0.15,y,z+0.88,0.1,height,0.1,'ladder']);
    add([x+0.75,y,z+0.88,0.1,height,0.1,'ladder']);
    for(let dy=0;dy<height;dy++)add([x+0.15,y+dy+0.4,z+0.85,0.7,0.12,0.12,'ladder']);
  }
  const matrix=new THREE.Matrix4();
  let built=0;
  for(const boxes of batches.values()) {
    const mesh=new THREE.InstancedMesh(cube,materials[boxes[0][6]]||materials.house,boxes.length);
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    boxes.forEach(([x,y,z,sx,sy,sz],i)=>{
      const yy=WORLD_MIN_Y+y;
      matrix.makeScale(sx,sy,sz);matrix.setPosition(x+sx/2,yy+sy/2,z+sz/2);mesh.setMatrixAt(i,matrix);
      minX=Math.min(minX,x);minY=Math.min(minY,yy);minZ=Math.min(minZ,z);
      maxX=Math.max(maxX,x+sx);maxY=Math.max(maxY,yy+sy);maxZ=Math.max(maxZ,z+sz);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.boundingBox=new THREE.Box3(new THREE.Vector3(minX,minY,minZ),new THREE.Vector3(maxX,maxY,maxZ));
    mesh.boundingSphere=mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
    content.add(mesh);renderBatches.push(mesh);
    built++;
    if(performance.now()-sliceStarted>12) {
      $('stats').textContent=`Affichage de la map : ${Math.round(built/batches.size*100)} %`;
      await new Promise(requestAnimationFrame);if(revision!==generationRevision)return;sliceStarted=performance.now();
    }
  }
  $('zone').replaceChildren();
  for(const [label,values] of [
    ['House tunnel snake',(data.snakes||[]).map(s=>new Option(`Snake ${s.id+1} · ${s.length} blocs · Y ${s.y+WORLD_MIN_Y}`,`snake:${s.id}`))],
    ['House Wall 64 x 64',data.zones.filter(z=>z.type==='house_wall').map((z,i)=>new Option(`House Wall ${i+1} · 64 x 64`, `zone:${z.id}`))],
    ['Bridges',data.zones.filter(z=>z.type==='bridge_zone').map((z,i)=>new Option(`Bridges ${i+1} · ${z.width*32} x ${z.depth*32}`, `zone:${z.id}`))],
    ['Cavites',data.zones.filter(z=>!z.type).map(z=>new Option(`Zone ${z.id+1} · ${z.width*32} x ${z.depth*32}`,`zone:${z.id}`))],
    ['Building Long',(data.buildingLong||[]).map(z=>new Option(`Building Long ${z.id+1} · ${z.length} blocs · Y ${z.box[1]+WORLD_MIN_Y}`,`long:${z.id}`))],
    ['Wide Open Area',(data.wideAreas||[]).filter(z=>z.type==='open').map(z=>new Option(`Wide Open ${z.index+1} · ${z.box[3]} x ${z.box[5]} · Y ${z.box[1]+WORLD_MIN_Y}`,`wide:${z.id}`))],
    ['Wide Restrict Area',(data.wideAreas||[]).filter(z=>z.type==='restrict').map(z=>new Option(`Wide Restrict ${z.index+1} · ${z.box[3]} x ${z.box[5]} · Y ${z.box[1]+WORLD_MIN_Y}`,`wide:${z.id}`))],
    ['House Wall ultra dense',(data.wideAreas||[]).filter(z=>z.type==='ultra_dense').map(z=>
      new Option(`House Wall ultra dense ${z.index+1} · Y ${z.box[1]+WORLD_MIN_Y}`,`wide:${z.id}`))],
    ['Water Rooms',(data.settlements||[]).filter(z=>z.type==='water').map(z=>new Option(`Water Room ${z.index+1} · Y ${z.box[1]+WORLD_MIN_Y}`,`settlement:${z.id}`))],
    ['Villager Cities',(data.settlements||[]).filter(z=>z.type==='village').map(z=>new Option(`Village ${z.index+1} · Y ${z.box[1]+WORLD_MIN_Y}`,`settlement:${z.id}`))],
    ['Reseau de tuyaux',(data.globalPipe?.visits||[]).map((v,i)=>new Option(`${v.label} · Y ${v.pos[1]+WORLD_MIN_Y}`,`pipe:${i}`))],
    ['Acces des tuyaux vers la map',(data.globalPipe?.accesses||[]).map(a=>
      new Option(`${a.type==='ceiling'?'Echelle':'Porte'} ${a.id+1} · ${a.target.kind==='room'?'Piece':a.target.kind==='house'?'Maison':'Tunnel'} ${a.target.id+1} · Y ${a.pipeDoor[1]+WORLD_MIN_Y}`,`pipe_access:${a.id}`))],
    ['Galeries principales',(data.mainGalleries?.interiors||[]).map((b,i)=>({b,i})).filter(({b})=>Math.max(b[3],b[5])>=12).slice(0,60)
      .map(({b,i},n)=>new Option(`Galerie ${n+1} · Y ${b[1]+WORLD_MIN_Y}`,`gallery:${i}`))],
    ['Pieces denses',data.denseRooms.map(r=>new Option(`Dense ${r.id+1} · Y ${r.box[1]+WORLD_MIN_Y}`,`room:${r.id}`))],
    ['Acces Building Long',data.ports.filter(p=>p.buildingLong!==undefined).map(p=>new Option(`Building Long ${p.buildingLong+1} · ${p.end==='start'?'debut':'fin'} · chemin ${p.trail+1}`,`door:${p.id}`))],
    ['Acces villages',data.ports.filter(p=>p.village!==undefined).map(p=>new Option(`Village ${data.settlements[p.village].index+1} · ${p.side}`,`door:${p.id}`))],
    ['Acces House Wall ultra dense',data.ports.filter(p=>p.ultraDense!==undefined).map(p=>new Option(`House Wall ultra dense ${data.wideAreas.find(z=>z.id===p.ultraDense).index+1} · ${p.side} · Y ${p.door[1]+WORLD_MIN_Y}`,`door:${p.id}`))],
    ['Portes orange',data.ports.filter(p=>p.buildingLong===undefined&&p.village===undefined&&p.ultraDense===undefined).map(p=>new Option(`Porte ${p.id+1} · ${p.snake===undefined?`Zone ${p.zone+1}`:`Snake ${p.snake+1}`}`,`door:${p.id}`))],
  ]) {
    const group=document.createElement('optgroup');group.label=label;group.append(...values);$('zone').append(group);
  }
  const s=data.stats;
  $('stats').textContent = `${data.zones.length} zones · ${(data.wideAreas||[]).filter(z=>z.type==='open').length} Wide Open · ${(data.wideAreas||[]).filter(z=>z.type==='restrict').length} Wide Restrict · ${(data.snakes||[]).length} snakes · ${(data.buildingLong||[]).length} Building Long (${s.buildingConnections} acces) · ${s.wallHouses} maisons · ${s.connectedDense}/${s.denseRooms} denses reliees · ${s.connectedDoors}/${s.orangeDoors} portes reliees`;
  if(data.globalPipe)$('stats').textContent+=` · tuyaux ${data.globalPipe.length} blocs · ${data.globalPipe.branches.length} branches · ${data.globalPipe.connectedZones.length} Wide Open raccordes`;
  if(data.globalPipe?.accesses)$('stats').textContent+=` · ${s.pipeAccesses} acces vers la map (${s.pipeAccessSectors} secteurs)`;
  const ultraDense=(data.wideAreas||[]).filter(z=>z.type==='ultra_dense');
  if(ultraDense.length)$('stats').textContent+=` · ${ultraDense.length} House Wall ultra dense (${ultraDense.reduce((n,z)=>n+z.stats.houses,0)} pieces, ${s.ultraDenseConnections||0} acces)`;
  $('stats').textContent=`${data.zones.filter(z=>z.type==='house_wall').length} House Wall 64 x 64 · ${data.zones.filter(z=>z.type==='bridge_zone').length} Bridges · `+$('stats').textContent;
  if(data.settlements?.length)$('stats').textContent+=` · ${data.settlements.filter(z=>z.type==='water').length} Water Rooms · ${data.settlements.filter(z=>z.type==='village').length} Villager Cities (${s.villageConnections||0} acces)`;
  if(data.noise?.full)$('stats').textContent+=` · Noise ${data.world.length} x ${data.world.width} · ${data.noise.components} secteurs`;
  else if(data.noise)$('stats').textContent=`${data.world.length} x ${data.world.width} x ${data.world.height} · ${s.denseRooms} pieces reliees aux galeries · ${data.noise.components} secteurs · ${data.noise.seconds.toFixed(1)} s`;
  $('stats').textContent+=` · Y ${WORLD_MIN_Y} a ${WORLD_MAX_Y} (${data.world.height} blocs)`;
  const displaySeconds=(performance.now()-renderStarted)/1000;
  if($('loading')) {
    const reused=result.loading?.reusedMap?'carte reutilisee':
      `${result.loading?.stages.filter(s=>s.hit).length||0} etapes reutilisees`;
    $('loading').textContent=`Chargement ${generationSeconds.toFixed(1)} s · affichage ${displaySeconds.toFixed(1)} s · ${reused}${result.loading?.reusedMap?'':` · ${result.loading?.workers||1} workers`}`;
    $('loading').dataset.profile=JSON.stringify({generationSeconds,displaySeconds,...result.loading});
  }
  console.info('Map loading', {generationSeconds,displaySeconds,...result.loading});
  overview();
}

function generate(force=false,retries=0) {
  if(!$('settings').reportValidity())return;
  const revision=++generationRevision,started=performance.now();
  worker?.terminate();
  if($('loading')){$('loading').textContent='';delete $('loading').dataset.profile;}
  $('stats').textContent='Generation des maisons et connexions...';
  const seed=Number($('seed').value), density=Number($('count').value);
  worker=new Worker(noiseMode?'./generation_noise_worker.js?v=staged-cache-v1':'./generation_demo_chunks_worker.js?v=staged-cache-v1',{type:'module'});
  const current=worker;
  worker.onmessage=async({data:message})=>{
    if(current!==worker)return;
    if(message.progress){$('stats').textContent=message.progress;return;}
    if(message.stale){
      current.terminate();
      if(retries<2)generate(force,retries+1);
      else $('stats').textContent='Les regles ont change pendant le calcul. Relance la generation.';
      return;
    }
    if(message.error)$('stats').textContent=`Generation impossible : ${message.error}`;
    current.terminate();
    if(!message.error)try{await show(message.result,revision,(performance.now()-started)/1000);}
      catch(error){if(revision===generationRevision)$('stats').textContent=`Affichage impossible : ${error.message}`;console.error(error);}
  };
  worker.onerror=event=>{
    if(current!==worker)return;
    $('stats').textContent=`Erreur de generation : ${event.message}`;current.terminate();
  };
  worker.postMessage({seed,density,force,threads:Number($('threads')?.value||4),profile:cubeTest?'cube1000':undefined});
}

function resize() {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (!flying) overview();
}
addEventListener('resize', resize);
$('settings').onsubmit = event => { event.preventDefault(); generate(); };
if($('rebuild'))$('rebuild').onclick=()=>generate(true);
$('random').onclick = () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; generate(); };
$('overview').onclick = overview;
$('fly').onclick = visit;
if($('pipe-door'))$('pipe-door').onclick=inspectPipeDoor;
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
