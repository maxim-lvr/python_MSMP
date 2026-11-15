export function zoneVolume(zone,world,padding=0) {
  return [zone.x*32-padding,zone.y??0,zone.z*32-padding,zone.width*32+padding*2,
    zone.height??world.height,zone.depth*32+padding*2];
}

export function verticalNear(a,b,gap=0) {
  return a[1]<b[1]+b[4]+gap&&a[1]+a[4]+gap>b[1];
}

export function buildingAltitude(layout,index,height,integer) {
  const low=16,high=Math.max(low,layout.world.height-height-16);
  const band=index%4;
  return integer(Math.round(low+(high-low)*band/4),Math.round(low+(high-low)*(band+1)/4));
}

export function networkLevels(layout) {
  const step=layout.networkLevelStep||96,levels=[];
  for(let y=step/2;y<layout.world.height-16;y+=step)levels.push(y);
  if(levels.at(-1)<layout.world.height-48)levels.push(layout.world.height-24);
  return levels;
}

export function nearestNetworkLevel(layout,y) {
  const levels=networkLevels(layout).filter(level=>Math.abs(level-y)>=8);
  return levels.reduce((a,b)=>Math.abs(b-y)<Math.abs(a-y)?b:a);
}
