import {overlaps, subtract} from './generation_demo_generator.js';

// Grow attached rooms first; solid infill is placed only in the remaining space.
export function growRestrictMass(data, random) {
  const int = (a, b) => a + Math.floor(random() * (b - a + 1));
  const {world, rooms, boxes, connections, doors} = data;
  const additions = [], solids = [], ladders = [], coreCuts = [], buckets = new Map();
  const bounds = room => [room.x, room.y, room.z, room.sx, room.sy ?? 13, room.sz];
  const cells = function* (b) {
    for (let x = Math.floor(b[0] / 48); x <= Math.floor((b[0] + b[3] - 1) / 48); x++)
      for (let y = Math.floor(b[1] / 48); y <= Math.floor((b[1] + b[4] - 1) / 48); y++)
        for (let z = Math.floor(b[2] / 48); z <= Math.floor((b[2] + b[5] - 1) / 48); z++) yield `${x}:${y}:${z}`;
  };
  const reserve = b => {
    for (const key of cells(b)) { if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(b); }
  };
  const free = b => {
    if (b.some((v, i) => i < 3 && (v < (i === 1 ? 1 : 8) || v + b[i + 3] > [world.length - 8, world.height - 1, world.width - 8][i]))) return false;
    for (const key of cells(b)) if ((buckets.get(key) || []).some(other => overlaps(b, other))) return false;
    return true;
  };
  const coreRooms = [...rooms];
  for (const room of coreRooms) { room.access = []; reserve(bounds(room)); }
  // The original narrow fissure, its bridges and terraces remain untouched.
  reserve([0, 1, 188, world.length, world.height - 1, 224]);
  function cut(room, hole) {
    if (room.mass) room.cuts.push(hole); else coreCuts.push(hole);
  }
  function append(parent, b, axis, sign) {
    if (!free(b)) return false;
    const p = bounds(parent), room = {id: rooms.length, building: data.buildings.length + additions.length,
      mass: true, x: b[0], y: b[1], z: b[2], sx: b[3], sy: b[4], sz: b[5], cuts: [], access: []};
    if (axis === 1) {
      const lowX = Math.max(p[0], b[0]) + 3, highX = Math.min(p[0] + p[3], b[0] + b[3]) - 4;
      if (lowX > highX || parent.z !== room.z) return false;
      const x = int(lowX, highX), z = room.z + 1;
      const lower = sign > 0 ? parent : room, upper = sign > 0 ? room : parent;
      const access = [x - 1, lower.y + 1, z, 3, upper.y - lower.y + 3, 3];
      if (parent.access.some(a => overlaps(a, access))) return false;
      const hole = [x, upper.y - 1, z, 1, 2, 1];
      cut(lower, hole); cut(upper, hole);
      parent.access.push(access); room.access.push(access);
      ladders.push({a: parent.id, b: room.id, x, z, bottom: lower.y + 1, top: upper.y});
    } else {
      const across = axis === 0 ? 2 : 0;
      const low = Math.max(p[across], b[across]) + 3;
      const high = Math.min(p[across] + p[across + 3], b[across] + b[across + 3]) - 6;
      if (low > high) return false;
      const at = int(low, high), border = sign > 0 ? b[axis] : p[axis];
      const hole = axis === 0 ? [border - 1, room.y + 1, at, 2, 3, 3] : [at, room.y + 1, border - 1, 3, 3, 2];
      const access = [...hole]; access[axis] -= 2; access[axis + 3] += 4;
      if (parent.access.some(a => overlaps(a, access))) return false;
      cut(parent, hole); cut(room, hole); doors.push(hole);
      parent.access.push(access); room.access.push(access);
    }
    connections.push({a: parent.id, b: room.id, kind: axis === 1 ? 'ladder' : 'door'});
    rooms.push(room); additions.push(room); reserve(b); return true;
  }
  function attempt(parent, axis, sign) {
    const p = bounds(parent), sizes = [int(24, 72), int(8, 30), int(18, 64)];
    const b = [p[0] + int(-12, Math.max(0, p[3] - 16)), p[1], p[2] + int(-12, Math.max(0, p[5] - 16)), ...sizes];
    b[axis] = sign > 0 ? p[axis] + p[axis + 3] : p[axis] - sizes[axis];
    if (axis === 1) b[2] = p[2];
    if (axis === 0) b[1] = p[1];
    return append(parent, b, axis, sign);
  }
  const roots = [...coreRooms];
  for (let i = roots.length - 1; i > 0; i--) { const j = int(0, i); [roots[i], roots[j]] = [roots[j], roots[i]]; }
  for (const root of roots) for (let i = 0; i < 4; i++) if (attempt(root, 2, root.side === 0 ? -1 : 1)) break;
  for (let i = 0; i < 24000 && additions.length < 850; i++) {
    const parent = additions[int(0, additions.length - 1)];
    if (!parent) break;
    attempt(parent, int(0, 2), random() < 0.5 ? -1 : 1);
  }
  // Cut only the new entrances into the existing structure; other zones are not regenerated.
  for (const hole of coreCuts) {
    for (let i = boxes.length - 1; i >= 0; i--) if (overlaps(boxes[i], hole)) boxes.splice(i, 1, ...subtract(boxes[i], hole));
  }
  for (const room of additions) {
    const {x, y, z, sx, sy, sz} = room;
    const kind = ['mass_wall', 'mass_dark', 'mass_light'][int(0, 2)];
    const shell = [
      [x, y, z, sx, 1, sz, 'floor'], [x, y + sy - 1, z, sx, 1, sz, 'floor'],
      [x, y + 1, z, 1, sy - 2, sz, kind], [x + sx - 1, y + 1, z, 1, sy - 2, sz, kind],
      [x + 1, y + 1, z, sx - 2, sy - 2, 1, kind], [x + 1, y + 1, z + sz - 1, sx - 2, sy - 2, 1, kind],
    ];
    for (const wall of shell) {
      let parts = [wall];
      for (const hole of room.cuts) parts = parts.flatMap(part => subtract(part, hole));
      boxes.push(...parts);
    }
  }
  for (const ladder of ladders) for (let y = ladder.bottom; y <= ladder.top; y++) boxes.push([ladder.x, y, ladder.z, 1, 1, 1, 'ladder']);
  // Irregular solid clusters, not a single rectangular envelope hiding all the buildings.
  for (let i = 0; i < 1800 && solids.length < 180; i++) {
    const size = [int(30, 90), int(24, 70), int(30, 90)];
    const b = [int(8, world.length - 8 - size[0]), int(1, world.height - 1 - size[1]), int(8, world.width - 8 - size[2]), ...size];
    const neighbors = new Set();
    for (const key of cells(b)) for (const other of buckets.get(key) || []) neighbors.add(other);
    let parts = [b];
    for (const other of neighbors) parts = parts.flatMap(part => subtract(part, other));
    for (const part of parts) {
      if (solids.length >= 180) break;
      if (part.slice(3, 6).some(n => n < 4) || part[3] * part[4] * part[5] < 512) continue;
      const volume = part.slice(0, 6);
      reserve(volume); solids.push(volume); boxes.push([...volume, random() < 0.5 ? 'infill' : 'mass_dark']);
    }
  }
  data.buildings.push(...additions.map(room => ({id: room.building, rooms: [room], mass: true})));
  data.ladders = ladders; data.solids = solids;
  data.stats = {...data.stats, buildings: data.buildings.length, rooms: rooms.length, ladders: ladders.length, solids: solids.length};
}
