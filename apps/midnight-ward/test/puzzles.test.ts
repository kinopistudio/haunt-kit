import { distance, run, tick } from 'haunt-kit';
import type { Rule, TickTrace } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { NIGHT_1, NIGHT_4, buildWorld } from '../src/levels';
import { createRegistry, makeItem } from '../src/vocab';

const registry = createRegistry();

const BELL_CARD: Rule = { kw: 'IF', cond: 'bell_near', act: 'away_girl' };
const REWRITE: Rule = { kw: 'WHEN', cond: 'girl_near', act: 'toward_girl' };

function must(t: TickTrace | null): TickTrace {
  if (t === null) throw new Error('expected a trace');
  return t;
}

describe('Night IV: the wisp rewrites itself', () => {
  // The bell sits by the girl. The card on line 1 keeps the wisp away from her, until the sixth bell.
  const bell = [makeItem('bell', 4, 2)];
  const card = [{ actor: 'wisp', at: 0, rule: BELL_CARD }];

  it('R6.7: no line is written before the sixth bell', () => {
    const world = buildWorld(NIGHT_4, bell, card);
    for (let t = 1; t <= 5; t++) {
      const trace = must(tick(world, registry));
      expect(trace.events, `tick ${t}`).toEqual([]);
    }
    expect(world.actors[1]!.lines).toHaveLength(4);
  });

  it('R6.7: at the sixth bell the written rule becomes the wisp\u2019s first line, and the trace lists the event', () => {
    const world = buildWorld(NIGHT_4, bell, card);
    const wisp = world.actors[1]!;
    const before = wisp.lines.map((l) => l.id);
    for (let t = 1; t <= 5; t++) must(tick(world, registry));
    const trace = must(tick(world, registry));
    expect(trace.tick).toBe(6);
    expect(trace.events).toEqual([{ actor: 'wisp', kind: 'wisp', index: 0, lineId: wisp.lines[0]!.id }]);
    expect(wisp.lines).toHaveLength(5);
    expect(wisp.lines[0]).toMatchObject({ rule: REWRITE, origin: 'rewrite' });
    expect(wisp.lines.slice(1).map((l) => l.id)).toEqual(before);
    expect(world.actors[0]!.lines).toHaveLength(1); // the girl is untouched
  });

  it('R6.7: the written line shadows the player\u2019s card, and the wisp reaches the girl', () => {
    const world = buildWorld(NIGHT_4, bell, card);
    const cardId = world.actors[1]!.lines[0]!.id;
    const traces = run(world, registry);
    const written = traces[5]!.events[0]!.lineId;
    // From the seventh bell the wisp is within 3 of the girl, so the written line fires first.
    const seventh = traces[6]!.turns.find((x) => x.actor === 'wisp')!;
    expect(seventh.firedId).toBe(written);
    expect(seventh.shadowedIds).toContain(cardId);
    expect(world.status).toBe('violated');
    expect(traces.at(-1)!.violation).toEqual({ property: 'girl_safe', message: 'wisp caught the girl.', actors: ['wisp'] });
    expect(traces.at(-1)!.turns.at(-1)!.firedId).toBe(written);
  });

  it('R6.7: without the rewrite the same board is won, so the rewrite is what decides the night', () => {
    const world = buildWorld(NIGHT_4, bell, card);
    world.events = [];
    run(world, registry);
    expect(world.status).toBe('complete');
  });

  it('R6.7: a bell next to the wisp and a card on line 1 still survive the rewrite', () => {
    const world = buildWorld(NIGHT_4, [makeItem('bell', 4, 5)], card);
    run(world, registry);
    expect(world.status).toBe('complete');
  });
});

describe('Night I: rule order and shadowing', () => {
  // The wisp starts at (1, 1) and walks along the top row toward the girl. A bell at (2, 1) is near it from the first bell.
  const bell = [makeItem('bell', 2, 1)];
  const STAY: Rule = { kw: 'IF', cond: 'bell_near', act: 'stay' };

  function wisp1(traces: TickTrace[]) {
    return traces.map((t) => t.turns.find((x) => x.actor === 'wisp')!);
  }

  it('R6.8: a bell line below the always-true line is reported as shadowed and never runs', () => {
    const world = buildWorld(NIGHT_1, bell, [{ actor: 'wisp', at: 1, rule: STAY }]);
    const cardId = world.actors[1]!.lines[1]!.id;
    const turns = wisp1(run(world, registry));
    const bellNear = turns.filter((t) => distance(t.from, bell[0]!.pos) <= 2);
    expect(bellNear.length).toBeGreaterThan(0);
    for (const turn of bellNear) {
      expect(turn.shadowedIds).toContain(cardId);
      expect(turn.shadowed).toContain(1);
    }
    for (const turn of turns) {
      expect(turn.firedId).not.toBe(cardId);
      expect(turn.fired).toBe(0);
    }
    expect(turns.some((t) => t.from.x !== t.to.x || t.from.y !== t.to.y)).toBe(true);
  });

  it('R6.8: the same line above the always-true line runs whenever its condition holds', () => {
    const world = buildWorld(NIGHT_1, bell, [{ actor: 'wisp', at: 0, rule: STAY }]);
    const cardId = world.actors[1]!.lines[0]!.id;
    const alwaysId = world.actors[1]!.lines[1]!.id;
    const turns = wisp1(run(world, registry));
    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) {
      const holds = distance(turn.from, bell[0]!.pos) <= 2;
      expect(turn.firedId, `from (${turn.from.x}, ${turn.from.y})`).toBe(holds ? cardId : alwaysId);
      if (holds) {
        expect(turn.to).toEqual(turn.from);
        expect(turn.shadowedIds).toEqual([alwaysId]);
      }
    }
    // The wisp starts one step from the bell, so the card holds it still for the whole night.
    expect(new Set(turns.map((t) => `${t.from.x},${t.from.y}`)).size).toBe(1);
  });

  it('R6.8: the card changes only the wisp it was placed on', () => {
    const world = buildWorld(NIGHT_1, bell, [{ actor: 'wisp', at: 0, rule: STAY }]);
    expect(world.actors.map((a) => [a.id, a.lines.length])).toEqual([['girl', 1], ['wisp', 2], ['wisp-2', 1]]);
    const traces = run(world, registry);
    const other = traces[0]!.turns.find((x) => x.actor === 'wisp-2')!;
    expect(other.fired).toBe(0);
    expect(other.firedId).toBe(world.actors[2]!.lines[0]!.id);
  });
});
