import {GenerationPool} from '../generation_parallel.js';
import {prepareGeneration} from '../generation_pipeline.js';
const originalFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(url,options)=>originalFetch(typeof url==='string'&&url.startsWith('./')?'/'+url.slice(2):url,options);
let pool;
setInterval(()=>self.postMessage({diagnostic:pool?{pending:[...pool.jobs.values()].map(j=>({type:j.type,index:j.payload?.index,cells:j.payload?.air?.length})),queued:pool.queue.length}:null}),5000);
self.onmessage=async({data:settings})=>{
 try {
  const manifest=await (await fetch('/api/generation-manifest?mode=noise',{cache:'no-store'})).json();
  const prepared=await prepareGeneration(manifest,settings,progress=>self.postMessage({progress}),{store:null,poolFactory:(count,revision)=>pool=new GenerationPool(count,revision)});
  const {world,stats,loading}=prepared.result;
  self.postMessage({result:{world,stats,loading}});prepared.cache.close();
 }catch(error){self.postMessage({error:error.stack});}
};
