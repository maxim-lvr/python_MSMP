import {generateMegastructure} from './generation_megastructure.js';

const cache=new Map();
async function json(url) {
  if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}));
  return cache.get(url);
}
self.onmessage=async({data:{seed,density}})=>{
  try {
    const progress=progress=>self.postMessage({progress});
    progress('Chargement des modeles...');
    const templates=await json(`/api/demo-chunks-templates?seed=${seed}`);
    const models=[];
    for(const offset of [0,1])models.push(await json(`/api/demo-building-long?seed=${(seed+offset)>>>0}&length=960`));
    self.postMessage({result:generateMegastructure(seed,templates,models,progress,density)});
  }catch(error){self.postMessage({error:error.message});}
};
