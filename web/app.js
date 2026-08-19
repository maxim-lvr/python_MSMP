import * as THREE from './vendor/three.module.js';

const WORLD_SCALE = 16;
const WORLD_MIN_Y = -64;
const WORLD_MAX_Y = 320;
const GENERATION_MAX_Y = 300;
const GENERATION_HEIGHT_BLOCKS = GENERATION_MAX_Y - WORLD_MIN_Y;

const WORLD = {
  width: 1200,
  height: Math.ceil(GENERATION_HEIGHT_BLOCKS / WORLD_SCALE),
  depth: 1200,
};
const RENDER_WORLD = {
  width: WORLD.width * WORLD_SCALE,
  height: WORLD_MAX_Y - WORLD_MIN_Y,
  depth: WORLD.depth * WORLD_SCALE,
};
const MAP_BOUNDS = {
  x: [-RENDER_WORLD.width / 2, RENDER_WORLD.width / 2],
  y: [0, RENDER_WORLD.height],
  z: [-RENDER_WORLD.depth / 2, RENDER_WORLD.depth / 2],
};
const CHUNK_SIZE = 4;
const WORLD_VERTICAL_CHUNKS = Math.ceil(WORLD.height / CHUNK_SIZE);
const NOISE_MAP_URL = './noisemap.stringy.jpg';
const STRUCTURES_URL = './structures.json?v=slope-walls-20260722';
const EMPTY_BRIGHTNESS = 0.94;
const FULL_HEIGHT_BRIGHTNESS = 0.30;
const MIN_SOLID_HEIGHT = 5;
const ACTIVE_STRUCTURE_NAMES = ['building', 'room_1', 'pillar_1'];
const ACTIVE_BRIDGE_NAMES = ['bridge'];
const NORMAL_DARK_COLOR = 0xb8b8b8;
const NORMAL_LIGHT_COLOR = 0xdcdcdc;
const CONNECTOR_DARK_COLOR = 0x009cff;
const CONNECTOR_LIGHT_COLOR = 0x00eaff;
const WALL_DARK_COLOR = 0x9f9f9f;
const WALL_LIGHT_COLOR = 0xd4d4d4;
const WALL_STEP_HEIGHT_BLOCKS = 20;
const WALL_BASE_ADVANCE_BLOCKS = 1;
const WALL_MAX_ADVANCE_BLOCKS = WALL_BASE_ADVANCE_BLOCKS + Math.floor((GENERATION_HEIGHT_BLOCKS - 1) / WALL_STEP_HEIGHT_BLOCKS);
const WALL_MAX_DISTANCE_CELLS = Math.max(
  1,
  Math.ceil(WALL_MAX_ADVANCE_BLOCKS / WORLD_SCALE),
);
const BLUE_CONNECTOR_TARGET = 200;
const BLUE_CONNECTOR_ATTEMPTS = 90000;
const BLUE_CONNECTOR_MIN_LENGTH = 3;
const BLUE_CONNECTOR_MAX_LENGTH = 20;
const BLUE_CONNECTOR_SPACING = 20;
const BLUE_CONNECTOR_HEIGHT = 1;
const BLUE_CONNECTOR_NEAR_START_TARGET = 70;
const BLUE_CONNECTOR_NEAR_START_RADIUS = 260;
const SAME_ISLAND_PATH_LIMIT = 220;
const SAME_ISLAND_MAX_VISITED = 9000;
const RENDER_RADIUS_CHUNKS = 12;
const DETAIL_RADIUS_CHUNKS = 2;
const UNLOAD_RADIUS_CHUNKS = RENDER_RADIUS_CHUNKS + 2;
const CHUNKS_BUILT_PER_FRAME = 4;
const VERTICAL_RADIUS_CHUNKS = WORLD_VERTICAL_CHUNKS;
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
scene.fog = new THREE.Fog(0xf2f7fb, 360 * WORLD_SCALE, 1050 * WORLD_SCALE);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1800 * WORLD_SCALE);
camera.position.set(-95 * WORLD_SCALE, 12 * WORLD_SCALE, -145 * WORLD_SCALE);
camera.rotation.order = 'YXZ';
camera.rotation.x = -0.22;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c7d9, 2.8));
const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(40, 80, 30);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(RENDER_WORLD.width, RENDER_WORLD.depth),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.03;
scene.add(floor);

const chunkGroups = new Map();
const allChunkKeys = [];
const allChunkKeySet = new Set();
const visibleChunkSet = new Set();
const tmpMatrix = new THREE.Matrix4();
const tmpEuler = new THREE.Euler();
const tmpQuaternion = new THREE.Quaternion();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
let blockCount = 0;
let connectorCount = 0;
let connectorCandidateCount = 0;
let connectorBlockCount = 0;
let sameIslandSkippedCount = 0;
let wallSegmentCount = 0;
let structureReplacementCount = 0;
let structureBlockCount = 0;
let structureCandidateCount = 0;
let noiseMap = null;
let structureTemplates = [];
let bridgeTemplates = [];
let columnHeights = null;
let connectorCells = new Map();
let wallDistanceMap = null;
let connectorMaterial = null;
let normalMaterial = null;
let wallMaterial = null;
let structureMaterials = new Map();
let chunkMeta = new Map();
let chunkBuildQueue = [];
let chunkBuildQueueSet = new Set();
let chunkBuildLod = new Map();
let structureStackCache = new Map();
let fillableHeightCache = new Map();
let wallStonePositionCache = new Map();

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

