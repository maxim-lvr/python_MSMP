import * as THREE from './web/vendor/three.module.js';

const DATA_URL = './exports/bridge_zone.json?v=towers-spacing70-20260907';
const stats = document.querySelector('#stats');
const keys = new Set();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef3f7);
scene.fog = new THREE.Fog(0xeef3f7, 420, 1300);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1800);
camera.position.set(-430, 78, -130);
camera.rotation.order = 'YXZ';
camera.lookAt(-250, 60, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xb0bfce, 2.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(80, 140, 60);
scene.add(sun);

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const tmpMatrix = new THREE.Matrix4();
const materialByKind = new Map([
  ['main_bridge', new THREE.MeshBasicMaterial({ color: 0x1d78ff })],
  ['small_bridge', new THREE.MeshBasicMaterial({ color: 0x8b929b })],
  ['landing', new THREE.MeshBasicMaterial({ color: 0xb8bec6 })],
  ['railing', new THREE.MeshBasicMaterial({ color: 0x343a42 })],
  ['support', new THREE.MeshBasicMaterial({ color: 0x555b64 })],
  ['tower', new THREE.MeshBasicMaterial({ color: 0x22c55e })],
  ['door', new THREE.MeshBasicMaterial({ color: 0xff8800 })],
]);

let zone = { size: [1000, 120, 300] };
let runCount = 0;
let blockCount = 0;

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
}

function addHelpers() {
  const [length, height, width] = zone.size;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const grid = new THREE.GridHelper(Math.max(length, width), 50, 0x7f91a6, 0xcbd5df);
  grid.position.y = 0.02;
  scene.add(grid);

  const bounds = new THREE.Box3(
    new THREE.Vector3(-length / 2, 0, -width / 2),
    new THREE.Vector3(length / 2, height, width / 2),
  );
  const helper = new THREE.Box3Helper(bounds, 0x334155);
  scene.add(helper);
}

async function loadBridgeZone() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`Impossible de charger ${DATA_URL}: ${response.status}`);
  const payload = await response.json();
  zone = payload.zone;
  const firstTower = payload.towers?.[0];
  if (firstTower) {
    const [length, , width] = zone.size;
    const [x, y, z] = firstTower.door.pos;
    camera.position.set(x - length / 2 - 20, payload.settings.main_bridge.y + 6, 0);
    camera.lookAt(x - length / 2, y + 1, z - width / 2);
  }
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
  stats.textContent = `${payload.stats.towers} tours · ${payload.paths.length} ponts secondaires · ${payload.stats.towers} portes · 1 pont central`;
}

document.body.addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
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

loadBridgeZone()
  .then(animate)
  .catch((error) => {
    stats.textContent = error.message;
    console.error(error);
  });
