import * as THREE from './vendor/three.module.js';

const WORLD = {
  width: 1200,
  height: 24,
  depth: 1200,
};
const MAP_BOUNDS = {
  x: [-WORLD.width / 2, WORLD.width / 2],
  y: [0, WORLD.height],
  z: [-WORLD.depth / 2, WORLD.depth / 2],
};
const CHUNK_SIZE = 8;
const NOISE_MAP_URL = './noisemap.stringy.jpg';
const EMPTY_BRIGHTNESS = 0.94;
const FULL_HEIGHT_BRIGHTNESS = 0.18;
const MIN_SOLID_HEIGHT = 5;
const NORMAL_DARK_COLOR = 0xb8b8b8;
const NORMAL_LIGHT_COLOR = 0xdcdcdc;
const CONNECTOR_DARK_COLOR = 0x009cff;
const CONNECTOR_LIGHT_COLOR = 0x00eaff;
const BLUE_CONNECTOR_TARGET = 200;
const BLUE_CONNECTOR_ATTEMPTS = 90000;
const BLUE_CONNECTOR_MIN_LENGTH = 3;
const BLUE_CONNECTOR_MAX_LENGTH = 26;
const BLUE_CONNECTOR_SPACING = 20;
const BLUE_CONNECTOR_HEIGHT = 1;
const BLUE_CONNECTOR_NEAR_START_TARGET = 70;
const BLUE_CONNECTOR_NEAR_START_RADIUS = 260;
const SAME_ISLAND_PATH_LIMIT = 220;
const SAME_ISLAND_MAX_VISITED = 9000;
const RENDER_RADIUS_CHUNKS = 30;
const VERTICAL_RADIUS_CHUNKS = 5;
const SAME_ISLAND_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const keys = new Set();
const stats = document.querySelector('#stats');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f7fb);
scene.fog = new THREE.Fog(0xf2f7fb, 360, 1050);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1800);
camera.position.set(-95, 34, -145);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c7d9, 2.8));
const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(40, 80, 30);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD.width, WORLD.depth),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
scene.add(floor);

const chunkGroups = new Map();
const allChunkKeys = [];
const visibleChunkSet = new Set();
const tmpMatrix = new THREE.Matrix4();
let blockCount = 0;
let connectorCount = 0;
let connectorCandidateCount = 0;
let connectorBlockCount = 0;
let sameIslandSkippedCount = 0;
let noiseMap = null;

