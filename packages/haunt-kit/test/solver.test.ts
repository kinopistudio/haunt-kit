import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SolverError, addItem, cloneWorld, findSolutions, stateKey } from '../src/index';
import type { ChoiceGenerator, PropertyDef, World } from '../src/index';
import { contactProperty, createToyRegistry, toyWorld } from './fixtures/toy-vocab';

const srcDir = join(import.meta.dirname, '../src/solver');
const sources = (): { file: string; text: string }[] =>
  readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => ({ file, text: readFileSync(join(srcDir, file), 'utf8') }));

describe('solver module', () => {
  it('S1.1: src/solver exists and its API is exported from the haunt-kit entry point', async () => {
    expect(existsSync(srcDir)).toBe(true);
    const kit = await import('../src/index');
    for (const name of ['findSolutions', 'findCounterexample', 'boardChoices', 'stateKey', 'SolverError']) expect(kit, name).toHaveProperty(name);
    expect(readFileSync(join(srcDir, '../index.ts'), 'utf8')).toContain("'./solver/index'");
  });

  it('S1.1: the solver imports only from grammar, registry, world, engine and trace', () => {
    const allowed = new Set(['grammar', 'registry', 'world', 'engine', 'trace']);
    let checked = 0;
    for (const { file, text } of sources()) {
      for (const m of text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1]!;
        checked++;
        if (spec.startsWith('./')) continue;
        const dir = /^\.\.\/([a-z]+)\//.exec(spec)?.[1];
        expect(dir !== undefined && allowed.has(dir), `${file} imports ${spec}`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('S1.2: the solver files contain no game words, in code or comments', () => {
    const words = /\b(?:ghosts?|girls?|wisps?|shades?|snuffers?|candles?|salt|bells?|visitors?|fog|jump|light)\b/i;
    for (const { file, text } of sources()) expect(words.exec(text)?.[0], file).toBeUndefined();
  });

  it('S1.3: the solver files use no Math.random, Date or DOM globals', () => {
    const forbidden = /\bMath\.random\b|\bDate\b|\bdocument\b|\bwindow\b|\bnavigator\b|\blocalStorage\b|\bperformance\b/;
    for (const { file, text } of sources()) expect(forbidden.exec(text)?.[0], file).toBeUndefined();
  });
});

const registry = createToyRegistry().addProperty(contactProperty).addProperty({ id: 'always_fails', description: 'x', check: () => ({ message: 'no', actors: [] }) });
const rows = ['#########', '#S.....T#', '#########'];
const walk = 'THE seeker SHALL step toward the target.';

/** Choices: no block, or a solid block on one tile between the seeker and the target. Only a block stops the seeker. */
function blockGenerator(blocks: (number | null)[]): ChoiceGenerator<number | null> & { built: number } {
  const gen = {
    built: 0,
    choices: () => blocks,
    build(choice: number | null): World {
      gen.built++;
      const world = toyWorld(rows, walk, registry);
      if (choice !== null) addItem(world, { type: 'block', pos: { x: choice, y: 1 }, solid: true });
      return world;
    },
  };
  return gen;
}

describe('findSolutions', () => {
  it('S2.1: counts the choices whose world ends complete, building one world per choice', () => {
    const gen = blockGenerator([null, 2, 3, 4, 5, 6]);
    const result = findSolutions(gen, registry, 'no_contact');
    expect(result.solutions).toBe(5);
    expect(gen.built).toBe(6);
  });

  it('S2.1: only the named property is checked, whatever the world listed', () => {
    const world = toyWorld(rows, walk, registry);
    expect(world.properties).toEqual(['no_contact', 'always_fails']);
    const result = findSolutions({ choices: () => [0], build: () => world }, registry, 'no_contact');
    expect(world.properties).toEqual(['no_contact']);
    expect(result.solutions).toBe(0); // the seeker reaches the target on an empty corridor
    const other = findSolutions(blockGenerator([2]), registry, 'always_fails');
    expect(other).toEqual({ solutions: 0, total: 1, firstSolution: null });
  });

  it('S2.1: choices are tried in generator order', () => {
    const order: (number | null)[] = [];
    const gen = blockGenerator([6, 2, 4]);
    const build = gen.build;
    gen.build = (c) => (order.push(c), build(c));
    findSolutions(gen, registry, 'no_contact');
    expect(order).toEqual([6, 2, 4]);
  });

  it('S2.2: the result has solutions, total and the first solution in generator order', () => {
    const result = findSolutions(blockGenerator([null, 5, 2, 3]), registry, 'no_contact');
    expect(result).toEqual({ solutions: 3, total: 4, firstSolution: 5 });
    expect(Object.keys(result).sort()).toEqual(['firstSolution', 'solutions', 'total']);
  });

  it('S2.3: no choices gives zeros and a null first solution', () => {
    expect(findSolutions(blockGenerator([]), registry, 'no_contact')).toEqual({ solutions: 0, total: 0, firstSolution: null });
  });

  it('S2.3: when no choice is a solution the first solution is null', () => {
    expect(findSolutions(blockGenerator([null, null]), registry, 'no_contact')).toEqual({ solutions: 0, total: 2, firstSolution: null });
  });

  it('S2.3: a solution that is falsy (0) is still reported as the first solution', () => {
    const gen: ChoiceGenerator<number> = { choices: () => [0, 1], build: () => toyWorld(['#####', '#S..#', '#####'], 'THE seeker SHALL do nothing.', registry) };
    expect(findSolutions(gen, registry, 'no_contact')).toEqual({ solutions: 2, total: 2, firstSolution: 0 });
  });

  it('S2.4: a property id that is not registered throws a SolverError before any world is built', () => {
    const gen = blockGenerator([2, 3]);
    expect(() => findSolutions(gen, registry, 'missing')).toThrow(SolverError);
    expect(() => findSolutions(gen, registry, 'missing')).toThrow(/"missing"/);
    expect(gen.built).toBe(0);
  });

  it('S1.4: a built world that is not running throws a SolverError that names the choice number', () => {
    const done = toyWorld(rows, walk, registry);
    done.status = 'complete';
    expect(() => findSolutions({ choices: () => ['a'], build: () => done }, registry, 'no_contact')).toThrow(SolverError);
    expect(() => findSolutions({ choices: () => ['a'], build: () => done }, registry, 'no_contact')).toThrow(/choice 1/);
  });

  it('S1.5: choices and the registry are not changed, and a second run gives the same result (S1.3)', () => {
    const choices = Object.freeze([null, 2, 3, 4]);
    const props = registry.properties().map((p: PropertyDef) => p.id);
    const first = findSolutions(blockGenerator([...choices]), registry, 'no_contact');
    const second = findSolutions(blockGenerator([...choices]), registry, 'no_contact');
    expect(second).toEqual(first);
    expect(registry.properties().map((p) => p.id)).toEqual(props);
    expect(choices).toEqual([null, 2, 3, 4]);
  });
});

describe('stateKey', () => {
  const make = (): World => toyWorld(['#######', '#S.T.s#', '#######'], `${walk}\nTHE target SHALL do nothing.`, registry);

  it('S4.1: equal worlds have equal keys, and a clone has the key of its original', () => {
    const w = make();
    expect(stateKey(make())).toBe(stateKey(w));
    expect(stateKey(cloneWorld(w))).toBe(stateKey(w));
  });

  it('S4.1: the key changes with an actor tile, an item state, an item tile, a line id and the status', () => {
    const base = stateKey(make());
    const keys = new Set([base]);
    const moved = make();
    moved.actors[0]!.pos.x += 1;
    keys.add(stateKey(moved));
    const flipped = make();
    flipped.items[0]!.state.on = true;
    keys.add(stateKey(flipped));
    const shifted = make();
    shifted.items[0]!.pos.x -= 1;
    keys.add(stateKey(shifted));
    const relined = make();
    relined.actors[0]!.lines[0]!.id = 99;
    keys.add(stateKey(relined));
    const finished = make();
    finished.status = 'complete';
    keys.add(stateKey(finished));
    expect(keys.size).toBe(6);
  });

  it('S4.1: the key does not depend on the order of the keys of an item state, and ignores the tick', () => {
    const a = make();
    const b = make();
    a.items[0]!.state = { on: true, charge: 2 };
    b.items[0]!.state = { charge: 2, on: true };
    b.tick = 5;
    expect(stateKey(a)).toBe(stateKey(b));
  });
});
