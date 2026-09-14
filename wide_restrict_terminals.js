import {overlaps, subtract} from './generation_demo_generator.js';

export function addRestrictTerminals(data, coreEnd) {
  const {boxes, rooms, buildings, connections, doors, stairs} = data;
  const left = buildings.filter(b => b.side === 0).at(-1);
  const right = buildings.filter(b => b.side === 1).at(-1);
  const center = Math.floor((left.rooms[0].front + right.rooms[0].front) / 2);
  const front = coreEnd + 16, back = data.world.length - 8, height = 229;
  const bayLow = center - 12, bayHigh = center + 14;
  const aX = coreEnd + 2, bX = coreEnd + 8, zA = center - 6, zB = zA + 11;
  const building = {id: buildings.length, terminal: true, side: 1, rooms: []};
  const cuts = [], terminalBoxes = [];
  const add = (x, y, z, sx, sy, sz, kind) => terminalBoxes.push([x, y, z, sx, sy, sz, kind]);
  const link = (a, b, kind) => connections.push({a: a.id, b: b.id, kind});

  const endWall = [7, 1, 188, 1, data.world.height - 1, 224, 'wall'];
  boxes.push(endWall);
  // Two solid wings frame a recessed stair court, leaving the central flight visible.
  add(coreEnd, 1, 188, 16, height, bayLow - 188, 'mass_dark');
  add(coreEnd, 1, bayHigh, 16, height, 412 - bayHigh, 'mass_dark');
  for (let level = 0; level < 19; level++) {
    const y = 1 + level * 12;
    const room = {id: rooms.length, building: building.id, terminal: true, side: 1, level,
      x: front, y, z: 188, sx: back - front, sz: 224, front: 188, cuts: []};
    rooms.push(room); building.rooms.push(room);
    add(front, y, 188, back - front, 1, 224, 'floor');
    add(front, y + 1, 188, 1, 11, 224, 'wall');
    add(back - 1, y + 1, 188, 1, 11, 224, 'wall');
    add(front + 1, y + 1, 188, back - front - 2, 11, 1, 'wall');
    add(front + 1, y + 1, 411, back - front - 2, 11, 1, 'wall');
    const door = [front, y + 1, zB, 1, 3, 3];
    doors.push(door); cuts.push(door);
    add(aX, y, zB, front - aX, 1, 3, 'bridge');
    add(bX, y, zA - 2, 5, 1, zB - zA + 2, 'bridge');
    add(aX, y, zA - 2, bX - aX, 1, 2, 'bridge');
    // The return gallery is beside the flight, never directly above the next steps.
    if (level < 18) {
      const points = [];
      for (let i = 0; i < 11; i++) {
        add(aX, y + i + 1, zA + i, 5, 1, 1, 'stair');
        points.push([aX + 2, y + i + 1, zA + i]);
      }
      stairs.push({a: room.id, b: room.id + 1, terminal: true, points, landing: [aX + 2, y + 12, zB]});
    }
    for (const [source, z] of [[left, 226], [right, 370]]) {
      const neighbor = source.rooms[level];
      if (!neighbor) continue;
      const tunnel = [coreEnd - 1, y + 1, z, front - coreEnd + 2, 3, 3];
      cuts.push(tunnel); doors.push(tunnel); link(neighbor, room, 'door');
    }
  }
  add(front, height, 188, back - front, 1, 224, 'floor');
  for (let i = 1; i < building.rooms.length; i++) link(building.rooms[i - 1], building.rooms[i], 'stair');
  // Carve the wing corridors through both endpoint walls, keeping their floors intact.
  for (const hole of cuts) for (let i = boxes.length - 1; i >= 0; i--) {
    if (overlaps(boxes[i], hole)) boxes.splice(i, 1, ...subtract(boxes[i], hole));
  }
  for (const box of terminalBoxes) {
    let parts = [box];
    for (const hole of cuts) parts = parts.flatMap(part => subtract(part, hole));
    boxes.push(...parts);
  }
  buildings.push(building);
  data.endWall = endWall;
  data.terminal = {building: building.id, center, bayLow, bayHigh, front, coreEnd};
  data.stats = {...data.stats, buildings: buildings.length, rooms: rooms.length, stairs: stairs.length,
    featured: rooms.filter(room => room.featured).length};
}
