import {generateWideOpenArea, AREA as OPEN_AREA} from './wide_open_area.js';
import {generateWideRestrictArea, AREA as RESTRICT_AREA} from './wide_restrict_area.js';
import {generateHouseWallUltraDense,ULTRA_DENSE} from './house_wall_ultra_dense.js';
import {addUltraDenseEntrances} from './house_wall_ultra_dense_access.js';

const ULTRA_PADDING=ULTRA_DENSE.roomDepth-1;
export const ULTRA_DENSE_AREA={length:ULTRA_DENSE.towerLength+2*(ULTRA_DENSE.gap+ULTRA_DENSE.wallThickness+ULTRA_PADDING),
  width:ULTRA_DENSE.towerWidth+2*(ULTRA_DENSE.gap+ULTRA_DENSE.wallThickness+ULTRA_PADDING),height:ULTRA_DENSE.height};

export const WIDE_COUNTS = {open: 2, restrict: 2};
const GAP = 160;

export function placeWideAreas(layout) {
  let state = (layout.seed ^ 0x57494445) >>> 0;
  const integer = (a, b) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return a + Math.floor(state / 4294967296 * (b - a + 1));
  };
  const s = layout.world.chunk;
  const occupied = layout.zones.map(z => [z.x * s, 0, z.z * s, z.width * s, layout.world.height, z.depth * s]);
  occupied.push(...(layout.buildingLong || []).map(z => z.box), ...(layout.snakes || []).flatMap(z => z.volumes));
  const areas = [];
  for (const [type, count] of Object.entries(layout.buildCounts?.wide||WIDE_COUNTS)) for (let index = 0; index < count; index++) {
    const size = type === 'open' ? OPEN_AREA : type==='ultra_dense'?
      {...ULTRA_DENSE_AREA,height:layout.ultraDenseHeight||ULTRA_DENSE_AREA.height}:RESTRICT_AREA;
    let area;
    for (let attempt = 0; attempt < 12000; attempt++) {
      const rotation = integer(0, 1), sx = rotation ? size.width : size.length, sz = rotation ? size.length : size.width;
      const x = integer(4, Math.floor((layout.world.length - sx - 128) / s)) * s;
      const z = integer(4, Math.floor((layout.world.width - sz - 128) / s)) * s;
      const y = Math.min(layout.world.height-size.height-8,16 + areas.length * 12), box = [x, y, z, sx, size.height, sz];
      const clearance=type==='ultra_dense'?64:16;
      if(layout.isSolidBox&&!layout.isSolidBox([x-clearance,0,z-clearance,sx+clearance*2,layout.world.height,sz+clearance*2]))continue;
      const gap = attempt < 3000 ? GAP : attempt < 8000 ? 96 : 64;
      if (occupied.some(b => x < b[0] + b[3] + gap && x + sx + gap > b[0] &&
        z < b[2] + b[5] + gap && z + sz + gap > b[2])) continue;
      area = {id: areas.length, index, type, seed: integer(0, 0xffffffff), rotation, box, size};
      break;
    }
    if (!area) throw Error(`Pas assez de place pour Wide ${type} ${index + 1}`);
    areas.push(area); occupied.push(area.box);
  }
  return areas;
}

export function populateWideArea(area) {
  let model;
  if(area.type==='ultra_dense') {
    const raw=addUltraDenseEntrances(generateHouseWallUltraDense(area.seed,{height:area.box[4]}),area.seed,ULTRA_PADDING);
    const shift=([x,y,z])=>[x+ULTRA_PADDING,y,z+ULTRA_PADDING];
    model={world:{...ULTRA_DENSE_AREA,height:area.box[4]},boxes:raw.boxes.map(b=>[...shift(b),...b.slice(3)]),
      spawn:shift(raw.spawn),lookAt:shift(raw.lookAt),stats:raw.stats,
      ports:raw.ports.map(p=>({...p,pos:shift(p.pos),entry:shift(p.entry)}))};
  }else model = area.type === 'open' ? generateWideOpenArea(area.seed) : generateWideRestrictArea(area.seed);
  const [ox, oy, oz] = area.box, width = model.world.width;
  const point = ([x, y, z]) => area.rotation ? [ox + width - z, oy + y, oz + x] : [ox + x, oy + y, oz + z];
  const boxes = model.boxes.map(([x, y, z, sx, sy, sz, kind]) => area.rotation ?
    [ox + width - z - sz, oy + y, oz + x, sz, sy, sx, `wide_${area.type}_${kind}`] :
    [ox + x, oy + y, oz + z, sx, sy, sz, `wide_${area.type}_${kind}`]);
  const pipe = model.details?.pipe;
  const pipePoints = pipe?.points.map(([x,y,z]) => area.rotation ? [ox+width-z-1,oy+y,oz+x] : [ox+x,oy+y,oz+z]);
  const voxel=([x,y,z])=>area.rotation?[ox+width-z-1,oy+y,oz+x]:[ox+x,oy+y,oz+z];
  const ports=(model.ports||[]).map(p=>({...p,ultraDense:area.id,pos:voxel(p.pos),entry:voxel(p.entry),
    normal:area.rotation?[-p.normal[2],0,p.normal[0]]:p.normal}));
  return {...area, boxes, spawn: point(model.spawn), lookAt: point(model.lookAt), stats: model.stats,
    ports,pipe: pipePoints?.length ? {points:pipePoints,radius:pipe.radius} : null};
}
