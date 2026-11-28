import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { distance, isBlocked, stepAway, stepToward } from '../src/index';
import type { Actor, Item, Pos, World } from '../src/index';
import { bareWorld } from './fixtures/bare-world';

const posArb = fc.record({ x: fc.integer({ min: -50, max: 50 }), y: fc.integer({ min: -50, max: 50 }) });

describe('distance', () => {
  it('R4.3: is the sum of the absolute differences', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
    expect(distance({ x: 5, y: 1 }, { x: 2, y: 3 })).toBe(5);
    expect(distance({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });

  it('R4.3: is a metric: non-negative, zero only at the same point, symmetric, triangle inequality', () => {
    fc.assert(
      fc.property(posArb, posArb, posArb, (a, b, c) => {
        expect(distance(a, b)).toBeGreaterThanOrEqual(0);
        expect(distance(a, b) === 0).toBe(a.x === b.x && a.y === b.y);
        expect(distance(a, b)).toBe(distance(b, a));
        expect(distance(a, c)).toBeLessThanOrEqual(distance(a, b) + distance(b, c));
      }),
    );
  });

  it('R4.3: ignores walls: it is distance on the plane, not path length', () => {
    expect(distance({ x: 1, y: 1 }, { x: 3, y: 1 })).toBe(2);
  });
});

const ROOM = ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'];

function setup(rows: string[], at: Pos, items: Item[] = []): { world: World; actor: Actor } {
  const world = bareWorld(rows, { actors: [{ id: 'a', kind: 'mover', pos: at }], items });
  return { world, actor: world.actors[0]! };
}

describe('stepToward', () => {
  it('R4.4: takes the axis with the larger difference first', () => {
    const h = setup(ROOM, { x: 1, y: 1 });
    expect(stepToward(h.world, h.actor, { x: 5, y: 2 })).toBe(true);
    expect(h.actor.pos).toEqual({ x: 2, y: 1 });
    const v = setup(ROOM, { x: 1, y: 1 });
    expect(stepToward(v.world, v.actor, { x: 2, y: 5 })).toBe(true);
    expect(v.actor.pos).toEqual({ x: 1, y: 2 });
  });

  it('R4.4: goes horizontally on a tie', () => {
    const { world, actor } = setup(ROOM, { x: 1, y: 1 });
    stepToward(world, actor, { x: 4, y: 4 });
    expect(actor.pos).toEqual({ x: 2, y: 1 });
  });

  it('R4.4: tries the minor axis when the major axis is blocked', () => {
    const rows = ['#######', '#..#..#', '#.....#', '#######'];
    const { world, actor } = setup(rows, { x: 2, y: 1 });
    expect(stepToward(world, actor, { x: 5, y: 2 })).toBe(true);
    expect(actor.pos).toEqual({ x: 2, y: 2 });
  });

  it('R4.4: stays when both axes are blocked', () => {
    const rows = ['#####', '#.###', '#####'];
    const { world, actor } = setup(rows, { x: 1, y: 1 });
    expect(stepToward(world, actor, { x: 3, y: 1 })).toBe(false);
    expect(actor.pos).toEqual({ x: 1, y: 1 });
  });

  it('R4.4: does not take the minor axis when the difference on it is zero', () => {
    const rows = ['#####', '#.#.#', '#...#', '#####'];
    const { world, actor } = setup(rows, { x: 1, y: 1 });
    expect(stepToward(world, actor, { x: 3, y: 1 })).toBe(false);
    expect(actor.pos).toEqual({ x: 1, y: 1 });
  });

  it('R4.4: stays when already on the target', () => {
    const { world, actor } = setup(ROOM, { x: 3, y: 3 });
    expect(stepToward(world, actor, { x: 3, y: 3 })).toBe(false);
    expect(actor.pos).toEqual({ x: 3, y: 3 });
  });

  it('R4.4: on an open floor a step always shortens the distance by exactly 1', () => {
    const tile = fc.record({ x: fc.integer({ min: 1, max: 5 }), y: fc.integer({ min: 1, max: 5 }) });
    fc.assert(
      fc.property(tile, tile, (from, target) => {
        const { world, actor } = setup(ROOM, from);
        const before = distance(actor.pos, target);
        const moved = stepToward(world, actor, target);
        expect(moved).toBe(before > 0);
        expect(distance(actor.pos, target)).toBe(before - (moved ? 1 : 0));
      }),
    );
  });

  it('R4.4: the step is along the major axis when it is not blocked', () => {
    const tile = fc.record({ x: fc.integer({ min: 1, max: 5 }), y: fc.integer({ min: 1, max: 5 }) });
    fc.assert(
      fc.property(tile, tile, (from, target) => {
        fc.pre(from.x !== target.x || from.y !== target.y);
        const { world, actor } = setup(ROOM, from);
        stepToward(world, actor, target);
        const dx = Math.abs(target.x - from.x);
        const dy = Math.abs(target.y - from.y);
        if (dx >= dy) expect(actor.pos.y).toBe(from.y);
        else expect(actor.pos.x).toBe(from.x);
      }),
    );
  });
});

describe('stepAway', () => {
  it('R4.5: moves along the major axis in the opposite direction', () => {
    const { world, actor } = setup(ROOM, { x: 3, y: 3 });
    expect(stepAway(world, actor, { x: 1, y: 2 })).toBe(true);
    expect(actor.pos).toEqual({ x: 4, y: 3 });
  });

  it('R4.5: falls back to the minor axis against a wall', () => {
    const { world, actor } = setup(ROOM, { x: 5, y: 3 });
    expect(stepAway(world, actor, { x: 3, y: 2 })).toBe(true);
    expect(actor.pos).toEqual({ x: 5, y: 4 });
  });

  it('R4.5: stays in a corner it cannot leave, and on the spot it flees from', () => {
    const corner = setup(ROOM, { x: 5, y: 5 });
    expect(stepAway(corner.world, corner.actor, { x: 3, y: 3 })).toBe(false);
    expect(corner.actor.pos).toEqual({ x: 5, y: 5 });
    const same = setup(ROOM, { x: 3, y: 3 });
    expect(stepAway(same.world, same.actor, { x: 3, y: 3 })).toBe(false);
  });

  it('R4.5: on an open floor a step either raises the distance by exactly 1 or does not move', () => {
    const tile = fc.record({ x: fc.integer({ min: 1, max: 5 }), y: fc.integer({ min: 1, max: 5 }) });
    fc.assert(
      fc.property(tile, tile, (from, source) => {
        const { world, actor } = setup(ROOM, from);
        const before = distance(actor.pos, source);
        const moved = stepAway(world, actor, source);
        expect(distance(actor.pos, source)).toBe(before + (moved ? 1 : 0));
      }),
    );
  });
});

describe('blocking', () => {
  const solid: Item = { type: 'barrier', pos: { x: 3, y: 2 }, solid: true, state: {} };
  const soft: Item = { type: 'rug', pos: { x: 2, y: 2 }, solid: false, state: {} };

  it('R4.6: tiles outside the map are blocked', () => {
    const w = setup(ROOM, { x: 1, y: 1 }).world;
    for (const p of [{ x: -1, y: 1 }, { x: 1, y: -1 }, { x: 7, y: 1 }, { x: 1, y: 7 }]) expect(isBlocked(w, p)).toBe(true);
  });

  it('R4.6: wall tiles are blocked', () => {
    const w = setup(ROOM, { x: 1, y: 1 }).world;
    expect(isBlocked(w, { x: 0, y: 0 })).toBe(true);
    expect(isBlocked(w, { x: 1, y: 1 })).toBe(false);
  });

  it('R4.6: tiles with a solid item are blocked and tiles with other items are not', () => {
    const w = setup(ROOM, { x: 1, y: 1 }, [solid, soft]).world;
    expect(isBlocked(w, solid.pos)).toBe(true);
    expect(isBlocked(w, soft.pos)).toBe(false);
  });

  it('R4.6: other actors do not block', () => {
    const w = bareWorld(ROOM, {
      actors: [
        { id: 'a', kind: 'mover', pos: { x: 1, y: 1 } },
        { id: 'b', kind: 'mover', pos: { x: 2, y: 1 } },
      ],
    });
    expect(isBlocked(w, { x: 2, y: 1 })).toBe(false);
    expect(stepToward(w, w.actors[0]!, { x: 4, y: 1 })).toBe(true);
    expect(w.actors[0]!.pos).toEqual({ x: 2, y: 1 });
  });

  it('R4.6: a step never ends on a blocked tile and moves at most one tile, on random maps', () => {
    const cell = fc.constantFrom('.', '.', '.', '#');
    const gridArb = fc.array(fc.array(cell, { minLength: 6, maxLength: 6 }).map((r) => r.join('')), { minLength: 6, maxLength: 6 });
    const tile = fc.record({ x: fc.integer({ min: 0, max: 5 }), y: fc.integer({ min: 0, max: 5 }) });
    const itemsArb = fc.array(tile.map((pos): Item => ({ type: 'barrier', pos, solid: true, state: {} })), { maxLength: 4 });
    fc.assert(
      fc.property(gridArb, tile, tile, itemsArb, fc.boolean(), (rows, from, target, items, away) => {
        const world = bareWorld(rows, { actors: [{ id: 'a', kind: 'mover', pos: from }], items });
        const actor = world.actors[0]!;
        fc.pre(!isBlocked(world, from));
        const moved = away ? stepAway(world, actor, target) : stepToward(world, actor, target);
        expect(isBlocked(world, actor.pos)).toBe(false);
        expect(distance(actor.pos, from)).toBe(moved ? 1 : 0);
      }),
      { numRuns: 500 },
    );
  });
});
