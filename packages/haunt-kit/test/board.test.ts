import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SolverError, boardChoices, parseGrid } from '../src/index';
import type { BoardChoice, ItemToken, Rule, World } from '../src/index';
import { TOY_LEGEND, createToyRegistry, toyWorld } from './fixtures/toy-vocab';

const registry = createToyRegistry();

/** A base world on a one-row corridor. `seekers` seekers (one line each) and one target. */
function base(seekers = 1, specText = 'THE seeker SHALL do nothing.'): World {
  const row = '#' + 'S'.repeat(seekers) + 'T.....#';
  return toyWorld(['#'.repeat(row.length), row, '#'.repeat(row.length)], specText, registry);
}
const tilesOf = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i + 1, y: 1 }));
const token = (type: string): ItemToken => ({ type, make: (pos) => ({ type, pos, solid: type === 'block' }) });
const card = (act: string): Rule => ({ kw: 'IF', cond: 'near', act });
const count = (it: Iterable<unknown>): number => [...it].length;

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
/** n! / (n-k)! divided by the permutations of equal tokens. */
function placementCount(n: number, types: string[]): number {
  const k = types.length;
  if (k > n) return 0;
  const groups = new Map<string, number>();
  for (const t of types) groups.set(t, (groups.get(t) ?? 0) + 1);
  return factorial(n) / factorial(n - k) / [...groups.values()].reduce((p, c) => p * factorial(c), 1);
}

