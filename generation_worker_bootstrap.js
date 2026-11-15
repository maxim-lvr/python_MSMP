// Generator modules load only after reading the source manifest. Every run uses a fresh worker.
export function createGenerationWorker(mode) {
  self.onmessage=async({data:settings})=>{
    let prepared;
    const manifest=async()=>{
      const response=await fetch(`/api/generation-manifest?mode=${mode}`,{cache:'no-store'});
      if(!response.ok)throw Error(`Versions de generation : HTTP ${response.status}`);return response.json();
    };
    try {
      self.postMessage({progress:'Verification des regles et des structures...'});
      const before=await manifest();
      const {prepareGeneration}=await import(`./generation_pipeline.js?revision=${before.version}`);
      if((await manifest()).version!==before.version){self.postMessage({stale:true});return;}
      prepared=await prepareGeneration(before,settings,progress=>self.postMessage({progress}));
      // No cache entry becomes readable if a source or structure changed during this run.
      if((await manifest()).version!==before.version){
        await prepared.cache.abort();self.postMessage({stale:true});return;
      }
      await prepared.cache.commit();self.postMessage({result:prepared.result});
    }catch(error){
      if(prepared)await prepared.cache.abort();
      console.error(error);self.postMessage(error.stale?{stale:true}:{error:error.message});
    }finally{prepared?.cache.close();}
  };
}
