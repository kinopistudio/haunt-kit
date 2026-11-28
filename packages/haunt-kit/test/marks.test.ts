import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bookState, insertLine, loadSpec, recordRun } from '../src/index';
import type { Recording, Rule } from '../src/index';
import { contactProperty, createToyRegistry, toyWorld } from './fixtures/toy-vocab';

const registry = createToyRegistry().addProperty(contactProperty);
const rows = ['#########', '#S..T...#', '#########'];
const STEP = 'THE seeker SHALL step toward the target.';
const rule = (text: string): Rule => Object.values(loadSpec(text, registry).spec.actors)[0]![0]!;

function record(spec: string, opts: { cards?: { at: number; text: string }[]; properties?: string[]; horizon?: number; rows?: string[] } = {}): Recording {
  const w = toyWorld(opts.rows ?? rows, spec, registry, { properties: opts.properties ?? [], horizon: opts.horizon ?? 6 });
  for (const card of opts.cards ?? []) insertLine(w, 'seeker', card.at, rule(card.text), 'card');
  return recordRun(w, registry);
}

const markList = (rec: Recording, cursor: number, options = {}) => [...bookState(rec, cursor, options).marks.values()];

describe('bookState', () => {
  it('U5.1: gives a mark and a tally for every line of the frame at the cursor', () => {
    const rec = record(STEP, { cards: [{ at: 0, text: 'THE seeker SHALL do nothing.' }] });
    for (let c = 0; c <= rec.traces.length; c++) {
      const ids = rec.frames[c]!.actors.flatMap((a) => a.lines.map((l) => l.id));
      const state = bookState(rec, c);
      expect([...state.marks.keys()]).toEqual(ids);
      expect([...state.tally.keys()]).toEqual(ids);
    }
  });

  it('U5.2: at cursor 0 every mark is idle, every tally 0, and nothing fired or was written', () => {
    const rec = record(STEP, { cards: [{ at: 0, text: 'THE seeker SHALL do nothing.' }] });
    const state = bookState(rec, 0);
    expect(markList(rec, 0)).toEqual(['idle', 'idle']);
    expect([...state.tally.values()]).toEqual([0, 0]);
    expect(state.fired).toEqual([]);
    expect(state.written).toEqual([]);
  });

  it('U5.3: the line that ran is lit, a true line below it is shadowed, lines above it are false, other lines below are skipped', () => {
    const spec = ['WHEN the switch is on, THE seeker SHALL do nothing.', 'WHEN the target is far, THE seeker SHALL step toward the target.', 'THE seeker SHALL do nothing.', 'WHEN the switch is on, THE seeker SHALL step away from the target.'].join('\n');
    const rec = record(spec);
    // Tick 1: the target is 3 away, so line 2 runs; line 3 is true and shadowed; line 4 is false below.
    expect(markList(rec, 1)).toEqual(['false', 'lit', 'shadowed', 'skipped']);
    // Tick 2: the seeker is 2 away, line 2 is false, line 3 runs.
    expect(markList(rec, 2)).toEqual(['false', 'false', 'lit', 'skipped']);
  });

  it('U5.3: every line of an actor with no true line is false', () => {
    const rec = record('WHEN the switch is on, THE seeker SHALL do nothing.\nWHEN the clock is past 50, THE seeker SHALL do nothing.');
    expect(markList(rec, 3)).toEqual(['false', 'false']);
  });

  it('U5.3: an actor that took no turn because a violation stopped the tick keeps idle lines', () => {
    const rec = record(STEP, { properties: ['no_contact'], rows: ['######', '#ST..#', '######'] });
    // The seeker moves first, onto the target, and the property fails on its turn. The target has no lines.
    expect(rec.status).toBe('violated');
    expect(markList(rec, rec.traces.length)).toEqual(['lit']);
  });

  it('U5.4: lists the lines that ran on the tick of the cursor, with their index at that tick', () => {
    const rec = record('THE seeker SHALL do nothing.', { cards: [{ at: 0, text: 'WHEN the target is far, THE seeker SHALL step toward the target.' }] });
    const first = bookState(rec, 1);
    const [card, spec] = rec.frames[1]!.actors[0]!.lines;
    expect(first.fired).toEqual([{ actor: 'seeker', lineId: card!.id, index: 0 }]);
    const second = bookState(rec, 2);
    expect(second.fired).toEqual([{ actor: 'seeker', lineId: spec!.id, index: 1 }]);
  });

  it('U5.4: lists the lines a scheduled write added on that tick, and none on other ticks', () => {
    const spec = [STEP, 'WHEN the clock strikes 3, THE seeker SHALL write "THE seeker SHALL do nothing." at line 1.'].join('\n');
    const rec = record(spec);
    expect(bookState(rec, 2).written).toEqual([]);
    const at3 = bookState(rec, 3);
    expect(at3.written).toHaveLength(1);
    expect(at3.written[0]).toMatchObject({ actor: 'seeker', index: 0 });
    expect(bookState(rec, 4).written).toEqual([]);
    // The new line is lit on its own tick: it is first and always true.
    expect(at3.marks.get(at3.written[0]!.lineId)).toBe('lit');
  });

  it('U5.5: the tally counts the ticks up to and including the cursor on which the line ran', () => {
    const rec = record('WHEN the target is far, THE seeker SHALL step toward the target.\nTHE seeker SHALL do nothing.');
    const [far, rest] = rec.frames[0]!.actors[0]!.lines.map((l) => l.id);
    expect([0, 1, 2, 6].map((c) => bookState(rec, c).tally.get(far!))).toEqual([0, 1, 1, 1]);
    expect([0, 1, 2, 6].map((c) => bookState(rec, c).tally.get(rest!))).toEqual([0, 0, 1, 5]);
  });

  it('U5.6: at the end of a completed run with final set, lines that ran are gold and the others are ash', () => {
    const rec = record(STEP, { cards: [{ at: 1, text: 'THE seeker SHALL do nothing.' }] });
    expect(rec.status).toBe('complete');
    expect(markList(rec, rec.traces.length, { final: true })).toEqual(['gold', 'ash']);
    expect(markList(rec, rec.traces.length)).toEqual(['lit', 'shadowed']);
  });

  it('U5.6: final does nothing before the last tick, or when the run was violated', () => {
    const rec = record(STEP, { cards: [{ at: 1, text: 'THE seeker SHALL do nothing.' }] });
    expect(markList(rec, rec.traces.length - 1, { final: true })).toEqual(['lit', 'shadowed']);
    const lost = record(STEP, { properties: ['no_contact'] });
    expect(lost.status).toBe('violated');
    expect(markList(lost, lost.traces.length, { final: true })).toEqual(['lit']);
  });

  it('U5.7: struck lines get the mark struck, whatever their other mark', () => {
    const rec = record(STEP, { cards: [{ at: 1, text: 'THE seeker SHALL do nothing.' }] });
    const [spec, card] = rec.frames[0]!.actors[0]!.lines.map((l) => l.id);
    expect(markList(rec, 2, { struck: [spec] })).toEqual(['struck', 'shadowed']);
    expect(markList(rec, rec.traces.length, { final: true, struck: [card] })).toEqual(['gold', 'struck']);
    expect(markList(rec, 2, { struck: [9999] })).toEqual(['lit', 'shadowed']);
  });

  it('U5.8: a cursor that is not an integer from 0 to the number of ticks throws a RangeError', () => {
    const rec = record(STEP);
    for (const bad of [-1, rec.traces.length + 1, 1.5, Number.NaN, Infinity]) expect(() => bookState(rec, bad)).toThrow(RangeError);
    expect(() => bookState(rec, rec.traces.length)).not.toThrow();
  });

  it('U5.5: the tally of every line never decreases as the cursor grows (property)', () => {
    const texts = [STEP, 'THE seeker SHALL do nothing.', 'WHEN the target is far, THE seeker SHALL step toward the target.', 'WHEN the target is near, THE seeker SHALL step away from the target.'];
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: texts.length - 1 }), { minLength: 1, maxLength: 4 }), (picks) => {
        const rec = record(texts[picks[0]!]!, { cards: picks.slice(1).map((p, i) => ({ at: i, text: texts[p]! })), horizon: 8 });
        let previous = new Map<number, number>();
        for (let c = 0; c <= rec.traces.length; c++) {
          const tally = bookState(rec, c).tally;
          for (const [id, n] of tally) expect(n).toBeGreaterThanOrEqual(previous.get(id) ?? 0);
          previous = tally;
        }
      }),
    );
  });
});
