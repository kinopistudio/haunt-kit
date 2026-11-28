import { describe, expect, it } from 'vitest';
import { HINTS, coachStep, hasCoach } from '../src/coach';
import type { CoachInput } from '../src/coach';
import { LEVELS, NIGHT_1, NIGHT_4, PROLOGUE } from '../src/levels';
import type { LevelDef } from '../src/levels';
import { runNight } from '../src/night';
import { freshPlan, insertCard, placeItem } from '../src/plan';
import type { Plan, Selection } from '../src/plan';

function must<T>(value: T | null): T {
  if (value === null) throw new Error('expected a value');
  return value;
}

const plan = (input: Partial<CoachInput> & { plan: Plan }): CoachInput => ({ phase: 'plan', selection: null, ...input });
const target = (level: LevelDef, input: CoachInput) => coachStep(level, input)?.target ?? null;

/** The hint of a level as a plan. */
function hintPlan(level: LevelDef): Plan {
  let p = freshPlan(level);
  for (const item of HINTS[level.id]!.items) p = must(placeItem(level, p, item.type, item.x, item.y));
  for (const card of HINTS[level.id]!.cards) p = must(insertCard(level, p, card.card, card.actor, card.at));
  return p;
}

describe('coach', () => {
  it('M7.1: the Prologue and Night I have a coach, and Night IV does not', () => {
    expect(hasCoach(PROLOGUE)).toBe(true);
    expect(hasCoach(NIGHT_1)).toBe(true);
    expect(hasCoach(NIGHT_4)).toBe(false);
    expect(coachStep(NIGHT_4, plan({ plan: freshPlan(NIGHT_4) }))).toBeNull();
    expect(LEVELS.filter(hasCoach).map((l) => l.id)).toEqual(['prologue', 'night1']);
  });

  it('M7.2: the Prologue steps point at the salt, then the glowing tile, then the ring button', () => {
    const empty = freshPlan(PROLOGUE);
    expect(target(PROLOGUE, plan({ plan: empty }))).toEqual({ kind: 'tool', type: 'salt' });
    const salt: Selection = { kind: 'item', type: 'salt' };
    expect(target(PROLOGUE, plan({ plan: empty, selection: salt }))).toEqual({ kind: 'tile', x: 4, y: 3 });
    const placed = must(placeItem(PROLOGUE, empty, 'salt', 4, 3));
    expect(target(PROLOGUE, plan({ plan: placed }))).toEqual({ kind: 'ring' });
  });

  it('M7.2: Night I steps point at the bell, its tile, a card, its slot, the second card, its slot, then the ring button', () => {
    let p = freshPlan(NIGHT_1);
    const steps: unknown[] = [];
    steps.push(target(NIGHT_1, plan({ plan: p })));
    steps.push(target(NIGHT_1, plan({ plan: p, selection: { kind: 'item', type: 'bell' } })));
    p = must(placeItem(NIGHT_1, p, 'bell', 4, 3));
    steps.push(target(NIGHT_1, plan({ plan: p })));
    steps.push(target(NIGHT_1, plan({ plan: p, selection: { kind: 'card', card: 0 } })));
    p = must(insertCard(NIGHT_1, p, 0, 'wisp', 0));
    steps.push(target(NIGHT_1, plan({ plan: p })));
    steps.push(target(NIGHT_1, plan({ plan: p, selection: { kind: 'card', card: 1 } })));
    p = must(insertCard(NIGHT_1, p, 1, 'wisp-2', 0));
    steps.push(target(NIGHT_1, plan({ plan: p })));
    expect(steps).toEqual([
      { kind: 'tool', type: 'bell' },
      { kind: 'tile', x: 4, y: 3 },
      { kind: 'card', index: 0 },
      { kind: 'slot', actor: 'wisp', at: 0 },
      { kind: 'card', index: 1 },
      { kind: 'slot', actor: 'wisp-2', at: 0 },
      { kind: 'ring' },
    ]);
  });

  it('M7.2: the second card goes to the other wisp even when the player picks it first', () => {
    const p = must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3));
    expect(target(NIGHT_1, plan({ plan: p, selection: { kind: 'card', card: 1 } }))).toEqual({ kind: 'slot', actor: 'wisp-2', at: 0 });
  });

  it('M7.2: the step is a function of the plan and the selection only: the same input gives the same step', () => {
    const p = must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3));
    const a = coachStep(NIGHT_1, plan({ plan: p, selection: { kind: 'card', card: 0 } }));
    const b = coachStep(NIGHT_1, plan({ plan: structuredClone(p), selection: { kind: 'card', card: 0 } }));
    expect(a).toEqual(b);
    expect(a!.text.length).toBeGreaterThan(20);
    // Every step of the plan phase has a short instruction in English and a tag.
    for (const input of [plan({ plan: freshPlan(NIGHT_1) }), plan({ plan: p }), plan({ plan: hintPlan(NIGHT_1) })]) {
      const s = coachStep(NIGHT_1, input)!;
      expect(s.text).toMatch(/^[A-Z]/);
      expect(s.text.length).toBeLessThan(200);
      expect(s.tag).toBe('Tutorial');
    }
  });

  it('M7.2: an item placed on some other tile still lets the coach move on to the next action', () => {
    const p = must(placeItem(PROLOGUE, freshPlan(PROLOGUE), 'salt', 2, 2));
    expect(target(PROLOGUE, plan({ plan: p }))).toEqual({ kind: 'ring' });
  });

  it('M7.2: with a selection the coach never points at a tile that is already taken', () => {
    const p = must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3));
    const s = coachStep(NIGHT_1, plan({ plan: p, selection: { kind: 'item', type: 'bell' } }))!;
    expect(s.target).toBeNull();
  });

  it('M7.3: the setup that each coach leads to wins when it is run', () => {
    for (const level of [PROLOGUE, NIGHT_1]) {
      const night = runNight(level, hintPlan(level));
      expect(night.outcome, level.id).toBe('won');
      expect(night.bells).toBe(12);
    }
  });

  it('M7.3: the coach leads to that setup, and at its end points at the ring button', () => {
    for (const level of [PROLOGUE, NIGHT_1]) expect(target(level, plan({ plan: hintPlan(level) }))).toEqual({ kind: 'ring' });
  });

  it('M7.4: a card under an always-true line gets the shadow warning with the remove control as target', () => {
    let p = must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3));
    p = must(insertCard(NIGHT_1, p, 0, 'wisp', 1));
    const s = coachStep(NIGHT_1, plan({ plan: p }))!;
    expect(s.id).toBe('shadow');
    expect(s.text).toContain('shadowed');
    expect(s.target).toEqual({ kind: 'remove', actor: 'wisp', at: 1 });
    // The warning wins over a selection.
    expect(coachStep(NIGHT_1, plan({ plan: p, selection: { kind: 'card', card: 1 } }))!.id).toBe('shadow');
  });

  it('M7.4: a card above the always-true line is not shadowed, and a card under another card that is conditional is not either', () => {
    let p = must(insertCard(NIGHT_1, freshPlan(NIGHT_1), 0, 'wisp', 0));
    expect(coachStep(NIGHT_1, plan({ plan: p }))!.id).not.toBe('shadow');
    p = must(insertCard(NIGHT_1, p, 1, 'wisp', 1));
    expect(coachStep(NIGHT_1, plan({ plan: p }))!.id).not.toBe('shadow');
  });

  it('M7.5: after a lost night the coach points at Try again, and says why when a card was shadowed', () => {
    const p = freshPlan(NIGHT_1);
    expect(coachStep(NIGHT_1, plan({ phase: 'lost', plan: p }))).toMatchObject({ id: 'lost', target: { kind: 'retry' } });
    const shadowed = coachStep(NIGHT_1, plan({ phase: 'lost', plan: p, shadowedCard: true }))!;
    expect(shadowed).toMatchObject({ id: 'lost-shadow', target: { kind: 'retry' } });
    expect(shadowed.text).toContain('a line above it was true first');
  });

  it('M7.5: after a won night the coach points at the next level, if there is one', () => {
    const p = hintPlan(NIGHT_1);
    expect(coachStep(NIGHT_1, plan({ phase: 'won', plan: p, hasNext: true }))!.target).toEqual({ kind: 'next' });
    expect(coachStep(NIGHT_1, plan({ phase: 'won', plan: p, hasNext: false }))!.target).toBeNull();
  });

  it('M7.2: during a night the coach explains the lit line and points at nothing', () => {
    const s = coachStep(PROLOGUE, plan({ phase: 'night', plan: freshPlan(PROLOGUE) }))!;
    expect(s.target).toBeNull();
    expect(s.text).toContain('lit line');
  });
});
