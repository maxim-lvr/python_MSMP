import {localTunnelNetwork} from './generation_demo_chunks_network.js';
import {mergeBoxes, overlaps, subtract} from './generation_demo_generator.js';
import {expandPipeNetwork} from './generation_demo_chunks_pipe_network.js';
import {snakeAccessPlans} from './generation_demo_chunks_snake_ports.js';
import {compactPipePath as simplify} from './generation_demo_chunks_pipe_paths.js';

export const GLOBAL_PIPE_RADIUS = 6;
const BORE = 4, BAND_RADIUS = 8, CLEARANCE = 10, STEP = 64;
const distance = (a, b) => a.reduce((sum, n, i) => sum + Math.abs(n - b[i]), 0);
const segmentBox = (a, b, radius) => [...a.map((v, i) => Math.min(v, b[i]) - radius),
  ...a.map((v, i) => Math.abs(v - b[i]) + radius * 2 + 1)];

export function generatePipeTrunk(layout) {
  let state = (layout.seed ^ 0x50495045) >>> 0;
  const integer = (a, b) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return a + Math.floor(state / 4294967296 * (b - a + 1));
  };
  const {world} = layout, top = world.height - 12;
  const obstacles = [...layout.zones.map(z => [z.x * 32 - 80, 0, z.z * 32 - 80, z.width * 32 + 160, world.height, z.depth * 32 + 160]),
    ...(layout.buildingLong || []).map(z => z.box), ...(layout.wideAreas || []).map(z => z.box),
    ...(layout.settlements || []).flatMap(z => [z.box,...(z.accessVolumes||[])]),
    ...(layout.pipeAccessReservations || [])];
  const snakes = (layout.snakes || []).flatMap(s => s.volumes);
  const clear = (a, b) => {
    const axis = [0, 1, 2].find(i => a[i] !== b[i]), limits = [world.length, world.height, world.width];
    if (axis !== undefined && a.some((n, i) => i !== axis && (n < CLEARANCE || n + CLEARANCE >= limits[i]))) return false;
    return ![...obstacles, ...snakes].some(box => overlaps(segmentBox(a, b, CLEARANCE), box));
  };
  const size = Math.ceil((Math.max(world.length, world.width) - 1) / STEP) + 1;
  const point = id => [Math.min(world.length - 1, (id % size) * STEP), top,
    Math.min(world.width - 1, Math.floor(id / size) * STEP)];
  const blocked = new Uint8Array(size * size);
  for (let id = 0; id < blocked.length; id++) {
    const p = point(id), r = STEP / 2 + CLEARANCE;
    if (obstacles.some(b => overlaps([p[0] - r, top-CLEARANCE, p[2] - r, r * 2 + 1, CLEARANCE*2+1, r * 2 + 1], b))) blocked[id] = 1;
  }
  let route;
  for (let attempt = 0; attempt < 48 && !route; attempt++) {
    const acrossX = attempt < 32, a = integer(3, size - 4), b = integer(3, size - 4);
    const start = acrossX ? a * size : a, end = acrossX ? b * size + size - 1 : (size - 1) * size + b;
    if (blocked[start] || blocked[end]) continue;
    try {
      const network = localTunnelNetwork(size, blocked, [start, end], state);
      const path = [];
      for (let id = end; id !== -1; id = network.parents[id]) path.push(point(id));
      path.reverse();
      const short = [path[0]];
      for (let i = 0; i < path.length - 1;) {
        let chosen;
        for (let j = path.length - 1; j > i; j--) {
          const a = path[i], b = path[j];
          for (const corner of [[a[0], top, b[2]], [b[0], top, a[2]]]) {
            if (clear(a, corner) && clear(corner, b)) { chosen = {j, corner}; break; }
          }
          if (chosen) break;
        }
        if (!chosen) break;
        short.push(chosen.corner, path[chosen.j]); i = chosen.j;
      }
      if (distance(short.at(-1), path.at(-1)) === 0) route = simplify(short);
    } catch { /* Try a different pair of map edges if this component is closed. */ }
  }
  if (!route) throw Error('Aucun passage disponible pour le grand tuyau');

  // Replace portions of long runs with low sections, keeping vertical risers away from snakes.
  const points = [route[0]];
  let drops = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], axis = a[0] !== b[0] ? 0 : 2;
    const length = distance(a, b), sign = Math.sign(b[axis] - a[axis]);
    let detour;
    if (drops < 3 && length >= 384) for (let attempt = 0; attempt < 36 && !detour; attempt++) {
      const start = integer(64, Math.max(64, length - 320)), end = Math.min(length - 64, start + integer(256, Math.max(256, length - start - 64)));
      const entry = [...a], exit = [...a]; entry[axis] += start * sign; exit[axis] += end * sign;
      const y = [72, 144, 216][(drops + attempt) % 3], lowA = [...entry], lowB = [...exit]; lowA[1] = lowB[1] = y;
      if (clear(entry, lowA) && clear(lowA, lowB) && clear(lowB, exit)) detour = [entry, lowA, lowB, exit];
    }
    if (detour) { points.push(...detour); drops++; }
    points.push(b);
  }
  const path = simplify(points);
  const limits = [world.length, world.height, world.width];
  const volumes = path.slice(1).map((b, i) => {
    const box = segmentBox(path[i], b, CLEARANCE), min = box.slice(0, 3).map(n => Math.max(0, n));
    return [...min, ...min.map((n, axis) => Math.min(limits[axis], box[axis] + box[axis + 3]) - n)];
  });
  return {points: path, volumes, boxes: pipeBoxes(path, world), radius: GLOBAL_PIPE_RADIUS, bore: BORE,
    length: path.slice(1).reduce((sum, b, i) => sum + distance(path[i], b), 0), drops};
}

