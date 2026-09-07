import * as THREE from './web/vendor/three.module.js';

const snake = document.body.dataset.zone === 'snake';
const snakeGenerator = snake ? await import('./house_tunnel_snake_generator.js') : null;
let currentLayout = null;

const LENGTH = 200;
const GAP = 30;
const HEIGHT = 41;
const LEVELS = 10;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe6ece8);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, snake ? 3000 : 700);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c2ba, 2.2));
const light = new THREE.DirectionalLight(0xffffff, 1.1);
light.position.set(-60, 90, 30);
scene.add(light);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const materials = {
  wall: new THREE.MeshLambertMaterial({ color: 0x727b78 }),
  floor: new THREE.MeshLambertMaterial({ color: 0x89928d }),
  facade: new THREE.MeshLambertMaterial({ color: 0xbfc7bf }),
  alternate: new THREE.MeshLambertMaterial({ color: 0x9aa99e }),
  window: new THREE.MeshBasicMaterial({ color: 0x36564b }),
  lit: new THREE.MeshBasicMaterial({ color: 0xeee2ad }),
  bridge: new THREE.MeshLambertMaterial({ color: 0x637fb0 }),
};
let model = new THREE.Group();
scene.add(model);

function resetView() {
  if (snake && currentLayout) {
    camera.position.set(-8, 13, 0);
    camera.lookAt(40, 20, 0);
    return;
  }
  camera.position.set(-LENGTH / 2 - 8, 13, 0);
  camera.lookAt(20, 20, 0);
}

// Every box uses integer minimum corners and exclusive maximum corners.
function generate(seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const boxes = Object.fromEntries(Object.keys(materials).map(key => [key, []]));
  const add = (kind, x, y, z, sx, sy, sz) => boxes[kind].push([x, y, z, sx, sy, sz]);
  const depths = Array.from({ length: 2 }, () => Array.from({ length: LEVELS }, () => 8 + Math.floor(random() * 5)));
  add('wall', 0, 0, -1, LENGTH, HEIGHT, 1);
  add('wall', 0, 0, GAP, LENGTH, HEIGHT, 1);
  add('floor', 0, 0, 0, LENGTH, 1, GAP);
  add('floor', 0, HEIGHT - 1, 0, LENGTH, 1, GAP);

  for (let side = 0; side < 2; side++) {
    const zAt = depth => side === 0 ? 0 : GAP - depth;
    for (let level = 0; level < LEVELS; level++) {
      const depth = depths[side][level];
      const y = level * 4 + 1;
      const facadeZ = side === 0 ? depth - 1 : GAP - depth;
      // Shared slabs cover both neighbouring storeys when their depths differ.
      if (level > 0) {
        const slabDepth = Math.max(depth, depths[side][level - 1]);
        add('floor', 0, level * 4, zAt(slabDepth), LENGTH, 1, slabDepth);
      }
      const kind = level % 2 === 0 ? 'facade' : 'alternate';
      add(kind, 0, y, facadeZ, LENGTH, 1, 1);
      for (let x = 0; x < LENGTH; x++) {
        const isWindow = x > 1 && x < LENGTH - 2 && x % 6 >= 2 && x % 6 <= 3;
        const faceKind = isWindow ? (random() < 0.2 ? 'lit' : 'window') : kind;
        add(faceKind, x, y + 1, facadeZ, 1, 2, 1);
      }
      const endZ = side === 0 ? 0 : facadeZ + 1;
      add(kind, 0, y, endZ, 1, 3, depth - 1);
      add(kind, LENGTH - 1, y, endZ, 1, 3, depth - 1);
    }
  }
  return { boxes, depths };
}

function rebuild() {
  const seed = Number(document.querySelector('#seed').value) >>> 0;
  currentLayout = snake ? snakeGenerator.generateSnake(seed) : generate(seed);
  const { boxes, depths } = currentLayout;
  scene.remove(model);
  for (const mesh of model.children) mesh.dispose();
  model = new THREE.Group();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const [kind, items] of Object.entries(boxes)) {
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, materials[kind], items.length);
    items.forEach(([x, y, z, sx, sy, sz], index) => {
      position.set(x + sx / 2 - (snake ? 0 : LENGTH / 2), y + sy / 2, z + sz / 2 - (snake ? 0 : GAP / 2));
      matrix.compose(position, rotation, scale.set(sx, sy, sz));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.computeBoundingSphere();
    model.add(mesh);
  }
  scene.add(model);
  const passages = depths[0].map((depth, i) => GAP - depth - depths[1][i]);
  document.querySelector('#stats').textContent = `${LENGTH} de long / ${GAP} entre parois / ${HEIGHT} de haut. 10 etages par cote. Passage : ${Math.min(...passages)} a ${Math.max(...passages)} blocs.`;
  if (snake) {
    document.querySelector('#stats').textContent = `1500 blocs / ${currentLayout.route.lengths.length} troncons / 30 de large / 41 de haut / ${currentLayout.bridges.length} ponts`;
    resetView();
  }
}

document.querySelector('#settings').addEventListener('submit', event => {
  event.preventDefault();
  rebuild();
});
document.querySelector('#random').addEventListener('click', () => {
  document.querySelector('#seed').value = crypto.getRandomValues(new Uint32Array(1))[0];
  rebuild();
});
document.querySelector('#reset').addEventListener('click', resetView);
document.querySelector('#overview')?.addEventListener('click', () => {
  const { minX, minZ, width, depth } = currentLayout.bounds;
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const angle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
  const distance = Math.hypot(width, depth, HEIGHT) * 0.55 / Math.sin(angle);
  camera.position.set(minX + width / 2, 20 + distance * 0.85, minZ + depth / 2 + distance * 0.53);
  camera.lookAt(minX + width / 2, 20, minZ + depth / 2);
});

const keys = new Set();
renderer.domElement.addEventListener('click', () => {
  if (!matchMedia('(pointer: coarse)').matches) renderer.domElement.requestPointerLock();
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input, button, a')) return;
  const key = event.key.toLowerCase();
  if (['z', 'q', 's', 'd', ' ', 'control', 'c', 'shift'].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
});
document.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('pointerlockchange', () => keys.clear());
function look(dx, dy) {
  camera.rotation.y -= dx * 0.0022;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.0022, -1.55, 1.55);
}
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement === renderer.domElement) look(event.movementX, event.movementY);
});
let touch = null;
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch') return;
  touch = { x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!touch || event.pointerType !== 'touch') return;
  look(event.clientX - touch.x, event.clientY - touch.y);
  touch = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', () => { touch = null; });
renderer.domElement.addEventListener('pointercancel', () => { touch = null; });
renderer.domElement.addEventListener('wheel', event => {
  event.preventDefault();
  camera.translateZ(Math.sign(event.deltaY) * 2);
}, { passive: false });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  movement.set(0, 0, 0);
  if (keys.has('z')) movement.add(forward);
  if (keys.has('s')) movement.sub(forward);
  if (keys.has('q')) movement.sub(right);
  if (keys.has('d')) movement.add(right);
  if (keys.has(' ')) movement.y++;
  if (keys.has('control') || keys.has('c')) movement.y--;
  camera.position.addScaledVector(movement.normalize(), dt * (keys.has('shift') ? 55 : 12));
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
resetView();
rebuild();
animate();
