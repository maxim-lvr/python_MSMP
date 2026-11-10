// Simultaneous weighted growth from every entrance, then a spanning tree of
// neighbouring regions. Paths join locally instead of all converging on one origin.
export function localTunnelNetwork(size, blocked, terminals, seed, allowDisconnected=false) {
  const roots=[...new Set(terminals)],length=blocked.length;
  const distance=new Float64Array(length).fill(Infinity);
  const owner=new Int32Array(length).fill(-1),parent=new Int32Array(length).fill(-1);
  const heap=[];
  function push(node,cost) {
    const item={node,cost};let i=heap.length;heap.push(item);
    while(i>0){const p=(i-1)>>1;if(heap[p].cost<=cost)break;heap[i]=heap[p];i=p;}heap[i]=item;
  }
  function pop() {
    const first=heap[0],last=heap.pop();
    if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;
      if(heap[c].cost>=last.cost)break;heap[i]=heap[c];i=c;}heap[i]=last;}
    return first;
  }
  const hash=(x,z,salt=0)=>{
    let n=(Math.imul(x,374761393)^Math.imul(z,668265263)^seed^salt)>>>0;
    n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
  };
  const noise=(x,z,scale,salt)=>{
    const gx=Math.floor(x/scale),gz=Math.floor(z/scale);
    let u=x/scale-gx,v=z/scale-gz;u=u*u*(3-2*u);v=v*v*(3-2*v);
    return (hash(gx,gz,salt)*(1-u)+hash(gx+1,gz,salt)*u)*(1-v)+
      (hash(gx,gz+1,salt)*(1-u)+hash(gx+1,gz+1,salt)*u)*v;
  };
  const neighbours=id=>{
    const result=[],x=id%size,z=Math.floor(id/size);
    if(x>0)result.push(id-1);if(x<size-1)result.push(id+1);
    if(z>0)result.push(id-size);if(z<size-1)result.push(id+size);
    return result;
  };
  const terrain=new Float64Array(length);
  for(let id=0;id<length;id++)if(!blocked[id]) {
    const x=id%size,z=Math.floor(id/size);
    terrain[id]=1+32*noise(x,z,13,173)**3+12*noise(x,z,5,937)**2+hash(x,z,71)*3;
    if(neighbours(id).some(n=>blocked[n]))terrain[id]+=7;
  }
  roots.forEach((id,i)=>{
    if(blocked[id])throw Error('Blocked tunnel entrance');
    distance[id]=0;owner[id]=i;push(id,0);
  });
  while(heap.length) {
    const {node,cost}=pop();if(cost!==distance[node])continue;
    for(const next of neighbours(node))if(!blocked[next]) {
      const candidate=cost+(terrain[node]+terrain[next])/2;
      if(candidate<distance[next]) {
        distance[next]=candidate;owner[next]=owner[node];parent[next]=node;push(next,candidate);
      }
    }
  }
  const contacts=new Map();
  for(let a=0;a<length;a++)if(owner[a]>=0)for(const b of neighbours(a))if(b>a&&owner[b]>=0&&owner[b]!==owner[a]) {
    const ra=owner[a],rb=owner[b],key=`${Math.min(ra,rb)},${Math.max(ra,rb)}`;
    const cost=distance[a]+distance[b]+(terrain[a]+terrain[b])/2;
    if(!contacts.has(key)||cost<contacts.get(key).cost)contacts.set(key,{a,b,ra,rb,cost});
  }
  const components=roots.map((_,i)=>i);
  const find=id=>{while(components[id]!==id){components[id]=components[components[id]];id=components[id];}return id;};
  const edges=[],edgeKeys=new Set();
  const add=(a,b)=>{
    const key=Math.min(a,b)*length+Math.max(a,b);
    if(edgeKeys.has(key))return false;edgeKeys.add(key);edges.push([a,b]);return true;
  };
  const branch=start=>{let id=start;while(parent[id]>=0){const next=parent[id];if(!add(id,next))break;id=next;}};
  let joins=0;
  for(const contact of [...contacts.values()].sort((a,b)=>a.cost-b.cost)) {
    const a=find(contact.ra),b=find(contact.rb);if(a===b)continue;
    components[a]=b;joins++;branch(contact.a);branch(contact.b);add(contact.a,contact.b);
  }
  if(!allowDisconnected&&joins!==roots.length-1)throw Error('Disconnected entrance regions');
  const adjacent=new Map();
  for(const [a,b] of edges)for(const [u,v] of [[a,b],[b,a]]) {
    if(!adjacent.has(u))adjacent.set(u,[]);adjacent.get(u).push(v);
  }
  const starts=allowDisconnected?[...new Map(roots.map((node,i)=>[find(i),node])).values()]:[roots[0]];
  const parents=new Int32Array(length).fill(-1),order=[...starts],seen=new Set(order);
  for(let i=0;i<order.length;i++)for(const next of adjacent.get(order[i])||[])if(!seen.has(next)) {
    seen.add(next);parents[next]=order[i];order.push(next);
  }
  if(roots.some(id=>!seen.has(id)))throw Error('Missing entrance connection');
  return {edges,parents,order,roots:starts};
}
