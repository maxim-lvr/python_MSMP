import assert from 'node:assert/strict';
import {generateChunks} from '../generation_demo_chunks_generator.js';
import {placeBuildingLong} from '../generation_demo_chunks_building_long.js';
import {generateDemoSnakes} from '../generation_demo_chunks_snakes.js';
import {placeWideAreas,populateWideArea} from '../generation_demo_chunks_wide.js';
import {generateGlobalPipe} from '../generation_demo_chunks_pipe.js';
import {snakeAccessPlans} from '../generation_demo_chunks_snake_ports.js';

for(const seed of [42,1268093524]) {
  const layout=generateChunks(seed);
  layout.buildingLong=placeBuildingLong(layout);
  layout.snakes=generateDemoSnakes(layout);
  layout.wideAreas=placeWideAreas(layout).map(populateWideArea);
  const before=snakeAccessPlans(layout,[],[],[]);
  layout.globalPipe=generateGlobalPipe(layout);
  const after=snakeAccessPlans(layout,[],[],[]);
  assert.deepEqual(after,before,'Pipes must preserve existing entrance routes and shafts');
  assert.equal(layout.globalPipe.connectedZones.length,2);
  console.log({seed,accesses:after.length,branches:layout.globalPipe.branches.length,
    uncovered:layout.globalPipe.uncovered});
}
