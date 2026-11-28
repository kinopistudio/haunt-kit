import { describe, expect, it } from 'vitest';
import { insertLine, loadSpec, recordRun, tick } from '../src/index';
import type { Recording, World } from '../src/index';
import { createToyRegistry, toyWorld } from './fixtures/toy-vocab';
import { lineStats } from '../src/index';

const registry = createToyRegistry();
const rows = ['#########', '#S.....T#', '#########'];

const record = (spec: string, rowsIn = rows, horizon = 12): Recording => recordRun(toyWorld(rowsIn, spec, registry, { horizon, properties: [] }), registry);

describe('lineStats', () => {
  it('U3.1: one entry per line of the last frame, in actor order then line order, with actor, id and origin', () => {
    const rec = record('THE seeker SHALL step toward the target.\nTHE watcher SHALL do nothing.', ['#########', '#S..T..W#', '#########']);
    const stats = lineStats(rec);
    expect([...stats.values()].map((s) => [s.actor, s.origin])).toEqual([
      ['seeker', 'spec'],
      ['watcher', 'spec'],
    ]);
    const ids = rec.frames.at(-1)!.actors.flatMap((a) => a.lines.map((l) => l.id));
    expect([...stats.keys()]).toEqual(ids);
    expect([...stats.values()].every((s) => s.born === 0)).toBe(true);
  });

  it('U3.2: fired counts the ticks a line ran, shadowed the ticks it was true under a line that ran, idle the ticks it was false', () => {
    // The seeker is 3 tiles from the target, so line 1 is true on tick 1 only (far means more than 2).
    // Line 2 and line 3 are always true.
    const rec = record(
      ['WHEN the target is far, THE seeker SHALL step toward the target.', 'THE seeker SHALL do nothing.', 'THE seeker SHALL step toward the target.'].join('\n'),
      ['#########', '#S..T...#', '#########'],
      6,
    );
    expect(rec.traces.map((t) => t.turns[0]!.fired)).toEqual([0, 1, 1, 1, 1, 1]);
    const [a, b, c] = [...lineStats(rec).values()];
    expect(a).toMatchObject({ fired: 1, shadowed: 0, idle: 5 });
    expect(b).toMatchObject({ fired: 5, shadowed: 1, idle: 0 });
    expect(c).toMatchObject({ fired: 0, shadowed: 6, idle: 0 });
    for (const s of [a!, b!, c!]) expect(s.fired + s.shadowed + s.idle).toBe(rec.traces.length);
  });

  it('U3.3: firstFired and firstShadowed come from the traces, with the index and the shadowing line', () => {
    const rec = record('THE seeker SHALL do nothing.\nTHE seeker SHALL step toward the target.', rows, 5);
    const [first, second] = [...lineStats(rec).values()];
    expect(first!.firstFired).toBe(1);
    expect(first!.firstShadowed).toBeNull();
    expect(second!.firstFired).toBeNull();
    expect(second!.firstShadowed).toEqual({ tick: 1, index: 1, byId: first!.id, byIndex: 0 });
  });

  it('U3.3: a line that never ran and was never true has no firstFired and no firstShadowed', () => {
    const rec = record('THE seeker SHALL do nothing.\nWHEN the switch is on, THE seeker SHALL step toward the target.');
    const [, second] = [...lineStats(rec).values()];
    // The second line is below an always-true line and its condition is false: checked, false, never shadowed.
    expect(second).toMatchObject({ fired: 0, shadowed: 0, idle: 12, firstFired: null, firstShadowed: null });
  });

  it('U3.4: a rewrite that inserts a line above others does not move the indexes of earlier ticks', () => {
    const spec = [
      'THE seeker SHALL do nothing.',
      'THE seeker SHALL step toward the target.',
      'WHEN the clock strikes 3, THE seeker SHALL write "THE seeker SHALL step away from the target." at line 1.',
    ].join('\n');
    const rec = record(spec, rows, 5);
    const stats = [...lineStats(rec).values()];
    const rewritten = stats.find((s) => s.origin === 'rewrite')!;
    expect(rewritten.born).toBe(3);
    expect(rewritten.firstFired).toBe(3);
    // The original second line was shadowed at tick 1 as index 1; at tick 3 the rewrite pushes it to index 2.
    const original = stats.find((s) => s.origin === 'spec' && s.firstShadowed !== null && s.id !== rewritten.id && s.fired === 0)!;
    expect(original.firstShadowed).toMatchObject({ tick: 1, index: 1, byIndex: 0 });
    // After the write, the line that was at index 0 is at index 1, so the line at index 2 is shadowed by index 0.
    const lastTrace = rec.traces.at(-1)!.turns[0]!;
    expect(lastTrace.shadowed).toEqual([1, 2]);
    expect(lastTrace.fired).toBe(0);
  });

  it('U3.5: a scripted turn counts for no line', () => {
    const w: World = toyWorld(rows, 'THE seeker SHALL step toward the target.', registry, { properties: [] });
    const frames = [structuredClone(w)];
    const traces = [tick(w, registry, { scripted: { seeker: { x: 1, y: 1 } } })!];
    frames.push(structuredClone(w));
    const stats = lineStats({ frames, traces, status: w.status });
    expect([...stats.values()][0]).toMatchObject({ fired: 0, shadowed: 0, idle: 0 });
  });

  it('U3.1: a card inserted into a spec is listed with origin card and born 0', () => {
    const w = toyWorld(rows, 'THE seeker SHALL step toward the target.', registry, { properties: [] });
    insertLine(w, 'seeker', 0, loadSpec('THE seeker SHALL do nothing.', registry).spec.actors.seeker![0]!, 'card');
    const stats = [...lineStats(recordRun(w, registry)).values()];
    expect(stats.map((s) => [s.origin, s.born, s.fired, s.shadowed])).toEqual([
      ['card', 0, 12, 0],
      ['spec', 0, 0, 12],
    ]);
  });
});
