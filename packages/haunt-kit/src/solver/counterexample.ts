import { tick } from '../engine/tick';
import type { TickTrace } from '../trace/types';
import { cloneWorld } from '../world/create';
import { openSteps } from '../world/move';
import type { Pos, World } from '../world/types';
import { stateKey } from './key';
import { SolverError } from './types';
import type { Counterexample, CounterexampleProblem, CounterexampleResult } from './types';

/** All the paths that reach one state at one tick, merged. */
interface Entry {
  world: World;
  /** Paths from the start that end in this state. */
  paths: number;
  /** Of those, the paths on which the goal held at least once so far. */
  goalPaths: number;
  /** The entry this one was first reached from, and the tile the wanderer moved to. Used to rebuild one path. */
  parent: Entry | null;
  move: Pos | null;
}

interface Found {
  property: string;
  tick: number;
  moves: Pos[];
}

function add(entry: Entry, paths: number, goalPaths: number): void {
  entry.paths += paths;
  entry.goalPaths += goalPaths;
  if (entry.paths > Number.MAX_SAFE_INTEGER) throw new SolverError('the number of paths is above Number.MAX_SAFE_INTEGER');
}

function movesTo(entry: Entry, last: Pos): Pos[] {
  const moves = [last];
  for (let e: Entry | null = entry; e !== null && e.move !== null; e = e.parent) moves.push(e.move);
  return moves.reverse().map((m) => ({ x: m.x, y: m.y }));
}

/** Runs the engine again along `moves` and returns its traces. This is the trace the caller gets. */
function replay(start: World, problem: CounterexampleProblem, found: Found): Counterexample {
  const world = cloneWorld(start);
  const trace: TickTrace[] = [];
  for (const to of found.moves) {
    const t = tick(world, problem.registry, { scripted: { [problem.wanderer.actor]: to } });
    if (t === null) break;
    trace.push(t);
  }
  const last = trace.at(-1);
  if (last?.violation?.property !== found.property || last.tick !== found.tick) {
    throw new Error(`internal error: replaying the counterexample for "${found.property}" does not fail at tick ${found.tick}`);
  }
  return { property: found.property, tick: found.tick, moves: found.moves, trace };
}

/**
 * Checks every way the wanderer can move, tick by tick, and returns the shortest counterexample for each
 * property that can fail, or `safe`. The search is layered by tick. Paths that reach the same state at
 * the same tick are merged into one entry with a count, so the work depends on the number of states and
 * not on the number of paths. A path that makes a property fail stops there and is not counted.
 */
export function findCounterexample(problem: CounterexampleProblem): CounterexampleResult {
  const { registry, wanderer, goal } = problem;
  const start = cloneWorld(problem.world);
  if (problem.world.status !== 'running') throw new SolverError(`the start world is "${problem.world.status}", not "running"`);
  if (!start.actors.some((a) => a.id === wanderer.actor)) throw new SolverError(`the wanderer "${wanderer.actor}" is not an actor of the world`);
  start.properties = [...(problem.properties ?? problem.world.properties)];
  for (const id of start.properties) {
    if (!registry.property(id)) throw new SolverError(`property "${id}" is not registered`);
  }

  const movesOf =
    wanderer.moves ??
    ((world: World): Pos[] => openSteps(world, world.actors.find((a) => a.id === wanderer.actor)!.pos));

  const found = new Map<string, Found>();
  let layer = new Map<string, Entry>([[stateKey(start), { world: start, paths: 1, goalPaths: 0, parent: null, move: null }]]);
  let states = 0;
  let transitions = 0;

  for (let depth = start.horizon - start.tick; depth > 0; depth--) {
    const next = new Map<string, Entry>();
    for (const entry of layer.values()) {
      states++;
      for (const to of movesOf(entry.world)) {
        const world = cloneWorld(entry.world);
        const trace = tick(world, registry, { scripted: { [wanderer.actor]: to } });
        transitions++;
        if (trace === null) continue;
        if (trace.violation) {
          // Layers go in tick order, so the first record of a property is a shortest one.
          if (!found.has(trace.violation.property)) {
            found.set(trace.violation.property, { property: trace.violation.property, tick: world.tick, moves: movesTo(entry, to) });
          }
          continue;
        }
        const hit = goal?.(world, trace) ?? false;
        const key = stateKey(world);
        let target = next.get(key);
        if (!target) {
          target = { world, paths: 0, goalPaths: 0, parent: entry, move: { x: to.x, y: to.y } };
          next.set(key, target);
        }
        add(target, entry.paths, hit ? entry.paths : entry.goalPaths);
      }
    }
    layer = next;
  }

  let paths = 0;
  let goalPaths = 0;
  for (const entry of layer.values()) {
    paths += entry.paths;
    goalPaths += entry.goalPaths;
  }
  if (paths > Number.MAX_SAFE_INTEGER) throw new SolverError('the number of paths is above Number.MAX_SAFE_INTEGER');

  if (found.size === 0) return { verdict: 'safe', paths, goalPaths, states, transitions };
  const counterexamples = [...found.values()].sort((a, b) => a.tick - b.tick).map((f) => replay(start, problem, f));
  return { verdict: 'unsafe', shortest: counterexamples[0]!, counterexamples, paths, goalPaths, states, transitions };
}