async function loadNoiseMap(url) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossible de charger ${url}`));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, data, image };
}

function brightnessAt(x, z) {
  const u = Math.max(0, Math.min(0.999999, x / WORLD.width));
  const v = Math.max(0, Math.min(0.999999, z / WORLD.depth));
  const px = Math.floor(u * noiseMap.width);
  const pz = Math.floor(v * noiseMap.height);
  const index = (pz * noiseMap.width + px) * 4;
  const r = noiseMap.data[index];
  const g = noiseMap.data[index + 1];
  const b = noiseMap.data[index + 2];
  return (r + g + b) / (255 * 3);
}

function columnHeightForBrightness(brightness) {
  if (brightness >= EMPTY_BRIGHTNESS) return 0;
  const strength = (EMPTY_BRIGHTNESS - brightness) / (EMPTY_BRIGHTNESS - FULL_HEIGHT_BRIGHTNESS);
  const height = MIN_SOLID_HEIGHT + Math.ceil(strength * (WORLD.height - MIN_SOLID_HEIGHT));
  return Math.max(MIN_SOLID_HEIGHT, Math.min(WORLD.height, height));
}

function chunkKey(x, y, z) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
}

function addToChunk(key, object) {
  let group = chunkGroups.get(key);
  if (!group) {
    group = new THREE.Group();
    group.visible = false;
    chunkGroups.set(key, group);
    allChunkKeys.push(key);
    scene.add(group);
  }
  group.add(object);
}

function hash01(a, b, c) {
  let n = a * 374761393 + b * 668265263 + c * 2246822519;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function addBlockToChunk(blocksByChunk, block) {
  const key = chunkKey(block.x + block.sx / 2, block.y, block.z + block.sz / 2);
  if (!blocksByChunk.has(key)) blocksByChunk.set(key, []);
  blocksByChunk.get(key).push(block);
}

function addRunToChunks(blocksByChunk, startX, endX, y, z, density) {
  let cursor = startX;
  while (cursor < endX) {
    const worldX = cursor - WORLD.width / 2;
    const chunkEndWorldX = (Math.floor(worldX / CHUNK_SIZE) + 1) * CHUNK_SIZE;
    const next = Math.min(endX, Math.ceil(chunkEndWorldX + WORLD.width / 2));
    const width = next - cursor;
    const worldZ = z - WORLD.depth / 2;
    addBlockToChunk(blocksByChunk, { x: worldX, y, z: worldZ, sx: width, sy: 1, sz: 1, density });
    cursor = next;
  }
}

function addConnectorToChunks(blocksByChunk, startX, startZ, y, length, axis) {
  for (let i = 0; i < length; i++) {
    const x = startX + (axis === 'x' ? i : 0);
    const z = startZ + (axis === 'z' ? i : 0);
    addBlockToChunk(blocksByChunk, {
      x: x - WORLD.width / 2,
      y,
      z: z - WORLD.depth / 2,
      sx: 1,
      sy: BLUE_CONNECTOR_HEIGHT,
      sz: 1,
      density: 1,
      kind: 'connector',
    });
  }
}

function bridgeIndex(x, z) {
  return z * WORLD.width + x;
}

function bridgeEndHeights(columnHeights, x, z, length, axis) {
  const startIslandX = x - (axis === 'x' ? 1 : 0);
  const startIslandZ = z - (axis === 'z' ? 1 : 0);
  const endIslandX = x + (axis === 'x' ? length : 0);
  const endIslandZ = z + (axis === 'z' ? length : 0);
  return [
    columnHeights[startIslandZ][startIslandX],
    columnHeights[endIslandZ][endIslandX],
  ];
}

function bridgeEndPositions(x, z, length, axis) {
  return {
    startX: x - (axis === 'x' ? 1 : 0),
    startZ: z - (axis === 'z' ? 1 : 0),
    endX: x + (axis === 'x' ? length : 0),
    endZ: z + (axis === 'z' ? length : 0),
  };
}

function sameIslandPathExists(columnHeights, x, z, length, axis) {
  const { startX, startZ, endX, endZ } = bridgeEndPositions(x, z, length, axis);
  if (Math.abs(startX - endX) + Math.abs(startZ - endZ) > SAME_ISLAND_PATH_LIMIT) return false;

  const queueX = new Int16Array(SAME_ISLAND_MAX_VISITED);
  const queueZ = new Int16Array(SAME_ISLAND_MAX_VISITED);
  const queueDistance = new Uint16Array(SAME_ISLAND_MAX_VISITED);
  const visited = new Set([bridgeIndex(startX, startZ)]);
  let head = 0;
  let tail = 1;
  queueX[0] = startX;
  queueZ[0] = startZ;
  queueDistance[0] = 0;

  while (head < tail) {
    const cx = queueX[head];
    const cz = queueZ[head];
    const distance = queueDistance[head];
    head++;

    if (cx === endX && cz === endZ) return true;
    if (distance >= SAME_ISLAND_PATH_LIMIT) continue;

    for (const [dx, dz] of SAME_ISLAND_DIRECTIONS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= WORLD.width || nz >= WORLD.depth) continue;
      if (columnHeights[nz][nx] === 0) continue;
      const key = bridgeIndex(nx, nz);
      if (visited.has(key)) continue;
      visited.add(key);
      if (tail >= SAME_ISLAND_MAX_VISITED) return false;
      queueX[tail] = nx;
      queueZ[tail] = nz;
      queueDistance[tail] = distance + 1;
      tail++;
    }
  }

  return false;
}

function bridgeAreaIsFree(bridgeMask, x, z, length, axis) {
  for (let i = 0; i < length; i++) {
    const px = x + (axis === 'x' ? i : 0);
    const pz = z + (axis === 'z' ? i : 0);
    for (let dz = -BLUE_CONNECTOR_SPACING; dz <= BLUE_CONNECTOR_SPACING; dz++) {
      for (let dx = -BLUE_CONNECTOR_SPACING; dx <= BLUE_CONNECTOR_SPACING; dx++) {
        const nx = px + dx;
        const nz = pz + dz;
        if (nx < 0 || nz < 0 || nx >= WORLD.width || nz >= WORLD.depth) continue;
        if (bridgeMask[bridgeIndex(nx, nz)] !== 0) return false;
      }
    }
  }
  return true;
}

function reserveBridgeArea(bridgeMask, x, z, length, axis) {
  for (let i = 0; i < length; i++) {
    const px = x + (axis === 'x' ? i : 0);
    const pz = z + (axis === 'z' ? i : 0);
    for (let dz = -BLUE_CONNECTOR_SPACING; dz <= BLUE_CONNECTOR_SPACING; dz++) {
      for (let dx = -BLUE_CONNECTOR_SPACING; dx <= BLUE_CONNECTOR_SPACING; dx++) {
        const nx = px + dx;
        const nz = pz + dz;
        if (nx < 0 || nz < 0 || nx >= WORLD.width || nz >= WORLD.depth) continue;
        bridgeMask[bridgeIndex(nx, nz)] = 1;
      }
    }
  }
}

function canPlaceBridge(columnHeights, bridgeMask, x, z, length, axis) {
  if (x < 1 || z < 1) return false;
  if (axis === 'x' && x + length >= WORLD.width) return false;
  if (axis === 'z' && z + length >= WORLD.depth) return false;

  const [startHeight, endHeight] = bridgeEndHeights(columnHeights, x, z, length, axis);
  if (startHeight === 0 || endHeight === 0) return false;

  for (let i = 0; i < length; i++) {
    const px = x + (axis === 'x' ? i : 0);
    const pz = z + (axis === 'z' ? i : 0);
    if (columnHeights[pz][px] !== 0) return false;
    if (bridgeMask[bridgeIndex(px, pz)] !== 0) return false;
  }
  return bridgeAreaIsFree(bridgeMask, x, z, length, axis);
}

function collectBridgeCandidates(columnHeights) {
  const candidates = [];
  const scanAxis = (axis) => {
    const lineCount = axis === 'x' ? WORLD.depth : WORLD.width;
    const lineLength = axis === 'x' ? WORLD.width : WORLD.depth;

    for (let line = 1; line < lineCount - 1; line++) {
      let cursor = 1;
      while (cursor < lineLength - 1) {
        const x = axis === 'x' ? cursor : line;
        const z = axis === 'x' ? line : cursor;
        const beforeX = x - (axis === 'x' ? 1 : 0);
        const beforeZ = z - (axis === 'z' ? 1 : 0);
        if (columnHeights[beforeZ][beforeX] === 0 || columnHeights[z][x] !== 0) {
          cursor++;
          continue;
        }

        let end = cursor;
        while (end < lineLength - 1) {
          const px = axis === 'x' ? end : line;
          const pz = axis === 'x' ? line : end;
          if (columnHeights[pz][px] !== 0) break;
          end++;
        }

        const length = end - cursor;
        const endX = axis === 'x' ? end : line;
        const endZ = axis === 'x' ? line : end;
        if (
          length >= BLUE_CONNECTOR_MIN_LENGTH
          && length <= BLUE_CONNECTOR_MAX_LENGTH
          && end < lineLength
          && columnHeights[endZ][endX] !== 0
        ) {
          candidates.push({ x, z, length, axis, score: hash01(x, z, length + (axis === 'x' ? 0 : 10000)) });
        }

        cursor = Math.max(cursor + 1, end);
      }
    }
  };

  scanAxis('x');
  scanAxis('z');
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

function bridgeDistanceToStart(candidate) {
  const worldX = candidate.x + (candidate.axis === 'x' ? candidate.length / 2 : 0.5) - WORLD.width / 2;
  const worldZ = candidate.z + (candidate.axis === 'z' ? candidate.length / 2 : 0.5) - WORLD.depth / 2;
  const dx = worldX - camera.position.x;
  const dz = worldZ - camera.position.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function addBlueConnectors(blocksByChunk, columnHeights) {
  let placed = 0;
  let placedNearStart = 0;
  let bridgeBlocks = 0;
  let skippedSameIsland = 0;
  const bridgeMask = new Uint8Array(WORLD.width * WORLD.depth);
  const candidates = collectBridgeCandidates(columnHeights);
  const nearStartCandidates = candidates
    .filter((candidate) => bridgeDistanceToStart(candidate) <= BLUE_CONNECTOR_NEAR_START_RADIUS)
    .sort((a, b) => a.score - b.score);

  const placeBridge = (candidate) => {
    if (placed >= BLUE_CONNECTOR_TARGET) return false;
    const { x, z, length, axis } = candidate;
    if (sameIslandPathExists(columnHeights, x, z, length, axis)) {
      skippedSameIsland++;
      return false;
    }
    if (!canPlaceBridge(columnHeights, bridgeMask, x, z, length, axis)) return false;

    const [startHeight, endHeight] = bridgeEndHeights(columnHeights, x, z, length, axis);
    const y = Math.max(0, Math.min(startHeight, endHeight) - 1);
    addConnectorToChunks(blocksByChunk, x, z, y, length, axis);
    reserveBridgeArea(bridgeMask, x, z, length, axis);
    placed++;
    bridgeBlocks += length;
    return true;
  };

  for (const candidate of nearStartCandidates) {
    if (placedNearStart >= BLUE_CONNECTOR_NEAR_START_TARGET || placed >= BLUE_CONNECTOR_TARGET) break;
    if (placeBridge(candidate)) placedNearStart++;
  }

  for (const candidate of candidates) {
    if (placed >= BLUE_CONNECTOR_TARGET) break;
    placeBridge(candidate);
  }
  return {
    bridges: placed,
    blocks: bridgeBlocks,
    candidates: candidates.length,
    skippedSameIsland,
  };
}

function generateNoiseBlocks() {
  const blocksByChunk = new Map();
  let total = 0;
  const columnHeights = Array.from({ length: WORLD.depth }, () => new Uint8Array(WORLD.width));

  for (let z = 0; z < WORLD.depth; z++) {
    for (let x = 0; x < WORLD.width; x++) {
      columnHeights[z][x] = columnHeightForBrightness(brightnessAt(x, z));
    }
  }

  for (let y = 0; y < WORLD.height; y++) {
    for (let z = 0; z < WORLD.depth; z++) {
      let runStart = null;
      let runDensity = 0;
      for (let x = 0; x <= WORLD.width; x++) {
        const density = x < WORLD.width ? columnHeights[z][x] / WORLD.height : 0;
        const solid = x < WORLD.width && y < columnHeights[z][x];
        if (solid && runStart === null) {
          runStart = x;
          runDensity = density;
        } else if (solid) {
          runDensity = Math.max(runDensity, density);
        }
        if ((!solid || x === WORLD.width) && runStart !== null) {
          addRunToChunks(blocksByChunk, runStart, x, y, z, runDensity);
          total += x - runStart;
          runStart = null;
          runDensity = 0;
        }
      }
    }
  }

  const connectors = addBlueConnectors(blocksByChunk, columnHeights);
  total += connectors.blocks;
  return {
    blocksByChunk,
    total,
    connectors: connectors.bridges,
    connectorBlocks: connectors.blocks,
    connectorCandidates: connectors.candidates,
    skippedSameIsland: connectors.skippedSameIsland,
  };
}

function buildInstancedChunks() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const { blocksByChunk, total, connectors, connectorBlocks, connectorCandidates, skippedSameIsland } = generateNoiseBlocks();
  const normalMaterial = createCheckerMaterial(NORMAL_DARK_COLOR, NORMAL_LIGHT_COLOR);
  const connectorMaterial = createCheckerMaterial(CONNECTOR_DARK_COLOR, CONNECTOR_LIGHT_COLOR, {
    fog: false,
    toneMapped: false,
  });

  for (const [key, blocks] of blocksByChunk.entries()) {
    const normalBlocks = [];
    const connectorBlocksInChunk = [];

    for (const block of blocks) {
      if (block.kind === 'connector') {
        connectorBlocksInChunk.push(block);
      } else {
        normalBlocks.push(block);
      }
    }

    if (normalBlocks.length > 0) addInstancedBlocks(key, geometry, normalMaterial, normalBlocks);
    if (connectorBlocksInChunk.length > 0) addInstancedBlocks(key, geometry, connectorMaterial, connectorBlocksInChunk);
  }

  const helper = new THREE.GridHelper(1200, 60, 0x8aa0b8, 0xd3dde8);
  helper.position.y = -0.01;
  scene.add(helper);

  const texture = new THREE.Texture(noiseMap.image);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  const preview = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width, WORLD.depth),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  preview.rotation.x = -Math.PI / 2;
  preview.position.y = 0.02;
  scene.add(preview);
  return { total: Math.round(total), connectors, connectorBlocks, connectorCandidates, skippedSameIsland };
}

function createCheckerMaterial(darkColor, lightColor, options = {}) {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, ...options });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.darkColor = { value: new THREE.Color(darkColor) };
    shader.uniforms.lightColor = { value: new THREE.Color(lightColor) };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPosition;',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 checkerWorldPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          checkerWorldPosition = instanceMatrix * checkerWorldPosition;
        #endif
        checkerWorldPosition = modelMatrix * checkerWorldPosition;
        vWorldPosition = checkerWorldPosition.xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPosition;\nuniform vec3 darkColor;\nuniform vec3 lightColor;',
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 checkerPosition = floor(vWorldPosition + vec3(${WORLD.width / 2 + 0.001}, 0.001, ${WORLD.depth / 2 + 0.001}));
        float checker = mod(checkerPosition.x + checkerPosition.y + checkerPosition.z, 2.0);
        vec3 checkerColor = mix(darkColor, lightColor, checker);
        vec4 diffuseColor = vec4(checkerColor, opacity);`,
      );
  };
  material.needsUpdate = true;
  return material;
}

