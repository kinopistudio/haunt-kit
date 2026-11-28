import type { Rule, ScheduledEvent } from '../grammar/types';

export interface Pos {
  x: number;
  y: number;
}

/** `walls` holds `y * w + x` keys. It is never mutated after parsing. */
export interface GridMap {
  w: number;
  h: number;
  walls: ReadonlySet<number>;
}

export type LineOrigin = 'spec' | 'card' | 'rewrite';

/** A rule at a position in an actor's spec. `id` is unique within a world and never reused. */
export interface Line {
  id: number;
  rule: Rule;
  origin: LineOrigin;
}

export interface Actor {
  id: string;
  kind: string;
  pos: Pos;
  lines: Line[];
}

export interface Item {
  type: string;
  pos: Pos;
  solid: boolean;
  state: Record<string, boolean | number>;
}

export type WorldStatus = 'running' | 'complete' | 'violated';

/** Plain data. `tick` mutates it in place; `cloneWorld` copies it. */
export interface World {
  map: GridMap;
  markers: Record<string, Pos[]>;
  /** Array order is turn order. */
  actors: Actor[];
  items: Item[];
  events: ScheduledEvent[];
  /** Property ids checked after every turn. */
  properties: string[];
  /** 0 before the first tick. */
  tick: number;
  /** The status becomes `complete` when `tick` reaches it. */
  horizon: number;
  status: WorldStatus;
  nextLineId: number;
}

/** An item to place. `solid` defaults to false and `state` to `{}`. */
export interface ItemInit {
  type: string;
  pos: Pos;
  solid?: boolean;
  state?: Record<string, boolean | number>;
}

/**
 * What one grid character means. A cell may combine `actor`, `item` and `marker`.
 * A cell with none of the four fields is plain floor. `wall` cannot be combined with the others.
 */
export interface CellDef {
  wall?: boolean;
  /** An actor of this kind starts here. */
  actor?: string;
  /** An item starts here. */
  item?: Omit<ItemInit, 'pos'>;
  /** Names this tile; `ParsedGrid.markers[name]` lists the tiles in reading order. */
  marker?: string;
}

/** Maps one character to its meaning. `#` is a wall and `.` is plain floor unless overridden. */
export type Legend = Record<string, CellDef>;

export interface ParsedGrid {
  map: GridMap;
  /** Actor starts in reading order (row by row, left to right). */
  starts: { kind: string; pos: Pos }[];
  /** Items from the grid, in reading order. */
  items: ItemInit[];
  markers: Record<string, Pos[]>;
  /** Plain floor tiles (no wall, actor, item or marker) in reading order. These are the tiles a player may use. */
  free: Pos[];
}
