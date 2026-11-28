/** The part of a canvas the renderer uses, so that drawing can be tested without a browser. */
export interface Surface {
  width: number;
  height: number;
  getContext(type: '2d'): CanvasRenderingContext2D | null;
}

export type SurfaceFactory = () => Surface;

export interface Tile {
  x: number;
  y: number;
}

/** What the renderer needs to know about a level's map. */
export interface MapInfo {
  w: number;
  h: number;
  /** `y * w + x` keys of wall tiles. */
  walls: ReadonlySet<number>;
  /** The bed's tile (where the girl sleeps), if the level has one. */
  bed: Tile | null;
}

export const isWall = (map: Pick<MapInfo, 'w' | 'h' | 'walls'>, x: number, y: number): boolean =>
  x < 0 || y < 0 || x >= map.w || y >= map.h || map.walls.has(y * map.w + x);

/** The tile of the back wall that holds the window. */
export const windowColumn = (map: Pick<MapInfo, 'w'>): number => Math.max(1, Math.floor(map.w * 0.66));

export function ctxOf(surface: Surface): CanvasRenderingContext2D {
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('this browser has no 2D canvas');
  return ctx;
}
