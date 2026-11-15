import {noiseLayout as placeNoise} from './generation_noise_placement.js';
import {NOISE_DENSE_RULES} from './generation_dense_rules.js';
export function noiseLayout(...args) {
  const result=placeNoise(...args);Object.assign(result.layout,NOISE_DENSE_RULES);return result;
}
export {noiseWalls} from './generation_noise_walls.js';
