import type { TurnTrace } from '../trace/types';
import type { Actor, World } from '../world/types';

export interface EvalContext {
  world: World;
  actor: Actor;
}

export interface ConditionDef {
  /** `/^[a-z][a-z0-9_]*$/`, and not `always`. */
  id: string;
  /** Lowercase words, for example `the girl is near` or `the clock strikes {n}`. */
  pattern: string;
  /** Marks the trigger of scheduled write sentences. At most one per registry; needs `{n}`. */
  schedule?: boolean;
  /** Must not mutate the world. `n` is 0 when the pattern has no `{n}`. */
  test(ctx: EvalContext, n: number): boolean;
}

export interface ActionDef {
  id: string;
  /** Lowercase words. No `{n}`. */
  pattern: string;
  /** May mutate the world through the world helpers. */
  run(ctx: EvalContext): void;
}

/** The context of a prohibition: the actor the safety rule is about, and the turn that was just taken. */
export interface TurnContext extends EvalContext {
  turn: TurnTrace;
}

export interface ProhibitionDef {
  /** `/^[a-z][a-z0-9_]*$/`. */
  id: string;
  /** Lowercase words, for example `trigger` or `be on`. No `{n}`. */
  pattern: string;
  /** True when the prohibited thing happened on `ctx.turn`. Must not mutate the world. */
  occurs(ctx: TurnContext): boolean;
}

export interface PropertyFailure {
  message: string;
  actors: string[];
}

export interface PropertyDef {
  id: string;
  description: string;
  /**
   * Returns a failure, or `null` when the property holds. Must not mutate the world.
   * The engine passes the trace of the turn that was just taken as `turn`.
   */
  check(world: World, turn?: TurnTrace): PropertyFailure | null;
}
