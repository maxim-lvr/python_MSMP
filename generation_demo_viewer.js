import * as THREE from './web/vendor/three.module.js';
import { OrbitControls } from './web/vendor/OrbitControls.js';
import { LABELS } from './generation_demo_generator.js';
import {WORLD_MIN_Y, WORLD_MAX_Y, WORLD_HEIGHT} from './world_config.js';

const PALETTE = {
  tower: 0x72a482, building: 0x9babb9, close: 0x659e9a, wide: 0xb99aa7,
  dense: 0xb9bfa3, tunnel: 0x91b99c, wall: 0x737e80, floor: 0x8c9793,
  road: 0x347ebe, bridge: 0x61788d, column: 0x565e65, trail: 0xbc565b, door: 0xf49833,
  stair: 0x74818c, ladder: 0xb48148, alternate: 0x82988b, window: 0x283331, lit: 0xffe4a5,
};
const TYPE_KIND = { bridge: 'tower', long: 'building', close: 'close', wide: 'wide', dense: 'dense', tunnel: 'tunnel' };
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9eeeb);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.15, 50000);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.domElement.id = 'viewport';
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.minDistance = 15;
orbit.maxDistance = 30000;
orbit.maxPolarAngle = Math.PI * 0.49;
const geometry = new THREE.BoxGeometry(1, 1, 1);
const cut = { value: WORLD_MAX_Y }, fogDistance = { value: 0 };
const materials = {};
for (const [kind, color] of Object.entries(PALETTE)) {
  materials[kind] = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) }, cut, fogDistance,
      sky: { value: scene.background },
    },
    vertexShader: `
      varying vec3 worldPos;
      varying vec3 worldNormal;
      void main() {
        vec4 p = modelMatrix * instanceMatrix * vec4(position, 1.0);
        worldPos = p.xyz;
        worldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * p;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform vec3 sky;
      uniform float cut;
      uniform float fogDistance;
      varying vec3 worldPos;
      varying vec3 worldNormal;
      void main() {
        if (worldPos.y > cut) discard;
        vec3 n = normalize(worldNormal);
        vec3 c = color;
        float distanceToCamera = distance(cameraPosition, worldPos);
        float shade = 0.68 + 0.32 * max(dot(n, normalize(vec3(-0.4, 0.9, 0.6))), 0.0);
        c *= shade;
        if (fogDistance > 0.0) c = mix(c, sky, smoothstep(fogDistance * 0.65, fogDistance, distanceToCamera));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshBasicMaterial({ color: 0xdce3df }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = WORLD_MIN_Y-0.1;
scene.add(floor);
const grid = new THREE.GridHelper(5000, 50, 0x99aea2, 0xb9c6be);
grid.position.y = WORLD_MIN_Y-0.05;
scene.add(grid);
const bounds = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-2500, WORLD_MIN_Y, -2500), new THREE.Vector3(2500, WORLD_MAX_Y, 2500)), 0x9aada0);
scene.add(bounds);

let mode = 'overview', data = null, sectorViews = [], worldGroup = new THREE.Group();
let worker = null, generation = 0, selected = -1;
scene.add(worldGroup);
const keys = new Set();
const query = id => document.querySelector(`#${id}`);
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

