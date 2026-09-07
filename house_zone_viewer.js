import * as THREE from './web/vendor/three.module.js';

const API_URL = './api/house-zone';
const DATA_URL = './exports/house_zone.json?v=wide-four-walls-houses-20260819';
const stats = document.querySelector('#stats');
const seedInput = document.querySelector('#seed');
const updateButton = document.querySelector('#update');
const randomButton = document.querySelector('#random');
const keys = new Set();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xedf1f4);
scene.fog = new THREE.Fog(0xedf1f4, 360, 1200);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1800);
camera.position.set(-430, 92, -130);
camera.rotation.order = 'YXZ';
camera.rotation.x = -0.08;
camera.rotation.y = -0.72;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xaab4c0, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(90, 150, 70);
scene.add(sun);

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const tmpMatrix = new THREE.Matrix4();
const materialByKind = new Map([
  ['wall', new THREE.MeshBasicMaterial({ color: 0x6f7780 })],
  ['house', new THREE.MeshBasicMaterial({ color: 0x9aa0a7 })],
  ['house_close', new THREE.MeshBasicMaterial({ color: 0x9aa0a7 })],
  ['house_wide', new THREE.MeshBasicMaterial({ color: 0xb0b5bb })],
  ['house_bridge', new THREE.MeshBasicMaterial({ color: 0x58606a })],
  ['house_stair', new THREE.MeshBasicMaterial({ color: 0x3f4650 })],
  ['window', new THREE.MeshBasicMaterial({ color: 0x151a20 })],
  ['rear_door', new THREE.MeshBasicMaterial({ color: 0xff8800, toneMapped: false })],
]);

let zone = { size: [1000, 120, 300] };
let runCount = 0;
let blockCount = 0;
let loading = false;
let seedTimer = null;
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
  const mesh = new THREE.InstancedMesh(boxGeometry, materialByKind.get(kind), runs.length);
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
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  dynamicObjects.push(floor);

  const grid = new THREE.GridHelper(Math.max(length, width), 50, 0x8594a6, 0xcbd5df);
  grid.position.y = 0.02;
  scene.add(grid);
  dynamicObjects.push(grid);

  const bounds = new THREE.Box3(
    new THREE.Vector3(-length / 2, 0, -width / 2),
    new THREE.Vector3(length / 2, height, width / 2),
  );
  const boundsHelper = new THREE.Box3Helper(bounds, 0x334155);
  scene.add(boundsHelper);
  dynamicObjects.push(boundsHelper);
}

function clearDynamicObjects() {
  for (const object of dynamicObjects.splice(0)) {
    scene.remove(object);
    if (object.geometry && object.geometry !== boxGeometry) object.geometry.dispose();
  }
  runCount = 0;
  blockCount = 0;
}

async function fetchHouseZone(seed) {
  const apiUrl = `${API_URL}?compare=1&length=100&width=100&height=200&seed=${encodeURIComponent(seed)}&_=${Date.now()}`;
  const apiResponse = await fetch(apiUrl).catch(() => null);
  if (apiResponse?.ok) return apiResponse.json();

  const response = await fetch(`${DATA_URL}&_=${Date.now()}`);
  if (!response.ok) throw new Error(`Impossible de charger ${DATA_URL}: ${response.status}`);
  return response.json();
}

async function loadHouseZone(seed = seedInput?.value || 42) {
  if (loading) return;
  loading = true;
  stats.textContent = 'Generation...';
  try {
    const payload = await fetchHouseZone(seed);
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
      if (!materialByKind.has(kind)) materialByKind.set(kind, new THREE.MeshBasicMaterial({ color: 0xb7bcc4 }));
      addInstancedRuns(kind, runs);
      runCount += runs.length;
    }

    addHelpers();
    const walls = runsByKind.get('wall')?.length || 0;
    const houses = (runsByKind.get('house')?.length || 0) + (runsByKind.get('house_close')?.length || 0) + (runsByKind.get('house_wide')?.length || 0);
    const bridges = runsByKind.get('house_bridge')?.length || 0;
    const stairs = runsByKind.get('house_stair')?.length || 0;
    const windows = runsByKind.get('window')?.length || 0;
    const profileStats = payload.stats.house_close !== undefined ? ` · ${payload.stats.house_close} close · ${payload.stats.house_wide} wide` : '';
    stats.textContent = `${payload.stats.houses} maisons${profileStats} · ${payload.stats.bridges} ponts · ${payload.stats.stairs} escaliers · ${blockCount} blocs · ${runCount} runs · ${walls} murs · ${houses} volumes · ${bridges} runs ponts · ${stairs} runs escaliers · ${windows} fenetres`;
  } finally {
    loading = false;
  }
}

document.body.addEventListener('click', (event) => {
  if (event.target.closest('#controls')) return;
  renderer.domElement.requestPointerLock();
});

updateButton?.addEventListener('click', () => {
  loadHouseZone(seedInput.value);
});

randomButton?.addEventListener('click', () => {
  seedInput.value = String(Math.floor(Math.random() * 100000));
  loadHouseZone(seedInput.value);
});

seedInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadHouseZone(seedInput.value);
});

seedInput?.addEventListener('input', () => {
  window.clearTimeout(seedTimer);
  seedTimer = window.setTimeout(() => loadHouseZone(seedInput.value), 450);
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
  const speed = (keys.has('shift') ? 180 : 62) * dt;
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

loadHouseZone()
  .then(animate)
  .catch((error) => {
    stats.textContent = error.message;
    console.error(error);
  });
