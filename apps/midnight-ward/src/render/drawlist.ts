import { FOOT_OFFSET } from './sprites';
import type { WallBlock } from './walls';

/** One thing that stands up from the floor and must be drawn in depth order. */
export type Drawable =
  | { kind: 'wall'; key: number; block: WallBlock }
  | { kind: 'thing'; key: number; id: string; draw: () => void };

/** The depth key of something standing on tile row `y` (feet may be fractional while it glides). */
export const thingKey = (y: number): number => y + FOOT_OFFSET;

/**
 * Orders drawables from the back of the room to the front. A wall's key is the y of its front edge and a
 * sprite's key is the y of its feet, so a sprite north of a wall is drawn first and the wall hides its lower
 * part, while a sprite south of it is drawn after and stands in front. Equal keys keep their order.
 */
export function sortDrawables(list: Drawable[]): Drawable[] {
  return list.map((d, i) => ({ d, i })).sort((a, b) => a.d.key - b.d.key || a.i - b.i).map((e) => e.d);
}
