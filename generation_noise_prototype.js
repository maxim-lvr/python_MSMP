// Tall test variant; geometry and connectivity use the final-map generators.
export const CUBE_TEST={
  world:{length:10000,width:10000,height:1000,minY:0,maxY:1000,chunk:32},
  ultraDenseHeight:960,wallHouseBands:[8,336,664],
  buildCounts:{long:9,wide:{open:3,restrict:3,ultra_dense:7},snakes:8,bridges:5,walls:160,cavities:48,water:4,villages:50},
};

export function prototypeNoiseImage(image) {
  return image; // Use the complete source terrain at 10,000 x 10,000.
}
