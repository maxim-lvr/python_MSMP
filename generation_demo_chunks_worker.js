import { generateChunks } from './generation_demo_chunks_generator.js';
import { populateChunks } from './generation_demo_chunks_houses.js';

self.onmessage=async ({data})=>{
  try {
    const response=await fetch(`/api/demo-chunks-templates?seed=${data.seed}`);
    if(!response.ok)throw Error(`Maisons : HTTP ${response.status}`);
    const result=populateChunks(generateChunks(data.seed),await response.json(),data.count,false,data.density);
    self.postMessage({result});
  } catch(error) { self.postMessage({error:error.message}); }
};
