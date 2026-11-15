import {runSkinTask} from './generation_demo_chunks_skin.js';
import {populateWideArea} from './generation_demo_chunks_wide.js';
import {populateBuildingLong} from './generation_demo_chunks_building_long.js';
import {createPipePlanner,planPipeSlot,commitPipeProposal} from './generation_demo_chunks_pipe_accesses.js';

let pipePlanner;
self.onmessage=({data:{id,type,payload}})=>{
  try {
    let result,transfer=[];
    if(type==='skin') {result=runSkinTask(payload);transfer=[result.runs.buffer];if(result.tunnel)transfer.push(result.tunnel.buffer,result.dense.buffer);}
    else if(type==='wide')result=populateWideArea(payload);
    else if(type==='building')result=populateBuildingLong(payload.zone,payload.template);
    else if(type==='pipeInit'){pipePlanner=createPipePlanner(payload);result=true;}
    else if(type==='pipeSlot')result=planPipeSlot(pipePlanner,payload.index,payload.extra);
    else if(type==='pipeCommit'){for(const proposal of payload)commitPipeProposal(pipePlanner,proposal,false);result=true;}
    else throw Error(`Unknown generation task: ${type}`);
    self.postMessage({id,result},transfer);
  }catch(error){self.postMessage({id,error:error.message});}
};
