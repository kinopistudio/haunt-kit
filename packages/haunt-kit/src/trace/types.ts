import type { Pos, World, WorldStatus } from '../world/types';

/** A scheduled write that was applied at the start of a tick. `index` is the 0-based position of the new line. */
export interface EventTrace {
  /** Id of the actor that received the line. */
  actor: string;
  kind: string;
  index: number;
  lineId: number;
}

/** What one actor did in one tick. Indexes are 0-based and refer to the actor's lines at the time of the turn. */
export interface TurnTrace {
  /** Actor id. */
  actor: string;
  kind: string;
  /**
   * Results of the conditions evaluated top to bottom, up to and including the fired line.
   * When no line is true this has one entry per line.
   */
  evals: boolean[];
  /** Index of the first true line, or `null`. */
  fired: number | null;
  /** `Line.id` of the fired line, or `null`. Ids stay valid when later inserts shift the indexes. */
  firedId: number | null;
  /** Indexes of the lines below the fired line whose conditions were also true. They did not run. */
  shadowed: number[];
  shadowedIds: number[];
  from: Pos;
  to: Pos;
}

export interface ViolationTrace {
  /** Property id. */
  property: string;
  message: string;
  /** Actor ids named by the property. */
  actors: string[];
}

/**
 * The record of one tick. It is plain JSON and carries no rule text; look the text up through
 * `Line.id` in the world. When a property failed, the violating turn is the last entry of `turns`.
 */
export interface TickTrace {
  tick: number;
  events: EventTrace[];
  turns: TurnTrace[];
  violation: ViolationTrace | null;
  status: WorldStatus;
}

/**
 * A run kept whole. `frames[0]` is the start world and `frames[k]` the world after tick `k`;
 * `traces[k - 1]` is the trace of tick `k`. So `frames.length === traces.length + 1`.
 */
export interface Recording {
  frames: World[];
  traces: TickTrace[];
  status: WorldStatus;
}
