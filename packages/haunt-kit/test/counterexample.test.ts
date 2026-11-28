import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SolverError, cloneWorld, findCounterexample, openSteps, registerSafety, loadSpec, tick } from '../src/index';
import type { CounterexampleResult, Pos, Registry, World } from '../src/index';
import { contactProperty, createToyRegistry, toyWorld } from './fixtures/toy-vocab';

// The wanderer is the toy "target". The seeker and the watcher follow rules and react to where it is.
// Properties: no_contact (the seeker stands on the target) and S1 (the watcher SHALL NOT be on WHILE the target is near).
const SAFETY = 'THE watcher SHALL NOT be on WHILE the target is near.';

function toyRegistry(): Registry {
  const registry = createToyRegistry().addProperty(contactProperty);
  registerSafety(registry, loadSpec(SAFETY, registry).spec.safety);
  return registry;
}

function make(rows: string[], specText: string, registry: Registry, horizon: number): World {
  const loaded = loadSpec(`${specText}\n${SAFETY}`, registry);
  return toyWorld(rows, specText, registry, { spec: loaded.spec, horizon, turnOrder: ['target'] });
}

/** Rows with S, T, W and s placed on the given tiles of a w by h room. */
function room(w: number, h: number, tiles: { S: number; T: number; W: number; s?: number }): string[] {
  const cells = Array.from({ length: w * h }, () => '.');
  cells[tiles.S] = 'S';
  cells[tiles.T] = 'T';
  cells[tiles.W] = 'W';
  if (tiles.s !== undefined) cells[tiles.s] = 's';
  const rows = Array.from({ length: h }, (_, y) => `#${cells.slice(y * w, y * w + w).join('')}#`);
  const wall = '#'.repeat(w + 2);
  return [wall, ...rows, wall];
}

const goalSwitchOn = (world: World): boolean => world.items.some((i) => i.state.on === true);
const wanderer = { actor: 'target' };

interface Brute {
  paths: number;
  goalPaths: number;
  firstTick: Map<string, number>;
}

/** Walks every move sequence with the engine, one by one. Only for small worlds. */
function brute(start: World, registry: Registry, goal: (w: World) => boolean): Brute {
  const out: Brute = { paths: 0, goalPaths: 0, firstTick: new Map() };
  const go = (world: World, left: number, hit: boolean): void => {
    if (left === 0) {
      out.paths++;
      if (hit) out.goalPaths++;
      return;
    }
    for (const to of openSteps(world, world.actors.find((a) => a.id === 'target')!.pos)) {
      const w = cloneWorld(world);
      const t = tick(w, registry, { scripted: { target: to } })!;
      if (t.violation) {
        const prev = out.firstTick.get(t.violation.property);
        if (prev === undefined || w.tick < prev) out.firstTick.set(t.violation.property, w.tick);
        continue;
      }
      go(w, left - 1, hit || goal(w));
    }
  };
  go(cloneWorld(start), start.horizon, false);
  return out;
}

const SEEKER_SPECS = [
  'THE seeker SHALL step toward the target.',
  'WHEN the target is near, THE seeker SHALL step away from the target.\nTHE seeker SHALL do nothing.',
  'IF the target is near, THEN THE seeker SHALL step toward the target.\nTHE seeker SHALL do nothing.',
];
const WATCHER_SPECS = [
  'WHEN the target is near, THE watcher SHALL flip the switch.',
  'WHEN the target is far, THE watcher SHALL flip the switch.\nTHE watcher SHALL do nothing.',
  'THE watcher SHALL do nothing.',
];

