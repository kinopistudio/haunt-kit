import fc from 'fast-check';
import { cloneWorld, run } from 'haunt-kit';
import type { TickTrace } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { LEVEL_INFO, levelInfo, makeNames } from '../src/content';
import { LEVELS, NIGHT_1, NIGHT_4, PROLOGUE, buildWorld } from '../src/levels';
import {
  cardPlace,
  floorTiles,
  freshPlan,
  insertCard,
  isFreeTile,
  itemTypes,
  levelActors,
  moveItem,
  placeItem,
  pieceAt,
  remaining,
  removeCard,
  takeItem,
  toInserts,
  toPlacement,
  usedCards,
} from '../src/plan';
import type { Plan } from '../src/plan';
import { levelChoices } from '../src/solve';
import { planOfChoice } from './fixtures/plan-of-choice';
import { createRegistry } from '../src/vocab';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}

describe('plan: items', () => {
  it('M3.1: a fresh plan lists every item type of the level with its count, and every card of the level', () => {
    expect(itemTypes(PROLOGUE)).toEqual(['salt']);
    expect(remaining(PROLOGUE, freshPlan(PROLOGUE), 'salt')).toBe(1);
    expect(itemTypes(NIGHT_1)).toEqual(['bell']);
    expect(remaining(NIGHT_1, freshPlan(NIGHT_1), 'bell')).toBe(1);
    expect(NIGHT_1.cards).toHaveLength(2);
    expect(NIGHT_4.cards).toHaveLength(1);
    expect(levelActors(NIGHT_1).map((a) => [a.id, a.lines])).toEqual([['girl', 1], ['wisp', 1], ['wisp-2', 1]]);
    for (const level of LEVELS) expect(freshPlan(level).items).toEqual([]);
  });

  it('M3.2: placing an item on a free tile puts it there and reduces the number left', () => {
    const plan = freshPlan(PROLOGUE);
    const placed = must(placeItem(PROLOGUE, plan, 'salt', 4, 3));
    expect(placed.items).toEqual([{ type: 'salt', x: 4, y: 3 }]);
    expect(remaining(PROLOGUE, placed, 'salt')).toBe(0);
    expect(plan.items).toEqual([]);
  });

  it('M3.2: no more can be placed than the level has', () => {
    const placed = must(placeItem(PROLOGUE, freshPlan(PROLOGUE), 'salt', 4, 3));
    expect(placeItem(PROLOGUE, placed, 'salt', 3, 3)).toBeNull();
    expect(placeItem(PROLOGUE, freshPlan(PROLOGUE), 'bell', 3, 3)).toBeNull();
  });

  it('M3.3: a wall, a ghost, the bed and an occupied tile refuse an item', () => {
    const plan = freshPlan(NIGHT_1);
    expect(isFreeTile(NIGHT_1, plan, 0, 0)).toBe(false); // wall
    expect(isFreeTile(NIGHT_1, plan, 1, 1)).toBe(false); // a wisp starts here
    expect(isFreeTile(NIGHT_1, plan, 4, 4)).toBe(false); // the bed
    expect(isFreeTile(NIGHT_1, plan, 99, 1)).toBe(false);
    expect(isFreeTile(NIGHT_1, plan, 4, 3)).toBe(true);
    for (const [x, y] of [[0, 0], [1, 1], [4, 4], [-1, 2]] as const) expect(placeItem(NIGHT_1, plan, 'bell', x, y)).toBeNull();
    const placed = must(placeItem(NIGHT_1, plan, 'bell', 4, 3));
    expect(isFreeTile(NIGHT_1, placed, 4, 3)).toBe(false);
  });

  it('M3.3: every floor tile of a level is plain floor: not a wall, a ghost start or the bed', () => {
    for (const level of LEVELS) {
      const world = buildWorld(level);
      for (const t of floorTiles(level)) {
        expect(world.map.walls.has(t.y * world.map.w + t.x)).toBe(false);
        expect(world.actors.some((a) => a.pos.x === t.x && a.pos.y === t.y)).toBe(false);
      }
    }
  });

  it('M3.4: taking a placed item gives its type back and removes it from the plan', () => {
    const placed = must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3));
    const taken = must(takeItem(placed, 4, 3));
    expect(taken.type).toBe('bell');
    expect(taken.plan.items).toEqual([]);
    expect(remaining(NIGHT_1, taken.plan, 'bell')).toBe(1);
    expect(takeItem(placed, 2, 2)).toBeNull();
    expect(pieceAt(placed, 4, 3)).toEqual({ type: 'bell', x: 4, y: 3 });
  });

  it('M3.5: moving an item puts it on the new tile, and refuses a tile that is not free', () => {
    const placed = must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3));
    expect(must(moveItem(NIGHT_1, placed, { x: 4, y: 3 }, { x: 2, y: 2 })).items).toEqual([{ type: 'bell', x: 2, y: 2 }]);
    expect(moveItem(NIGHT_1, placed, { x: 4, y: 3 }, { x: 0, y: 0 })).toBeNull();
    expect(moveItem(NIGHT_1, placed, { x: 5, y: 5 }, { x: 2, y: 2 })).toBeNull();
  });
});