describe('boardChoices: item placements', () => {
  const noCards = (types: string[], n: number): BoardChoice[] => [...boardChoices({ base: base(), tiles: tilesOf(n), items: types.map(token), cards: [] }).choices()];

  it('S3.1: one token can go on any tile; no tokens is one placement', () => {
    expect(noCards(['x'], 5).map((c) => c.tiles)).toEqual([[0], [1], [2], [3], [4]]);
    expect(noCards([], 5)).toEqual([{ tiles: [], cards: [] }]);
  });

  it('S3.1: two tokens of the same type are a set: C(n, 2), and two of different types are n * (n - 1)', () => {
    expect(count(noCards(['salt', 'salt'], 39))).toBe(741);
    expect(noCards(['x', 'x'], 3).map((c) => c.tiles)).toEqual([[0, 1], [0, 2], [1, 2]]);
    expect(count(noCards(['a', 'b'], 6))).toBe(30);
  });

  it('S3.1: same-type tokens that are not next to each other in the list are still a set', () => {
    const choices = noCards(['x', 'y', 'x'], 4);
    expect(choices).toHaveLength(placementCount(4, ['x', 'y', 'x']));
    for (const c of choices) expect(c.tiles[0]!).toBeLessThan(c.tiles[2]!);
  });

  it('S3.1: more tokens than tiles gives no choice', () => {
    expect(noCards(['x', 'y', 'z'], 2)).toEqual([]);
  });

  it('S3.1: property: for any tokens and tile count the number of placements is the closed formula, all are distinct and use distinct tiles', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('x', 'y', 'z'), { maxLength: 4 }), fc.integer({ min: 0, max: 6 }), (types, n) => {
        const choices = noCards(types, n);
        expect(choices).toHaveLength(placementCount(n, types));
        const seen = new Set<string>();
        for (const c of choices) {
          expect(new Set(c.tiles).size).toBe(c.tiles.length);
          // The same arrangement of items on tiles, ignoring which same-type token is which.
          const canon = [...new Set(types)].sort().map((t) => `${t}:${c.tiles.filter((_, k) => types[k] === t).sort((a, b) => a - b)}`).join('|');
          expect(seen.has(canon), canon).toBe(false);
          seen.add(canon);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('boardChoices: card arrangements', () => {
  const arrangementsOf = (b: World, cards: Rule[], actors?: string[]) =>
    [...boardChoices({ base: b, tiles: [], items: [], cards, actors }).choices()].map((c) => c.cards);

  it('S3.2: with no cards there is one arrangement, the empty one', () => {
    expect(arrangementsOf(base(), [])).toEqual([[]]);
  });

  it('S3.2: one card is unused, or goes to any actor at any index from 0 to its line count', () => {
    const b = base(); // seeker: 1 line, target: 0 lines
    expect(arrangementsOf(b, [card('rest')])).toEqual([
      [null],
      [{ actor: 'seeker', at: 0 }],
      [{ actor: 'seeker', at: 1 }],
      [{ actor: 'target', at: 0 }],
    ]);
  });

  it('S3.2: an earlier card inserted into an actor raises the top index of the next card by one', () => {
    const b = base(); // one actor with lines: seeker (1)
    const result = arrangementsOf(b, [card('rest'), card('flip')], ['seeker']);
    expect(result).toHaveLength(1 * 3 + 2 * 4);
    const afterFirstUsed = result.filter((c) => c[0] !== null).flatMap((c) => (c[1] ? [c[1].at] : []));
    expect(Math.max(...afterFirstUsed)).toBe(2);
    const afterFirstUnused = result.filter((c) => c[0] === null).flatMap((c) => (c[1] ? [c[1].at] : []));
    expect(Math.max(...afterFirstUnused)).toBe(1);
  });

  it('S3.2: the arrangement count of Night I style levels: two cards, three actors with one line each, is 55', () => {
    const b = base(2); // seeker, seeker-2 and the target: give the target a line too
    b.actors.find((a) => a.id === 'target')!.lines.push({ id: 100, rule: { kw: '', cond: 'always', act: 'rest' }, origin: 'spec' });
    expect(b.actors.map((a) => a.lines.length)).toEqual([1, 1, 1]);
    expect(arrangementsOf(b, [card('rest'), card('rest')])).toHaveLength(55);
  });

  it('S3.2: a card can be limited to some actors, and an unknown actor is a SolverError', () => {
    expect(arrangementsOf(base(), [card('rest')], ['target'])).toEqual([[null], [{ actor: 'target', at: 0 }]]);
    expect(() => boardChoices({ base: base(), tiles: [], items: [], cards: [], actors: ['nobody'] })).toThrow(SolverError);
    expect(() => boardChoices({ base: base(), tiles: [], items: [], cards: [], actors: ['nobody'] })).toThrow(/"nobody"/);
  });

  it('S3.2: property: the count is the same when computed by counting the possible insert indexes with an independent recursion', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 3 }), fc.integer({ min: 0, max: 3 }), (lens, cardCount) => {
        const b = base(1);
        b.actors = lens.map((len, i) => ({
          id: `a${i}`,
          kind: 'a',
          pos: { x: 1, y: 1 },
          lines: Array.from({ length: len }, (_, j) => ({ id: i * 10 + j + 1, rule: { kw: '' as const, cond: 'always', act: 'rest' }, origin: 'spec' as const })),
        }));
        const cards = Array.from({ length: cardCount }, () => card('rest'));
        const expected = (i: number, extra: number[]): number => {
          if (i === cardCount) return 1;
          let total = expected(i + 1, extra);
          lens.forEach((len, a) => {
            const options = len + extra[a]! + 1;
            const next = extra.slice();
            next[a]!++;
            total += options * expected(i + 1, next);
          });
          return total;
        };
        expect(arrangementsOf(b, cards)).toHaveLength(expected(0, lens.map(() => 0)));
      }),
      { numRuns: 100 },
    );
  });
});

