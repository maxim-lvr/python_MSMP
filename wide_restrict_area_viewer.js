import * as THREE from './web/vendor/three.module.js';
import {OrbitControls} from './web/vendor/OrbitControls.js';
import {generateWideRestrictArea, AREA} from './wide_restrict_area.js';

const $ = id => document.getElementById(id), scene = new THREE.Scene();
scene.background = new THREE.Color(0xd1d9db);
const flightFog = new THREE.Fog(0xd1d9db, 180, 900);
scene.fog = flightFog;
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 2000);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8188, 2.2));
const sun = new THREE.DirectionalLight(0xfff3df, 1.5); sun.position.set(-100, 350, 160); scene.add(sun);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false; orbit.enableDamping = true; orbit.maxDistance = 1400; orbit.minDistance = 5;
const geometry = new THREE.BoxGeometry(1, 1, 1), materials = {};
const ladderPositions = [], ladderNormals = [];
for (const [x, y, sx, sy] of [[-0.34, 0, 0.12, 1], [0.34, 0, 0.12, 1], [0, -0.25, 0.68, 0.12], [0, 0.25, 0.68, 0.12]]) {
  const part = new THREE.BoxGeometry(sx, sy, 0.12).toNonIndexed(); part.translate(x, y, -0.43);
  ladderPositions.push(...part.attributes.position.array); ladderNormals.push(...part.attributes.normal.array); part.dispose();
}
const ladderGeometry = new THREE.BufferGeometry();
ladderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ladderPositions, 3));
ladderGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(ladderNormals, 3));
for (const [kind, color] of Object.entries({wall: 0x79838a, floor: 0x91979b, window: 0x31434b,
  trim: 0x555f68, stair: 0x718b88, bridge: 0x91a49d, rail: 0x454e52, ground: 0x777e84,
  mass_wall: 0x84868c, mass_dark: 0x616970, mass_light: 0xa2a5a1, infill: 0x52565a, ladder: 0xbb9470})) {
  materials[kind] = new THREE.MeshLambertMaterial({color});
}
materials.light = new THREE.MeshBasicMaterial({color: 0xffdda3});
const plane = new THREE.Plane();
function updateCut() {
  const axis = $('cut-axis').value, sign = $('cut-reverse').checked ? 1 : -1;
  $('cut').max = axis === 'x' ? AREA.length : axis === 'z' ? AREA.width : AREA.height;
  plane.normal.set(axis === 'x' ? sign : 0, axis === 'y' ? sign : 0, axis === 'z' ? sign : 0);
  plane.constant = -sign * Number($('cut').value);
  renderer.clippingPlanes = $('cut-enabled').checked ? [plane] : [];
  $('cut-value').value = $('cut').value;
}
for (const id of ['cut', 'cut-axis', 'cut-enabled', 'cut-reverse']) $(id).addEventListener('input', updateCut);
let model, layout, mode = 'fly';
const keys = new Set(), forward = new THREE.Vector3(), right = new THREE.Vector3(), movement = new THREE.Vector3();
function switchMode(next) {
  mode = next; keys.clear(); orbit.enabled = mode === 'overview';
  scene.fog = orbit.enabled ? null : flightFog;
  $('fly').setAttribute('aria-pressed', String(mode === 'fly'));
  $('overview').setAttribute('aria-pressed', String(mode === 'overview'));
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  if (orbit.enabled) {
    camera.position.set(820, 580, 880); orbit.target.set(AREA.length / 2, 95, AREA.width / 2); orbit.update();
  } else { camera.position.fromArray(layout.spawn); camera.lookAt(...layout.lookAt); }
}
function rebuild() {
  try {
    const data = generateWideRestrictArea(Number($('seed').value));
    if (model) { scene.remove(model); model.traverse(mesh => { if (mesh.isInstancedMesh) mesh.dispose(); }); }
    layout = data; model = new THREE.Group(); scene.add(model);
    const buckets = new Map();
    for (const b of data.boxes) {
      const id = `${b[6]}:${Math.floor(b[0] / 96)}:${Math.floor(b[2] / 96)}`;
      if (!buckets.has(id)) buckets.set(id, []); buckets.get(id).push(b);
    }
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    for (const boxes of buckets.values()) {
      const kind = boxes[0][6];
      const mesh = new THREE.InstancedMesh(kind === 'ladder' ? ladderGeometry : geometry, materials[kind], boxes.length);
      boxes.forEach(([x, y, z, sx, sy, sz], i) => {
        position.set(x + sx / 2, y + sy / 2, z + sz / 2); scale.set(sx, sy, sz);
        matrix.compose(position, rotation, scale); mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); model.add(mesh);
    }
    const s = data.stats;
    $('stats').textContent = `${AREA.length} x ${AREA.width} x ${AREA.height} · ${s.rooms} pieces · ${s.bridges} ponts · ${s.stairs} escaliers · ${s.ladders} echelles · ${s.solids} volumes pleins`;
    switchMode(mode); updateCut(); document.body.dataset.ready = 'true';
  } catch (error) { $('stats').textContent = error.message; document.body.dataset.ready = 'error'; console.error(error); }
}
$('settings').addEventListener('submit', event => { event.preventDefault(); rebuild(); });
$('random').onclick = () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0]; rebuild(); };
$('fly').onclick = () => switchMode('fly'); $('overview').onclick = () => switchMode('overview');
renderer.domElement.addEventListener('click', () => {
  if (mode === 'fly' && matchMedia('(pointer:fine)').matches) renderer.domElement.requestPointerLock();
});
const rotate = (dx, dy) => {
  camera.rotation.y -= dx * 0.0022;
  camera.rotation.x = Math.max(-1.54, Math.min(1.54, camera.rotation.x - dy * 0.0022));
};
document.addEventListener('mousemove', e => { if (document.pointerLockElement === renderer.domElement) rotate(e.movementX, e.movementY); });
const name = e => e.key === ' ' ? 'space' : e.key.toLowerCase();
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.pointerLockElement === renderer.domElement) { document.exitPointerLock(); return; }
  if (mode !== 'fly' || document.pointerLockElement !== renderer.domElement) return;
  if (['z', 'q', 's', 'd', 'space', 'c', 'control', 'shift'].includes(name(e))) { keys.add(name(e)); e.preventDefault(); }
});
document.addEventListener('keyup', e => keys.delete(name(e)));
document.addEventListener('pointerlockchange', () => keys.clear()); window.addEventListener('blur', () => keys.clear());
for (const button of document.querySelectorAll('[data-key]')) {
  button.onpointerdown = e => { e.preventDefault(); button.setPointerCapture(e.pointerId); keys.add(button.dataset.key); };
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => keys.delete(button.dataset.key);
}
let touch;
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' && mode === 'fly') { touch = [e.clientX, e.clientY]; renderer.domElement.setPointerCapture(e.pointerId); }
});
renderer.domElement.addEventListener('pointermove', e => {
  if (touch) { rotate(e.clientX - touch[0], e.clientY - touch[1]); touch = [e.clientX, e.clientY]; }
});
renderer.domElement.addEventListener('pointerup', () => touch = null);
renderer.domElement.addEventListener('pointercancel', () => touch = null);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
let previous = performance.now(), lastLabel = 0;
function animate(now) {
  const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
  if (orbit.enabled) orbit.update();
  else {
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, camera.up).normalize(); movement.set(0, 0, 0);
    if (keys.has('z')) movement.add(forward); if (keys.has('s')) movement.sub(forward);
    if (keys.has('d')) movement.add(right); if (keys.has('q')) movement.sub(right);
    if (keys.has('space')) movement.y++; if (keys.has('c') || keys.has('control')) movement.y--;
    if (movement.lengthSq()) camera.position.addScaledVector(movement.normalize(), Number($('speed').value) * dt * (keys.has('shift') ? 3 : 1));
  }
  if (now - lastLabel > 200) { $('position').textContent = `X ${Math.round(camera.position.x)} · Y ${Math.round(camera.position.y)} · Z ${Math.round(camera.position.z)}`; lastLabel = now; }
  renderer.render(scene, camera); requestAnimationFrame(animate);
}
rebuild(); requestAnimationFrame(animate);