function meshesFor(boxes) {
  const group = new THREE.Group();
  const byKind = new Map();
  for (const box of boxes) {
    const kind = box[6];
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(box);
  }
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  for (const [kind, items] of byKind) {
    const mesh = new THREE.InstancedMesh(geometry, materials[kind], items.length);
    items.forEach(([x, y, z, sx, sy, sz], i) => {
      matrix.compose(position.set(x + sx / 2 - 2500, WORLD_MIN_Y + y + sy / 2, z + sz / 2 - 2500), rotation, scale.set(sx, sy, sz));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
function disposeGroup(group) {
  group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  group.clear();
}
async function regenerate() {
  if (!query('settings').reportValidity()) return;
  const id = ++generation;
  const seed = Number(query('seed').value) >>> 0;
  worker?.terminate();
  worker = new Worker('./generation_demo_worker.js', { type: 'module' });
  query('stats').textContent = 'Generation...';
  worker.onerror = () => { if (id === generation) query('stats').textContent = 'Erreur de generation'; };
  worker.onmessage = async ({ data: message }) => {
    if (id !== generation) return;
    if (message.error) { query('stats').textContent = message.error; return; }
    const result = message.result;
    const next = new THREE.Group();
    next.add(meshesFor(result.roads));
    const views = [];
    for (const sector of result.sectors) {
      await frame();
      if (id !== generation) { disposeGroup(next); return; }
      const coarse = meshesFor(sector.coarse);
      next.add(coarse);
      const [x, y, z, sx, sy, sz] = sector.bounds;
      views.push({ coarse, detail: null, sector,
        bounds: new THREE.Box3(new THREE.Vector3(x - 2500, WORLD_MIN_Y + y, z - 2500), new THREE.Vector3(x + sx - 2500, WORLD_MIN_Y + y + sy, z + sz - 2500)) });
    }
    scene.remove(worldGroup);
    disposeGroup(worldGroup);
    worldGroup = next;
    scene.add(worldGroup);
    data = result;
    sectorViews = views;
    query('stats').textContent = `5000 x 5000 x ${WORLD_HEIGHT} · Y ${WORLD_MIN_Y} a ${WORLD_MAX_Y} · ${result.sectors.length} builds relies · ${result.connections.length} raccords`;
    query('sector').replaceChildren(new Option('Builds', ''));
    for (const sector of result.sectors) query('sector').add(new Option(sector.name, sector.id));
    if (mode === 'fly') enterSector(selected < 0 || selected >= result.sectors.length ? 0 : selected);
    mapDirty = true;
    drawMap();
  };
  worker.postMessage({ id, seed });
}

function setMode(value) {
  mode = value;
  document.body.dataset.mode = mode;
  orbit.enabled = mode === 'overview';
  fogDistance.value = mode === 'overview' ? 0 : Number(query('distance').value);
  query('overview').setAttribute('aria-pressed', String(mode === 'overview'));
  query('fly').setAttribute('aria-pressed', String(mode === 'fly'));
  keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
}
function overview() {
  setMode('overview');
  const angle = Math.min(Math.PI / 6, Math.atan(Math.tan(Math.PI / 6) * camera.aspect));
  const distance = 3500 / Math.sin(angle);
  orbit.target.set(0, WORLD_MIN_Y + 110, 0);
  camera.position.copy(new THREE.Vector3(0.6, 0.85, 0.72).normalize().multiplyScalar(distance)).add(orbit.target);
  orbit.update();
}
function enterSector(id) {
  if (!data) return;
  const sector = data.sectors[id];
  selected = id;
  setMode('fly');
  camera.position.set(sector.spawn[0] - 2500, WORLD_MIN_Y + sector.spawn[1], sector.spawn[2] - 2500);
  camera.lookAt(sector.viewTarget[0] - 2500, WORLD_MIN_Y + sector.viewTarget[1], sector.viewTarget[2] - 2500);
  query('sector').value = String(id);
  drawMap();
}
query('overview').onclick = overview;
query('fly').onclick = () => enterSector(selected < 0 ? 0 : selected);
query('sector').onchange = event => { if (event.target.value !== '') enterSector(Number(event.target.value)); };
query('settings').onsubmit = event => { event.preventDefault(); regenerate(); };
query('random').onclick = () => { query('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; regenerate(); };
query('cut').oninput = event => { cut.value = Number(event.target.value); query('cut-value').value = event.target.value; };
query('distance').oninput = event => { query('distance-value').value = event.target.value; if (mode === 'fly') fogDistance.value = Number(event.target.value); };

const minimap = query('minimap');
const context = minimap.getContext('2d');
const mapImage = document.createElement('canvas');
mapImage.width = minimap.width; mapImage.height = minimap.height;
const mapContext = mapImage.getContext('2d');
let mapDirty = true;
for (const [type, label] of Object.entries(LABELS)) {
  const span = document.createElement('span');
  const swatch = document.createElement('i');
  swatch.style.setProperty('--color', `#${PALETTE[TYPE_KIND[type]].toString(16).padStart(6, '0')}`);
  span.append(swatch, document.createTextNode(label));
  query('legend').append(span);
}
function drawMap() {
  if (!data) return;
  const scale = minimap.width / 5000;
  if (mapDirty) {
    mapContext.clearRect(0, 0, 250, 250);
    for (const sector of data.sectors) {
      mapContext.fillStyle = `#${PALETTE[TYPE_KIND[sector.type]].toString(16).padStart(6, '0')}`;
      for (const [x, , z, sx, , sz] of sector.coarse) mapContext.fillRect(x * scale, z * scale, Math.max(0.5, sx * scale), Math.max(0.5, sz * scale));
    }
    mapContext.fillStyle = '#347ebe';
    for (const [x, , z, sx, , sz] of data.roads) mapContext.fillRect(x * scale, z * scale, Math.max(1, sx * scale), Math.max(1, sz * scale));
    mapDirty = false;
  }
  context.clearRect(0, 0, 250, 250);
  context.drawImage(mapImage, 0, 0);
  for (const sector of data.sectors) {
    if (sector.id === selected) {
      const [x, , z, sx, , sz] = sector.bounds;
      context.strokeStyle = '#263b32'; context.lineWidth = 2;
      context.strokeRect(x * scale, z * scale, sx * scale, sz * scale);
    }
  }
  if (mode === 'fly') {
    context.fillStyle = '#bd333c';
    context.beginPath(); context.arc((camera.position.x + 2500) * scale, (camera.position.z + 2500) * scale, 4, 0, Math.PI * 2); context.fill();
  }
}
minimap.onclick = event => {
  if (!data) return;
  const rect = minimap.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * 5000;
  const z = (event.clientY - rect.top) / rect.height * 5000;
  const sector = data.sectors.find(s => x >= s.bounds[0] && x < s.bounds[0] + s.bounds[3] && z >= s.bounds[2] && z < s.bounds[2] + s.bounds[5]);
  if (sector) enterSector(sector.id);
};

renderer.domElement.addEventListener('click', () => {
  if (mode === 'fly' && !matchMedia('(pointer: coarse)').matches) renderer.domElement.requestPointerLock();
});
document.addEventListener('keydown', event => {
  if (mode !== 'fly' || event.target.closest('input, select, button, a')) return;
  if (['z', 'q', 's', 'd', ' ', 'c', 'control', 'shift'].includes(event.key.toLowerCase())) {
    event.preventDefault(); keys.add(event.key.toLowerCase());
  }
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('pointerlockchange', () => keys.clear());
function look(dx, dy) {
  camera.rotation.y -= dx * 0.002;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.002, -1.55, 1.55);
}
document.addEventListener('mousemove', event => { if (document.pointerLockElement === renderer.domElement) look(event.movementX, event.movementY); });
let touch = null;
renderer.domElement.addEventListener('pointerdown', event => {
  if (mode === 'fly' && event.pointerType === 'touch') { touch = [event.clientX, event.clientY]; renderer.domElement.setPointerCapture(event.pointerId); }
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!touch) return;
  look(event.clientX - touch[0], event.clientY - touch[1]); touch = [event.clientX, event.clientY];
});
for (const name of ['pointerup', 'pointercancel']) renderer.domElement.addEventListener(name, () => { touch = null; });
for (const button of document.querySelectorAll('[data-key]')) {
  button.onpointerdown = event => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.key); };
  button.onpointerup = button.onpointercancel = () => keys.delete(button.dataset.key);
}
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock(), direction = new THREE.Vector3(), right = new THREE.Vector3(), movement = new THREE.Vector3();
let lastStats = 0, frames = 0;
function animate(now) {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'overview') orbit.update();
  else {
    camera.getWorldDirection(direction); direction.y = 0; direction.normalize();
    right.crossVectors(direction, camera.up).normalize(); movement.set(0, 0, 0);
    if (keys.has('z')) movement.add(direction);
    if (keys.has('s')) movement.sub(direction);
    if (keys.has('q')) movement.sub(right);
    if (keys.has('d')) movement.add(right);
    if (keys.has(' ')) movement.y++;
    if (keys.has('c') || keys.has('control')) movement.y--;
    camera.position.addScaledVector(movement.normalize(), dt * (keys.has('shift') ? 420 : 65));
  }
  let visible = 0;
  for (const view of sectorViews) {
    const distance = view.bounds.distanceToPoint(camera.position);
    const show = mode === 'overview' || distance <= fogDistance.value;
    view.coarse.visible = show;
    if (show) visible++;
  }
  renderer.render(scene, camera);
  frames++;
  if (now - lastStats > 800) {
    query('perf').textContent = `${Math.round(frames * 1000 / (now - lastStats))} FPS · ${visible} builds`;
    frames = 0; lastStats = now; drawMap();
  }
  requestAnimationFrame(animate);
}
overview();
regenerate();
requestAnimationFrame(animate);
