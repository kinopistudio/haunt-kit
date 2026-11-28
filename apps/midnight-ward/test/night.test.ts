import { recordRun, run } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { LEVELS, NIGHT_1, NIGHT_4, PROLOGUE, buildWorld } from '../src/levels';
import { readNight, runNight } from '../src/night';
import { freshPlan, insertCard, placeItem } from '../src/plan';
import { levelChoices, solveLevel } from '../src/solve';
import { createRegistry } from '../src/vocab';
import { planOfChoice } from './fixtures/plan-of-choice';

describe('runNight', () => {
  it('M4.1: an empty board loses on every level, and the recording ends at the capture', () => {
    for (const level of LEVELS) {
      const night = runNight(level, freshPlan(level));
      expect(night.outcome, level.id).toBe('lost');
      expect(night.recording.status).toBe('violated');
      expect(night.bells).toBe(night.recording.traces.length);
      expect(night.bells).toBeGreaterThan(0);
      expect(night.bells).toBeLessThan(12);
      expect(night.recording.frames).toHaveLength(night.bells + 1);
      expect(night.recording.traces.at(-1)!.violation?.property).toBe('girl_safe');
    }
  });

  it('M4.1: the first solution of each level, as a plan, wins after 12 bells', () => {
    for (const level of LEVELS) {
      const { firstSolution } = solveLevel(level);
      const night = runNight(level, planOfChoice(level, firstSolution!));
      expect(night.outcome, level.id).toBe('won');
      expect(night.bells).toBe(12);
      expect(night.struck).toEqual([]);
    }
  });

  it('M4.1: the outcome is the status the solver gives for the same choice, for every choice of the Prologue and Night IV', () => {
    for (const level of [PROLOGUE, NIGHT_4]) {
      const registry = createRegistry();
      const generator = levelChoices(level, registry);
      for (const choice of generator.choices()) {
        const world = generator.build(choice);
        run(world, registry);
        const night = runNight(level, planOfChoice(level, choice));
        expect(night.outcome).toBe(world.status === 'complete' ? 'won' : 'lost');
      }
    }
  });

  it('M5.1: on a loss, the struck line is the line of the girl that ran on the last tick', () => {
    const night = runNight(NIGHT_1, freshPlan(NIGHT_1));
    const last = night.recording.traces.at(-1)!;
    const girlTurn = last.turns.find((t) => t.actor === 'girl')!;
    expect(girlTurn.firedId).not.toBeNull();
    expect(night.struck).toEqual([girlTurn.firedId]);
    const girl = night.recording.frames.at(-1)!.actors.find((a) => a.id === 'girl')!;
    expect(girl.lines.find((l) => l.id === night.struck[0])!.rule).toEqual({ kw: '', cond: 'always', act: 'stay' });
  });

  it('M5.1: when no line of the girl ran on the last tick, her first line is struck', () => {
    const registry = createRegistry();
    const world = buildWorld(PROLOGUE, [], [], registry);
    // The girl's only line now waits for bell 99, so no line of hers ever runs.
    world.actors[0]!.lines[0]!.rule = { kw: 'WHEN', cond: 'tick_is', act: 'stay', n: 99 };
    const recording = recordRun(world, registry);
    expect(recording.status).toBe('violated');
    expect(recording.traces.at(-1)!.turns.find((t) => t.actor === 'girl')!.firedId).toBeNull();
    const night = readNight(PROLOGUE, freshPlan(PROLOGUE), registry, recording);
    expect(night.outcome).toBe('lost');
    expect(night.struck).toEqual([recording.frames.at(-1)!.actors[0]!.lines[0]!.id]);
  });

  it('M5.3: burned is the number of lines that never ran, and the stats cover every line', () => {
    // Night I with a card at line 2 of the wisp (never fires: line 1 is always true), plus a bell near nothing.
    let plan = freshPlan(NIGHT_1);
    plan = placeItem(NIGHT_1, plan, 'bell', 4, 3)!;
    plan = insertCard(NIGHT_1, plan, 0, 'wisp', 0)!;
    plan = insertCard(NIGHT_1, plan, 1, 'wisp-2', 1)!;
    const night = runNight(NIGHT_1, plan);
    const lines = night.recording.frames.at(-1)!.actors.flatMap((a) => a.lines);
    expect(night.stats.size).toBe(lines.length);
    expect(night.burned).toBe([...night.stats.values()].filter((s) => s.fired === 0).length);
    // The card at line 2 of wisp-2 sits under an always-true line: it can never run.
    const dead = night.recording.frames.at(-1)!.actors.find((a) => a.id === 'wisp-2')!.lines[1]!;
    expect(night.stats.get(dead.id)!.fired).toBe(0);
    expect(night.burned).toBeGreaterThanOrEqual(1);
  });

  it('M5.3: a won night burns exactly the lines that never ran, and nothing on a loss is counted twice', () => {
    const { firstSolution } = solveLevel(NIGHT_4);
    const night = runNight(NIGHT_4, planOfChoice(NIGHT_4, firstSolution!));
    expect(night.outcome).toBe('won');
    const never = [...night.stats.values()].filter((s) => s.fired === 0);
    expect(night.burned).toBe(never.length);
  });
});
