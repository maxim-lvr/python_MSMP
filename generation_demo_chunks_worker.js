import { generateChunks, addExtraZones } from './generation_demo_chunks_generator.js';
import { populateChunks } from './generation_demo_chunks_houses.js';
import { generateDemoSnakes } from './generation_demo_chunks_snakes.js';
import { placeBuildingLong, populateBuildingLong } from './generation_demo_chunks_building_long.js';
import { placeWideAreas, populateWideArea } from './generation_demo_chunks_wide.js';
import { generateGlobalPipe } from './generation_demo_chunks_pipe.js';

self.onmessage=async ({data})=>{
  try {
    const response=await fetch(`/api/demo-chunks-templates?seed=${data.seed}`);
    if(!response.ok)throw Error(`Maisons : HTTP ${response.status}`);
    const layout=generateChunks(data.seed);
    layout.buildingLong=placeBuildingLong(layout);
    const models=await Promise.all(layout.buildingLong.map(async zone=>{
      const response=await fetch(`/api/demo-building-long?seed=${zone.seed}&length=${zone.length}`);
      if(!response.ok)throw Error(`Building Long : HTTP ${response.status}`);
      return populateBuildingLong(zone,await response.json());
    }));
    layout.buildingLong=models;
    layout.snakes=generateDemoSnakes(layout);
    layout.wideAreas=placeWideAreas(layout).map(populateWideArea);
    addExtraZones(layout);
    layout.globalPipe=generateGlobalPipe(layout);
    for(const zone of layout.wideAreas)if(layout.globalPipe.connectedZones.includes(zone.id))
      zone.boxes=zone.boxes.filter(b=>!['wide_open_pipe','wide_open_pipe_band'].includes(b[6]));
    const result=populateChunks(layout,await response.json(),data.count,false,data.density);
    self.postMessage({result});
  } catch(error) { self.postMessage({error:error.message}); }
};