describe('boardChoices: order and build', () => {
  const options = () => ({ base: base(), tiles: tilesOf(4), items: [token('x')], cards: [card('rest')] });

  it('S3.3: the total is placements times arrangements, and every combination appears exactly once', () => {
    const gen = boardChoices(options());
    const all = [...gen.choices()];
    expect(all).toHaveLength(4 * 4);
    expect(new Set(all.map((c) => JSON.stringify(c))).size).toBe(16);
  });

  it('S3.3: placements are the outer loop and arrangements the inner loop, and the order is the same every time', () => {
    const gen = boardChoices(options());
    const all = [...gen.choices()];
    expect(all.map((c) => c.tiles[0])).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    expect(all.slice(0, 4).map((c) => c.cards)).toEqual(all.slice(4, 8).map((c) => c.cards));
    expect([...gen.choices()]).toEqual(all);
  });

  it('S3.4: a built world has the items on their tiles after the base items, and cards inserted in card order with origin card', () => {
    const b = base(1, 'THE seeker SHALL do nothing.\nTHE seeker SHALL do nothing.');
    const gen = boardChoices({ base: b, tiles: tilesOf(4), items: [token('x'), token('block')], cards: [card('rest'), card('flip')] });
    const w = gen.build({ tiles: [2, 0], cards: [{ actor: 'seeker', at: 1 }, { actor: 'seeker', at: 0 }] });
    expect(w.items.map((i) => [i.type, i.pos.x, i.solid])).toEqual([['x', 3, false], ['block', 1, true]]);
    const seeker = w.actors.find((a) => a.id === 'seeker')!;
    expect(seeker.lines.map((l) => [l.origin, l.rule.act])).toEqual([['card', 'flip'], ['spec', 'rest'], ['card', 'rest'], ['spec', 'rest']]);
    expect(new Set(seeker.lines.map((l) => l.id)).size).toBe(4);
  });

  it('S3.4: an unused card inserts nothing', () => {
    const gen = boardChoices(options());
    const w = gen.build({ tiles: [0], cards: [null] });
    expect(w.actors.find((a) => a.id === 'seeker')!.lines).toHaveLength(1);
  });

  it('S3.4: building does not change the base world, and two built worlds share nothing', () => {
    const b = base();
    const before = JSON.stringify(b);
    const gen = boardChoices({ base: b, tiles: tilesOf(4), items: [token('x')], cards: [card('rest')] });
    const choice = { tiles: [1], cards: [{ actor: 'seeker', at: 0 }] };
    const w1 = gen.build(choice);
    const w2 = gen.build(choice);
    expect(JSON.stringify(b)).toBe(before);
    expect(JSON.stringify(w1)).toBe(JSON.stringify(w2));
    w1.items[0]!.state.on = true;
    w1.items[0]!.pos.x = 9;
    w1.actors[0]!.pos.x = 9;
    w1.actors[0]!.lines[0]!.rule.act = 'flip';
    w1.nextLineId = 99;
    expect(JSON.stringify(b)).toBe(before);
    expect(w2.items[0]!.state).toEqual({});
    expect(w2.items[0]!.pos.x).toBe(2);
    expect(w2.actors[0]!.pos.x).not.toBe(9);
    expect(w2.actors[0]!.lines[0]!.rule.act).toBe('rest');
    expect(gen.build(choice).nextLineId).toBe(w2.nextLineId);
  });

  it('S3.4: the card rule is copied, so editing a built line does not change the card', () => {
    const c = card('rest');
    const gen = boardChoices({ base: base(), tiles: [], items: [], cards: [c] });
    const w = gen.build({ tiles: [], cards: [{ actor: 'seeker', at: 0 }] });
    w.actors.find((a) => a.id === 'seeker')!.lines[0]!.rule.act = 'flip';
    expect(c.act).toBe('rest');
  });

  it('S1.4: a base world that is not running is a SolverError', () => {
    const b = base();
    b.status = 'violated';
    expect(() => boardChoices({ base: b, tiles: [], items: [], cards: [] })).toThrow(SolverError);
  });

  it('S3.1: the free tiles of a parsed grid work as tiles', () => {
    const grid = parseGrid(['#####', '#S.T#', '#####'], TOY_LEGEND);
    const gen = boardChoices({ base: base(), tiles: grid.free, items: [token('x')], cards: [] });
    expect([...gen.choices()]).toHaveLength(grid.free.length);
  });
});