describe('findCounterexample: counts by search against walking every path', () => {
  const caseArb = fc
    .record({
      size: fc.constantFrom<[number, number]>([4, 1], [2, 2], [3, 2], [4, 2]),
      horizon: fc.integer({ min: 1, max: 4 }),
      seeker: fc.integer({ min: 0, max: SEEKER_SPECS.length - 1 }),
      watcher: fc.integer({ min: 0, max: WATCHER_SPECS.length - 1 }),
    })
    .chain((c) =>
      fc
        .uniqueArray(fc.integer({ min: 0, max: c.size[0] * c.size[1] - 1 }), { minLength: 4, maxLength: 4 })
        .map(([S, T, W, s]) => ({ ...c, w: c.size[0], h: c.size[1], tiles: { S: S!, T: T!, W: W!, s: s! } })),
    );

  it('S4.2: paths, goal paths and the shortest tick per property equal the brute-force enumeration', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const registry = toyRegistry();
        const world = make(room(c.w, c.h, c.tiles), `${SEEKER_SPECS[c.seeker]}\n${WATCHER_SPECS[c.watcher]}`, registry, c.horizon);
        const expected = brute(world, registry, goalSwitchOn);
        const result = findCounterexample({ world, registry, wanderer, goal: goalSwitchOn });
        expect(result.paths).toBe(expected.paths);
        expect(result.goalPaths).toBe(expected.goalPaths);
        if (result.verdict === 'safe') {
          expect(expected.firstTick.size).toBe(0);
        } else {
          expect(new Map(result.counterexamples.map((x) => [x.property, x.tick]))).toEqual(expected.firstTick);
          expect(result.shortest.tick).toBe(Math.min(...expected.firstTick.values()));
        }
      }),
      { numRuns: 150 },
    );
  });

  it('S4.2: on a corridor with nothing to break, the path count equals an independent count of walks', () => {
    const registry = createToyRegistry();
    const world = toyWorld(['#######', '#.T...#', '#######'], 'THE target SHALL do nothing.', registry, { horizon: 12 });
    // walks[x] = number of paths of the given length that end on tile x; each step stays or moves one tile.
    let walks = [0, 1, 0, 0, 0];
    for (let t = 0; t < 12; t++) walks = walks.map((_, x) => walks[x]! + (walks[x - 1] ?? 0) + (walks[x + 1] ?? 0));
    const result = findCounterexample({ world, registry, wanderer });
    expect(result.paths).toBe(walks.reduce((a, b) => a + b, 0));
    expect(result.verdict).toBe('safe');
  });
});

describe('findCounterexample: the search is over states, not paths', () => {
  const corridor = (horizon: number, width = 5): { world: World; registry: Registry } => {
    const registry = createToyRegistry();
    return { registry, world: toyWorld(['#'.repeat(width + 2), `#T${'.'.repeat(width - 1)}#`, '#'.repeat(width + 2)], 'THE target SHALL do nothing.', registry, { horizon }) };
  };

  it('S4.1: the transitions are at most ticks x states per tick x moves, whatever the number of paths', () => {
    const { world, registry } = corridor(12);
    const result = findCounterexample({ world, registry, wanderer });
    expect(result.paths).toBeGreaterThan(100_000);
    expect(result.states).toBeLessThanOrEqual(12 * 5);
    expect(result.transitions).toBeLessThanOrEqual(result.states * 3);
    expect(result.transitions).toBeLessThan(result.paths / 100);
  });

  it('S4.1: twenty ticks on a corridor has hundreds of millions of paths and is still a few hundred transitions', () => {
    const { world, registry } = corridor(20);
    const result = findCounterexample({ world, registry, wanderer });
    expect(result.paths).toBeGreaterThan(1e8);
    expect(result.transitions).toBeLessThan(400);
  });

  it('S4.1: paths that reach the same state at the same tick are merged into one entry', () => {
    const { world, registry } = corridor(3, 3);
    const result = findCounterexample({ world, registry, wanderer });
    // Tile counts per layer: 2, 3, 3. The entries expanded are the ones of the first three layers (1 + 2 + 3).
    expect(result.states).toBe(1 + 2 + 3);
  });

  it('S1.4: a path count above Number.MAX_SAFE_INTEGER is a SolverError', () => {
    const registry = createToyRegistry();
    const world = toyWorld(['#######', '#T....#', '#.....#', '#######'], 'THE target SHALL do nothing.', registry, { horizon: 40 });
    expect(() => findCounterexample({ world, registry, wanderer })).toThrow(SolverError);
    expect(() => findCounterexample({ world, registry, wanderer })).toThrow(/MAX_SAFE_INTEGER/);
  });
});