describe('plan: cards', () => {
  it('M3.6: inserting a card puts it at the line and moves the lines at and below it down', () => {
    const plan = freshPlan(NIGHT_4);
    const inserted = must(insertCard(NIGHT_4, plan, 0, 'wisp', 1));
    expect(inserted.lists.wisp).toEqual([{ t: 'base', i: 0 }, { t: 'card', c: 0 }, { t: 'base', i: 1 }, { t: 'base', i: 2 }]);
    const top = must(insertCard(NIGHT_4, plan, 0, 'wisp', 0));
    expect(top.lists.wisp![0]).toEqual({ t: 'card', c: 0 });
    expect(top.lists.wisp).toHaveLength(4);
    const bottom = must(insertCard(NIGHT_4, plan, 0, 'wisp', 3));
    expect(bottom.lists.wisp!.at(-1)).toEqual({ t: 'card', c: 0 });
    expect(plan.lists.wisp).toHaveLength(3);
  });

  it('M3.6: refuses an unknown actor, a position out of range and an unknown card', () => {
    const plan = freshPlan(NIGHT_4);
    expect(insertCard(NIGHT_4, plan, 0, 'ghost', 0)).toBeNull();
    expect(insertCard(NIGHT_4, plan, 0, 'wisp', 4)).toBeNull();
    expect(insertCard(NIGHT_4, plan, 0, 'wisp', -1)).toBeNull();
    expect(insertCard(NIGHT_4, plan, 0, 'wisp', 0.5)).toBeNull();
    expect(insertCard(NIGHT_4, plan, 1, 'wisp', 0)).toBeNull();
  });

  it('M3.8: each card is in at most one spec, and removing it returns it to the tray', () => {
    const plan = must(insertCard(NIGHT_1, freshPlan(NIGHT_1), 0, 'wisp', 0));
    expect(insertCard(NIGHT_1, plan, 0, 'wisp-2', 0)).toBeNull();
    expect(cardPlace(plan, 0)).toEqual({ actor: 'wisp', at: 0 });
    expect(cardPlace(plan, 1)).toBeNull();
    expect([...usedCards(plan)]).toEqual([0]);
    const second = must(insertCard(NIGHT_1, plan, 1, 'wisp', 0));
    expect(second.lists.wisp).toEqual([{ t: 'card', c: 1 }, { t: 'card', c: 0 }, { t: 'base', i: 0 }]);
    const back = removeCard(second, 1);
    expect(back.lists.wisp).toEqual([{ t: 'card', c: 0 }, { t: 'base', i: 0 }]);
    expect(usedCards(back).has(1)).toBe(false);
    expect(removeCard(back, 1)).toBe(back);
    expect(must(insertCard(NIGHT_1, back, 1, 'wisp-2', 1)).lists['wisp-2']).toHaveLength(2);
  });

  it('M3.10: clearing is a fresh plan: every item and card is back in the tray', () => {
    let plan = must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3));
    plan = must(insertCard(NIGHT_1, plan, 0, 'wisp', 0));
    const cleared = freshPlan(NIGHT_1);
    expect(cleared).toEqual(freshPlan(NIGHT_1));
    expect(cleared.items).toEqual([]);
    expect(usedCards(cleared).size).toBe(0);
    expect(remaining(NIGHT_1, cleared, 'bell')).toBe(1);
    expect(plan).not.toEqual(cleared);
  });

  it('M3.1: the plan functions never change the plan they are given', () => {
    const plan = must(insertCard(NIGHT_1, must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3)), 0, 'wisp', 0));
    const copy = structuredClone(plan);
    placeItem(NIGHT_1, plan, 'bell', 2, 2);
    takeItem(plan, 4, 3);
    moveItem(NIGHT_1, plan, { x: 4, y: 3 }, { x: 2, y: 2 });
    insertCard(NIGHT_1, plan, 1, 'wisp', 0);
    removeCard(plan, 0);
    toPlacement(NIGHT_1, plan);
    toInserts(NIGHT_1, plan);
    expect(plan).toEqual(copy);
  });

  it('M3.2: any sequence of plan operations keeps the plan valid (property)', () => {
    const op = fc.oneof(
      fc.record({ kind: fc.constant('place' as const), x: fc.integer({ min: -1, max: 9 }), y: fc.integer({ min: -1, max: 8 }) }),
      fc.record({ kind: fc.constant('take' as const), x: fc.integer({ min: 0, max: 8 }), y: fc.integer({ min: 0, max: 7 }) }),
      fc.record({ kind: fc.constant('insert' as const), card: fc.integer({ min: 0, max: 2 }), actor: fc.constantFrom('girl', 'wisp', 'wisp-2', 'nobody'), at: fc.integer({ min: -1, max: 3 }) }),
      fc.record({ kind: fc.constant('remove' as const), card: fc.integer({ min: 0, max: 2 }) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
        let plan: Plan = freshPlan(NIGHT_1);
        for (const o of ops) {
          if (o.kind === 'place') plan = placeItem(NIGHT_1, plan, 'bell', o.x, o.y) ?? plan;
          else if (o.kind === 'take') plan = takeItem(plan, o.x, o.y)?.plan ?? plan;
          else if (o.kind === 'insert') plan = insertCard(NIGHT_1, plan, o.card, o.actor, o.at) ?? plan;
          else plan = removeCard(plan, o.card);
          expect(remaining(NIGHT_1, plan, 'bell')).toBeGreaterThanOrEqual(0);
          for (const piece of plan.items) {
            expect(floorTiles(NIGHT_1).some((t) => t.x === piece.x && t.y === piece.y)).toBe(true);
          }
          expect(new Set(plan.items.map((p) => `${p.x},${p.y}`)).size).toBe(plan.items.length);
          const cards = Object.values(plan.lists).flat().filter((e) => e.t === 'card');
          expect(new Set(cards.map((e) => (e.t === 'card' ? e.c : -1))).size).toBe(cards.length);
          for (const [actor, list] of Object.entries(plan.lists)) {
            const base = levelActors(NIGHT_1).find((a) => a.id === actor)!.lines;
            expect(list.filter((e) => e.t === 'base').map((e) => (e.t === 'base' ? e.i : -1))).toEqual(Array.from({ length: base }, (_, i) => i));
          }
        }
      }),
    );
  });
});

