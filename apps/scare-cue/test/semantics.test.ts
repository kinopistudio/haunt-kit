import { tick } from 'haunt-kit';
import type { Pos, TickTrace, World } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { buildScareCue, registry } from '../src/level';

/** Plays the visitor's moves one tick at a time and returns every trace. Stops when the world stops. */
function play(world: World, moves: Pos[]): TickTrace[] {
  const traces: TickTrace[] = [];
  for (const to of moves) {
    const trace = tick(world, registry, { scripted: { visitor: to } });
    if (trace === null) break;
    traces.push(trace);
  }
  return traces;
}

const p = (x: number, y: number): Pos => ({ x, y });
const ids = (t: TickTrace): string[] => t.turns.map((turn) => turn.actor);

describe('Scare Cue engine semantics', () => {
  it('S8.5: in every tick the visitor moves first, then the jump-scare, the fog machine and the exit light', () => {
    const traces = play(buildScareCue(), [p(1, 2), p(1, 3)]);
    expect(traces.map(ids)).toEqual([
      ['visitor', 'jump-scare', 'fog machine', 'exit light'],
      ['visitor', 'jump-scare', 'fog machine', 'exit light'],
    ]);
    expect(traces[0]!.turns[0]).toMatchObject({ evals: [], fired: null, from: p(1, 1), to: p(1, 2) });
  });

  it('S8.5: the props read the world after the visitor has moved, and the first true line fires', () => {
    const world = buildScareCue();
    const [t1, t2] = play(world, [p(2, 1), p(1, 1)]);
    // The visitor is 2 steps from the jump-scare after tick 1: its line fires (trigger). After going back it is 3 steps away.
    expect(t1!.turns[1]).toMatchObject({ actor: 'jump-scare', fired: 0 });
    expect(t1!.violation).toBeNull();
    expect(t2!.turns[1]).toMatchObject({ actor: 'jump-scare', fired: null, evals: [false] });
    // The fog machine has the "always stop the fog" line, so it fires line 2 when no visitor is near.
    expect(t1!.turns[2]).toMatchObject({ actor: 'fog machine', fired: 1, evals: [false, true] });
  });

  it('S8.5: S2 is checked after the jump-scare triggers with a visitor adjacent, and the tick stops there', () => {
    const traces = play(buildScareCue(), [p(2, 1), p(3, 1), p(3, 2)]);
    expect(traces).toHaveLength(2);
    const last = traces[1]!;
    expect(last.violation).toEqual({
      property: 'S2',
      message: 'THE jump-scare SHALL NOT trigger WHILE a visitor is adjacent.',
      actors: ['jump-scare'],
    });
    expect(ids(last)).toEqual(['visitor', 'jump-scare']);
    expect(last.status).toBe('violated');
  });

  it('S8.5: S1 is checked after every prop turn: the fog going on is not a failure until the light is off', () => {
    const world = buildScareCue();
    const traces = play(world, [p(1, 2), p(1, 3), p(1, 4), p(2, 4), p(3, 4)]);
    expect(traces).toHaveLength(5);
    expect(traces.slice(0, 4).every((t) => t.violation === null)).toBe(true);
    const last = traces[4]!;
    // The fog machine sprays first (the fog is on, the light still on: no failure), then the exit light turns off.
    expect(last.turns.map((t) => [t.actor, t.fired])).toEqual([['visitor', null], ['jump-scare', null], ['fog machine', 0], ['exit light', 0]]);
    expect(last.violation).toEqual({
      property: 'S1',
      message: 'THE fog machine SHALL NOT be on WHILE the exit light is off.',
      actors: ['fog machine'],
    });
    expect(world.items.find((i) => i.type === 'fog')!.state.on).toBe(true);
    expect(world.items.find((i) => i.type === 'exit-light')!.state.on).toBe(false);
  });

  it('S8.5: the exit-light fix on line 1 keeps the light on when the fog is on, so S1 holds on the same walk', () => {
    const world = buildScareCue([{ card: 0, at: 0 }]);
    const traces = play(world, [p(1, 2), p(1, 3), p(1, 4), p(2, 4), p(3, 4), p(3, 4)]);
    expect(traces.every((t) => t.violation === null)).toBe(true);
    const turn = traces[4]!.turns[3]!;
    expect(turn).toMatchObject({ actor: 'exit light', fired: 0, shadowed: [1, 2] });
    expect(world.items.find((i) => i.type === 'exit-light')!.state.on).toBe(true);
  });

  it('S8.5: the same fix on line 2 is shadowed by the rule above it, so S1 still fails', () => {
    const world = buildScareCue([{ card: 0, at: 1 }]);
    const traces = play(world, [p(1, 2), p(1, 3), p(1, 4), p(2, 4), p(3, 4)]);
    expect(traces.at(-1)!.violation?.property).toBe('S1');
  });

  it('S8.5: a replay of the same moves gives the same traces', () => {
    const moves = [p(2, 1), p(3, 1)];
    expect(play(buildScareCue(), moves)).toEqual(play(buildScareCue(), moves));
  });
});
