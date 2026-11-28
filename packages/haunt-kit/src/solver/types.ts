import type { Registry } from '../registry/registry';
import type { TickTrace } from '../trace/types';
import type { Pos, World } from '../world/types';

/** Thrown for input the solver cannot work with. The message names the problem. */
export class SolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolverError';
  }
}

/** The "property" the solver checks: the id of a property registered in the registry. */
export type PropertyId = string;

/** Everything a player may choose before a night, listed lazily and built into worlds. */
export interface ChoiceGenerator<C> {
  /** Every choice, in a fixed order. */
  choices(): Iterable<C>;
  /** A fresh, running world for the choice. It must share no mutable state with any other world. */
  build(choice: C): World;
}

export interface SolutionSummary<C> {
  /** Choices whose world ended `complete` with the property holding after every turn. */
  solutions: number;
  /** All choices. */
  total: number;
  /** The first solution in generator order, or `null`. */
  firstSolution: C | null;
}

/** An actor with no rules whose move each tick is chosen by the search. */
export interface Wanderer {
  /** Actor id. */
  actor: string;
  /** The tiles it may move to, in the order the search tries them. Default: `openSteps` of its tile. */
  moves?: (world: World) => Pos[];
}

export interface CounterexampleProblem {
  /** The start world: running, not mutated. */
  world: World;
  registry: Registry;
  wanderer: Wanderer;
  /** Property ids to check. Default: `world.properties`. */
  properties?: string[];
  /** Evaluated on the world after every tick in which no property failed. A path reaches the goal when it holds once. */
  goal?: (world: World, trace: TickTrace) => boolean;
}

/** One path on which a property fails. */
export interface Counterexample {
  property: string;
  /** The tick at which the property failed. */
  tick: number;
  /** The wanderer's tile after each tick, up to and including the failing one. */
  moves: Pos[];
  /** The engine's trace of replaying `moves` from the start world. It ends with the violation. */
  trace: TickTrace[];
}

export type CounterexampleResult =
  | {
      verdict: 'safe';
      /** Every path to the horizon. */
      paths: number;
      /** Paths on which the goal held at least once. */
      goalPaths: number;
      /** (tick, state) entries that were expanded. */
      states: number;
    }
  | {
      verdict: 'unsafe';
      /** The counterexample with the lowest tick. */
      shortest: Counterexample;
      /** One per failed property, by tick. */
      counterexamples: Counterexample[];
      /** Paths that reach the horizon without any failure. */
      paths: number;
      goalPaths: number;
      states: number;
    };
