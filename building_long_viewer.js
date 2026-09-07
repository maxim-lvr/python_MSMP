import * as THREE from './web/vendor/three.module.js';

const stats = document.querySelector('#stats');
const keys = new Set();

const ZONE = {
  length: 1000,
  width: 280,
  height: 150,
};
const FLOOR_THICKNESS = 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171a1e);
scene.fog = new THREE.FogExp2(0x282d32, 0.0048);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 1800);
camera.position.set(-455, 58, 18);
camera.rotation.order = 'YXZ';
camera.rotation.y = -Math.PI / 2 + 0.08;
camera.rotation.x = -0.04;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xb5c0ca, 0x15181c, 0.9));
const stripLight = new THREE.DirectionalLight(0xdde7ef, 1.3);
stripLight.position.set(-180, 180, -90);
scene.add(stripLight);

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpPosition = new THREE.Vector3();

const materials = {
  building: new THREE.MeshLambertMaterial({ color: 0x343a40 }),
  buildingDark: new THREE.MeshLambertMaterial({ color: 0x1d2126 }),
  column: new THREE.MeshLambertMaterial({ color: 0x252a30 }),
  stair: new THREE.MeshLambertMaterial({ color: 0x454d55 }),
  trail: new THREE.MeshBasicMaterial({ color: 0xff2d2d }),
  window: new THREE.MeshBasicMaterial({ color: 0xfff1bd }),
  windowDim: new THREE.MeshBasicMaterial({ color: 0x9da7a9 }),
  floor: new THREE.MeshBasicMaterial({ color: 0x20252b }),
  grid: new THREE.LineBasicMaterial({ color: 0x3d4650, transparent: true, opacity: 0.35 }),
};

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function centered(x, y, z) {
  return tmpPosition.set(x - ZONE.length / 2, y, z - ZONE.width / 2);
}

function composeBox(item) {
  const [x, y, z, sx, sy, sz] = item;
  tmpMatrix.compose(
    centered(x + sx / 2, y + sy / 2, z + sz / 2),
    tmpQuat,
    tmpScale.set(sx, sy, sz),
  );
  return tmpMatrix;
}