describe('findCounterexample: counterexamples', () => {
  const rows = ['#####', '#T..#', '#.S.#', '#####']; // the target is at (1,1) and the seeker at (2,2)
  const registry = toyRegistry();

  it('S4.3: the counterexample of each failed property has the lowest tick, and shortest is the lowest of all', () => {
    // No watcher is on the grid, so only no_contact can fail.
    const world = toyWorld(rows, 'THE seeker SHALL do nothing.', registry, { horizon: 4, turnOrder: ['target'], properties: ['no_contact'] });
    const result = findCounterexample({ world, registry, wanderer });
    expect(result.verdict).toBe('unsafe');
    if (result.verdict !== 'unsafe') return;
    expect(result.counterexamples.map((c) => [c.property, c.tick])).toEqual([['no_contact', 2]]);
    expect(result.shortest).toBe(result.counterexamples[0]);
  });

  it('S4.3: when two paths fail at the same tick, the one that comes first in move order is returned', () => {
    const world = toyWorld(rows, 'THE seeker SHALL do nothing.', registry, { horizon: 4, turnOrder: ['target'], properties: ['no_contact'] });
    const result = findCounterexample({ world, registry, wanderer });
    if (result.verdict !== 'unsafe') throw new Error('expected unsafe');
    // east then south and south then east both reach (2,2) at tick 2. East is tried before south.
    expect(result.shortest.moves).toEqual([{ x: 2, y: 1 }, { x: 2, y: 2 }]);
  });

  it('S4.3: counterexamples are listed by tick, and each property appears once', () => {
    // The watcher flips the switch when the target is near; S1 fails the first time the target comes near the watcher with the switch on.
    const reg = toyRegistry();
    const r = room(4, 1, { S: 3, T: 0, W: 1, s: 2 });
    const world = make(r, 'THE seeker SHALL do nothing.\nTHE watcher SHALL flip the switch.', reg, 4);
    const result = findCounterexample({ world, registry: reg, wanderer });
    if (result.verdict !== 'unsafe') throw new Error('expected unsafe');
    const ticks = result.counterexamples.map((c) => c.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(new Set(result.counterexamples.map((c) => c.property)).size).toBe(result.counterexamples.length);
    expect(result.shortest.tick).toBe(ticks[0]);
  });

  it('S4.4: the moves replayed through the engine give the trace, which ends with the violation at the counterexample tick', () => {
    const world = toyWorld(rows, 'THE seeker SHALL do nothing.', registry, { horizon: 4, turnOrder: ['target'], properties: ['no_contact'] });
    const result = findCounterexample({ world, registry, wanderer });
    if (result.verdict !== 'unsafe') throw new Error('expected unsafe');
    const replayed = cloneWorld(world);
    const trace = result.shortest.moves.map((to) => tick(replayed, registry, { scripted: { target: to } }));
    expect(result.shortest.trace).toEqual(trace);
    expect(result.shortest.trace).toHaveLength(result.shortest.tick);
    expect(result.shortest.trace.at(-1)!.violation).toEqual({ property: 'no_contact', message: 'seeker reached the target', actors: ['seeker'] });
    expect(result.shortest.trace.at(-1)!.status).toBe('violated');
    expect(result.shortest.trace.slice(0, -1).every((t) => t.violation === null)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.shortest))).toEqual(result.shortest);
  });

  it('S4.4: every counterexample of a random world replays to its own violation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: SEEKER_SPECS.length - 1 }), fc.integer({ min: 0, max: WATCHER_SPECS.length - 1 }), (a, b) => {
        const reg = toyRegistry();
        const world = make(room(3, 2, { S: 5, T: 0, W: 3, s: 1 }), `${SEEKER_SPECS[a]}\n${WATCHER_SPECS[b]}`, reg, 5);
        const result = findCounterexample({ world, registry: reg, wanderer });
        if (result.verdict !== 'unsafe') return;
        for (const c of result.counterexamples) {
          expect(c.moves).toHaveLength(c.tick);
          const w = cloneWorld(world);
          const last = c.moves.map((to) => tick(w, reg, { scripted: { target: to } })!).at(-1)!;
          expect(last.violation?.property).toBe(c.property);
          expect(last.tick).toBe(c.tick);
        }
      }),
      { numRuns: 40 },
    );
  });

  it('S4.5: a move that makes a property fail is not extended and is not counted in paths', () => {
    // Horizon 1: the target may stay, step east (onto the seeker: a violation) or step south.
    const world = toyWorld(['#####', '#TS.#', '#...#', '#####'], 'THE seeker SHALL do nothing.', registry, { horizon: 1, turnOrder: ['target'], properties: ['no_contact'] });
    const result = findCounterexample({ world, registry, wanderer });
    expect(result.verdict).toBe('unsafe');
    expect(result.paths).toBe(2);
    // Horizon 2: the surviving paths are counted the same way as by walking each one.
    const longer = toyWorld(['#####', '#TS.#', '#...#', '#####'], 'THE seeker SHALL do nothing.', registry, { horizon: 2, turnOrder: ['target'], properties: ['no_contact'] });
    expect((findCounterexample({ world: longer, registry, wanderer }) as { paths: number }).paths).toBe(brute(longer, registry, () => false).paths);
  });

  it('S4.7: the verdict is safe exactly when no path fails, and the safe result has paths, goalPaths, states and transitions', () => {
    const reg = createToyRegistry();
    const world = toyWorld(['#####', '#T..#', '#####'], 'THE target SHALL do nothing.', reg, { horizon: 2 });
    const result: CounterexampleResult = findCounterexample({ world, registry: reg, wanderer });
    // Three tiles, two ticks. Tick 1 expands the start (2 moves). Tick 2 expands the 2 states it reached:
    // the tile at the wall has 2 moves and the middle tile has 3. That is 3 expanded entries and 7 transitions.
    expect(result).toEqual({ verdict: 'safe', paths: 5, goalPaths: 0, states: 3, transitions: 7 });
  });

  it('S4.7: an unsafe result has the shortest, the list, the surviving paths and the counters', () => {
    const world = toyWorld(rows, 'THE seeker SHALL do nothing.', registry, { horizon: 4, turnOrder: ['target'], properties: ['no_contact'] });
    const result = findCounterexample({ world, registry, wanderer });
    expect(Object.keys(result).sort()).toEqual(['counterexamples', 'goalPaths', 'paths', 'shortest', 'states', 'transitions', 'verdict']);
  });
});

