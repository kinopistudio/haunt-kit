import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Registry, cloneWorld, createWorld, parseGrid, run, tick } from '../src/index';
import type { Rule, ScheduledEvent, SpecSet, TickTrace, World } from '../src/index';
import { ruleArbFor } from './fixtures/arbitraries';
import { TOY_LEGEND, contactProperty, createToyRegistry } from './fixtures/toy-vocab';

const registry = createToyRegistry().addProperty(contactProperty);
const HORIZON = 8;

afterEach(() => vi.restoreAllMocks());

// ---- random toy worlds ---------------------------------------------------------------------------------------

const W = 8;
const H = 3;
const ruleArb = ruleArbFor(registry, 9);
const rulesArb = fc.array(ruleArb, { maxLength: 5 });
const eventArb: fc.Arbitrary<ScheduledEvent> = fc.record({
  tick: fc.integer({ min: 1, max: HORIZON }),
  actor: fc.constant('seeker'),
  line: fc.integer({ min: 1, max: 5 }),
  rule: ruleArb,
});

interface Scenario {
  world: World;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    walls: fc.array(fc.boolean(), { minLength: W * H, maxLength: W * H }),
    cells: fc.shuffledSubarray(
      Array.from({ length: W * H }, (_, i) => i),
      { minLength: 4, maxLength: 7 },
    ),
    seeker: rulesArb,
    watcher: rulesArb,
    target: rulesArb,
    events: fc.array(eventArb, { maxLength: 3 }),
  })
  .map(({ walls, cells, seeker, watcher, target, events }) => {
    // cells[0] seeker, [1] target, [2] watcher, [3] switch, the rest extra seekers
    const glyph = new Map<number, string>();
    cells.forEach((c, i) => glyph.set(c, i === 0 ? 'S' : i === 1 ? 'T' : i === 2 ? 'W' : i === 3 ? 's' : 'S'));
    const rows: string[] = ['#'.repeat(W + 2)];
    for (let y = 0; y < H; y++) {
      let row = '#';
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        row += glyph.get(i) ?? (walls[i] ? '#' : '.');
      }
      rows.push(row + '#');
    }
    rows.push('#'.repeat(W + 2));
    const spec: SpecSet = { actors: { seeker, watcher, target }, events, safety: [] };
    const world = createWorld({ grid: parseGrid(rows, TOY_LEGEND), spec, registry, horizon: HORIZON });
    return { world };
  });