// ---- M3.11: a plan builds the world the solver builds for the same choice ----

/** A trace without line ids. Two worlds that insert the same cards in a different order number their lines differently. */
function withoutIds(traces: TickTrace[]) {
  return traces.map((t) => ({
    ...t,
    events: t.events.map(({ lineId: _lineId, ...rest }) => rest),
    turns: t.turns.map(({ firedId: _f, shadowedIds: _s, ...rest }) => rest),
  }));
}

describe('plan: equal to the solver', () => {
  for (const level of [PROLOGUE, NIGHT_1, NIGHT_4]) {
    it(`M3.11: every choice of ${level.name}, as a plan, builds a world that ends and traces like the solver's`, () => {
      const registry = createRegistry();
      const generator = levelChoices(level, registry);
      let checked = 0;
      for (const choice of generator.choices()) {
        const fromSolver = generator.build(choice);
        const plan = planOfChoice(level, choice);
        const fromPlan = buildWorld(level, toPlacement(level, plan), toInserts(level, plan), registry);
        // Same items in the same order, same lines in the same order.
        expect(fromPlan.items).toEqual(fromSolver.items);
        expect(fromPlan.actors.map((a) => a.lines.map((l) => [l.rule, l.origin]))).toEqual(fromSolver.actors.map((a) => a.lines.map((l) => [l.rule, l.origin])));
        const a = withoutIds(run(cloneWorld(fromPlan), registry));
        const b = withoutIds(run(cloneWorld(fromSolver), registry));
        expect(a).toEqual(b);
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
    });
  }
});

describe('content', () => {
  it('M2.2: every level has a numeral, a concept and a lesson', () => {
    for (const level of LEVELS) {
      const info = levelInfo(level);
      expect(info.concept.length, level.id).toBeGreaterThan(3);
      expect(info.lesson.length, level.id).toBeGreaterThan(20);
    }
    expect(LEVELS.map((l) => levelInfo(l).numeral)).toEqual(['Prologue', 'I', 'IV']);
    expect(Object.keys(LEVEL_INFO).sort()).toEqual(['night1', 'night4', 'prologue']);
  });

  it('M8.10: several ghosts of one kind get numerals, and a single one does not', () => {
    const night1 = makeNames(levelActors(NIGHT_1));
    expect([night1.title('wisp'), night1.title('wisp-2'), night1.title('girl')]).toEqual(['Wisp I', 'Wisp II', 'The girl']);
    expect([night1.name('wisp-2'), night1.name('girl')]).toEqual(['Wisp II', 'the girl']);
    expect([night1.numeral('wisp'), night1.numeral('wisp-2'), night1.numeral('girl')]).toEqual(['I', 'II', '']);
    const night4 = makeNames(levelActors(NIGHT_4));
    expect(night4.title('wisp')).toBe('Wisp');
    expect(night4.numeral('wisp')).toBe('');
    expect(night4.title('unknown')).toBe('Unknown');
  });
});
