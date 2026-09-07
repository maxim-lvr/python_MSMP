export const TOTAL_LENGTH = 1500;
export const MIN_SEGMENT = 70;
export const MAX_SEGMENT = 150;
export const BRIDGE_COUNT = 16;
export const HEIGHT = 41;
const HALF_WIDTH = 15;
const LEVELS = 10;

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function rectangle(a, b, margin) {
  return [Math.min(a.x, b.x) - margin, Math.min(a.z, b.z) - margin,
    Math.max(a.x, b.x) + margin, Math.max(a.z, b.z) + margin];
}

function intersects(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

export function generateRoute(seed) {
  const random = makeRandom(seed);
  const count = 14;
  const lengths = [];
  let remaining = TOTAL_LENGTH;
  for (let i = 0; i < count; i++) {
    const left = count - i - 1;
    const low = Math.max(MIN_SEGMENT, remaining - left * MAX_SEGMENT);
    const high = Math.min(MAX_SEGMENT, remaining - left * MIN_SEGMENT);
    const length = low + Math.floor(random() * (high - low + 1));
    lengths.push(length);
    remaining -= length;
  }
  const points = [{ x: 0, z: 0 }];
  const envelopes = [];
  function walk(i, dx, dz) {
    if (i === lengths.length) return true;
    const a = points.at(-1);
    const b = { x: a.x + dx * lengths[i], z: a.z + dz * lengths[i] };
    // Reserve the entire 32-wide building, its corners and an exterior gap.
    const envelope = rectangle(a, b, HALF_WIDTH + 3);
    if (envelopes.slice(0, -1).some(other => intersects(envelope, other))) return false;
    points.push(b);
    envelopes.push(envelope);
    const sign = random() < 0.5 ? 1 : -1;
    if (walk(i + 1, -dz * sign, dx * sign) || walk(i + 1, dz * sign, -dx * sign)) return true;
    points.pop();
    envelopes.pop();
    return false;
  }
  if (!walk(0, 1, 0)) throw new Error('Aucun parcours valide');
  return { points, lengths, envelopes };
}

// Orthogonal offset lines meet at their miter, keeping both facades continuous.
function ribbon(points, left, right) {
  const normals = points.slice(1).map((b, i) => {
    const a = points[i];
    return { x: -Math.sign(b.z - a.z), z: Math.sign(b.x - a.x) };
  });
  const offset = (p, i, distance) => {
    const before = normals[Math.max(0, i - 1)];
    const after = normals[Math.min(normals.length - 1, i)];
    const n = i === 0 || i === points.length - 1 ? before : { x: before.x + after.x, z: before.z + after.z };
    return { x: p.x + distance * n.x, z: p.z + distance * n.z };
  };
  return [...points.map((p, i) => offset(p, i, left)), ...points.map((p, i) => offset(p, i, -right)).reverse()];
}

export function generateSnake(seed, bridgeCount = BRIDGE_COUNT) {
  if (!Number.isInteger(bridgeCount) || bridgeCount < 0 || bridgeCount > 100) throw new Error('Nombre de ponts : 0 a 100');
  const route = generateRoute(seed);
  const random = makeRandom((seed >>> 0) ^ 0xa32f81);
  const polygon = ribbon(route.points, 16, 16);
  const minX = Math.min(...polygon.map(p => p.x)) - 1;
  const minZ = Math.min(...polygon.map(p => p.z)) - 1;
  const width = Math.max(...polygon.map(p => p.x)) - minX + 1;
  const depth = Math.max(...polygon.map(p => p.z)) - minZ + 1;
  const index = (x, z) => (z - minZ) * width + x - minX;
  const coords = i => [minX + i % width, minZ + Math.floor(i / width)];
  function mask(left, right) {
    const poly = ribbon(route.points, left, right);
    const result = new Uint8Array(width * depth);
    for (let z = minZ; z < minZ + depth; z++) {
      const crossings = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if ((a.z > z + 0.5) !== (b.z > z + 0.5)) crossings.push(a.x);
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i < crossings.length; i += 2) {
        result.fill(1, index(crossings[i], z), index(crossings[i + 1], z));
      }
    }
    return result;
  }
  const footprint = mask(16, 16);
  const interior = mask(15, 15);
  const cells = [];
  for (let i = 0; i < footprint.length; i++) if (footprint[i]) cells.push(i);
  const depths = Array.from({ length: 2 }, () => Array.from({ length: LEVELS }, () => 8 + Math.floor(random() * 5)));
  const passages = Array.from({ length: LEVELS }, (_, level) => mask(15 - depths[0][level], 15 - depths[1][level]));
  const bridges = [];
  const bridgeCells = Array.from({ length: LEVELS }, () => new Set());
  const doors = Array.from({ length: LEVELS }, () => new Set());
  let distance = 0;
  const candidates = [];
  route.lengths.forEach((length, segment) => {
    for (let step = 25; step < length - 25; step += 12) candidates.push({ segment, step, distance: distance + step });
    distance += length;
  });
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const candidate of candidates) {
    if (bridges.length >= bridgeCount) break;
    if (bridges.some(b => Math.abs(b.distance - candidate.distance) < 60)) continue;
    const level = 1 + Math.floor(random() * (LEVELS - 1));
    const a = route.points[candidate.segment];
    const b = route.points[candidate.segment + 1];
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    const nx = -dz;
    const nz = dx;
    const low = -(15 - depths[1][level]);
    const high = 15 - depths[0][level];
    const positions = [];
    for (let along = 0; along < 2; along++) {
      for (let across = low - 1; across <= high; across++) {
        const x = Math.floor(a.x + dx * (candidate.step + along + 0.5) + nx * (across + 0.5));
        const z = Math.floor(a.z + dz * (candidate.step + along + 0.5) + nz * (across + 0.5));
        const i = index(x, z);
        if (across === low - 1 || across === high) doors[level].add(i);
        else { bridgeCells[level].add(i); positions.push([x, level * 4, z]); }
      }
    }
    bridges.push({ ...candidate, level, positions });
  }
  const boxes = Object.fromEntries(['wall', 'floor', 'facade', 'alternate', 'window', 'lit', 'bridge'].map(k => [k, []]));
  function emit(kind, y, sy, predicate) {
    let start = -1;
    let previous = -2;
    const rowRuns = new Map();
    const flush = () => {
      if (start < 0) return;
      const [x, z] = coords(start);
      const sx = previous - start + 1;
      const key = `${x},${sx}`;
      const last = rowRuns.get(key);
      if (last && last[2] + last[5] === z) last[5]++;
      else {
        const box = [x, y, z, sx, sy, 1];
        boxes[kind].push(box);
        rowRuns.set(key, box);
      }
      start = -1;
    };
    for (const i of cells) {
      if (!predicate(i)) { flush(); continue; }
      if (i !== previous + 1 || Math.floor(i / width) !== Math.floor(previous / width)) flush();
      if (start < 0) start = i;
      previous = i;
    }
    flush();
  }
  emit('wall', 0, HEIGHT, i => !interior[i]);
  emit('floor', 0, 1, i => interior[i]);
  emit('floor', 40, 1, i => interior[i]);
  for (let level = 0; level < LEVELS; level++) {
    const passage = passages[level];
    const outsideFacade = mask(16 - depths[0][level], 16 - depths[1][level]);
    const kind = level % 2 === 0 ? 'facade' : 'alternate';
    const isFacade = i => interior[i] && outsideFacade[i] && !passage[i];
    const isEnd = i => {
      if (!interior[i] || passage[i]) return false;
      const [x, z] = coords(i);
      return route.points.some((p, j) => {
        if (j !== 0 && j !== route.points.length - 1) return false;
        const q = route.points[j === 0 ? 1 : j - 1];
        return p.x === q.x
          ? Math.abs(x + 0.5 - p.x) < 15 && z === Math.min(p.z, p.z + Math.sign(q.z - p.z))
          : Math.abs(z + 0.5 - p.z) < 15 && x === Math.min(p.x, p.x + Math.sign(q.x - p.x));
      });
    };
    const facade = new Uint8Array(footprint.length);
    const windows = new Uint8Array(footprint.length);
    for (const i of cells) {
      if (isFacade(i) || isEnd(i)) facade[i] = 1;
      if (!isFacade(i)) continue;
      const [x, z] = coords(i);
      const along = passage[i + 1] || passage[i - 1] ? z : x;
      const phase = ((along % 6) + 6) % 6;
      if (phase === 2 || phase === 3) windows[i] = random() < 0.2 ? 2 : 1;
    }
    if (level > 0) {
      const openSlab = mask(15 - Math.max(depths[0][level], depths[0][level - 1]), 15 - Math.max(depths[1][level], depths[1][level - 1]));
      emit('floor', level * 4, 1, i => interior[i] && !openSlab[i]);
      emit('bridge', level * 4, 1, i => openSlab[i] && bridgeCells[level].has(i));
    }
    emit(kind, level * 4 + 1, 1, i => facade[i] && !doors[level].has(i));
    for (let dy = 2; dy <= 3; dy++) {
      const visible = i => facade[i] && (dy === 3 || !doors[level].has(i));
      emit(kind, level * 4 + dy, 1, i => visible(i) && !windows[i]);
      emit('window', level * 4 + dy, 1, i => visible(i) && windows[i] === 1);
      emit('lit', level * 4 + dy, 1, i => visible(i) && windows[i] === 2);
    }
  }
  return { boxes, route, bridges, depths, bounds: { minX, minZ, width, depth } };
}
