import { lineStats, recordRun } from 'haunt-kit';
import type { LineStat, Recording, Registry } from 'haunt-kit';
import { buildWorld } from './levels';
import type { LevelDef } from './levels';
import { toInserts, toPlacement } from './plan';
import type { Plan } from './plan';
import { createRegistry } from './vocab';

/** A night run to its end: everything the play screen needs, computed once. */
export interface NightRun {
  level: LevelDef;
  plan: Plan;
  registry: Registry;
  /** Every frame and trace. The replay reads this and nothing else. */
  recording: Recording;
  outcome: 'won' | 'lost';
  /** Bells that were rung: 12 on a win, fewer when the girl was caught. */
  bells: number;
  /** On a loss, the id of the girl's line to strike through. Empty on a win. */
  struck: number[];
  stats: Map<number, LineStat>;
  /** Lines that never ran during the night. */
  burned: number;
}

/**
 * Builds the world from the plan, runs the night with the kit's `recordRun`, and reads what the screens need.
 * The outcome is the engine's: the night is won when it ends `complete`, and lost when it ends `violated`.
 */
export function runNight(level: LevelDef, plan: Plan, registry: Registry = createRegistry()): NightRun {
  const world = buildWorld(level, toPlacement(level, plan), toInserts(level, plan), registry);
  return readNight(level, plan, registry, recordRun(world, registry));
}

/** Reads a finished recording: the outcome, the struck line, the statistics. Split from `runNight` so that it can be tested on its own. */
export function readNight(level: LevelDef, plan: Plan, registry: Registry, recording: Recording): NightRun {
  const stats = lineStats(recording);
  const outcome = recording.status === 'complete' ? 'won' : 'lost';
  return {
    level,
    plan,
    registry,
    recording,
    outcome,
    bells: recording.traces.length,
    struck: outcome === 'lost' ? girlLine(recording) : [],
    stats,
    burned: [...stats.values()].filter((s) => s.fired === 0).length,
  };
}

/** The line the girl ran on the last tick, or her first line when none ran. */
function girlLine(recording: Recording): number[] {
  const last = recording.frames[recording.frames.length - 1]!;
  const girl = last.actors.find((a) => a.kind === 'girl');
  if (!girl) return [];
  const trace = recording.traces[recording.traces.length - 1];
  const turn = trace?.turns.find((t) => t.actor === girl.id);
  if (turn?.firedId != null) return [turn.firedId];
  const first = girl.lines[0];
  return first ? [first.id] : [];
}