function addInstancedBlocks(key, geometry, material, blocks) {
  const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  blocks.forEach((block, index) => {
    tmpMatrix.compose(
      new THREE.Vector3(block.x + block.sx / 2, block.y + block.sy / 2, block.z + block.sz / 2),
      new THREE.Quaternion(),
      new THREE.Vector3(block.sx, block.sy, block.sz),
    );
    mesh.setMatrixAt(index, tmpMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  addToChunk(key, mesh);
}

function updateVisibleChunks() {
  const cx = Math.floor(camera.position.x / CHUNK_SIZE);
  const cy = Math.floor(camera.position.y / CHUNK_SIZE);
  const cz = Math.floor(camera.position.z / CHUNK_SIZE);
  const radius = RENDER_RADIUS_CHUNKS;
  const radiusSq = radius * radius;
  visibleChunkSet.clear();

  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let y = cy - VERTICAL_RADIUS_CHUNKS; y <= cy + VERTICAL_RADIUS_CHUNKS; y++) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz <= radiusSq) visibleChunkSet.add(`${x},${y},${z}`);
      }
    }
  }

  let visible = 0;
  for (const key of allChunkKeys) {
    const group = chunkGroups.get(key);
    const shouldShow = visibleChunkSet.has(key);
    group.visible = shouldShow;
    if (shouldShow) visible++;
  }
  return visible;
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

