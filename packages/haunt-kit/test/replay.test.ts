import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { replayReduce, replayStart } from '../src/index';
import type { ReplayAction, ReplayState } from '../src/index';

const at = (cursor: number, length = 12, playing = false): ReplayState => ({ cursor, length, playing });

describe('replayReduce', () => {
  it('U6.1: the initial state has cursor 0, playing false and the given length', () => {
    expect(replayStart(12)).toEqual({ cursor: 0, length: 12, playing: false });
    expect(replayStart(-3).length).toBe(0);
    expect(replayStart(Number.NaN).length).toBe(0);
  });

  it('U6.2: play sets playing, starts again from 0 at the end, and does nothing without ticks', () => {
    expect(replayReduce(at(4), { type: 'play' })).toEqual(at(4, 12, true));
    expect(replayReduce(at(12), { type: 'play' })).toEqual(at(0, 12, true));
    const empty = replayStart(0);
    expect(replayReduce(empty, { type: 'play' })).toBe(empty);
  });

  it('U6.2: pause stops a playing replay and keeps the cursor', () => {
    expect(replayReduce(at(4, 12, true), { type: 'pause' })).toEqual(at(4));
  });

  it('U6.3: step and back move the cursor by one, stay in range and pause', () => {
    expect(replayReduce(at(3, 12, true), { type: 'step' })).toEqual(at(4));
    expect(replayReduce(at(3, 12, true), { type: 'back' })).toEqual(at(2));
    expect(replayReduce(at(12), { type: 'step' })).toEqual(at(12));
    expect(replayReduce(at(0), { type: 'back' })).toEqual(at(0));
  });

  it('U6.4: seek rounds, limits to 0..length and pauses', () => {
    expect(replayReduce(at(3, 12, true), { type: 'seek', to: 7.6 })).toEqual(at(8));
    expect(replayReduce(at(3), { type: 'seek', to: -5 })).toEqual(at(0));
    expect(replayReduce(at(3), { type: 'seek', to: 99 })).toEqual(at(12));
    expect(replayReduce(at(3), { type: 'seek', to: Number.NaN })).toEqual(at(0));
    expect(replayReduce(at(3), { type: 'start' })).toEqual(at(0));
    expect(replayReduce(at(3), { type: 'end' })).toEqual(at(12));
  });

  it('U6.5: advance moves one tick while playing and stops at the end; it does nothing when not playing', () => {
    expect(replayReduce(at(3, 12, true), { type: 'advance' })).toEqual(at(4, 12, true));
    expect(replayReduce(at(11, 12, true), { type: 'advance' })).toEqual(at(12, 12, false));
    const idle = at(3);
    expect(replayReduce(idle, { type: 'advance' })).toBe(idle);
  });

  it('U6.6: reset gives cursor 0, playing false and the new length', () => {
    expect(replayReduce(at(5, 12, true), { type: 'reset', length: 7 })).toEqual(at(0, 7));
  });

  it('U6.3: the reducer does not change its input', () => {
    const state = at(5, 12, true);
    const copy = { ...state };
    for (const type of ['play', 'pause', 'step', 'back', 'advance', 'start', 'end'] as const) replayReduce(state, { type });
    expect(state).toEqual(copy);
  });

  it('U6.3: any sequence of actions keeps 0 <= cursor <= length (property)', () => {
    const action: fc.Arbitrary<ReplayAction> = fc.oneof(
      fc.constantFrom(...(['play', 'pause', 'step', 'back', 'advance', 'start', 'end'] as const).map((type) => ({ type }) as ReplayAction)),
      fc.double({ noNaN: false, min: -50, max: 50 }).map((to) => ({ type: 'seek', to }) as ReplayAction),
      fc.integer({ min: 0, max: 20 }).map((length) => ({ type: 'reset', length }) as ReplayAction),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 60 }), (actions) => {
        let state = replayStart(12);
        for (const a of actions) {
          state = replayReduce(state, a);
          expect(Number.isInteger(state.cursor)).toBe(true);
          expect(state.cursor).toBeGreaterThanOrEqual(0);
          expect(state.cursor).toBeLessThanOrEqual(state.length);
          if (state.length === 0) expect(state.playing).toBe(false);
        }
      }),
    );
  });
});
