import { cloneWorld, tick } from 'haunt-kit';
import type { CounterexampleResult } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { buildScareCue, checkScareCue, registry } from '../src/level';
import type { CardInsert } from '../src/level';

// The expected numbers come from the prototype's checker. They are literals: this search reads the map,
// the prop specs, the safety rules and the registered vocabulary, and nothing recorded.

const LIGHT_FIX = 0;
const JUMP_FIX = 1;
const FOG_DECOY = 2;

const unsafe = (r: CounterexampleResult) => {
  if (r.verdict !== 'unsafe') throw new Error('expected an unsafe verdict');
  return r;
};
const failedAt = (r: CounterexampleResult): Record<string, number> =>
  r.verdict === 'safe' ? {} : Object.fromEntries(r.counterexamples.map((c) => [c.property, c.tick]));

describe('Scare Cue oracle', () => {
  it('S9.1: with the default rules the check is unsafe, S2 fails at bell 2 and S1 at bell 5', () => {
    const result = checkScareCue();
    expect(result.verdict).toBe('unsafe');
    expect(failedAt(result)).toEqual({ S2: 2, S1: 5 });
  });

  it('S9.1: the shortest counterexample is the S2 one, at tick 2', () => {
    const { shortest, counterexamples } = unsafe(checkScareCue());
    expect(shortest.property).toBe('S2');
    expect(shortest.tick).toBe(2);
    expect(counterexamples.map((c) => c.property)).toEqual(['S2', 'S1']);
    expect(shortest).toBe(counterexamples[0]);
  });

  it('S9.2: both fixes at line 1 are safe, with 4,008,562 visitor paths checked and 92% still scared', () => {
    const result = checkScareCue([{ card: LIGHT_FIX, at: 0 }, { card: JUMP_FIX, at: 0 }]);
    expect(result.verdict).toBe('safe');
    expect(result.paths).toBe(4_008_562);
    expect(Math.round((100 * result.goalPaths) / result.paths)).toBe(92);
  });

  it('S9.2: the order the two fixes are inserted in does not change the answer', () => {
    const a = checkScareCue([{ card: LIGHT_FIX, at: 0 }, { card: JUMP_FIX, at: 0 }]);
    const b = checkScareCue([{ card: JUMP_FIX, at: 0 }, { card: LIGHT_FIX, at: 0 }]);
    expect(b).toEqual(a);
  });

  it('S9.3: both fixes at line 2 are still unsafe', () => {
    const result = checkScareCue([{ card: LIGHT_FIX, at: 1 }, { card: JUMP_FIX, at: 1 }]);
    expect(result.verdict).toBe('unsafe');
    expect(failedAt(result)).toEqual({ S2: 2, S1: 5 });
  });

  it('S9.3: only the decoy is still unsafe, and it changes nothing about when the rules fail', () => {
    for (const at of [0, 1, 2]) {
      const result = checkScareCue([{ card: FOG_DECOY, at }]);
      expect(result.verdict, `decoy at ${at}`).toBe('unsafe');
      expect(failedAt(result), `decoy at ${at}`).toEqual({ S2: 2, S1: 5 });
    }
  });

  it('S9.3: each fix alone repairs its own rule and leaves the other failing', () => {
    expect(failedAt(checkScareCue([{ card: LIGHT_FIX, at: 0 }]))).toEqual({ S2: 2 });
    expect(failedAt(checkScareCue([{ card: JUMP_FIX, at: 0 }]))).toEqual({ S1: 5 });
  });

  it('S9.3: the decoy with the jump-scare fix does not repair S1', () => {
    const result = checkScareCue([{ card: JUMP_FIX, at: 0 }, { card: FOG_DECOY, at: 0 }]);
    expect(failedAt(result)).toEqual({ S1: 5 });
  });

  it('S9.4: the safe check expands under 5,000 states for over 4 million paths', () => {
    const fixes: CardInsert[] = [{ card: LIGHT_FIX, at: 0 }, { card: JUMP_FIX, at: 0 }];
    const result = checkScareCue(fixes);
    expect(result.states).toBeLessThan(5000);
    expect(result.paths).toBeGreaterThan(4_000_000);
    expect(result.transitions).toBeLessThanOrEqual(result.states * 5);
  });

  it('S9.5: the trace has one tick per bell up to the failure, each with the visitor and then the props, and ends with the violation', () => {
    const { counterexamples } = unsafe(checkScareCue());
    const byProperty = Object.fromEntries(counterexamples.map((c) => [c.property, c]));
    const s2 = byProperty.S2!;
    expect(s2.trace.map((t) => t.tick)).toEqual([1, 2]);
    expect(s2.trace.at(-1)!.turns.map((t) => t.actor)).toEqual(['visitor', 'jump-scare']);
    expect(s2.trace.at(-1)!.violation?.property).toBe('S2');
    const s1 = byProperty.S1!;
    expect(s1.trace.map((t) => t.tick)).toEqual([1, 2, 3, 4, 5]);
    for (const t of s1.trace) expect(t.turns[0]).toMatchObject({ actor: 'visitor', fired: null });
    for (const t of s1.trace.slice(0, -1)) {
      expect(t.turns.map((x) => x.actor)).toEqual(['visitor', 'jump-scare', 'fog machine', 'exit light']);
      expect(t.violation).toBeNull();
    }
    expect(s1.trace.at(-1)!.violation).toMatchObject({ property: 'S1', actors: ['fog machine'] });
  });

  it('S9.5: the trace is what the engine gives when the same moves are played again, and it survives JSON', () => {
    const { shortest } = unsafe(checkScareCue());
    const world = buildScareCue();
    const again = shortest.moves.map((to) => tick(cloneWorld(world), registry, { scripted: { visitor: to } }));
    expect(again[0]).toEqual(shortest.trace[0]);
    const w = cloneWorld(world);
    const replay = shortest.moves.map((to) => tick(w, registry, { scripted: { visitor: to } }));
    expect(replay).toEqual(shortest.trace);
    expect(JSON.parse(JSON.stringify(shortest.trace))).toEqual(shortest.trace);
  });
});
