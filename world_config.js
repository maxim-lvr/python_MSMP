// Minecraft's upper Y bound is exclusive: block layers are -64 through 319.
export const WORLD_MIN_Y = -64;
export const WORLD_MAX_Y = 320;
export const WORLD_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y;

// Generators and reusable templates use local Y coordinates (0..height-1).
// Viewers and exporters apply minY once, at the world boundary.
export function mapWorld(length, width = length) {
  return {length, width, height: WORLD_HEIGHT, minY: WORLD_MIN_Y, maxY: WORLD_MAX_Y, chunk: 32};
}

export function worldRun(run, world) {
  return {...run, pos: [run.pos[0], run.pos[1] + (world.minY ?? 0), run.pos[2]]};
}
