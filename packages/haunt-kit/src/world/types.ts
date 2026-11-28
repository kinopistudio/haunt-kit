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
