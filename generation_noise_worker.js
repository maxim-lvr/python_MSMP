import {noiseLayout,noiseWalls} from './generation_noise_layout.js';
import {populateChunks} from './generation_demo_chunks_houses.js';
import {populateBuildingLong} from './generation_demo_chunks_building_long.js';
import {populateWideArea} from './generation_demo_chunks_wide.js';
import {generateGlobalPipe} from './generation_demo_chunks_pipe.js';

let imagePromise;
function loadNoise() {
  return imagePromise??= (async()=>{
    const response=await fetch('./noisemap_10000_redone_16.png',{cache:'no-store'});
    if(!response.ok)throw Error(`Noise map : HTTP ${response.status}`);
    const bitmap=await createImageBitmap(await response.blob());
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(bitmap,0,0);bitmap.close();
    const data=context.getImageData(0,0,canvas.width,canvas.height);
    return {width:data.width,height:data.height,data:data.data};
  })();
}
self.onmessage=async({data})=>{
  try {
    self.postMessage({progress:'Lecture de la noise map...'});
    const started=performance.now(),progress=message=>self.postMessage({progress:message});
    const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`HTTP ${r.status} : ${url}`);return r.json();};
    const templates=json(`/api/demo-chunks-templates?seed=${data.seed}`);
    const {layout,mask}=noiseLayout(data.seed,await loadNoise(),progress);
    progress('Construction des modeles Building Long...');
    // Bound Python model requests: more zones must not spawn all expensive builds at once.
    let next=0,completed=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(next<layout.buildingLong.length) {
        const index=next++,zone=layout.buildingLong[index];
        layout.buildingLong[index]=populateBuildingLong(zone,
          await json(`/api/demo-building-long?seed=${zone.seed}&length=${zone.length}`));
        progress(`Building Long ${++completed}/${layout.buildingLong.length}...`);
      }
    }));
    progress('Construction des Wide Areas et du reseau de tuyaux...');
    layout.wideAreas=layout.wideAreas.map(populateWideArea);
    layout.globalPipe=generateGlobalPipe(layout);
    for(const zone of layout.wideAreas)if(layout.globalPipe.connectedZones.includes(zone.id))
      zone.boxes=zone.boxes.filter(b=>!['wide_open_pipe','wide_open_pipe_band'].includes(b[6]));
    progress('Maisons murales, galeries et pieces denses...');
    const result=populateChunks(layout,await templates,undefined,false,data.density);
    delete result.isSolidBox;
    result.wallGroups.push({zone:-1,boxes:mask.floor,walls:noiseWalls(mask,layout.snakes,layout.settlements)});
    result.noise={full:true,components:result.stats.components,seconds:(performance.now()-started)/1000};
    self.postMessage({result});
  }catch(error){console.error(error);self.postMessage({error:error.message});}
};
