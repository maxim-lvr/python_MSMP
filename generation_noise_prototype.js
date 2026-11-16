// Tall test variant; geometry and connectivity use the final-map generators.
export const CUBE_TEST={
  world:{length:10000,width:10000,height:1000,minY:0,maxY:1000,chunk:32},
  verticalBuildings:true,ultraDenseHeightRange:[300,400],houseWallHeightRange:[320,400],
  layeredTunnels:true,networkLevelStep:96,denseCountScale:1.5,
  buildCounts:{long:9,wide:{open:9,restrict:9,ultra_dense:12},snakes:8,bridges:5,walls:160,cavities:48,water:4,villages:50},
};

export const POC_TEST={
  ...CUBE_TEST,
  world:{length:2000,width:2000,height:500,minY:0,maxY:500,chunk:32},
  ultraDenseHeightRange:[300,340],houseWallHeightRange:[300,340],denseCountScale:.35,
  buildCounts:{long:1,wide:{open:1,restrict:1,ultra_dense:1},snakes:1,bridges:1,walls:3,cavities:0,water:1,villages:1},
};

export function prototypeNoiseImage(image,profile) {
  if(profile==='poc2000') {
    // A broad solid testing ground with a village-sized fissure; shrinking the
    // 10 km noise would make its solid regions too narrow for the same builds.
    const width=125,height=125,data=new Uint8ClampedArray(width*height*4);
    for(let z=0;z<height;z++)for(let x=0;x<width;x++) {
      const p=(z*width+x)*4,value=z>=104&&z<112?255:96;
      data[p]=data[p+1]=data[p+2]=value;data[p+3]=255;
    }
    return {width,height,data};
  }
  return image; // Use the complete source terrain at 10,000 x 10,000.
}