async function loadStructures(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    return Array.isArray(payload.structures) ? payload.structures : [];
  } catch (error) {
    console.warn(`Structures ignorees: ${error.message}`);
    return [];
  }
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
  return WORLD.height;
}

function solidHeightBlocksAt(x, z) {
  return Math.min(columnHeights[z][x] * WORLD_SCALE, GENERATION_HEIGHT_BLOCKS);
}

function solidTopLogicalAt(x, z) {
  return solidHeightBlocksAt(x, z) / WORLD_SCALE;
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
    if (!allChunkKeySet.has(key)) {
      allChunkKeySet.add(key);
      allChunkKeys.push(key);
    }
    scene.add(group);
  }
  group.add(object);
}

function removeChunk(key) {
  const group = chunkGroups.get(key);
  if (!group) return;
  scene.remove(group);
  group.clear();
  chunkGroups.delete(key);
  chunkMeta.delete(key);
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

function addConnectorToCells(cells, startX, startZ, y, length, axis) {
  for (let i = 0; i < length; i++) {
    const x = startX + (axis === 'x' ? i : 0);
    const z = startZ + (axis === 'z' ? i : 0);
    cells.set(cellKey(x, y, z), {
      cellX: x,
      cellY: y,
      cellZ: z,
      axis,
      kind: 'bridge',
    });
  }
}

function cellKey(x, y, z) {
  return `${x},${y},${z}`;
}

function logicalCameraX() {
  return camera.position.x / WORLD_SCALE;
}

function logicalCameraZ() {
  return camera.position.z / WORLD_SCALE;
}

function replacementDistanceToStart(candidate) {
  const worldX = candidate.x + 0.5 - WORLD.width / 2;
  const worldZ = candidate.z + 0.5 - WORLD.depth / 2;
  const dx = worldX - logicalCameraX();
  const dz = worldZ - logicalCameraZ();
  return Math.sqrt(dx * dx + dz * dz);
}

function replacementIndex(x, z) {
  return z * WORLD.width + x;
}

function replacementAreaIsFree(replacementMask, x, z) {
  for (let dz = -STRUCTURE_REPLACEMENT_SPACING; dz <= STRUCTURE_REPLACEMENT_SPACING; dz++) {
    for (let dx = -STRUCTURE_REPLACEMENT_SPACING; dx <= STRUCTURE_REPLACEMENT_SPACING; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= WORLD.width || nz >= WORLD.depth) continue;
      if (replacementMask[replacementIndex(nx, nz)] !== 0) return false;
    }
  }
  return true;
}

function reserveReplacementArea(replacementMask, x, z) {
  for (let dz = -STRUCTURE_REPLACEMENT_SPACING; dz <= STRUCTURE_REPLACEMENT_SPACING; dz++) {
    for (let dx = -STRUCTURE_REPLACEMENT_SPACING; dx <= STRUCTURE_REPLACEMENT_SPACING; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= WORLD.width || nz >= WORLD.depth) continue;
      replacementMask[replacementIndex(nx, nz)] = 1;
    }
  }
}