export function pipeBoxes(points, world) {
  return pipeNetworkBoxes([points], world);
}

export function generateGlobalPipe(layout,progress=()=>{}) {
  // Entrances take priority over decorative pipes, including their vertical access shafts.
  const plans = snakeAccessPlans({...layout, globalPipe:null}, [], [], []);
  const pipeAccessReservations = plans.flatMap(plan => [
    [plan.x-2,0,plan.z-2,5,layout.world.height,5],
    ...plan.points.slice(1).map((b,i) => {
      const a=plan.points[i];
      return [Math.min(a[0],b[0])-1,plan.door[1]-1,Math.min(a[1],b[1])-1,
        Math.abs(a[0]-b[0])+3,4,Math.abs(a[1]-b[1])+3];
    }),
  ]);
  const reservedLayout = {...layout, pipeAccessReservations};
  const network = expandPipeNetwork(reservedLayout, generatePipeTrunk(reservedLayout),progress);
  return {...network, length:pipeNetworkSegments(network.paths).reduce((sum,s)=>sum+s.hi-s.lo,0),
    boxes:pipeNetworkBoxes(network.paths, layout.world)};
}

export function pipeNetworkSegments(paths) {
  const groups = new Map();
  for(const points of paths)for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],axis=[0,1,2].find(n=>a[n]!==b[n]);
    if(axis===undefined)continue;
    const key=`${axis}:${a.filter((_,n)=>n!==axis).join(',')}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({a:[...a],b:[...b],axis,lo:Math.min(a[axis],b[axis]),hi:Math.max(a[axis],b[axis])});
  }
  const segments=[];
  for(const group of groups.values()) {
    group.sort((a,b)=>a.lo-b.lo);let last;
    for(const s of group) {
      if(last&&s.lo<=last.hi){last.hi=Math.max(last.hi,s.hi);last.b[last.axis]=last.hi;}
      else {s.a[s.axis]=s.lo;s.b[s.axis]=s.hi;segments.push(s);last=s;}
    }
  }
  return segments;
}

export function* pipeBoreBoxes(paths) {
  for(const {a,axis,lo,hi} of pipeNetworkSegments(paths)) {
    const cross=[0,1,2].filter(i=>i!==axis);
    for(let u=-BORE;u<=BORE;u++)for(let v=-BORE;v<=BORE;v++)if(u*u+v*v<=BORE*BORE) {
      const p=[...a],size=[1,1,1];
      p[axis]=lo;p[cross[0]]+=u;p[cross[1]]+=v;size[axis]=hi-lo+1;
      yield [...p,...size];
    }
  }
  const joints=new Map();
  for(const path of paths)for(const p of path.slice(1,-1))joints.set(p.join(','),p);
  for(const p of joints.values())for(let y=-BORE;y<=BORE;y++)for(let z=-BORE;z<=BORE;z++) {
    if(y*y+z*z>BORE*BORE)continue;
    const x=Math.floor(Math.sqrt(BORE*BORE-y*y-z*z));
    yield [p[0]-x,p[1]+y,p[2]+z,x*2+1,1,1];
  }
}

export function pipeNetworkBoxes(paths, world) {
  const segments=pipeNetworkSegments(paths), jointMap=new Map();
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++) {
    const a=segments[i],b=segments[j];if(a.axis===b.axis)continue;
    const third=3-a.axis-b.axis;if(a.a[third]!==b.a[third])continue;
    const p=[...a.a];p[a.axis]=b.a[a.axis];p[b.axis]=a.a[b.axis];
    if(p[a.axis]>=a.lo&&p[a.axis]<=a.hi&&p[b.axis]>=b.lo&&p[b.axis]<=b.hi)jointMap.set(p.join(','),p);
  }
  const boxes = [], radius = GLOBAL_PIPE_RADIUS, joints = [...jointMap.values()];
  const jointBoxes = joints.map(p => [...p.map(n => n - BAND_RADIUS), ...Array(3).fill(BAND_RADIUS * 2 + 1)]);
  const limits = [world.length, world.height, world.width];
  const boreBuckets = new Map();
  function* boreKeys(box) {
    for (let x = Math.floor(box[0]/128); x <= Math.floor((box[0]+box[3]-1)/128); x++)
      for (let y = Math.floor(box[1]/128); y <= Math.floor((box[1]+box[4]-1)/128); y++)
        for (let z = Math.floor(box[2]/128); z <= Math.floor((box[2]+box[5]-1)/128); z++) yield `${x},${y},${z}`;
  }
  for (const segment of segments) for (const key of boreKeys(segmentBox(segment.a,segment.b,BORE))) {
    if (!boreBuckets.has(key)) boreBuckets.set(key,[]);
    boreBuckets.get(key).push(segment);
  }
  const emit = box => {
    const min = box.slice(0, 3).map(n => Math.max(0, n));
    const size = min.map((n, i) => Math.min(limits[i], box[i] + box[i + 3]) - n);
    if (!size.every(n => n > 0)) return;
    let parts = [[...min, ...size, box[6]]];
    // Taller maps can bring separate branches within one pipe radius of each other.
    // Carve every bore from the combined shells, including near parallel branches.
    const nearby = new Set();
    for (const key of boreKeys(parts[0])) for (const segment of boreBuckets.get(key)||[]) nearby.add(segment);
    for (const {a,axis,lo,hi} of nearby) {
      if (min[axis] > hi || min[axis] + size[axis] <= lo) continue;
      const cross = [0,1,2].filter(i => i !== axis);
      const distanceSquared = cross.reduce((sum,i) => sum + Math.max(0,
        min[i] - a[i], a[i] - min[i] - size[i] + 1) ** 2, 0);
      if (distanceSquared > BORE * BORE) continue;
      const [u,v] = cross;
      for (let x = Math.max(min[u],a[u]-BORE); x < Math.min(min[u]+size[u],a[u]+BORE+1); x++)
        for (let y = Math.max(min[v],a[v]-BORE); y < Math.min(min[v]+size[v],a[v]+BORE+1); y++) {
          if ((x-a[u])**2 + (y-a[v])**2 > BORE * BORE) continue;
          const p = [...a], extent = [1,1,1];
          p[axis] = lo; p[u] = x; p[v] = y; extent[axis] = hi-lo+1;
          parts = parts.flatMap(part => subtract(part,[...p,...extent]));
        }
      if (!parts.length) break;
    }
    boxes.push(...parts);
  };
  for (const {a,b,axis} of segments) {
    const cuts=jointBoxes.filter(box=>overlaps(box,segmentBox(a,b,BAND_RADIUS)));
    const cross = [0, 1, 2].filter(n => n !== axis), length = distance(a, b);
    for (let u = -BAND_RADIUS; u <= BAND_RADIUS; u++) for (let v = -BAND_RADIUS; v <= BAND_RADIUS; v++) {
      const d = u * u + v * v;
      if (d <= BORE * BORE || d > BAND_RADIUS * BAND_RADIUS) continue;
      const origin = [...a]; origin[axis] = Math.min(a[axis], b[axis]); origin[cross[0]] += u; origin[cross[1]] += v;
      const runs = [];
      if (d <= radius * radius) runs.push([0, length + 1, 'global_pipe']);
      else for (let step = 32; step < length - 16; step += 96) runs.push([step, 3, 'global_pipe_band']);
      for (const [offset, count, kind] of runs) {
        const min = [...origin], size = [1, 1, 1]; min[axis] += offset; size[axis] = count;
        let parts = [[...min, ...size, kind]];
        for (const joint of cuts) parts = parts.flatMap(part => subtract(part, joint));
        parts.forEach(emit);
      }
    }
  }
  // Only elbows need individual voxels: union both cylinders and bores before emitting.
  const emitted = new Set();
  for (const joint of joints) {
    const nearby=segments.filter(({a,b})=>overlaps(segmentBox(a,b,radius),[...joint.map(n=>n-BAND_RADIUS),17,17,17]));
    for (let dx = -BAND_RADIUS; dx <= BAND_RADIUS; dx++)
    for (let dy = -BAND_RADIUS; dy <= BAND_RADIUS; dy++) for (let dz = -BAND_RADIUS; dz <= BAND_RADIUS; dz++) {
      const p = [joint[0] + dx, joint[1] + dy, joint[2] + dz], key = p.join(',');
      if (emitted.has(key)) continue; emitted.add(key);
      let d = Infinity;
      for (const {a,b} of nearby) {
        const squared = p.reduce((sum, n, axis) => {
          const closest = Math.max(Math.min(a[axis], b[axis]), Math.min(Math.max(a[axis], b[axis]), n));
          return sum + (n - closest) ** 2;
        }, 0);
        d = Math.min(d, squared);
      }
      if (d > BORE * BORE && d <= radius * radius) emit([...p, 1, 1, 1, 'global_pipe']);
    }
  }
  return mergeBoxes(boxes);
}
