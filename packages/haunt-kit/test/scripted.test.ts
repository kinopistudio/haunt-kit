import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cloneWorld, firedRule, openSteps, run, tick } from '../src/index';
import type { PropertyDef, TickTrace, TurnTrace } from '../src/index';
import { contactProperty, createToyRegistry, toyWorld } from './fixtures/toy-vocab';
import { bareWorld } from './fixtures/bare-world';

const rows = ['#########', '#S.....T#', '#########'];
const walk = 'THE seeker SHALL step toward the target.';

function must(t: TickTrace | null): TickTrace {
  if (t === null) throw new Error('expected a trace');
  return t;
}

describe('tick: scripted moves', () => {
  const registry = createToyRegistry();

  it('S5.1: a scripted actor moves to the given tile and does not evaluate its lines', () => {
    const w = toyWorld(rows, walk, registry);
    const t = must(tick(w, registry, { scripted: { seeker: { x: 5, y: 1 } } }));
    const turn = t.turns[0]!;
    expect(w.actors[0]!.pos).toEqual({ x: 5, y: 1 });
    expect(turn).toEqual({
      actor: 'seeker',
      kind: 'seeker',
      evals: [],
      fired: null,
      firedId: null,
      shadowed: [],
      shadowedIds: [],
      from: { x: 1, y: 1 },
      to: { x: 5, y: 1 },
    });
  });

  it('S5.1: the actor does not share the tile object it was given', () => {
    const w = toyWorld(rows, walk, registry);
    const to = { x: 2, y: 1 };
    must(tick(w, registry, { scripted: { seeker: to } }));
    to.x = 99;
    expect(w.actors[0]!.pos).toEqual({ x: 2, y: 1 });
  });

  it('S5.1: an actor that is not scripted still follows its lines in the same tick', () => {
    const w = toyWorld(rows, `${walk}\nTHE target SHALL step toward the target.`, registry, { turnOrder: ['seeker'] });
    const t = must(tick(w, registry, { scripted: { seeker: { x: 1, y: 1 } } }));
    expect(t.turns.map((x) => [x.actor, x.fired])).toEqual([['seeker', null], ['target', 0]]);
  });

  it('S5.1: a scripted move for an id that is not an actor throws and leaves the world unchanged', () => {
    const w = toyWorld(rows, walk, registry);
    const before = JSON.stringify(w);
    expect(() => tick(w, registry, { scripted: { ghost: { x: 1, y: 1 } } })).toThrow(/"ghost"/);
    expect(JSON.stringify(w)).toBe(before);
  });

  it('S5.2: the scripted turn happens in its place in the turn order, and later actors see the new position', () => {
    const w = toyWorld(
      rows,
      'WHEN the target is near, THE seeker SHALL step away from the target.\nTHE seeker SHALL do nothing.',
      registry,
      { turnOrder: ['target', 'seeker'] },
    );
    const t = must(tick(w, registry, { scripted: { target: { x: 2, y: 1 } } }));
    expect(t.turns.map((x) => x.actor)).toEqual(['target', 'seeker']);
    expect(t.turns[1]!.fired).toBe(0);
  });

  it('S5.2: a property is checked after the scripted turn, and the remaining actors do not act', () => {
    const reg = createToyRegistry().addProperty(contactProperty);
    const w = toyWorld(rows, 'THE target SHALL step away from the target.', reg, { turnOrder: ['seeker'] });
    const t = must(tick(w, reg, { scripted: { seeker: { x: 7, y: 1 } } }));
    expect(t.violation).toEqual({ property: 'no_contact', message: 'seeker reached the target', actors: ['seeker'] });
    expect(t.turns.map((x) => x.actor)).toEqual(['seeker']);
    expect(w.status).toBe('violated');
  });

  it('S5.5: without options, with {} and with an empty script, a tick gives the same trace', () => {
    const spec = `${walk}\nTHE target SHALL step away from the target.`;
    const a = toyWorld(rows, spec, registry);
    const b = cloneWorld(a);
    const c = cloneWorld(a);
    for (let i = 0; i < 4; i++) {
      const ta = tick(a, registry);
      expect(tick(b, registry, {})).toEqual(ta);
      expect(tick(c, registry, { scripted: {} })).toEqual(ta);
    }
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('S5.5: run is unchanged and still stops at the horizon', () => {
    const w = toyWorld(rows, walk, registry, { horizon: 3 });
    expect(run(w, registry)).toHaveLength(3);
    expect(w.status).toBe('complete');
  });
});

describe('tick: the turn passed to properties', () => {
  it('S5.3: check is called after every turn with the trace of that turn', () => {
    const seen: { actor: string; turn: TurnTrace | undefined; at: string }[] = [];
    const spy: PropertyDef = {
      id: 'spy',
      description: 'records its calls',
      check: (world, turn) => {
        seen.push({ actor: turn?.actor ?? '?', turn, at: JSON.stringify(world.actors.map((a) => a.pos)) });
        return null;
      },
    };
    const reg = createToyRegistry().addProperty(spy);
    const w = toyWorld(rows, `${walk}\nTHE target SHALL do nothing.`, reg, { turnOrder: ['seeker'] });
    const t = must(tick(w, reg));
    expect(seen.map((s) => s.actor)).toEqual(['seeker', 'target']);
    expect(seen.map((s) => s.turn)).toEqual(t.turns);
    expect(seen[0]!.at).toContain('"x":2');
  });

  it('S5.3: firedRule returns the rule of the line that fired, and null when none fired or the actor was scripted', () => {
    const reg = createToyRegistry();
    const w = toyWorld(rows, 'WHEN the target is near, THE seeker SHALL do nothing.\nTHE seeker SHALL step toward the target.', reg);
    const t = must(tick(w, reg));
    expect(firedRule(w, t.turns[0]!)).toEqual({ kw: '', cond: 'always', act: 'approach' });
    const w2 = toyWorld(rows, 'WHEN the target is near, THE seeker SHALL do nothing.', reg);
    const t2 = must(tick(w2, reg));
    expect(t2.turns[0]!.fired).toBeNull();
    expect(firedRule(w2, t2.turns[0]!)).toBeNull();
    const t3 = must(tick(w2, reg, { scripted: { seeker: { x: 2, y: 1 } } }));
    expect(firedRule(w2, t3.turns[0]!)).toBeNull();
  });

  it('S5.3: firedRule finds the line by id after a scheduled write shifted the indexes', () => {
    const reg = createToyRegistry();
    const spec = 'THE seeker SHALL step toward the target.\nWHEN the clock strikes 2, THE seeker SHALL write "THE seeker SHALL do nothing." at line 1.';
    const w = toyWorld(rows, spec, reg);
    const t1 = must(tick(w, reg));
    const t2 = must(tick(w, reg));
    expect(t2.turns[0]!.fired).toBe(0);
    expect(firedRule(w, t1.turns[0]!)).toEqual({ kw: '', cond: 'always', act: 'approach' });
    expect(firedRule(w, t2.turns[0]!)).toEqual({ kw: '', cond: 'always', act: 'rest' });
  });
});

describe('openSteps', () => {
  const grid = ['#####', '#...#', '#.b.#', '#...#', '#####'];
  const legend = { b: { item: { type: 'block', solid: true } } };
  const world = bareWorld(grid, { legend, items: [{ type: 'block', pos: { x: 2, y: 2 }, solid: true, state: {} }] });

  it('S5.4: lists the own tile, then east, west, south, north', () => {
    expect(openSteps(world, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }]);
    expect(openSteps(world, { x: 3, y: 3 })).toEqual([{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 2 }]);
    expect(openSteps(world, { x: 2, y: 3 })).toEqual([{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 1, y: 3 }]);
  });

  it('S5.4: on open ground the order is own tile, east, west, south, north', () => {
    const open = bareWorld(['#####', '#...#', '#...#', '#...#', '#####']);
    expect(openSteps(open, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 1 }]);
  });

  it('S5.4: blocked tiles (walls, solid items, outside the map) are left out, and the result is always one step or none', () => {
    const corner = bareWorld(['..', '..']);
    expect(openSteps(corner, { x: 0, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 }), (x, y) => {
        const steps = openSteps(world, { x, y });
        expect(steps[0]).toEqual({ x, y });
        for (const s of steps.slice(1)) {
          expect(Math.abs(s.x - x) + Math.abs(s.y - y)).toBe(1);
          expect(world.map.walls.has(s.y * world.map.w + s.x)).toBe(false);
          expect(s).not.toEqual({ x: 2, y: 2 });
        }
      }),
    );
  });

  it('S5.4: the result is a new list and does not alias the start tile', () => {
    const from = { x: 1, y: 1 };
    const steps = openSteps(world, from);
    steps[0]!.x = 9;
    expect(from).toEqual({ x: 1, y: 1 });
  });
});
