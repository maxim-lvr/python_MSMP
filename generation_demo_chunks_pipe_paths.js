export const PIPE_MIN_SPACING = 32;
const distance = (a,b) => a.reduce((sum,n,i) => sum+Math.abs(n-b[i]),0);

export function compactPipePath(points) {
  const result=[];
  for(const point of points) {
    if(result.length&&distance(result.at(-1),point)===0)continue;
    while(result.length>1) {
      const a=result.at(-2),b=result.at(-1);
      if(![0,1,2].some(axis=>[0,1,2].every(i=>i===axis||a[i]===b[i]&&b[i]===point[i])))break;
      result.pop();
    }
    if(result.length&&distance(result.at(-1),point)===0)continue;
    result.push([...point]);
  }
  return result;
}

export function pipePathSegments(points) {
  return points.slice(1).map((b,i)=>({a:points[i],b,axis:[0,1,2].find(j=>points[i][j]!==b[j])}));
}

export function pipeSegmentDistanceSquared(a,b) {
  return [0,1,2].reduce((sum,i)=>sum+Math.max(0,
    Math.min(a.a[i],a.b[i])-Math.max(b.a[i],b.b[i]),
    Math.min(b.a[i],b.b[i])-Math.max(a.a[i],a.b[i]))**2,0);
}

export function pointOnPipePaths(point,paths) {
  return paths.some(path=>pipePathSegments(path).some(({a,b})=>point.every((n,i)=>
    n>=Math.min(a[i],b[i])&&n<=Math.max(a[i],b[i]))));
}

export function validPipePath(points,spacing=PIPE_MIN_SPACING) {
  if(points.length<2||points.some(p=>p.length!==3||!p.every(Number.isSafeInteger)))return false;
  const segments=pipePathSegments(points);
  for(const {a,b} of segments)if(a.filter((n,i)=>n!==b[i]).length!==1||distance(a,b)<spacing)return false;
  for(let i=0;i<segments.length;i++)for(let j=i+2;j<segments.length;j++)
    if(pipeSegmentDistanceSquared(segments[i],segments[j])<spacing**2)return false;
  return true;
}

export function validPipeConnection(points,paths,startAttached=true) {
  if(!validPipePath(points))return false;
  if(startAttached&&!pointOnPipePaths(points[0],paths))return false;
  if(!pointOnPipePaths(points.at(-1),paths))return false;
  if(distance(points[0],points.at(-1))<PIPE_MIN_SPACING*2)return false;
  const existing=paths.flatMap(pipePathSegments);
  for(const segment of pipePathSegments(points))for(const other of existing) {
    const squared=pipeSegmentDistanceSquared(segment,other);
    // Exact intersections are real junctions; nearby disconnected shells are not.
    if(squared>0&&squared<PIPE_MIN_SPACING**2)return false;
  }
  return true;
}
