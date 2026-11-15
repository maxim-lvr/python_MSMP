import { generateSnake } from './house_tunnel_snake_generator.js';

import {mapWorld} from './world_config.js';

export const WORLD = mapWorld(5000);
export const TYPES = ['dense', 'tunnel', 'bridge', 'long', 'close', 'wide'];
export const LABELS = {
  bridge: 'Tours et ponts', long: 'Building long', close: 'House close',
  wide: 'House wide', dense: 'Dense houses', tunnel: 'House tunnel snake',
};
const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function randomFor(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function overlaps(a, b) {
  return [0, 1, 2].every(i => a[i] < b[i] + b[i + 3] && a[i] + a[i + 3] > b[i]);
}
export function subtract(box, cut) {
  if (!overlaps(box, cut)) return [box];
  const low = box.slice(0, 3), high = low.map((v, i) => v + box[i + 3]);
  const result = [];
  const emit = (a, b) => result.push([...a, ...b.map((v, i) => v - a[i]), box[6]]);
  for (let axis = 0; axis < 3; axis++) {
    const lo = Math.max(low[axis], cut[axis]);
    const hi = Math.min(high[axis], cut[axis] + cut[axis + 3]);
    if (low[axis] < lo) { const b = [...high]; b[axis] = lo; emit(low, b); low[axis] = lo; }
    if (high[axis] > hi) { const a = [...low]; a[axis] = hi; emit(a, high); high[axis] = hi; }
  }
  return result;
}

// Merge only adjacent, identical-material cuboids. No hulls or invented distant buildings.
export function mergeBoxes(input) {
  let boxes = input.map(b => [...b]);
  for (const axis of [2, 1, 0]) {
    const groups = new Map();
    for (const box of boxes) {
      const key = [box[6], ...[0, 1, 2].filter(i => i !== axis).flatMap(i => [box[i], box[i + 3]])].join(',');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(box);
    }
    boxes = [];
    for (const group of groups.values()) {
      group.sort((a, b) => a[axis] - b[axis]);
      let last;
      for (const box of group) {
        if (last && last[axis] + last[axis + 3] === box[axis]) last[axis + 3] += box[axis + 3];
        else { boxes.push(box); last = box; }
      }
    }
  }
  return boxes;
}
function runBoxes(payload, type) {
  const kinds = {
    house: 'dense', corridor: 'bridge', stair: 'stair', ladder: 'ladder', long_connection: 'trail',
    house_close: 'close', house_wide: 'wide', house_bridge: 'bridge', house_stair: 'stair',
    small_bridge: 'bridge', main_bridge: 'road', building_dark: 'building', window_dim: 'window',
  };
  return payload.runs.map(r => [...r.pos, ...r.size,
    r.kind === 'window' && type === 'long' ? 'lit' : kinds[r.kind] || r.kind]);
}
function lineBox(a, b, width = 1, kind = 'bridge') {
  const alongX = a[0] !== b[0];
  const radius = Math.floor(width / 2);
  return [Math.min(a[0], b[0]) - (alongX ? 0 : radius), a[1],
    Math.min(a[2], b[2]) - (alongX ? radius : 0),
    alongX ? Math.abs(a[0] - b[0]) + 1 : width, 1,
    alongX ? width : Math.abs(a[2] - b[2]) + 1, kind];
}

// A socket starts on a real room floor and exits through its side, not its roof.
function roomPorts(template, rooms) {
  const ports = [];
  for (const normal of DIRECTIONS) {
    const axis = normal[0] ? 0 : 2, sign = normal[0] || normal[1];
    const sorted = [...rooms].sort((a, b) => sign < 0 ? a[axis] - b[axis] : b[axis] + b[axis + 3] - a[axis] - a[axis + 3]);
    for (const room of sorted) {
      const door = [room[0] + Math.floor(room[3] / 2), room[1], room[2] + Math.floor(room[5] / 2)];
      door[axis] = room[axis] + (sign > 0 ? room[axis + 3] - 1 : 0);
      if (door[axis] < 0 || door[axis] >= template.size[axis]) continue;
      const port = makePort(template, door, normal);
      if (port) ports.push(port);
      if (ports.filter(p => p.normal === normal).length >= 5) break;
    }
  }
  return ports;
}
function makePort(template, door, normal) {
  const axis = normal[0] ? 0 : 2, sign = normal[0] || normal[1];
  const p = [...door];
  p[axis] = sign < 0 ? 0 : template.size[axis] - 1;
  const cut = [door[0], door[1] + 1, door[2], 1, 2, 1];
  const inside = [door[0] - normal[0], door[1], door[2] - normal[1], 1, 1, 1];
  const insideAir = [...inside]; insideAir[1]++; insideAir[4] = 2;
  if (!template.boxes.some(b => overlaps(b, inside)) || template.boxes.some(b => overlaps(b, insideAir))) return null;
  // Only the entrance block can be removed. Reject access through another construction.
  const air = lineBox(door, p); air[1]++; air[4] = 2;
  if (template.boxes.some(b => subtract(b, cut).some(piece => overlaps(piece, air)))) return null;
  return { p, door, normal, cut, deck: lineBox(door, p) };
}

export function buildTemplates(sources, seed) {
  const templates = [];
  const dense = { type: 'dense', size: sources.dense.zone.size, boxes: mergeBoxes(runBoxes(sources.dense, 'dense')),
    buildings: sources.dense.houses.length, source: 'exports/dense_1.json' };
  dense.ports = roomPorts(dense, sources.dense.houses.map(h => [...h.pos, ...h.size]));
  templates.push(dense);

  const bridge = { type: 'bridge', size: sources.bridge.zone.size, boxes: mergeBoxes(runBoxes(sources.bridge)),
    buildings: sources.bridge.towers.length, source: 'exports/bridge_zone.json' };
  const main = sources.bridge.settings.main_bridge;
  bridge.ports = [0, bridge.size[0] - 1].map((x, i) => makePort(bridge, [x, main.y + main.height - 1, main.z], [i ? 1 : -1, 0])).filter(Boolean);
  templates.push(bridge);

  const long = { type: 'long', size: sources.long.zone.size, boxes: mergeBoxes(runBoxes(sources.long, 'long')),
    buildings: sources.long.stats.buildings, source: 'exports/building_long_minecraft.json' };
  // Actual floor slabs identify rooms; avoid stair openings and respect their elevation.
  const floors = sources.long.runs.filter(r => r.kind === 'floor' && r.size[0] >= 5 && r.size[2] >= 5 && r.pos[1] < 140);
  long.ports = roomPorts(long, floors.map(r => [r.pos[0] - 1, r.pos[1], r.pos[2] - 1, r.size[0] + 2, 5, r.size[2] + 2]));
  templates.push(long);

  for (const type of ['close', 'wide']) {
    const offset = type === 'close' ? 0 : 150;
    const size = [type === 'close' ? 100 : 200, 200, 100];
    const boxes = runBoxes(sources.house).flatMap(b => {
      const x = Math.max(b[0], offset), end = Math.min(b[0] + b[3], offset + size[0]);
      return end > x ? [[x - offset, b[1], b[2], end - x, b[4], b[5], b[6]]] : [];
    });
    const houses = sources.house.houses.filter(h => h.profile === type);
    const template = { type, size, boxes: mergeBoxes(boxes), buildings: houses.length, source: 'exports/house_zone.json' };
    const rooms = houses.flatMap(h => Array.from({ length: h.local.floors }, (_, i) =>
      [h.box[0] - offset, h.box[1] + i * 5, h.box[2], h.box[3], 6, h.box[5]]));
    template.ports = roomPorts(template, rooms);
    templates.push(template);
  }

  // Use the original voxel ribbon, including mitered turns, facades and sparse bridges.
  for (let attempt = 0; attempt < 24; attempt++) {
    const snake = generateSnake((seed + attempt) >>> 0);
    const { minX, minZ, width, depth } = snake.bounds;
    const kinds = { facade: 'tunnel', alternate: 'alternate' };
    const template = { type: 'tunnel', size: [width, 41, depth], buildings: 20,
      source: 'house_tunnel_snake_generator.js', route: snake.route,
      boxes: mergeBoxes(Object.entries(snake.boxes).flatMap(([kind, boxes]) => boxes.map(b =>
        [b[0] - minX, b[1], b[2] - minZ, ...b.slice(3), kinds[kind] || kind]))) };
    template.ports = [0, snake.route.points.length - 1].map(i => {
      const p = snake.route.points[i], q = snake.route.points[i ? i - 1 : 1];
      const normal = [Math.sign(p.x - q.x), Math.sign(p.z - q.z)];
      const point = [p.x - minX, 0, p.z - minZ];
      // The negative endpoint occupies the preceding voxel on the block grid.
      if (normal[0] < 0) point[0]--;
      if (normal[1] < 0) point[2]--;
      return makePort(template, point, normal);
    }).filter(Boolean);
    if (template.ports.length === 2) { templates.push(template); break; }
  }
  for (const type of TYPES) {
    const template = templates.find(t => t.type === type);
    if (!template || template.ports.length < 2) throw new Error(`Entrees insuffisantes : ${type}`);
  }
  return templates;
}

function rotateBox(box, size, rotation) {
  let b = [...box], s = [...size];
  for (let i = 0; i < rotation; i++) {
    b = [s[2] - b[2] - b[5], b[1], b[0], b[5], b[4], b[3], b[6]];
    s = [s[2], s[1], s[0]];
  }
  return b;
}
function rotatedTemplate(template, rotation) {
  const size = rotation % 2 ? [template.size[2], template.size[1], template.size[0]] : template.size;
  const rotatePoint = p => rotateBox([...p, 1, 1, 1], template.size, rotation).slice(0, 3);
  return { ...template, size, rotation, ports: template.ports.map(port => {
    let normal = [...port.normal];
    for (let i = 0; i < rotation; i++) normal = [-normal[1], normal[0]];
    return { ...port, normal, p: rotatePoint(port.p), door: rotatePoint(port.door),
      cut: rotateBox(port.cut, template.size, rotation), deck: rotateBox(port.deck, template.size, rotation) };
  }) };
}
function translate(box, origin) { return box.map((v, i) => i < 3 ? v + origin[i] : v); }
function inWorld(b) {
  return [0, 1, 2].every(i => b[i] >= 0 && b[i] + b[i + 3] <= [WORLD.length, WORLD.height, WORLD.width][i]);
}

export function assembleDemo(seed, templates, count = 18) {
  const random = randomFor(seed);
  const choose = list => list[Math.floor(random() * list.length)];
  const variants = templates.flatMap(t => [0, 1, 2, 3].map(r => rotatedTemplate(t, r)));
  const sectors = [], links = [], connections = [];
  function place(t, origin) {
    const node = { id: sectors.length, type: t.type, name: `${LABELS[t.type]} ${sectors.filter(s => s.type === t.type).length + 1}`,
      bounds: [...origin, ...t.size], origin, template: t, used: new Set(), source: t.source,
      ports: t.ports.map(p => ({ ...p, p: translate(p.p, origin), door: translate(p.door, origin),
        cut: translate(p.cut, origin), deck: translate(p.deck, origin) })), buildings: t.buildings };
    sectors.push(node); return node;
  }
  place(variants.find(t => t.type === 'dense'), [2250, 50, 2250]);
  for (let n = 1; n < count; n++) {
    const type = TYPES[n % TYPES.length];
    let accepted = false;
    for (let attempt = 0; attempt < 2500 && !accepted; attempt++) {
      // Only the already connected dense network, main bridge or snake can carry transit.
      // The original courtyards and long buildings have independent rooms, so attach them as branches.
      const parent = choose(sectors.filter(s => ['dense', 'bridge', 'tunnel'].includes(s.type)));
      const available = parent.ports.map((p, i) => ({ ...p, i })).filter(p => !parent.used.has(p.i));
      if (!available.length) continue;
      const exit = choose(available);
      const t = choose(variants.filter(t => t.type === type));
      const entries = t.ports.map((p, i) => ({ ...p, i })).filter(p => p.normal[0] === -exit.normal[0] && p.normal[1] === -exit.normal[1]);
      if (!entries.length) continue;
      const entry = choose(entries), gap = 12 + Math.floor(random() * 25);
      const end = [exit.p[0] + exit.normal[0] * gap, exit.p[1], exit.p[2] + exit.normal[1] * gap];
      const origin = end.map((v, i) => v - entry.p[i]);
      const bounds = [...origin, ...t.size];
      if (!inWorld(bounds) || sectors.some(s => overlaps(s.bounds, bounds))) continue;
      const a = [exit.p[0] + exit.normal[0], exit.p[1], exit.p[2] + exit.normal[1]];
      const b = [end[0] - exit.normal[0], end[1], end[2] - exit.normal[1]];
      const deck = lineBox(a, b, 3);
      const clearance = [...deck]; clearance[4] = 4;
      if (!inWorld(clearance) || sectors.some(s => overlaps(s.bounds, clearance)) ||
          links.some(l => { const reserved = [...l]; reserved[4] = 4; return overlaps(reserved, bounds) || overlaps(reserved, clearance); })) continue;
      const node = place(t, origin);
      node.used.add(entry.i); parent.used.add(exit.i);
      links.push(deck);
      connections.push({ from: parent.id, to: node.id, fromPort: exit.i, toPort: entry.i, deck });
      accepted = true;
    }
  }
  if (new Set(sectors.map(s => s.type)).size !== TYPES.length) throw new Error('Assemblage incomplet : relancer avec une autre seed');
  for (const node of sectors) {
    const t = node.template;
    let boxes = t.boxes.map(b => translate(rotateBox(b, templates.find(v => v.type === t.type).size, t.rotation), node.origin));
    for (const i of node.used) {
      const port = node.ports[i];
      boxes = boxes.flatMap(b => subtract(b, port.cut));
      // A socket may reuse a floor already present in the original build.
      let additions = [port.deck];
      for (const box of boxes) if (overlaps(box, port.deck)) additions = additions.flatMap(b => subtract(b, box));
      boxes.push(...additions);
    }
    node.detail = boxes;
    node.coarse = boxes;
    const port = node.ports[[...node.used][0]];
    node.access = [...port.p];
    node.spawn = [port.p[0] + port.normal[0] * 4 + 0.5, port.p[1] + 3, port.p[2] + port.normal[1] * 4 + 0.5];
    node.viewTarget = [port.door[0] + 0.5, port.door[1] + 2.5, port.door[2] + 0.5];
    node.used = [...node.used];
    delete node.template;
  }
  return { world: WORLD, seed, sectors, roads: links, connections, edges: connections.map(c => [c.from, c.to]),
    buildings: sectors.reduce((sum, s) => sum + s.buildings, 0) };
}

export function generateDemo(seed, sources) {
  return assembleDemo(seed, buildTemplates(sources, seed));
}
