import {mergeBoxes, subtract} from './generation_demo_generator.js';
import {growRestrictMass} from './wide_restrict_mass.js';
import {addRestrictTerminals} from './wide_restrict_terminals.js';

export const AREA = {length: 540, width: 600, height: 240};
const CORE_WIDTH = 240, DEPTH_OFFSET = 180;
const STOREY = 12;
const CORE_END = AREA.length - 80;

export function generateWideRestrictArea(seed = 42) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Seed invalide');
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const int = (a, b) => a + Math.floor(random() * (b - a + 1));
  const boxes = [], buildings = [], rooms = [], bridges = [], stairs = [], connections = [], doors = [];
  const add = (x, y, z, sx, sy, sz, kind) => boxes.push([x, y, z, sx, sy, sz, kind]);
  const emitCut = (box, cuts) => {
    let parts = [box];
    for (const cut of cuts) parts = parts.flatMap(part => subtract(part, cut));
    boxes.push(...parts);
  };
  const stations = [];
  for (let x = 8; x < CORE_END;) {
    let width = Math.min(int(44, 68), CORE_END - x);
    if (CORE_END - x - width < 40) width = CORE_END - x;
    stations.push({x, width, center: int(108, 132), gap: int(26, 40)});
    x += width;
  }
  for (const [station, s] of stations.entries()) for (const side of [0, 1]) {
    const building = {id: buildings.length, station, side, x: s.x, width: s.width, floors: int(15, 19), rooms: []};
    const setback = int(0, 8);
    const featured = new Set([int(2, 6), int(10, building.floors - 2)]);
    for (let level = 0; level < building.floors; level++) {
      const offset = setback - (featured.has(level) ? 8 : 0);
      const front = side === 0 ? s.center - Math.floor(s.gap / 2) - offset
        : s.center + Math.ceil(s.gap / 2) + offset;
      const z = side === 0 ? 8 : front, endZ = side === 0 ? front : CORE_WIDTH - 8;
      const room = {id: rooms.length, building: building.id, side, level, x: s.x, y: 1 + level * STOREY,
        z, sx: s.width, sz: endZ - z, front, featured: featured.has(level), cuts: []};
      rooms.push(room); building.rooms.push(room);
    }
    buildings.push(building);
  }
  const link = (a, b, kind) => connections.push({a: a.id, b: b.id, kind});
  // Shared side doors form two continuous interior routes, independent of the fissure's setbacks.
  for (const building of buildings) {
    const next = buildings.find(b => b.side === building.side && b.station === building.station + 1);
    if (!next) continue;
    for (let level = 0; level < Math.min(building.floors, next.floors); level++) {
      const a = building.rooms[level], b = next.rooms[level], z = building.side === 0 ? 46 : 190;
      const door = [b.x - 1, a.y + 1, z, 2, 3, 3];
      a.cuts.push(door); b.cuts.push(door); doors.push(door); link(a, b, 'door');
    }
  }
  for (let station = 0; station < stations.length; station++) {
    const left = buildings[station * 2], right = buildings[station * 2 + 1];
    const levels = new Set([int(1, 3), int(6, 9), int(11, Math.min(left.floors, right.floors) - 1)]);
    for (const level of levels) {
      const a = left.rooms[level], b = right.rooms[level], x = a.x + Math.floor(a.sx / 2), y = a.y;
      const start = a.front, end = b.front;
      for (const room of [a, b]) {
        const door = [x - 1, y + 1, room.side === 0 ? room.front - 1 : room.front, 3, 3, 1];
        room.cuts.push(door); doors.push(door);
      }
      add(x - 2, y, start, 5, 1, end - start, 'bridge');
      for (const edge of [x - 2, x + 2]) {
        add(edge, y + 2, start, 1, 1, end - start, 'rail');
        for (let z = start; z < end; z += 5) add(edge, y + 1, z, 1, 1, 1, 'rail');
      }
      bridges.push({a: a.id, b: b.id, x, y, start, end}); link(a, b, 'bridge');
    }
  }
  for (const building of buildings) {
    const stairX = building.x + 6, stairZ = building.side === 0 ? 18 : 216;
    for (let level = 0; level <= building.floors; level++) {
      const below = building.rooms[Math.max(0, level - 1)];
      const above = building.rooms[Math.min(level, building.floors - 1)];
      const z = Math.min(below.z, above.z), endZ = Math.max(below.z + below.sz, above.z + above.sz);
      const y = 1 + level * STOREY;
      const hole = [stairX, y, stairZ, STOREY - 1, 1, 3];
      const slabCuts = level > 0 && level < building.floors ? [hole] : [];
      for (const bridge of bridges) if (bridge.y === y) slabCuts.push([bridge.x - 2, y, bridge.start, 5, 1, bridge.end - bridge.start]);
      const frontStrip = [building.x, y, building.side === 0 ? endZ - 1 : z, building.width, 1, 1, 'wall'];
      const plain = !below.featured && !above.featured;
      emitCut([building.x, y, z, building.width, 1, endZ - z, 'floor'], plain ? [...slabCuts, frontStrip] : slabCuts);
      if (plain) boxes.push(frontStrip);
      if (level === building.floors) continue;
      const room = building.rooms[level], end = room.z + room.sz;
      const walls = [
        [room.x, y + 1, room.z, 1, STOREY - 1, room.sz, 'wall'],
        [room.x + room.sx - 1, y + 1, room.z, 1, STOREY - 1, room.sz, 'wall'],
        [room.x + 1, y + 1, room.z, room.sx - 2, STOREY - 1, 1, 'wall'],
        [room.x + 1, y + 1, end - 1, room.sx - 2, STOREY - 1, 1, 'wall'],
      ];
      const facadeZ = room.side === 0 ? end - 1 : room.z;
      const windows = [];
      for (let x = room.x + 5; room.featured && x < room.x + room.sx - 5; x += 9) {
        const window = [x, y + 5, facadeZ, 3, 4, 1];
        windows.push(window); boxes.push([...window, random() < 0.18 ? 'light' : 'window']);
      }
      for (const wall of walls) emitCut(wall, [...room.cuts, ...windows]);
      const bandZ = room.side === 0 ? end : room.z - 1;
      const cornice = [room.x + 1, y + 9, bandZ, room.sx - 2, 1, 1, 'trim'];
      if (room.featured) boxes.push(cornice);
      if (level < building.floors - 1) {
        const points = [];
        for (let i = 0; i < STOREY - 1; i++) {
          add(stairX + i, y + i + 1, stairZ, 1, 1, 3, 'stair');
          points.push([stairX + i, y + i + 1, stairZ + 1]);
        }
        stairs.push({a: room.id, b: building.rooms[level + 1].id, points});
        link(room, building.rooms[level + 1], 'stair');
      }
    }
  }
  const spawnBridge = bridges[0], spawnZ = (spawnBridge.start + spawnBridge.end) / 2;
  for (const box of boxes) box[2] += DEPTH_OFFSET;
  for (const room of rooms) { room.z += DEPTH_OFFSET; room.front += DEPTH_OFFSET; }
  for (const door of doors) door[2] += DEPTH_OFFSET;
  for (const stair of stairs) for (const point of stair.points) point[2] += DEPTH_OFFSET;
  for (const bridge of bridges) { bridge.start += DEPTH_OFFSET; bridge.end += DEPTH_OFFSET; }
  const data = {seed, world: AREA, boxes, buildings, rooms, bridges, stairs, connections, doors,
    spawn: [spawnBridge.x, spawnBridge.y + 4.8, spawnZ + DEPTH_OFFSET],
    lookAt: [spawnBridge.x + 50, spawnBridge.y + 24, spawnZ + DEPTH_OFFSET],
    stats: {buildings: buildings.length, rooms: rooms.length, bridges: bridges.length, stairs: stairs.length}};
  addRestrictTerminals(data, CORE_END);
  growRestrictMass(data, random);
  add(0, 0, 0, AREA.length, 1, AREA.width, 'ground');
  data.boxes = [...mergeBoxes(boxes.filter(box => box[6] !== 'ladder')), ...boxes.filter(box => box[6] === 'ladder')];
  return data;
}
