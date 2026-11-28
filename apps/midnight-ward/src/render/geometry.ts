/** Heights of the walls, in tiles. A tall back wall, medium side and inner walls, a low front wall. */
export const WALL_BACK = 1.25;
export const WALL_SIDE = 0.55;
export const WALL_FRONT = 0.22;

/** The height of the wall block in row `y` of a map `rows` tall. */
export function wallHeight(rows: number, y: number): number {
  if (y === 0) return WALL_BACK;
  if (y === rows - 1) return WALL_FRONT;
  return WALL_SIDE;
}
