// Tall test variant; geometry and connectivity use the final-map generators.
export const CUBE_TEST={
  world:{length:10000,width:10000,height:1000,minY:0,maxY:1000,chunk:32},
  verticalBuildings:true,ultraDenseHeightRange:[300,400],houseWallHeightRange:[320,400],
  layeredTunnels:true,networkLevelStep:96,denseCountScale:1.5,
  buildCounts:{long:9,wide:{open:9,restrict:9,ultra_dense:12},snakes:8,bridges:5,walls:160,cavities:48,water:4,villages:50},
};

export function prototypeNoiseImage(image) {
  return image; // Use the complete source terrain at 10,000 x 10,000.
}
