import { parseGrid, run, tick } from 'haunt-kit';
import type { Rule, World } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { NIGHT_1, NIGHT_4, PROLOGUE, buildWorld } from '../src/levels';
import type { CardInsert, LevelDef } from '../src/levels';
import { LEGEND, createRegistry, makeItem } from '../src/vocab';
import type { PlacedItem } from '../src/vocab';
import { NIGHT_2, NIGHT_3 } from './fixtures/extra-levels';
import oracle from './fixtures/oracle.json';

// The fixture was recorded from the prototype engine (see oracle.json "source"). These tests never import the prototype.

const registry = createRegistry();
const LEVELS: Record<string, LevelDef> = { prologue: PROLOGUE, night1: NIGHT_1, night2: NIGHT_2, night3: NIGHT_3, night4: NIGHT_4 };
const IDS = Object.keys(LEVELS);

interface OracleLevel {
  rows: string[];
  actors: { kind: string; rules: Rule[] }[];
  events: { tick: number; actor: number; at: number; rule: Rule }[];
  itemTypes: string[];
  cards: Rule[];
  freeTiles: number;
  emptyBoard: string;
  placements: number[][];
  insertions: number[][][];
  total: number;
  wins: number;
  outcomes: string;
  samples: { index: number; status: string; caught: { by: number; line: number } | null; ticks: { turns: (number | number[])[][]; candles: boolean[] }[] }[];
}
const data = oracle.levels as unknown as Record<string, OracleLevel>;

/** Builds the world for scenario `index` = placement * insertions.length + insertion, as the fixture numbers them. */
function scenarioWorld(id: string, index: number): World {
  const level = LEVELS[id]!;
  const o = data[id]!;
  const free = parseGrid(level.rows, LEGEND).free;
  const ids = buildWorld(level).actors.map((a) => a.id);
  const pi = Math.floor(index / o.insertions.length);
  const ii = index % o.insertions.length;
  const items = o.placements[pi]!.map((tile, k) => makeItem(o.itemTypes[k] as PlacedItem, free[tile]!.x, free[tile]!.y));
  const cards: CardInsert[] = [];
  o.insertions[ii]!.forEach(([actor, at], ci) => {
    if (actor! >= 0) cards.push({ actor: ids[actor!]!, at: at!, rule: o.cards[ci]! });
  });
  return buildWorld(level, items, cards, registry);
}

describe('oracle: the data matches the prototype', () => {
  it('R6.4: the fixture names its source', () => {
    expect(oracle.source).toMatch(/midnight-ward-engine\.js .* at commit [0-9a-f]{7,}/);
  });

  for (const id of IDS) {
    it(`R6.4: ${id}: map rows, spec rules and scheduled writes equal the prototype's`, () => {
      const o = data[id]!;
      const level = LEVELS[id]!;
      expect(level.rows).toEqual(o.rows);
      const world = buildWorld(level);
      expect(world.actors.map((a) => a.kind)).toEqual(o.actors.map((a) => a.kind));
      world.actors.forEach((a, i) => expect(a.lines.map((l) => l.rule), `${id} actor ${a.id}`).toEqual(o.actors[i]!.rules));
      expect(world.events).toEqual(
        o.events.map((e) => ({ tick: e.tick, actor: world.actors[e.actor]!.kind, line: e.at + 1, rule: e.rule })),
      );
      expect(parseGrid(level.rows, LEGEND).free).toHaveLength(o.freeTiles);
    });
  }
});

describe('oracle: sampled runs, tick by tick', () => {
  for (const id of IDS) {
    it(`R6.4: ${id}: fired line, shadowed lines, positions and candles match every tick of ${data[id]!.samples.length} sampled runs`, () => {
      const o = data[id]!;
      for (const sample of o.samples) {
        const world = scenarioWorld(id, sample.index);
        const where = `${id} scenario ${sample.index}`;
        let caught: { by: number; line: number } | null = null;
        sample.ticks.forEach((expected, t) => {
          const trace = tick(world, registry);
          expect(trace, `${where} tick ${t + 1} exists`).not.toBeNull();
          const mine = trace!.turns.map((turn) => [turn.fired ?? -1, turn.shadowed, turn.to.x, turn.to.y]);
          expect(mine, `${where} tick ${t + 1}`).toEqual(expected.turns);
          expect(
            world.items.filter((i) => i.type === 'candle').map((i) => i.state.lit === true),
            `${where} tick ${t + 1} candles`,
          ).toEqual(expected.candles);
          if (trace!.violation) {
            const by = world.actors.findIndex((a) => a.id === trace!.violation!.actors[0]);
            caught = { by, line: trace!.turns.at(-1)!.fired ?? -1 };
          }
        });
        expect(tick(world, registry), `${where} ends where the prototype ends`).toBeNull();
        expect(world.status === 'complete' ? 'W' : 'L', `${where} status`).toBe(sample.status);
        expect(caught, `${where} capture`).toEqual(sample.caught);
      }
    });
  }
});

describe('oracle: every scenario', () => {
  for (const id of IDS) {
    it(`R6.4: ${id}: the outcome of every placement and card insertion matches the prototype`, () => {
      const o = data[id]!;
      expect(o.placements.length * o.insertions.length).toBe(o.total);
      let outcomes = '';
      let wins = 0;
      for (let index = 0; index < o.total; index++) {
        const world = scenarioWorld(id, index);
        run(world, registry);
        outcomes += world.status === 'complete' ? 'W' : 'L';
        if (world.status === 'complete') wins++;
      }
      const firstDifference = [...outcomes].findIndex((c, i) => c !== o.outcomes[i]);
      expect(firstDifference, `${id}: first scenario that differs`).toBe(-1);
      expect(wins).toBe(o.wins);
    });
  }

  it('R6.4: the wins and totals are the prototype solver counts: 4/29, 12/2145, 4/741, 15/1482, 7/329', () => {
    const counts = Object.fromEntries(IDS.map((id) => [id, [data[id]!.wins, data[id]!.total]]));
    expect(counts).toEqual({ prologue: [4, 29], night1: [12, 2145], night2: [4, 741], night3: [15, 1482], night4: [7, 329] });
  });
});

describe('oracle: the empty board', () => {
  for (const id of IDS) {
    it(`R6.5: ${id}: with nothing placed the night ends violated`, () => {
      expect(data[id]!.emptyBoard).toBe('L');
      const world = buildWorld(LEVELS[id]!);
      const traces = run(world, registry);
      expect(world.status).toBe('violated');
      expect(traces.at(-1)!.violation?.property).toBe('girl_safe');
    });
  }
});