describe('findCounterexample: goal and moves', () => {
  const registry = createToyRegistry();
  const corridor = (horizon: number): World => toyWorld(['#####', '#T..#', '#####'], 'THE target SHALL do nothing.', registry, { horizon });
  const atRight = (w: World): boolean => w.actors[0]!.pos.x === 3;

  it('S4.6: goalPaths counts the paths on which the goal held at least once, and a path that left the goal still counts', () => {
    expect(findCounterexample({ world: corridor(2), registry, wanderer, goal: atRight })).toMatchObject({ paths: 5, goalPaths: 1 });
    // Horizon 3: 12 walks in all on three tiles. The goal is the far tile; the walks that touch it are counted by walking them.
    const result = findCounterexample({ world: corridor(3), registry, wanderer, goal: atRight });
    expect(result).toMatchObject({ paths: 12, goalPaths: brute(corridor(3), registry, atRight).goalPaths });
    expect(result.goalPaths).toBeGreaterThan(1);
  });

  it('S4.6: without a goal predicate goalPaths is 0', () => {
    expect(findCounterexample({ world: corridor(3), registry, wanderer }).goalPaths).toBe(0);
  });

  it('S4.6: the goal is given the world after the tick and the trace of that tick', () => {
    const seen: [number, number][] = [];
    findCounterexample({ world: corridor(2), registry, wanderer, goal: (w, t) => (seen.push([w.tick, t.tick]), false) });
    expect(seen.every(([a, b]) => a === b)).toBe(true);
    expect(new Set(seen.map(([a]) => a))).toEqual(new Set([1, 2]));
  });

  it('S4.8: by default the wanderer may stay or step to any open neighbour', () => {
    const calls: Pos[][] = [];
    findCounterexample({
      world: corridor(1),
      registry,
      wanderer: { actor: 'target', moves: (w) => (calls.push(openSteps(w, w.actors[0]!.pos)), openSteps(w, w.actors[0]!.pos)) },
    });
    expect(calls).toEqual([[{ x: 1, y: 1 }, { x: 2, y: 1 }]]);
    expect(findCounterexample({ world: corridor(1), registry, wanderer }).paths).toBe(2);
  });

  it('S4.8: the caller may supply the moves, and the search tries them in the order given', () => {
    const stayOnly = findCounterexample({ world: corridor(5), registry, wanderer: { actor: 'target', moves: (w) => [w.actors[0]!.pos] } });
    expect(stayOnly).toMatchObject({ verdict: 'safe', paths: 1, states: 5 });
    const jump = findCounterexample({ world: corridor(1), registry, wanderer: { actor: 'target', moves: () => [{ x: 3, y: 1 }, { x: 2, y: 1 }] }, goal: atRight });
    expect(jump).toMatchObject({ paths: 2, goalPaths: 1 });
  });
});