function collectStructureReplacementCandidates(columnHeights) {
  const candidates = [];
  for (let z = 1; z < WORLD.depth - 1; z++) {
    for (let x = 1; x < WORLD.width - 1; x++) {
      const height = columnHeights[z][x];
      if (height <= 0) continue;
      const y = height - 1;
      candidates.push({ x, y, z, score: hash01(x, z, y + 30000) });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

function addStructureToChunks(blocksByChunk, candidate, template) {
  let added = 0;
  const baseX = candidate.x - WORLD.width / 2;
  const baseY = candidate.y;
  const baseZ = candidate.z - WORLD.depth / 2;

  for (const block of template.blocks) {
    const [bx, by, bz] = block.pos;
    if (bx < 0 || by < 0 || bz < 0) continue;
    addBlockToChunk(blocksByChunk, {
      x: baseX + bx / WORLD_SCALE,
      y: baseY + by / WORLD_SCALE,
      z: baseZ + bz / WORLD_SCALE,
      sx: 1 / WORLD_SCALE,
      sy: 1 / WORLD_SCALE,
      sz: 1 / WORLD_SCALE,
      density: 1,
      kind: 'structure',
      color: block.color || '#e8edf2',
    });
    added++;
  }
  return added;
}

function structureCellSize(template) {
  const [sx, sy, sz] = template.size;
  return {
    x: Math.max(1, Math.ceil(sx / WORLD_SCALE)),
    y: Math.max(1, Math.ceil(sy / WORLD_SCALE)),
    z: Math.max(1, Math.ceil(sz / WORLD_SCALE)),
  };
}

function structureFits(candidate, template) {
  const size = structureCellSize(template);
  return (
    candidate.x >= 0
    && candidate.z >= 0
    && candidate.x + size.x <= WORLD.width
    && candidate.y + size.y <= WORLD.height
    && candidate.z + size.z <= WORLD.depth
  );
}

function structureBaseCandidate(candidate, template) {
  const size = structureCellSize(template);
  return {
    ...candidate,
    y: Math.max(0, candidate.y - size.y + 1),
  };
}

function reserveStructureCells(structureCells, candidate, template) {
  const size = structureCellSize(template);
  for (let dz = 0; dz < size.z; dz++) {
    for (let dy = 0; dy < size.y; dy++) {
      for (let dx = 0; dx < size.x; dx++) {
        const x = candidate.x + dx;
        const y = candidate.y + dy;
        const z = candidate.z + dz;
        if (x < 0 || y < 0 || z < 0 || x >= WORLD.width || y >= WORLD.height || z >= WORLD.depth) continue;
        structureCells.add(cellKey(x, y, z));
      }
    }
  }
}

function addStructureReplacements(blocksByChunk, columnHeights) {
  const structureMask = new Set();
  if (structureTemplates.length === 0) {
    return { cells: structureMask, placements: 0, blocks: 0, candidates: 0 };
  }

  const candidates = collectStructureReplacementCandidates(columnHeights);
  const nearStartCandidates = candidates
    .filter((candidate) => replacementDistanceToStart(candidate) <= STRUCTURE_REPLACEMENT_NEAR_START_RADIUS)
    .sort((a, b) => a.score - b.score);
  const replacementMask = new Uint8Array(WORLD.width * WORLD.depth);
  let placements = 0;
  let nearPlacements = 0;
  let blocks = 0;

  const place = (candidate) => {
    if (placements >= STRUCTURE_REPLACEMENT_TARGET) return false;
    if (!replacementAreaIsFree(replacementMask, candidate.x, candidate.z)) return false;
    const templateIndex = Math.floor(hash01(candidate.x, candidate.z, candidate.y + 41000) * structureTemplates.length);
    const template = structureTemplates[Math.min(structureTemplates.length - 1, templateIndex)];
    const baseCandidate = structureBaseCandidate(candidate, template);
    if (!structureFits(baseCandidate, template)) return false;
    reserveReplacementArea(replacementMask, candidate.x, candidate.z);
    reserveStructureCells(structureMask, baseCandidate, template);
    blocks += addStructureToChunks(blocksByChunk, baseCandidate, template);
    placements++;
    return true;
  };

  for (const candidate of nearStartCandidates) {
    if (nearPlacements >= STRUCTURE_REPLACEMENT_NEAR_START_TARGET || placements >= STRUCTURE_REPLACEMENT_TARGET) break;
    if (place(candidate)) nearPlacements++;
  }

  for (const candidate of candidates) {
    if (placements >= STRUCTURE_REPLACEMENT_TARGET) break;
    place(candidate);
  }

  return { cells: structureMask, placements, blocks, candidates: candidates.length };
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
  const dx = worldX - logicalCameraX();
  const dz = worldZ - logicalCameraZ();
  return Math.sqrt(dx * dx + dz * dz);
}

function maxBridgeTemplateHeight() {
  if (bridgeTemplates.length === 0) return WORLD_SCALE;
  return Math.max(...bridgeTemplates.map((template) => template.size[1] || WORLD_SCALE));
}

function maxBridgeCellY() {
  return Math.max(0, Math.floor((GENERATION_HEIGHT_BLOCKS - maxBridgeTemplateHeight()) / WORLD_SCALE));
}

function bridgeCellYForCandidate(candidate, highestBridgeCellY, maxIslandCellY) {
  const highestAllowedY = Math.max(0, Math.min(highestBridgeCellY, maxIslandCellY));
  const salt = candidate.length + (candidate.axis === 'x' ? 83000 : 93000);
  return Math.floor(hash01(candidate.x, candidate.z, salt) * (highestAllowedY + 1));
}

function addBlueConnectors(cells, columnHeights) {
  let placed = 0;
  let placedNearStart = 0;
  let bridgeBlocks = 0;
  let skippedSameIsland = 0;
  const bridgeMask = new Uint8Array(WORLD.width * WORLD.depth);
  const highestBridgeCellY = maxBridgeCellY();
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
    const y = bridgeCellYForCandidate(candidate, highestBridgeCellY, Math.max(0, Math.min(startHeight, endHeight) - 1));
    addConnectorToCells(cells, x, z, y, length, axis);
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

function computeWallDistanceMap() {
  const distances = new Uint8Array(WORLD.width * WORLD.depth);
  distances.fill(255);

  for (let z = 0; z < WORLD.depth; z++) {
    for (let x = 0; x < WORLD.width; x++) {
      if (columnHeights[z][x] !== 0) continue;

      let bestDistance = 255;
      for (let dz = -WALL_MAX_DISTANCE_CELLS; dz <= WALL_MAX_DISTANCE_CELLS; dz++) {
        for (let dx = -WALL_MAX_DISTANCE_CELLS; dx <= WALL_MAX_DISTANCE_CELLS; dx++) {
          if (dx === 0 && dz === 0) continue;
          const sx = x + dx;
          const sz = z + dz;
          if (sx < 0 || sz < 0 || sx >= WORLD.width || sz >= WORLD.depth) continue;
          if (columnHeights[sz][sx] === 0) continue;

          const chebyshevDistance = Math.max(Math.abs(dx), Math.abs(dz));
          if (chebyshevDistance < bestDistance) bestDistance = chebyshevDistance;
        }
      }

      if (bestDistance <= WALL_MAX_DISTANCE_CELLS) {
        distances[bridgeIndex(x, z)] = bestDistance;
      }
    }
  }

  return distances;
}

function addStoneBlockToWall(blocks, worldX, worldZ, blockY, bx, bz) {
  blocks.push({
    x: worldX + bx / WORLD_SCALE,
    y: blockY / WORLD_SCALE,
    z: worldZ + bz / WORLD_SCALE,
    sx: 1 / WORLD_SCALE,
    sy: 1 / WORLD_SCALE,
    sz: 1 / WORLD_SCALE,
    kind: 'wall',
  });
}

function distanceFromBlockToSolidCell(blockX, blockZ, solidCellX, solidCellZ) {
  const solidMinX = solidCellX * WORLD_SCALE;
  const solidMaxX = solidMinX + WORLD_SCALE - 1;
  const solidMinZ = solidCellZ * WORLD_SCALE;
  const solidMaxZ = solidMinZ + WORLD_SCALE - 1;
  const dx = blockX < solidMinX ? solidMinX - blockX : Math.max(0, blockX - solidMaxX);
  const dz = blockZ < solidMinZ ? solidMinZ - blockZ : Math.max(0, blockZ - solidMaxZ);
  return Math.max(dx, dz);
}

function nearestSolidDistanceForBlock(x, z, bx, bz, maxDistance) {
  const blockX = x * WORLD_SCALE + bx;
  const blockZ = z * WORLD_SCALE + bz;
  let bestDistance = maxDistance + 1;

  for (let dz = -WALL_MAX_DISTANCE_CELLS; dz <= WALL_MAX_DISTANCE_CELLS; dz++) {
    for (let dx = -WALL_MAX_DISTANCE_CELLS; dx <= WALL_MAX_DISTANCE_CELLS; dx++) {
      if (dx === 0 && dz === 0) continue;
      const sx = x + dx;
      const sz = z + dz;
      if (sx < 0 || sz < 0 || sx >= WORLD.width || sz >= WORLD.depth) continue;
      if (columnHeights[sz][sx] === 0) continue;
      const distance = distanceFromBlockToSolidCell(blockX, blockZ, sx, sz);
      if (distance < bestDistance) bestDistance = distance;
    }
  }

  return bestDistance;
}

function wallAdvanceForBlockY(blockY) {
  return Math.min(
    WALL_MAX_ADVANCE_BLOCKS,
    WALL_BASE_ADVANCE_BLOCKS + Math.floor(blockY / WALL_STEP_HEIGHT_BLOCKS),
  );
}

function wallStonePositionsForCell(x, z, advanceBlocks) {
  const key = `${x},${z},${advanceBlocks}`;
  const cached = wallStonePositionCache.get(key);
  if (cached) return cached;

  const positions = [];
  for (let bz = 0; bz < WORLD_SCALE; bz++) {
    for (let bx = 0; bx < WORLD_SCALE; bx++) {
      const distance = nearestSolidDistanceForBlock(x, z, bx, bz, advanceBlocks);
      if (distance >= 1 && distance <= advanceBlocks) positions.push([bx, bz]);
    }
  }

  wallStonePositionCache.set(key, positions);
  return positions;
}

function bridgeOverlapsWallSegment(x, y, z, segmentStartY, segmentEndY) {
  const bridge = connectorCells.get(cellKey(x, y, z));
  if (!bridge) return false;
  const bridgeHeight = maxBridgeTemplateHeight() / WORLD_SCALE;
  const bridgeStartY = bridge.cellY;
  const bridgeEndY = bridgeStartY + bridgeHeight;
  return segmentStartY < bridgeEndY && segmentEndY > bridgeStartY;
}

function addSlopeWallSegmentsToBlocks(blocks, x, z, startY, endY) {
  if (columnHeights[z][x] !== 0) return 0;
  if (wallDistanceMap[bridgeIndex(x, z)] === 255) return 0;

  let added = 0;
  const worldX = x - WORLD.width / 2;
  const worldZ = z - WORLD.depth / 2;
  const maxY = GENERATION_HEIGHT_BLOCKS / WORLD_SCALE;

  for (let y = Math.floor(startY); y < Math.ceil(endY); y++) {
    const segmentStartY = Math.max(startY, y);
    const segmentEndY = Math.min(endY, y + 1, maxY);
    if (segmentEndY <= segmentStartY) continue;
    if (bridgeOverlapsWallSegment(x, y, z, segmentStartY, segmentEndY)) continue;

    const startBlockY = Math.floor(segmentStartY * WORLD_SCALE);
    const endBlockY = Math.min(GENERATION_HEIGHT_BLOCKS, Math.ceil(segmentEndY * WORLD_SCALE));
    for (let blockY = startBlockY; blockY < endBlockY; blockY++) {
      const advanceBlocks = wallAdvanceForBlockY(blockY);
      const stonePositions = wallStonePositionsForCell(x, z, advanceBlocks);
      for (const [bx, bz] of stonePositions) {
        addStoneBlockToWall(blocks, worldX, worldZ, blockY, bx, bz);
        added++;
      }
    }
  }

  return added;
}

function countSlopeWalls() {
  let count = 0;
  for (let z = 0; z < WORLD.depth; z++) {
    for (let x = 0; x < WORLD.width; x++) {
      if (columnHeights[z][x] === 0 && wallDistanceMap[bridgeIndex(x, z)] !== 255) count++;
    }
  }
  return count;
}

function generateColumnHeights() {
  const heights = Array.from({ length: WORLD.depth }, () => new Uint8Array(WORLD.width));
  let solidCells = 0;

  for (let z = 0; z < WORLD.depth; z++) {
    for (let x = 0; x < WORLD.width; x++) {
      const height = columnHeightForBrightness(brightnessAt(x, z));
      heights[z][x] = height;
      solidCells += height;
    }
  }

  return { heights, solidCells };
}

function templateForCell(x, y, z) {
  if (structureTemplates.length === 0) return null;
  const index = Math.floor(hash01(x, z, y + 51000) * structureTemplates.length);
  return structureTemplates[Math.min(structureTemplates.length - 1, index)];
}

function fittingTemplates(remainingHeight) {
  return structureTemplates.filter((template) => {
    const [sx, sy, sz] = template.size;
    return sx <= WORLD_SCALE && sz <= WORLD_SCALE && sy <= remainingHeight;
  });
}

function canFillHeight(height) {
  if (height === 0) return true;
  if (height < 0) return false;
  if (fillableHeightCache.has(height)) return fillableHeightCache.get(height);

  const result = structureTemplates.some((template) => canFillHeight(height - template.size[1]));
  fillableHeightCache.set(height, result);
  return result;
}

function chooseStackTemplate(x, z, cursorHeight, remainingHeight) {
  const candidates = fittingTemplates(remainingHeight);
  if (candidates.length === 0) return null;

  const cleanCandidates = candidates.filter((template) => canFillHeight(remainingHeight - template.size[1]));
  const pool = cleanCandidates.length > 0 ? cleanCandidates : candidates;
  const index = Math.floor(hash01(x, z, cursorHeight + 61000) * pool.length);
  return pool[Math.min(pool.length - 1, index)];
}

function structureStackForColumn(x, z) {
  const key = `${x},${z}`;
  const cached = structureStackCache.get(key);
  if (cached) return cached;

  const availableHeight = solidHeightBlocksAt(x, z);
  const stack = [];
  let cursorHeight = 0;

  while (cursorHeight < availableHeight) {
    const remainingHeight = availableHeight - cursorHeight;
    const template = chooseStackTemplate(x, z, cursorHeight, remainingHeight);
    if (!template) break;
    stack.push({
      x,
      y: cursorHeight / WORLD_SCALE,
      z,
      template,
    });
    cursorHeight += template.size[1];
  }

  structureStackCache.set(key, stack);
  return stack;
}

function bridgeTemplateForCell(bridge) {
  if (bridgeTemplates.length === 0) return null;
  const index = Math.floor(hash01(bridge.cellX, bridge.cellZ, bridge.cellY + 71000) * bridgeTemplates.length);
  return bridgeTemplates[Math.min(bridgeTemplates.length - 1, index)];
}

function connectorFallbackBlock(bridge) {
  return {
    x: bridge.cellX - WORLD.width / 2,
    y: bridge.cellY,
    z: bridge.cellZ - WORLD.depth / 2,
    sx: 1,
    sy: BLUE_CONNECTOR_HEIGHT,
    sz: 1,
    density: 1,
    kind: 'connector',
  };
}

function addBridgeToBuckets(structureBlocksByColor, bridge) {
  const template = bridgeTemplateForCell(bridge);
  if (!template) return 0;
  return addStructureCellToBuckets(
    structureBlocksByColor,
    bridge.cellX,
    bridge.cellY,
    bridge.cellZ,
    template,
    bridge.axis,
  );
}

function rotatedBlockPosition(blockPos, axis) {
  const [bx, by, bz] = blockPos;
  if (axis !== 'x') return [bx, by, bz];
  return [bz, by, WORLD_SCALE - 1 - bx];
}

function addStructureCellToBuckets(structureBlocksByColor, x, y, z, template, axis = 'x') {
  let added = 0;
  const baseX = x - WORLD.width / 2;
  const baseY = y;
  const baseZ = z - WORLD.depth / 2;

  for (const block of template.blocks) {
    const [bx, by, bz] = rotatedBlockPosition(block.pos, axis);
    if (bx < 0 || by < 0 || bz < 0 || bx >= WORLD_SCALE || by >= WORLD_SCALE || bz >= WORLD_SCALE) continue;
    const color = block.color || '#e8edf2';
    if (!structureBlocksByColor.has(color)) structureBlocksByColor.set(color, []);
    structureBlocksByColor.get(color).push({
      x: baseX + bx / WORLD_SCALE,
      y: baseY + by / WORLD_SCALE,
      z: baseZ + bz / WORLD_SCALE,
      sx: 1 / WORLD_SCALE,
      sy: 1 / WORLD_SCALE,
      sz: 1 / WORLD_SCALE,
      kind: 'structure',
      color,
    });
    added++;
  }

  return added;
}

function worldChunkRange(chunkCoord, worldSize) {
  const start = Math.max(0, Math.floor(chunkCoord * CHUNK_SIZE + worldSize / 2));
  const end = Math.min(worldSize, Math.ceil((chunkCoord + 1) * CHUNK_SIZE + worldSize / 2));
  return [start, end];
}

function verticalChunkRange(chunkCoord) {
  const start = Math.max(0, Math.floor(chunkCoord * CHUNK_SIZE));
  const end = Math.min(WORLD.height, Math.ceil((chunkCoord + 1) * CHUNK_SIZE));
  return [start, end];
}

function buildChunk(key, lod = 'proxy') {
  const existing = chunkMeta.get(key);
  if (existing?.lod === lod) return;
  if (existing) removeChunk(key);
  const [cx, cy, cz] = key.split(',').map(Number);
  if (cy < 0 || cy >= WORLD_VERTICAL_CHUNKS) return;
  const [startX, endX] = worldChunkRange(cx, WORLD.width);
  const [startY, endY] = lod === 'proxy' ? [0, WORLD.height] : verticalChunkRange(cy);
  const [startZ, endZ] = worldChunkRange(cz, WORLD.depth);
  if (startX >= endX || startY >= endY || startZ >= endZ) return;

  const stats = lod === 'detail'
    ? buildDetailedChunk(key, startX, endX, startY, endY, startZ, endZ)
    : buildProxyChunk(key, startX, endX, startY, endY, startZ, endZ);

  chunkMeta.set(key, { lod, ...stats });
}

function buildDetailedChunk(key, startX, endX, startY, endY, startZ, endZ) {
  const connectorBlocksInChunk = [];
  const wallBlocksInChunk = [];
  const structureBlocksByColor = new Map();
  let structuresInChunk = 0;
  let nbtBlocksInChunk = 0;
  let wallsInChunk = 0;

  for (let z = startZ; z < endZ; z++) {
    for (let x = startX; x < endX; x++) {
      wallsInChunk += addSlopeWallSegmentsToBlocks(wallBlocksInChunk, x, z, startY, endY);

      for (let y = startY; y < endY; y++) {
        const bridge = connectorCells.get(cellKey(x, y, z));
        if (bridge) {
          const bridgeBlocks = addBridgeToBuckets(structureBlocksByColor, bridge);
          nbtBlocksInChunk += bridgeBlocks;
          if (bridgeBlocks === 0) connectorBlocksInChunk.push(connectorFallbackBlock(bridge));
        }
      }

      if (columnHeights[z][x] <= startY) continue;
      const stack = structureStackForColumn(x, z);
      for (const placement of stack) {
        if (placement.y < startY || placement.y >= endY) continue;
        structuresInChunk++;
        nbtBlocksInChunk += addStructureCellToBuckets(
          structureBlocksByColor,
          placement.x,
          placement.y,
          placement.z,
          placement.template,
        );
      }
    }
  }

  if (connectorBlocksInChunk.length > 0) {
    addInstancedBlocks(key, boxGeometry, connectorMaterial, connectorBlocksInChunk);
  }
  if (wallBlocksInChunk.length > 0) {
    addInstancedBlocks(key, boxGeometry, wallMaterial, wallBlocksInChunk);
  }

  for (const [color, blocks] of structureBlocksByColor.entries()) {
    if (!structureMaterials.has(color)) {
      structureMaterials.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    }
    addInstancedBlocks(key, boxGeometry, structureMaterials.get(color), blocks);
  }

  const group = chunkGroups.get(key);
  if (group) group.visible = visibleChunkSet.has(key);
  return { structures: structuresInChunk, nbtBlocks: nbtBlocksInChunk, proxyCells: 0, walls: wallsInChunk };
}

function buildProxyChunk(key, startX, endX, startY, endY, startZ, endZ) {
  const proxyBlocks = [];
  const connectorBlocksInChunk = [];
  const wallBlocksInChunk = [];
  const structureBlocksByColor = new Map();
  let wallsInChunk = 0;

  for (let z = startZ; z < endZ; z++) {
    for (let x = startX; x < endX; x++) {
      const solidEnd = Math.min(endY, solidTopLogicalAt(x, z));
      if (solidEnd > startY) {
        proxyBlocks.push({
          x: x - WORLD.width / 2,
          y: startY,
          z: z - WORLD.depth / 2,
          sx: 1,
          sy: solidEnd - startY,
          sz: 1,
          kind: 'proxy',
        });
      }

      for (let y = startY; y < endY; y++) {
        const bridge = connectorCells.get(cellKey(x, y, z));
        if (bridge) {
          const bridgeBlocks = addBridgeToBuckets(structureBlocksByColor, bridge);
          if (bridgeBlocks === 0) connectorBlocksInChunk.push(connectorFallbackBlock(bridge));
        }
      }
    }
  }

  if (proxyBlocks.length > 0) addInstancedBlocks(key, boxGeometry, normalMaterial, proxyBlocks);
  if (connectorBlocksInChunk.length > 0) addInstancedBlocks(key, boxGeometry, connectorMaterial, connectorBlocksInChunk);
  if (wallBlocksInChunk.length > 0) addInstancedBlocks(key, boxGeometry, wallMaterial, wallBlocksInChunk);
  for (const [color, blocks] of structureBlocksByColor.entries()) {
    if (!structureMaterials.has(color)) {
      structureMaterials.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    }
    addInstancedBlocks(key, boxGeometry, structureMaterials.get(color), blocks);
  }

  const group = chunkGroups.get(key);
  if (group) group.visible = visibleChunkSet.has(key);
  return { structures: 0, nbtBlocks: 0, proxyCells: proxyBlocks.length, walls: wallsInChunk };
}

function queueChunkBuild(key, lod) {
  const existing = chunkMeta.get(key);
  if (existing?.lod === lod) return;
  const queuedLod = chunkBuildLod.get(key);
  if (queuedLod === 'detail' && lod === 'proxy') return;
  chunkBuildLod.set(key, lod);
  if (chunkBuildQueueSet.has(key)) return;
  chunkBuildQueue.push(key);
  chunkBuildQueueSet.add(key);
}

function processChunkBuildQueue(maxChunks = CHUNKS_BUILT_PER_FRAME) {
  for (let i = 0; i < maxChunks && chunkBuildQueue.length > 0; i++) {
    const key = chunkBuildQueue.shift();
    chunkBuildQueueSet.delete(key);
    const lod = chunkBuildLod.get(key) || 'proxy';
    chunkBuildLod.delete(key);
    buildChunk(key, lod);
  }
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

  const structureReplacements = addStructureReplacements(blocksByChunk, columnHeights);
  total += structureReplacements.blocks / (WORLD_SCALE * WORLD_SCALE * WORLD_SCALE);

  for (let y = 0; y < WORLD.height; y++) {
    for (let z = 0; z < WORLD.depth; z++) {
      let runStart = null;
      let runDensity = 0;
      for (let x = 0; x <= WORLD.width; x++) {
        const density = x < WORLD.width ? columnHeights[z][x] / WORLD.height : 0;
        const replaced = x < WORLD.width && structureReplacements.cells.has(cellKey(x, y, z));
        const solid = x < WORLD.width && y < columnHeights[z][x] && !replaced;
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
    structurePlacements: structureReplacements.placements,
    structureBlocks: structureReplacements.blocks,
    structureCandidates: structureReplacements.candidates,
  };
}

function buildInstancedChunks() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const {
    blocksByChunk,
    total,
    connectors,
    connectorBlocks,
    connectorCandidates,
    skippedSameIsland,
    structurePlacements,
    structureBlocks,
    structureCandidates,
  } = generateNoiseBlocks();
  const normalMaterial = createCheckerMaterial(NORMAL_DARK_COLOR, NORMAL_LIGHT_COLOR);
  const connectorMaterial = createCheckerMaterial(CONNECTOR_DARK_COLOR, CONNECTOR_LIGHT_COLOR, {
    fog: false,
    toneMapped: false,
  });
  const structureMaterials = new Map();

  for (const [key, blocks] of blocksByChunk.entries()) {
    const normalBlocks = [];
    const connectorBlocksInChunk = [];
    const structureBlocksByColor = new Map();

    for (const block of blocks) {
      if (block.kind === 'connector') {
        connectorBlocksInChunk.push(block);
      } else if (block.kind === 'structure') {
        const color = block.color || '#e8edf2';
        if (!structureBlocksByColor.has(color)) structureBlocksByColor.set(color, []);
        structureBlocksByColor.get(color).push(block);
      } else {
        normalBlocks.push(block);
      }
    }

    if (normalBlocks.length > 0) addInstancedBlocks(key, geometry, normalMaterial, normalBlocks);
    if (connectorBlocksInChunk.length > 0) addInstancedBlocks(key, geometry, connectorMaterial, connectorBlocksInChunk);
    for (const [color, colorBlocks] of structureBlocksByColor.entries()) {
      if (!structureMaterials.has(color)) {
        structureMaterials.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      }
      addInstancedBlocks(key, geometry, structureMaterials.get(color), colorBlocks);
    }
  }

  const helper = new THREE.GridHelper(RENDER_WORLD.width, 60, 0x8aa0b8, 0xd3dde8);
  helper.position.y = -0.01;
  scene.add(helper);

  const texture = new THREE.Texture(noiseMap.image);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  const preview = new THREE.Mesh(
    new THREE.PlaneGeometry(RENDER_WORLD.width, RENDER_WORLD.depth),
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
  return {
    total: Math.round(total),
    connectors,
    connectorBlocks,
    connectorCandidates,
    skippedSameIsland,
    structurePlacements,
    structureBlocks,
    structureCandidates,
  };
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
        `vec3 checkerPosition = floor(vWorldPosition + vec3(${RENDER_WORLD.width / 2 + 0.001}, 0.001, ${RENDER_WORLD.depth / 2 + 0.001}));
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
    const rotationX = block.rotationX || 0;
    const rotationY = block.rotationY || 0;
    const rotationZ = block.rotationZ || 0;
    tmpEuler.set(rotationX, rotationY, rotationZ, 'XYZ');
    tmpQuaternion.setFromEuler(tmpEuler);
    tmpMatrix.compose(
      new THREE.Vector3(
        (block.cx ?? block.x + block.sx / 2) * WORLD_SCALE,
        (block.cy ?? block.y + block.sy / 2) * WORLD_SCALE,
        (block.cz ?? block.z + block.sz / 2) * WORLD_SCALE,
      ),
      tmpQuaternion,
      new THREE.Vector3(block.sx * WORLD_SCALE, block.sy * WORLD_SCALE, block.sz * WORLD_SCALE),
    );
    mesh.setMatrixAt(index, tmpMatrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  addToChunk(key, mesh);
}

function addMapHelpers() {
  const helper = new THREE.GridHelper(RENDER_WORLD.width, 60, 0x8aa0b8, 0xd3dde8);
  helper.position.y = -0.01;
  scene.add(helper);

  const texture = new THREE.Texture(noiseMap.image);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  const preview = new THREE.Mesh(
    new THREE.PlaneGeometry(RENDER_WORLD.width, RENDER_WORLD.depth),
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
}

function updateVisibleChunks() {
  const cx = Math.floor((camera.position.x / WORLD_SCALE) / CHUNK_SIZE);
  const cz = Math.floor((camera.position.z / WORLD_SCALE) / CHUNK_SIZE);
  const radius = RENDER_RADIUS_CHUNKS;
  const radiusSq = radius * radius;
  const detailRadiusSq = DETAIL_RADIUS_CHUNKS * DETAIL_RADIUS_CHUNKS;
  const chunksToQueue = [];
  visibleChunkSet.clear();

  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      const dx = x - cx;
      const dz = z - cz;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > radiusSq) continue;

      if (distanceSq <= detailRadiusSq) {
        for (let y = 0; y < WORLD_VERTICAL_CHUNKS; y++) {
          const key = `${x},${y},${z}`;
          visibleChunkSet.add(key);
          chunksToQueue.push({ key, lod: 'detail', score: distanceSq + y * 0.01 });
        }
      } else {
        const key = `${x},0,${z}`;
        visibleChunkSet.add(key);
        chunksToQueue.push({ key, lod: 'proxy', score: distanceSq + 1000 });
      }
    }
  }

  chunksToQueue.sort((a, b) => a.score - b.score);
  for (const item of chunksToQueue) queueChunkBuild(item.key, item.lod);

  for (const key of chunkGroups.keys()) {
    const [x, , z] = key.split(',').map(Number);
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz > UNLOAD_RADIUS_CHUNKS * UNLOAD_RADIUS_CHUNKS) removeChunk(key);
  }

  let visible = 0;
  for (const key of allChunkKeys) {
    const group = chunkGroups.get(key);
    if (!group) continue;
    const shouldShow = visibleChunkSet.has(key);
    group.visible = shouldShow;
    if (shouldShow) visible++;
  }
  return visible;
}

function loadedChunkStats() {
  let detailedChunks = 0;
  let proxyChunks = 0;
  let structures = 0;
  let nbtBlocks = 0;
  let walls = 0;

  for (const meta of chunkMeta.values()) {
    walls += meta.walls || 0;
    if (meta.lod === 'detail') {
      detailedChunks++;
      structures += meta.structures || 0;
      nbtBlocks += meta.nbtBlocks || 0;
    } else {
      proxyChunks++;
    }
  }

  return { detailedChunks, proxyChunks, structures, nbtBlocks, walls };
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
  camera.position.y = Math.max(MAP_BOUNDS.y[0] + 1.6 * WORLD_SCALE, Math.min(MAP_BOUNDS.y[1], camera.position.y));
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
  const speed = (keys.has('shift') ? 220 : 80) * WORLD_SCALE * dt;
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
    const loaded = loadedChunkStats();
    stats.textContent = `${blockCount} cellules pleines · ${loaded.structures} structures detaillees · ${loaded.nbtBlocks} blocs NBT · ${loaded.proxyChunks} chunks proxy · ${connectorCount} ponts · ${loaded.walls}/${wallSegmentCount} murs · ${lastVisibleChunks}/${chunkGroups.size} chunks visibles · ${chunkBuildQueue.length} en attente · pos ${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)}`;
  }
  frameCounter++;

  processChunkBuildQueue();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

async function boot() {
  stats.textContent = 'Chargement de la noise map et des structures...';
  const loadedStructures = await Promise.all([
    loadNoiseMap(NOISE_MAP_URL),
    loadStructures(STRUCTURES_URL),
  ]);
  noiseMap = loadedStructures[0];
  const templates = loadedStructures[1];
  structureTemplates = templates.filter((structure) => ACTIVE_STRUCTURE_NAMES.includes(structure.name));
  bridgeTemplates = templates.filter((structure) => ACTIVE_BRIDGE_NAMES.includes(structure.name));
  stats.textContent = 'Analyse de la map...';
  const generated = generateColumnHeights();
  columnHeights = generated.heights;
  blockCount = generated.solidCells;
  structureCandidateCount = generated.solidCells;
  structureReplacementCount = 0;
  structureBlockCount = 0;
  structureStackCache = new Map();
  fillableHeightCache = new Map([[0, true]]);
  wallStonePositionCache = new Map();
  connectorCells = new Map();
  normalMaterial = createCheckerMaterial(NORMAL_DARK_COLOR, NORMAL_LIGHT_COLOR);
  connectorMaterial = createCheckerMaterial(CONNECTOR_DARK_COLOR, CONNECTOR_LIGHT_COLOR, {
    fog: false,
    toneMapped: false,
  });
  wallMaterial = createCheckerMaterial(WALL_DARK_COLOR, WALL_LIGHT_COLOR, {
    transparent: true,
    opacity: 0.86,
  });
  const connectors = addBlueConnectors(connectorCells, columnHeights);
  wallDistanceMap = computeWallDistanceMap();
  wallSegmentCount = countSlopeWalls();
  connectorCount = connectors.bridges;
  connectorBlockCount = connectors.blocks;
  connectorCandidateCount = connectors.candidates;
  sameIslandSkippedCount = connectors.skippedSameIsland;
  addMapHelpers();
  updateVisibleChunks();
  animate();
}

boot().catch((error) => {
  stats.textContent = error.message;
  console.error(error);
});
