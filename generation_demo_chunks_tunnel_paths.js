// Simplify the main network before excavating it, while keeping every junction and entrance.
export function optimizeMainTunnelPaths({size,blocked,edges,terminals,heights,caps,step=16,clear}) {
  const adjacent=new Map(),key=(a,b)=>`${Math.min(a,b)},${Math.max(a,b)}`;
  for(const [a,b] of edges)for(const [u,v] of [[a,b],[b,a]]) {
    if(!adjacent.has(u))adjacent.set(u,[]);
    adjacent.get(u).push(v);
  }
  const anchors=new Set(terminals),visited=new Set(),chains=[];
  for(const [node,next] of adjacent)if(next.length!==2)anchors.add(node);
  for(const start of anchors)for(const next of adjacent.get(start)||[]) {
    if(visited.has(key(start,next)))continue;
    const nodes=[start];let previous=start,node=next;
    visited.add(key(previous,node));
    while(true) {
      nodes.push(node);if(anchors.has(node))break;
      const next=adjacent.get(node).find(n=>n!==previous);
      visited.add(key(node,next));previous=node;node=next;
    }
    chains.push(nodes);
  }
  const occupied=new Set(adjacent.keys()),point=(node,y)=>[(node%size)*step,y,Math.floor(node/size)*step];
  const direct=(a,b,xFirst)=>{
    const nodes=[a];let x=a%size,z=Math.floor(a/size);
    const end=[b%size,Math.floor(b/size)];
    for(const axis of xFirst?[0,1]:[1,0]) {
      while((axis===0?x:z)!==end[axis]) {
        if(axis===0)x+=Math.sign(end[0]-x);else z+=Math.sign(end[1]-z);
        nodes.push(z*size+x);
      }
    }
    return nodes;
  };
  function profile(nodes,startY,endY) {
    const last=nodes.length-1,maxStep=step/2;
    const direct=nodes.map((node,i)=>Math.round(startY+(endY-startY)*i/last));
    const fits=levels=>levels.every((y,i)=>i===0||Math.abs(y-levels[i-1])<=maxStep&&
      (!clear||clear(point(nodes[i-1],levels[i-1]),point(nodes[i],y))));
    // A structure below the passage does not require descending beneath it.
    if(clear&&fits(direct))return direct;
    const levels=direct.map((y,i)=>Math.min(caps?.[nodes[i]]??Infinity,y));
    // An obstacle may require a dip. Spread that descent instead of creating a vertical jump.
    for(let i=1;i<=last;i++)levels[i]=Math.min(levels[i],levels[i-1]+maxStep);
    for(let i=last-1;i>=0;i--)levels[i]=Math.min(levels[i],levels[i+1]+maxStep);
    if(levels[0]!==startY||levels[last]!==endY)return null;
    // Keep only the lowest dip required by clearance. Delay a climb if a later cap is lower.
    const pivot=levels.indexOf(Math.min(...levels));
    for(let i=1;i<=pivot;i++)levels[i]=Math.min(levels[i],levels[i-1]);
    for(let i=last-1;i>=pivot;i--)levels[i]=Math.min(levels[i],levels[i+1]);
    if(!fits(levels))return null;
    return levels;
  }
  const paths=[];
  for(const original of chains) {
    const start=original[0],end=original.at(-1),own=new Set(original),choices=[],seen=new Set();
    for(const nodes of [direct(start,end,true),direct(start,end,false),original]) {
      const signature=nodes.join(',');if(seen.has(signature))continue;seen.add(signature);
      if(nodes!==original&&nodes.some(node=>blocked[node]||occupied.has(node)&&!own.has(node)))continue;
      const levels=profile(nodes,heights[start],heights[end]);if(!levels)continue;
      const climb=levels.slice(1).reduce((sum,y,i)=>sum+Math.abs(y-levels[i]),0);
      let turns=0;
      for(let i=2;i<nodes.length;i++)if(nodes[i]-nodes[i-1]!==nodes[i-1]-nodes[i-2])turns++;
      choices.push({nodes,levels,climb,turns});
    }
    // Prefer avoiding unnecessary climbs, then the shortest plan and fewest bends.
    choices.sort((a,b)=>a.climb-b.climb||a.nodes.length-b.nodes.length||a.turns-b.turns);
    const chosen=choices[0]||{nodes:original,levels:original.map(node=>heights[node])};
    chosen.nodes.forEach(node=>occupied.add(node));
    paths.push({points:chosen.nodes.map((node,i)=>point(node,chosen.levels[i])),
      endpoints:[start,end],originalLength:(original.length-1)*step,
      originalClimb:original.slice(1).reduce((sum,node,i)=>sum+Math.abs(heights[node]-heights[original[i]]),0)});
  }
  return paths;
}

export function mainTunnelClearance(boxes,{radius=3,height=8}={}) {
  const buckets=new Map();
  function* keys(box) {
    for(let x=Math.floor(box[0]/64);x<=Math.floor((box[0]+box[3]-1)/64);x++)
      for(let y=Math.floor(box[1]/64);y<=Math.floor((box[1]+box[4]-1)/64);y++)
        for(let z=Math.floor(box[2]/64);z<=Math.floor((box[2]+box[5]-1)/64);z++)yield `${x},${y},${z}`;
  }
  for(const box of boxes)for(const key of keys(box)) {
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(box);
  }
  return (a,b)=>{
    const box=[Math.min(a[0],b[0])-radius,Math.min(a[1],b[1]),Math.min(a[2],b[2])-radius,
      Math.abs(a[0]-b[0])+radius*2+1,Math.abs(a[1]-b[1])+height,Math.abs(a[2]-b[2])+radius*2+1];
    for(const key of keys(box))for(const other of buckets.get(key)||[])
      if([0,1,2].every(i=>box[i]<other[i]+other[i+3]&&box[i]+box[i+3]>other[i]))return false;
    return true;
  };
}