describe('determinism', () => {
  it('R5.10: a clone and the original produce identical traces and end in the same world', () => {
    fc.assert(
      fc.property(scenarioArb, ({ world }) => {
        const copy = cloneWorld(world);
        const a = run(world, registry);
        const b = run(copy, registry);
        expect(b).toStrictEqual(a);
        expect(copy).toStrictEqual(world);
      }),
      { numRuns: 300 },
    );
  });

  it('R5.10: ticking a world one step at a time gives the same traces as run', () => {
    fc.assert(
      fc.property(scenarioArb, ({ world }) => {
        const copy = cloneWorld(world);
        const stepped: TickTrace[] = [];
        for (let t = tick(copy, registry); t !== null; t = tick(copy, registry)) stepped.push(t);
        expect(stepped).toStrictEqual(run(world, registry));
      }),
      { numRuns: 100 },
    );
  });

  it('R5.10: running does not read the clock or a random source', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random was called');
    });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now was called');
    });
    fc.assert(
      fc.property(scenarioArb, ({ world }) => {
        run(world, registry);
      }),
      { numRuns: 100 },
    );
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it('R5.10: a run always ends, within the horizon', () => {
    fc.assert(
      fc.property(scenarioArb, ({ world }) => {
        const traces = run(world, registry);
        expect(traces.length).toBeGreaterThanOrEqual(1);
        expect(traces.length).toBeLessThanOrEqual(HORIZON);
        expect(world.status).not.toBe('running');
        expect(traces.slice(0, -1).every((t) => t.status === 'running')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('trace format', () => {
  it('R5.11: every trace survives a JSON round trip unchanged', () => {
    fc.assert(
      fc.property(scenarioArb, ({ world }) => {
        for (const t of run(world, registry)) {
          expect(JSON.parse(JSON.stringify(t))).toStrictEqual(t);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('R5.11: traces are internally consistent', () => {
    fc.assert(
      fc.property(scenarioArb, ({ world }) => {
        const traces = run(world, registry);
        traces.forEach((t, i) => {
          expect(t.tick).toBe(i + 1);
          for (const turn of t.turns) {
            if (turn.fired === null) {
              expect(turn.firedId).toBeNull();
              expect(turn.shadowed).toEqual([]);
              expect(turn.evals.every((e) => e === false)).toBe(true);
              expect(turn.from).toEqual(turn.to);
            } else {
              expect(turn.evals).toHaveLength(turn.fired + 1);
              expect(turn.evals.slice(0, -1).every((e) => e === false)).toBe(true);
              expect(turn.evals.at(-1)).toBe(true);
              expect(turn.shadowed.every((s) => s > turn.fired!)).toBe(true);
              expect([...turn.shadowed].sort((a, b) => a - b)).toEqual(turn.shadowed);
            }
            expect(turn.shadowedIds).toHaveLength(turn.shadowed.length);
          }
          expect(t.violation === null).toBe(t.status !== 'violated');
        });
      }),
      { numRuns: 200 },
    );
  });
});

// ---- known truth tables ---------------------------------------------------------------------------------------

const flagRegistry = new Registry()
  .addCondition({
    id: 'flag',
    pattern: 'flag {n}',
    test: (ctx, n) => ctx.world.items.find((i) => i.type === 'flags')?.state[`f${n}`] === true,
  })
  .addAction({ id: 'rest', pattern: 'do nothing', run: () => {} });

const lineArb = fc.oneof(
  fc.constant<Rule>({ kw: '', cond: 'always', act: 'rest' }),
  fc.integer({ min: 0, max: 3 }).map((n): Rule => ({ kw: 'WHEN', cond: 'flag', act: 'rest', n })),
);

describe('first true line and shadowing, for any line list', () => {
  const caseArb = fc.record({
    lines: fc.array(lineArb, { maxLength: 8 }),
    table: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
  });

  function turnFor(lines: Rule[], table: boolean[]) {
    const world = createWorld({
      grid: parseGrid(['#####', '#S..#', '#####'], TOY_LEGEND),
      spec: { actors: { seeker: lines }, events: [], safety: [] },
      registry: flagRegistry,
      horizon: 3,
      items: [{ type: 'flags', pos: { x: 2, y: 1 }, state: Object.fromEntries(table.map((v, i) => [`f${i}`, v])) }],
    });
    const ids = world.actors[0]!.lines.map((l) => l.id);
    const trace = tick(world, flagRegistry)!;
    return { turn: trace.turns[0]!, ids };
  }

  it('R5.2: the fired line is the first true one', () => {
    fc.assert(
      fc.property(caseArb, ({ lines, table }) => {
        const truth = lines.map((r) => r.cond === 'always' || table[r.n!]!);
        const first = truth.indexOf(true);
        const { turn, ids } = turnFor(lines, table);
        expect(turn.fired).toBe(first === -1 ? null : first);
        expect(turn.firedId).toBe(first === -1 ? null : ids[first]);
        expect(turn.evals).toEqual(first === -1 ? truth : truth.slice(0, first + 1));
      }),
      { numRuns: 500 },
    );
  });

  it('R5.5: the shadowed lines are exactly the true lines below the fired one', () => {
    fc.assert(
      fc.property(caseArb, ({ lines, table }) => {
        const truth = lines.map((r) => r.cond === 'always' || table[r.n!]!);
        const first = truth.indexOf(true);
        const expected = first === -1 ? [] : truth.map((t, i) => (t && i > first ? i : -1)).filter((i) => i >= 0);
        const { turn, ids } = turnFor(lines, table);
        expect(turn.shadowed).toEqual(expected);
        expect(turn.shadowedIds).toEqual(expected.map((i) => ids[i]));
      }),
      { numRuns: 500 },
    );
  });
});
