import { describe, expect, it } from 'vitest';
import { cloneWorld, recordRun, run } from '../src/index';
import { contactProperty, createToyRegistry, toyWorld } from './fixtures/toy-vocab';

const registry = createToyRegistry().addProperty(contactProperty);
const rows = ['#########', '#S.....T#', '#########'];
const SPEC = 'THE seeker SHALL step toward the target.';

function world(horizon = 12) {
  return toyWorld(rows, SPEC, registry, { horizon, properties: [] });
}

describe('recordRun', () => {
  it('U2.1: frames[0] is the start world, frames[k] the world after tick k, traces[k-1] the trace of tick k', () => {
    const start = world();
    const rec = recordRun(start, registry);
    expect(rec.status).toBe('complete');
    expect(rec.traces).toHaveLength(12);
    expect(rec.frames).toHaveLength(13);
    expect(rec.frames[0]).toEqual(start);
    rec.frames.forEach((f, k) => expect(f.tick).toBe(k));
    rec.traces.forEach((t, k) => expect(t.tick).toBe(k + 1));
    // The seeker walks one tile east per tick until it reaches the target's tile and stays there.
    expect(rec.frames[1]!.actors[0]!.pos).toEqual({ x: 2, y: 1 });
    expect(rec.frames[3]!.actors[0]!.pos).toEqual({ x: 4, y: 1 });
    expect(rec.traces[2]!.turns[0]!.to).toEqual(rec.frames[3]!.actors[0]!.pos);
  });

  it('U2.1: a run that breaks a property ends violated, with the failing tick last', () => {
    const w = toyWorld(rows, SPEC, registry, { properties: ['no_contact'] });
    const rec = recordRun(w, registry);
    expect(rec.status).toBe('violated');
    expect(rec.traces.at(-1)!.violation?.property).toBe('no_contact');
    expect(rec.frames).toHaveLength(rec.traces.length + 1);
    expect(rec.frames.at(-1)!.status).toBe('violated');
  });

  it('U2.2: the given world is not changed', () => {
    const start = world();
    const before = cloneWorld(start);
    recordRun(start, registry);
    expect(start).toEqual(before);
  });

  it('U2.2: no two frames share mutable state', () => {
    const rec = recordRun(world(), registry);
    const seen = new Set<object>();
    for (const f of rec.frames) {
      for (const a of f.actors) {
        for (const o of [a, a.pos, a.lines]) {
          expect(seen.has(o)).toBe(false);
          seen.add(o);
        }
      }
    }
    rec.frames[2]!.actors[0]!.pos.x = 99;
    expect(rec.frames[1]!.actors[0]!.pos.x).toBe(2);
    expect(rec.frames[3]!.actors[0]!.pos.x).toBe(4);
  });

  it('U2.3: a world that is not running gives one frame and no traces', () => {
    const w = world();
    run(w, registry);
    expect(w.status).toBe('complete');
    const rec = recordRun(w, registry);
    expect(rec.frames).toHaveLength(1);
    expect(rec.traces).toEqual([]);
    expect(rec.status).toBe('complete');
  });

  it('U2.4: the traces equal the traces run returns for a clone of the same world', () => {
    for (const properties of [[], ['no_contact']]) {
      const w = toyWorld(rows, SPEC, registry, { properties });
      const expected = run(cloneWorld(w), registry);
      expect(recordRun(w, registry).traces).toEqual(expected);
    }
  });

  it('U2.4: recording twice gives equal results', () => {
    const w = world();
    expect(recordRun(w, registry)).toEqual(recordRun(w, registry));
  });
});