function clampCamera() {
  camera.position.x = Math.max(MAP_BOUNDS.x[0], Math.min(MAP_BOUNDS.x[1], camera.position.x));
  camera.position.y = Math.max(MAP_BOUNDS.y[0] + 1.6, Math.min(MAP_BOUNDS.y[1], camera.position.y));
  camera.position.z = Math.max(MAP_BOUNDS.z[0], Math.min(MAP_BOUNDS.z[1], camera.position.z));
}

const clock = new THREE.Clock();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();
let frameCounter = 0;
let lastVisibleChunks = 0;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const speed = (keys.has('shift') ? 220 : 80) * dt;
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
    clampCamera();
  }

  if (frameCounter % 20 === 0) {
    lastVisibleChunks = updateVisibleChunks();
    stats.textContent = `${blockCount} blocs · ${connectorCount} ponts bleus/${connectorCandidateCount} candidats · ${sameIslandSkippedCount} trous internes ignores · ${connectorBlockCount} blocs bleus · ${lastVisibleChunks}/${allChunkKeys.length} chunks visibles · pos ${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`;
  }
  frameCounter++;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

async function boot() {
  stats.textContent = 'Chargement de la noise map...';
  noiseMap = await loadNoiseMap(NOISE_MAP_URL);
  stats.textContent = 'Construction des chunks...';
  const worldData = buildInstancedChunks();
  blockCount = worldData.total;
  connectorCount = worldData.connectors;
  connectorBlockCount = worldData.connectorBlocks;
  connectorCandidateCount = worldData.connectorCandidates;
  sameIslandSkippedCount = worldData.skippedSameIsland;
  updateVisibleChunks();
  animate();
}

boot().catch((error) => {
  stats.textContent = error.message;
  console.error(error);
});
