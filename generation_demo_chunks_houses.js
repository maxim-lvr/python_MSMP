import {populateChunkCore} from './generation_demo_chunks_population.js';
import {connectPipeTunnels,connectPipeTunnelsParallel} from './generation_demo_chunks_pipe_accesses.js';
export {DENSE_ROOM_COUNT,DENSE_ROOMS_PER_SECTOR,NETWORK_FLOOR} from './generation_demo_chunks_population.js';

export function finishChunkPopulation(data,progress=()=>{}) {
  return connectPipeTunnels(data,progress);
}

export function populateChunks(layout,templates,count,diagnostics=false,density=null,progress=()=>{}) {
  return finishChunkPopulation(populateChunkCore(layout,templates,count,diagnostics,density,progress),progress);
}

export function finishChunkPopulationParallel(data,pool,progress=()=>{}) {
  return connectPipeTunnelsParallel(data,pool,progress);
}