describe('findCounterexample: input', () => {
  const registry = toyRegistry();
  const world = (): World => toyWorld(['#####', '#TS.#', '#####'], 'THE seeker SHALL do nothing.', registry, { horizon: 3, turnOrder: ['target'], properties: ['no_contact'] });

  it('S1.4: a wanderer that is not an actor, a property that is not registered and a world that is not running are SolverErrors', () => {
    expect(() => findCounterexample({ world: world(), registry, wanderer: { actor: 'nobody' } })).toThrow(/"nobody"/);
    expect(() => findCounterexample({ world: world(), registry, wanderer, properties: ['missing'] })).toThrow(/"missing"/);
    const done = world();
    done.status = 'complete';
    expect(() => findCounterexample({ world: done, registry, wanderer })).toThrow(SolverError);
    expect(() => findCounterexample({ world: done, registry, wanderer })).toThrow(/not "running"/);
  });

  it('S1.5: the world and the registry are not changed', () => {
    const w = world();
    const before = JSON.stringify(w);
    const props = registry.properties().map((p) => p.id);
    findCounterexample({ world: w, registry, wanderer, goal: () => true });
    expect(JSON.stringify(w)).toBe(before);
    expect(registry.properties().map((p) => p.id)).toEqual(props);
  });

  it('S1.5: the properties option replaces the checked list for the search but not for the given world', () => {
    const w = world();
    const only = findCounterexample({ world: w, registry, wanderer, properties: [] });
    expect(only.verdict).toBe('safe');
    expect(w.properties).toEqual(['no_contact']);
  });

  it('S1.3: the same inputs give the same result', () => {
    const a = findCounterexample({ world: world(), registry, wanderer, goal: goalSwitchOn });
    const b = findCounterexample({ world: world(), registry, wanderer, goal: goalSwitchOn });
    expect(b).toEqual(a);
  });
});
