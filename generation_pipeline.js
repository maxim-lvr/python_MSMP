import {GenerationPool} from './generation_parallel.js';
import {noiseLayout,CUBE_TEST} from './generation_noise_placement.js';
import {noiseWalls} from './generation_noise_walls.js';
import {noiseMask} from './generation_noise_mask.js';
import {generateChunks,addExtraZones} from './generation_demo_chunks_generator.js';
import {generateDemoSnakes} from './generation_demo_chunks_snakes.js';
import {populateBuildingLong,placeBuildingLong} from './generation_demo_chunks_building_long.js';
import {populateWideArea,placeWideAreas} from './generation_demo_chunks_wide.js';
import {generateGlobalPipe} from './generation_demo_chunks_pipe.js';
import {populateChunkCore,populateChunkCoreParallel} from './generation_demo_chunks_population.js';
import {finishChunkPopulation,finishChunkPopulationParallel} from './generation_demo_chunks_houses.js';
import {GenerationCache,generationKeys,openGenerationStore} from './generation_cache.js';
import {prototypeNoiseImage,POC_TEST} from './generation_noise_prototype.js';

async function loadNoise() {
  const response=await fetch('./noisemap_10000_redone_16.png',{cache:'no-store'});
  if(!response.ok)throw Error(`Noise map : HTTP ${response.status}`);
  const bitmap=await createImageBitmap(await response.blob());
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(bitmap,0,0);bitmap.close();
  const image=context.getImageData(0,0,canvas.width,canvas.height);
  return {width:image.width,height:image.height,data:image.data};
}

export async function prepareGeneration(manifest,settings,progress=()=>{},{store,noiseLoader=loadNoise,jsonLoader,poolFactory=(count,revision)=>new GenerationPool(count,revision)}={}) {
  const started=performance.now(),noise=manifest.mode==='noise';
  const cube=noise&&settings.profile==='cube1000';
  const poc=noise&&settings.profile==='poc2000',prototype=poc?POC_TEST:cube?CUBE_TEST:null;
  if(prototype)manifest={...manifest,mode:`noise-${settings.profile}`};
  const json=jsonLoader|| (async url=>{
    const response=await fetch(url,{cache:'no-store'});
    if(response.status===409)throw Object.assign(Error('Generation sources changed'),{stale:true});
    if(!response.ok)throw Error(`HTTP ${response.status} : ${url}`);return response.json();
  });
  if(store===undefined)try{store=await openGenerationStore();}catch(error){console.warn(error);store=null;}
  const cache=new GenerationCache(manifest,await generationKeys(manifest,settings),store,
    {force:settings.force,progress});
  let pool,imagePromise,maskPromise,templatesPromise;
  const parallel=()=>{
    if(settings.threads===1||typeof Worker==='undefined')return null;
    return pool??=poolFactory(settings.threads||4,manifest.version);
  };
  const image=()=>imagePromise??=poc?Promise.resolve(prototypeNoiseImage(null,'poc2000')):
    noiseLoader().then(i=>cube?prototypeNoiseImage(i):i);
  const mask=()=>maskPromise??=image().then(i=>noiseMask(i.width,i.height,i.data,prototype?.world));
  const suffix=`revision=${manifest.models}${settings.force?'&refresh=1':''}`;
  const model=(kind,seed,length)=>json(kind==='walls'?`/api/demo-chunks-templates?seed=${seed}&${suffix}`:
    `/api/demo-building-long?seed=${seed}&length=${length}&${suffix}`);
  const builders={
    layout:{async compute(){
      if(noise){
        const made=noiseLayout(settings.seed,await image(),progress,prototype||{});maskPromise=Promise.resolve(made.mask);
        const {isSolidBox,...layout}=made.layout;return layout;
      }
      const layout=generateChunks(settings.seed);layout.buildingLong=placeBuildingLong(layout);
      layout.snakes=generateDemoSnakes(layout);layout.wideAreas=placeWideAreas(layout);addExtraZones(layout);return layout;
    }},
    structures:{async compute({layout}){
      const workers=parallel();
      progress(`Construction des modeles de batiments${workers?` · ${workers.size} workers`:''}...`);
      const widePromise=workers?workers.map('wide',layout.wideAreas):Promise.resolve(layout.wideAreas.map(populateWideArea));
      const buildingLong=new Array(layout.buildingLong.length);let next=0;
      await Promise.all(Array.from({length:3},async()=>{
        while(next<buildingLong.length){const i=next++,zone=layout.buildingLong[i],template=await model('building',zone.seed,zone.length);
          buildingLong[i]=workers?await workers.run('building',{zone,template}):populateBuildingLong(zone,template);}
      }));
      return {buildingLong,wideAreas:await widePromise};
    }},
    pipes:{async compute({layout,structures}){
      progress('Construction du reseau de tuyaux...');
      const input={...layout,...structures};if(noise)input.isSolidBox=(await mask()).isSolid;
      return generateGlobalPipe(input,progress);
    }},
    population:{prepare(){
      templatesPromise=model('walls',settings.seed);templatesPromise.catch(()=>{});
    },async compute({layout,structures,pipes}){
      progress('Maisons, galeries et pieces denses...');
      const input={...layout,...structures,globalPipe:pipes,
        wideAreas:structures.wideAreas.map(z=>pipes.connectedZones.includes(z.id)?
          {...z,boxes:z.boxes.filter(b=>!['wide_open_pipe','wide_open_pipe_band'].includes(b[6]))}:z)};
      if(noise)input.isSolidBox=(await mask()).isSolid;
      const templates=await templatesPromise,workers=parallel();
      const result=workers?await populateChunkCoreParallel(workers,input,templates,settings.count,false,settings.density,progress):
        populateChunkCore(input,templates,settings.count,false,settings.density,progress);
      delete result.isSolidBox;return result;
    }},
    final:{async compute({population}){
      progress('Raccordement des acces des tuyaux...');
      const workers=parallel();
      const result=workers?await finishChunkPopulationParallel({...population},workers,progress):finishChunkPopulation({...population},progress);
      if(noise){const m=await mask();
        result.wallGroups=[...result.wallGroups,{zone:-1,boxes:m.floor,walls:noiseWalls(m,result.snakes,result.settlements,result.globalPipe)}];
        result.noise={full:true,components:result.stats.components};}
      return result;
    }},
  };
  try {
    const result=await cache.get('final',builders);
    const loading={workers:pool?.size||1,seconds:(performance.now()-started)/1000,stages:cache.timings,
      reusedMap:cache.timings.find(t=>t.id==='final')?.hit===true,cacheAvailable:cache.store!==null};
    const output={...result,loading};if(noise)output.noise={...output.noise,seconds:loading.seconds};
    return {result:output,cache};
  }catch(error){await cache.abort();cache.close();throw error;}
  finally{pool?.close();}
}
