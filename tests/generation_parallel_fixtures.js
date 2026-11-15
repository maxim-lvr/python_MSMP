import {mapWorld} from '../world_config.js';
import {pipeNetworkBoxes} from '../generation_demo_chunks_pipe.js';
import {subtract} from '../generation_demo_generator.js';

const contains=(b,p)=>p.every((n,i)=>n>=b[i]&&n<b[i]+b[i+3]);
function shell([x,y,z,sx,sy,sz],kind='dense') {
  return [[x,y,z,sx,1,sz,kind],[x,y+sy-1,z,sx,1,sz,kind],
    [x,y+1,z,sx,sy-2,1,kind],[x,y+1,z+sz-1,sx,sy-2,1,kind],
    [x,y+1,z+1,1,sy-2,sz-2,kind],[x+sx-1,y+1,z+1,1,sy-2,sz-2,kind]];
}
export function pipeFixture(floor=97) {
  const world=mapWorld(2048),paths=[[[0,100,1024],[2047,100,1024]],
    [[1800,100,1024],[1800,280,1024],[2047,280,1024]]];
  const routes=[{a:[32,floor,1080],b:[2016,floor,1080],main:true},
    {a:[127,floor,1080],b:[127,floor,1101]},
    {a:[1824,277,1080],b:[2016,277,1080],main:true}];
  const room={id:0,box:[120,floor,1100,14,7,12],doors:[[127,floor+1,1100]]};
  let boxes=[...shell([32,floor,1077,1985,8,7],'main_tunnel'),
    ...shell([1824,277,1077,193,8,7],'main_tunnel'),...shell(room.box),
    [127,floor,1080,1,1,22,'tunnel'],[126,floor+1,1084,1,2,16,'tunnel'],
    [128,floor+1,1084,1,2,16,'tunnel'],[127,floor+3,1084,1,1,16,'tunnel']];
  boxes=boxes.flatMap(b=>subtract(b,[127,floor+1,1080,1,2,22]));
  return {seed:42,world,denseRooms:[room],houses:[],zones:[],snakes:[],buildingLong:[],wideAreas:[],settlements:[],
    routes,growthConnections:[],shafts:[],mainGalleries:{interiors:[
      [32,floor+1,1078,1985,6,5],[1824,278,1078,193,6,5]]},
    air:new Set(),ladderBoxes:[],wallGroups:[],networkBoxes:boxes,stats:{},
    globalPipe:{paths,boxes:pipeNetworkBoxes(paths,world),visits:[]}};
}