function addInstanced(name, boxes) {
  if (!boxes.length) return null;
  const mesh = new THREE.InstancedMesh(boxGeometry, materials[name], boxes.length);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  boxes.forEach((box, index) => mesh.setMatrixAt(index, composeBox(box)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

function pushBox(target, x, y, z, sx, sy, sz) {
  const box = clippedBox(x, y, z, sx, sy, sz);
  if (box) target.push(box);
}

function pushWindowBlock(windowsWarm, windowsDim, x, y, z, rng) {
  pushBox(rng() < 0.78 ? windowsWarm : windowsDim, x, y, z, 1, 1, 1);
}

function clippedBox(x, y, z, sx, sy, sz) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const z0 = Math.max(0, z);
  const x1 = Math.min(ZONE.length, x + sx);
  const y1 = Math.min(ZONE.height, y + sy);
  const z1 = Math.min(ZONE.width, z + sz);
  if (x1 <= x0 || y1 <= y0 || z1 <= z0) return null;
  return [x0, y0, z0, x1 - x0, y1 - y0, z1 - z0];
}

function makeWindowSet(building, rng, density) {
  const [x, _y, _z, sx, sy] = building;
  const cells = new Set();
  const startX = x + 3;
  const endX = x + sx - 4;
  const endY = Math.min(sy - 5, ZONE.height - 5);

  for (let wy = 6; wy <= endY; wy += 6) {
    const rowShift = Math.floor(wy / 18) % 2 === 0 ? 0 : 2;
    for (let wx = startX + rowShift; wx <= endX; wx += 5) {
      if (rng() > density || (wx + wy) % 23 === 0) continue;
      cells.add(`${wx},${wy}`);
      cells.add(`${wx},${wy + 1}`);
    }
  }

  return cells;
}

function pushFacade(walls, windowsWarm, windowsDim, building, z, windowCells, rng) {
  const [x, _y, _z, sx, sy] = building;

  for (let y = 0; y < sy; y += 1) {
    let runStart = null;

    for (let dx = 0; dx < sx; dx += 1) {
      const wx = x + dx;
      const isWindow = windowCells.has(`${wx},${y}`);

      if (isWindow) {
        if (runStart !== null) {
          pushBox(walls, runStart, y, z, wx - runStart, 1, 1);
          runStart = null;
        }
        pushWindowBlock(windowsWarm, windowsDim, wx, y, z, rng);
      } else if (runStart === null) {
        runStart = wx;
      }
    }

    if (runStart !== null) {
      pushBox(walls, runStart, y, z, x + sx - runStart, 1, 1);
    }
  }
}

function makeStairLayout(building, rng) {
  const [x, _y, z, sx, sy, sz] = building;
  if (sx < 12 || sz < 10) return null;

  const floorStep = 8;
  const direction = rng() < 0.5 ? 1 : -1;
  const stairRun = floorStep - 1;
  const innerMinX = x + 2;
  const innerMaxX = x + sx - 3;
  const stairX = direction > 0
    ? innerMinX + Math.floor(rng() * Math.max(1, innerMaxX - innerMinX - stairRun + 2))
    : innerMaxX - Math.floor(rng() * Math.max(1, innerMaxX - innerMinX - stairRun + 2));
  const stairZ = z + 2 + Math.floor(rng() * Math.max(1, sz - 6));
  const endX = stairX + direction * (stairRun - 1);
  const holeStartX = direction > 0 ? endX - 2 : endX;
  const holeEndX = direction > 0 ? endX + 1 : endX + 3;

  return {
    floorStep,
    stairRun,
    stairX,
    stairZ,
    direction,
    holeX0: Math.max(x + 1, holeStartX),
    holeX1: Math.min(x + sx - 1, holeEndX),
    holeZ0: Math.max(z + 1, stairZ),
    holeZ1: Math.min(z + sz - 1, stairZ + 2),
  };
}

function pushInternalStairs(stairs, building, layout) {
  const [_x, _y, _z, _sx, sy] = building;
  if (!layout) return;
  const { floorStep, stairRun, stairX, stairZ, direction } = layout;

  for (let floorY = 0; floorY + floorStep < sy; floorY += floorStep) {
    for (let step = 0; step < stairRun; step += 1) {
      const sxPos = stairX + step * direction;
      pushBox(stairs, sxPos, floorY + 1 + step, stairZ, 1, 1, 2);
    }
  }
}

function pushFloorPlate(floors, building, y, hole) {
  const [x, _buildingY, z, sx, _sy, sz] = building;
  const x0 = x + 1;
  const x1 = x + sx - 1;
  const z0 = z + 1;
  const z1 = z + sz - 1;

  if (!hole) {
    pushBox(floors, x0, y, z0, Math.max(1, x1 - x0), FLOOR_THICKNESS, Math.max(1, z1 - z0));
    return;
  }

  const hx0 = Math.max(x0, hole.holeX0);
  const hx1 = Math.min(x1, hole.holeX1);
  const hz0 = Math.max(z0, hole.holeZ0);
  const hz1 = Math.min(z1, hole.holeZ1);

  pushBox(floors, x0, y, z0, x1 - x0, FLOOR_THICKNESS, hz0 - z0);
  pushBox(floors, x0, y, hz1, x1 - x0, FLOOR_THICKNESS, z1 - hz1);
  pushBox(floors, x0, y, hz0, hx0 - x0, FLOOR_THICKNESS, hz1 - hz0);
  pushBox(floors, hx1, y, hz0, x1 - hx1, FLOOR_THICKNESS, hz1 - hz0);
}

function pushBuildingShell(walls, darkWalls, floors, stairs, windowsWarm, windowsDim, building, rng, isDark) {
  const [x, _y, z, sx, sy, sz] = building;
  const wallTarget = isDark ? darkWalls : walls;

  pushBox(wallTarget, x, 0, z + 1, 1, sy, Math.max(1, sz - 2));
  pushBox(wallTarget, x + sx - 1, 0, z + 1, 1, sy, Math.max(1, sz - 2));

  const frontWindows = makeWindowSet(building, rng, 0.72);
  const backWindows = makeWindowSet(building, rng, 0.36);
  pushFacade(wallTarget, windowsWarm, windowsDim, building, z, frontWindows, rng);
  pushFacade(wallTarget, windowsWarm, windowsDim, building, z + sz - 1, backWindows, rng);

  const stairLayout = makeStairLayout(building, rng);
  for (let y = 0; y < sy; y += 8) {
    pushFloorPlate(floors, building, y, y === 0 ? null : stairLayout);
  }
  pushFloorPlate(floors, building, sy - 1, null);

  pushInternalStairs(stairs, building, stairLayout);
}

function columnBox(x, z, width) {
  return clippedBox(x, 0, z, width, ZONE.height, width);
}

function addTrailBlock(blocks, occupied, x, y, z) {
  const gx = Math.round(x);
  const gy = Math.round(y);
  const gz = Math.round(z);
  const key = `${gx},${gy},${gz}`;
  if (occupied.has(key)) return;
  const block = clippedBox(gx, gy, gz, 1, 1, 1);
  if (!block) return;
  occupied.add(key);
  blocks.push(block);
}

function pushBreakableTrailBlock(blocks, occupied, breakableKeys, x, y, z) {
  const before = blocks.length;
  addTrailBlock(blocks, occupied, x, y, z);
  if (blocks.length > before) {
    const block = blocks[blocks.length - 1];
    breakableKeys.add(`${block[0]},${block[1]},${block[2]}`);
  }
}

function pushXTrail(blocks, occupied, breakableKeys, x0, x1, y, z) {
  const start = Math.round(Math.min(x0, x1));
  const end = Math.round(Math.max(x0, x1));
  for (let x = start; x <= end; x += 1) {
    pushBreakableTrailBlock(blocks, occupied, breakableKeys, x, y, z);
  }
}

function pushZTrail(blocks, occupied, x, y, z0, z1) {
  const start = Math.round(Math.min(z0, z1));
  const end = Math.round(Math.max(z0, z1));
  for (let z = start; z <= end; z += 1) {
    addTrailBlock(blocks, occupied, x, y, z);
  }
}

function trailXZKey(block) {
  return `${block[0]},${block[2]}`;
}

function hasVerticalTrailConflict(block, heightsByXZ) {
  const heights = heightsByXZ.get(trailXZKey(block));
  if (!heights) return false;
  return heights.some((height) => Math.abs(height - block[1]) < 3);
}

function hasTrailConflict(candidate, heightsByXZ) {
  return candidate.some((block) => hasVerticalTrailConflict(block, heightsByXZ));
}

function registerTrail(candidate, heightsByXZ) {
  for (const block of candidate) {
    const key = trailXZKey(block);
    if (!heightsByXZ.has(key)) heightsByXZ.set(key, []);
    heightsByXZ.get(key).push(block[1]);
  }
}

function degradeTrail(candidate, breakableKeys, rng, ratio = 0.2) {
  return candidate.filter((block) => {
    const key = `${block[0]},${block[1]},${block[2]}`;
    return !breakableKeys.has(key) || rng() >= ratio;
  });
}

function columnLaneZ(column, side) {
  return side === 'north' ? column.z - 1 : column.z + column.width;
}

function pushColumnRamp(blocks, occupied, column, y, side, fromWest, deltaY) {
  const laneZ = columnLaneZ(column, side);
  const startX = fromWest ? column.x - 1 : column.x + column.width;
  const endX = fromWest ? column.x + column.width : column.x - 1;
  const steps = Math.max(1, Math.abs(endX - startX));
  const direction = startX <= endX ? 1 : -1;

  for (let i = 0; i <= steps; i += 1) {
    const x = startX + i * direction;
    const stepY = y + Math.round((deltaY * i) / steps);
    addTrailBlock(blocks, occupied, x, stepY, laneZ);
  }

  return y + deltaY;
}

function columnRingCells(column) {
  const minX = column.x - 1;
  const maxX = column.x + column.width;
  const minZ = column.z - 1;
  const maxZ = column.z + column.width;
  const cells = [];

  for (let x = minX; x <= maxX; x += 1) cells.push([x, minZ]);
  for (let z = minZ + 1; z <= maxZ; z += 1) cells.push([maxX, z]);
  for (let x = maxX - 1; x >= minX; x -= 1) cells.push([x, maxZ]);
  for (let z = maxZ - 1; z > minZ; z -= 1) cells.push([minX, z]);

  return cells;
}

function pushColumnSpiral(blocks, occupied, column, y, side, fromWest) {
  const laneZ = columnLaneZ(column, side);
  const start = [fromWest ? column.x - 1 : column.x + column.width, laneZ];
  const exit = [fromWest ? column.x + column.width : column.x - 1, laneZ];
  const clockwise = side === 'north' ? fromWest : !fromWest;
  const ring = clockwise ? columnRingCells(column) : columnRingCells(column).reverse();
  const sameCell = (cell, target) => cell[0] === target[0] && cell[1] === target[1];
  const startIndex = Math.max(0, ring.findIndex((cell) => sameCell(cell, start)));
  const ordered = ring.slice(startIndex).concat(ring.slice(0, startIndex));
  let currentY = y;
  let lastY = y;
  let didFullLoop = false;

  for (let i = 0; i < ordered.length * 2; i += 1) {
    const cell = ordered[i % ordered.length];
    lastY = currentY;
    addTrailBlock(blocks, occupied, cell[0], lastY, cell[1]);
    if (i > 0 && i % 2 === 0) currentY += 1;
    if (i >= ordered.length) didFullLoop = true;
    if (didFullLoop && sameCell(cell, exit)) break;
  }

  return lastY;
}

function generateRedTrail(columnCenters, rng, occupied) {
  const trail = [];
  const breakableKeys = new Set();
  const byZ = new Map();

  for (const column of columnCenters) {
    if (!byZ.has(column.z)) byZ.set(column.z, []);
    byZ.get(column.z).push(column);
  }

  const rows = [...byZ.keys()].sort((a, b) => a - b);
  let row = 1 + Math.floor(rng() * Math.max(1, rows.length - 2));
  let side = rng() < 0.5 ? 'north' : 'south';
  let y = 8 + Math.floor(rng() * 12);
  const fromWest = rng() < 0.5;
  let x = fromWest ? 0 : ZONE.length - 1;

  while (fromWest ? x < ZONE.length - 1 : x > 0) {
    const columns = byZ.get(rows[row]).sort((a, b) => fromWest ? a.x - b.x : b.x - a.x);
    const nextColumn = columns.find((column) => {
      return fromWest ? column.x + column.width >= x + 1 : column.x <= x - 1;
    });
    if (!nextColumn) {
      pushXTrail(trail, occupied, breakableKeys, x, fromWest ? ZONE.length - 1 : 0, y, columnLaneZ(columns[columns.length - 1], side));
      break;
    }

    const laneZ = columnLaneZ(nextColumn, side);
    const approachX = fromWest ? Math.max(x, nextColumn.x - 1) : Math.min(x, nextColumn.x + nextColumn.width);
    pushXTrail(trail, occupied, breakableKeys, x, approachX, y, laneZ);

    const climbRoll = rng();
    if (climbRoll < 0.2 && y < ZONE.height - 30) {
      y = pushColumnSpiral(trail, occupied, nextColumn, y, side, fromWest);
    } else if (climbRoll < 0.52 && y < ZONE.height - 14) {
      y = pushColumnRamp(trail, occupied, nextColumn, y, side, fromWest, 2);
    } else if (climbRoll < 0.78 && y > 12) {
      y = pushColumnRamp(trail, occupied, nextColumn, y, side, fromWest, -2);
    } else {
      pushColumnRamp(trail, occupied, nextColumn, y, side, fromWest, 0);
    }

    if (rng() < 0.28) {
      const direction = rng() < 0.5 ? -1 : 1;
      const nextRow = Math.max(0, Math.min(rows.length - 1, row + direction));
      if (nextRow !== row) {
        const fromZ = columnLaneZ(nextColumn, side);
        row = nextRow;
        side = side === 'north' ? 'south' : 'north';
        const targetColumn = byZ.get(rows[row]).find((column) => column.x === nextColumn.x) || nextColumn;
        const toZ = columnLaneZ(targetColumn, side);
        pushZTrail(trail, occupied, fromWest ? nextColumn.x + nextColumn.width + 1 : nextColumn.x - 1, y, fromZ, toZ);
      }
    }

    x = fromWest ? nextColumn.x + nextColumn.width + 1 : nextColumn.x - 1;
  }

  return {
    boxes: trail,
    breakableKeys,
  };
}

function generateRedTrails(columnCenters, rng, count) {
  const trails = [];
  const heightsByXZ = new Map();
  let accepted = 0;

  for (let i = 0; i < count; i += 1) {
    let candidate = null;

    for (let attempt = 0; attempt < 160; attempt += 1) {
      const nextTrail = generateRedTrail(columnCenters, rng, new Set());
      const degradedTrail = degradeTrail(nextTrail.boxes, nextTrail.breakableKeys, rng);
      if (!degradedTrail.length || hasTrailConflict(degradedTrail, heightsByXZ)) continue;
      candidate = degradedTrail;
      break;
    }

    if (!candidate) continue;
    registerTrail(candidate, heightsByXZ);
    trails.push(...candidate);
    accepted += 1;
  }

  return { boxes: trails, count: accepted };
}

function generateScene() {
  const rng = makeRng(98371);
  const buildings = [];
  const darkBuildings = [];
  const buildingFloors = [];
  const buildingStairs = [];
  const columns = [];
  const columnCenters = [];
  const windowsWarm = [];
  const windowsDim = [];
  let buildingCount = 0;

  const rowDepths = [24, 24, 24];
  const rowZ = [14, 48, 82];

  for (let row = 0; row < 3; row += 1) {
    let x = row * 6;
    while (x < ZONE.length) {
      const wantedSx = 26 + Math.floor(rng() * 28);
      const sz = rowDepths[row] + Math.floor(rng() * 6);
      const heightTrim = Math.floor(rng() * 18);
      const sy = ZONE.height - heightTrim;
      const z = rowZ[row] + Math.floor(rng() * 4);
      const building = clippedBox(x, 0, z, wantedSx, sy, sz);
      if (building && building[3] >= 12) {
        pushBuildingShell(
          buildings,
          darkBuildings,
          buildingFloors,
          buildingStairs,
          windowsWarm,
          windowsDim,
          building,
          rng,
          rng() < 0.22,
        );
        buildingCount += 1;
      }
      x += wantedSx + 8 + Math.floor(rng() * 8);
    }
  }

  for (let x = 0; x <= ZONE.length; x += 20) {
    for (let z = 180; z <= 240; z += 20) {
      const width = 4;
      const column = columnBox(x, z, width);
      if (column) {
        columns.push(column);
        columnCenters.push({ x, z, width });
      }
    }
  }
  const trailCount = 10;
  const trails = generateRedTrails(columnCenters, rng, trailCount);

  addInstanced('building', buildings);
  addInstanced('buildingDark', darkBuildings);
  addInstanced('floor', buildingFloors);
  addInstanced('stair', buildingStairs);
  addInstanced('column', columns);
  addInstanced('trail', trails.boxes);
  addInstanced('window', windowsWarm);
  addInstanced('windowDim', windowsDim);

  stats.textContent = `${ZONE.length}x${ZONE.width}x${ZONE.height} · ${buildingCount} buildings creux · ${columns.length} colonnes · ${trails.count}/${trailCount} chemins rouges · ${trails.boxes.length} blocks rouges · ${windowsWarm.length + windowsDim.length} vitres`;
}

function addFloorGrid() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ZONE.length, ZONE.width),
    materials.floor,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  scene.add(floor);

  const grid = new THREE.GridHelper(Math.max(ZONE.length, ZONE.width), 50, 0x55606b, 0x333b43);
  grid.position.y = 0.04;
  scene.add(grid);

  const bounds = new THREE.Box3(
    new THREE.Vector3(-ZONE.length / 2, 0, -ZONE.width / 2),
    new THREE.Vector3(ZONE.length / 2, ZONE.height, ZONE.width / 2),
  );
  const helper = new THREE.Box3Helper(bounds, 0x768393);
  scene.add(helper);
}

document.body.addEventListener('click', (event) => {
  if (event.target.closest('#hud') || event.target.closest('#help')) return;
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
  const speed = (keys.has('shift') ? 145 : 52) * dt;
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

addFloorGrid();
generateScene();
animate();
