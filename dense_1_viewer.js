import * as THREE from './web/vendor/three.module.js';

const API_URL = './api/dense-1';
const DATA_URL = './exports/dense_1.json?v=dense-ladder-ceiling-20260827';
const stats = document.querySelector('#stats');
const seedInput = document.querySelector('#seed');
const updateButton = document.querySelector('#update');
const randomButton = document.querySelector('#random');
const keys = new Set();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xedf2f6);
scene.fog = new THREE.Fog(0xedf2f6, 420, 1300);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1800);
camera.position.set(-330, 145, -340);
camera.rotation.order = 'YXZ';
camera.rotation.x = -0.18;
camera.rotation.y = -0.72;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xaeb8c2, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(80, 140, 90);
scene.add(sun);

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const tmpMatrix = new THREE.Matrix4();
const materialByKind = new Map([
  ['house', new THREE.MeshBasicMaterial({ color: 0x9ba3aa })],
  ['corridor', new THREE.MeshBasicMaterial({ color: 0x46505b })],
  ['stair', new THREE.MeshBasicMaterial({ color: 0x657282 })],
  ['stair_floor_north', new THREE.MeshBasicMaterial({ color: 0x657282 })],
  ['stair_floor_south', new THREE.MeshBasicMaterial({ color: 0x657282 })],
  ['stair_floor_west', new THREE.MeshBasicMaterial({ color: 0x657282 })],
  ['stair_floor_east', new THREE.MeshBasicMaterial({ color: 0x657282 })],
  ['ladder', new THREE.MeshBasicMaterial({ color: 0xb48148 })],
  ['long_connection', new THREE.MeshBasicMaterial({ color: 0xe11d48 })],
  ['door', new THREE.MeshBasicMaterial({ color: 0x111827 })],
]);

let zone = { size: [500, 200, 500] };
let runCount = 0;
let blockCount = 0;
let loading = false;
const dynamicObjects = [];

function centeredPosition(x, y, z, sx, sy, sz) {
  const [length, , width] = zone.size;
  return new THREE.Vector3(
    x + sx / 2 - length / 2,
    y + sy / 2,
    z + sz / 2 - width / 2,
  );
}

function addInstancedRuns(kind, runs) {
  const material = materialByKind.get(kind) || new THREE.MeshBasicMaterial({ color: 0xb7bec7 });
  const mesh = new THREE.InstancedMesh(boxGeometry, material, runs.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;

  runs.forEach((run, index) => {
    const [x, y, z] = run.pos;
    const [sx, sy, sz] = run.size;
    tmpMatrix.compose(
      centeredPosition(x, y, z, sx, sy, sz),
      new THREE.Quaternion(),
      new THREE.Vector3(sx, sy, sz),
    );
    mesh.setMatrixAt(index, tmpMatrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  dynamicObjects.push(mesh);
}

function addHelpers() {
  const [length, height, width] = zone.size;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  dynamicObjects.push(floor);

  const grid = new THREE.GridHelper(Math.max(length, width), 40, 0x8090a2, 0xcbd6e1);
  grid.position.y = 0.02;
  scene.add(grid);
  dynamicObjects.push(grid);

  const bounds = new THREE.Box3(
    new THREE.Vector3(-length / 2, 0, -width / 2),
    new THREE.Vector3(length / 2, height, width / 2),
  );
  const helper = new THREE.Box3Helper(bounds, 0x334155);
  scene.add(helper);
  dynamicObjects.push(helper);
}

function clearDynamicObjects() {
  for (const object of dynamicObjects.splice(0)) {
    scene.remove(object);
    if (object.geometry && object.geometry !== boxGeometry) object.geometry.dispose();
  }
  runCount = 0;
  blockCount = 0;
}

async function fetchStaticDenseZone() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`Impossible de charger ${DATA_URL}: ${response.status}`);
  return response.json();
}

async function fetchDenseZone(seed, preferStatic = false) {
  if (preferStatic && String(seed) === '42') {
    return fetchStaticDenseZone();
  }

  const apiUrl = `${API_URL}?length=500&width=500&height=200&houses=1100&seed=${encodeURIComponent(seed)}&_=${Date.now()}`;
  const apiResponse = await fetch(apiUrl).catch(() => null);
  if (apiResponse?.ok) return apiResponse.json();

  return fetchStaticDenseZone();
}

async function loadDenseZone(seed = seedInput?.value || 42, preferStatic = false) {
  if (loading) return;
  loading = true;
  stats.textContent = preferStatic ? 'Chargement export...' : 'Generation...';
  try {
  const payload = await fetchDenseZone(seed, preferStatic);
  clearDynamicObjects();
  zone = payload.zone;

  const runsByKind = new Map();
  for (const run of payload.runs || []) {
    if (!runsByKind.has(run.kind)) runsByKind.set(run.kind, []);
    runsByKind.get(run.kind).push(run);
    const [sx, sy, sz] = run.size;
    blockCount += sx * sy * sz;
  }

  for (const [kind, runs] of runsByKind.entries()) {
    addInstancedRuns(kind, runs);
    runCount += runs.length;
  }

  addHelpers();
  const s = payload.stats;
  const coverage = s.coverage_ratio ? ` · couvre ${Math.round(s.coverage_ratio[0] * 100)}%/${Math.round(s.coverage_ratio[1] * 100)}%/${Math.round(s.coverage_ratio[2] * 100)}%` : '';
  stats.textContent = `${s.houses} houses · ${s.connections} connexions · ${s.door_connections} portes · ${s.stair_connections || 0} escaliers · ${s.ladder_connections} echelles · ${s.long_connections || 0} longues · connecte ${s.reachable_houses}/${s.houses}${coverage} · ${blockCount} blocs · ${runCount} runs`;
  } finally {
    loading = false;
  }
}

document.body.addEventListener('click', (event) => {
  if (event.target.closest('#panel') || event.target.closest('#help')) return;
  renderer.domElement.requestPointerLock();
});

updateButton?.addEventListener('click', () => {
  loadDenseZone(seedInput.value);
});

randomButton?.addEventListener('click', () => {
  seedInput.value = String(Math.floor(Math.random() * 100000));
  loadDenseZone(seedInput.value);
});

seedInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadDenseZone(seedInput.value);
});

function keyName(event) {
  if (event.key === ' ') return 'space';
  return event.key.toLowerCase();
}

document.addEventListener('keydown', (event) => {
  if (document.pointerLockElement === renderer.domElement) event.preventDefault();
  keys.add(keyName(event));
});

document.addEventListener('keyup', (event) => {
  keys.delete(keyName(event));
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  camera.rotation.y -= event.movementX * 0.0022;
  camera.rotation.x -= event.movementY * 0.0022;
  camera.rotation.x = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, camera.rotation.x));
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const speed = (keys.has('shift') ? 130 : 46) * dt;
  movement.set(0, 0, 0);

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();

  if (keys.has('z')) movement.add(forward);
  if (keys.has('s')) movement.sub(forward);
  if (keys.has('d')) movement.add(right);
  if (keys.has('q')) movement.sub(right);
  if (keys.has('space')) movement.y += 1;
  if (keys.has('control') || keys.has('c')) movement.y -= 1;

  if (movement.lengthSq() > 0) {
    movement.normalize().multiplyScalar(speed);
    camera.position.add(movement);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

loadDenseZone(seedInput?.value || 42, true)
  .then(animate)
  .catch((error) => {
    stats.textContent = error.message;
    console.error(error);
  });
