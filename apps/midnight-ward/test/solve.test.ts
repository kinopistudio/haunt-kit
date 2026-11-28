import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { run } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { LEVELS, NIGHT_1, NIGHT_4, PROLOGUE } from '../src/levels';
import type { LevelDef } from '../src/levels';
import { GIRL_SAFE, emptyBoard, levelChoices, solveLevel } from '../src/solve';
import { createRegistry } from '../src/vocab';
import { NIGHT_2, NIGHT_3 } from './fixtures/extra-levels';

// The expected numbers are the prototype solver's. They are literals here: the search below reads the
// level rows, items, cards and the vocabulary, and never the recorded fixture.

describe('Midnight Ward solved by search', () => {
  it('S7.1: the Prologue has 4 solutions out of 29', () => {
    const { solutions, total } = solveLevel(PROLOGUE);
    expect([solutions, total]).toEqual([4, 29]);
  });

  it('S7.1: Night I has 12 solutions out of 2145', () => {
    const { solutions, total } = solveLevel(NIGHT_1);
    expect([solutions, total]).toEqual([12, 2145]);
  });

  it('S7.1: Night IV has 7 solutions out of 329', () => {
    const { solutions, total } = solveLevel(NIGHT_4);
    expect([solutions, total]).toEqual([7, 329]);
  });

  it('S7.1: the levels of the product are exactly the Prologue, Night I and Night IV', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['prologue', 'night1', 'night4']);
  });

  it('S7.3: the test-only Night II has 4 solutions out of 741 and Night III 15 out of 1482', () => {
    const night2 = solveLevel(NIGHT_2);
    const night3 = solveLevel(NIGHT_3);
    expect([night2.solutions, night2.total]).toEqual([4, 741]);
    expect([night3.solutions, night3.total]).toEqual([15, 1482]);
  });
});

describe('Midnight Ward: empty boards and first solutions', () => {
  const all: LevelDef[] = [PROLOGUE, NIGHT_1, NIGHT_4, NIGHT_2, NIGHT_3];

  it('S7.2: with no items placed and no cards inserted the night ends violated', () => {
    for (const level of [PROLOGUE, NIGHT_1, NIGHT_4]) expect(emptyBoard(level), level.id).toBe('violated');
  });

  it('S7.2: the same holds for the test-only nights', () => {
    for (const level of [NIGHT_2, NIGHT_3]) expect(emptyBoard(level), level.id).toBe('violated');
  });

  it('S7.4: the first solution of each level, built and run, ends complete', () => {
    for (const level of all) {
      const registry = createRegistry();
      const generator = levelChoices(level, registry);
      const { firstSolution, solutions } = solveLevel(level);
      expect(solutions, level.id).toBeGreaterThan(0);
      const world = generator.build(firstSolution!);
      run(world, registry);
      expect(world.status, level.id).toBe('complete');
    }
  });

  it('S7.4: a choice that is not the first solution can lose, and the property checked is girl_safe', () => {
    const registry = createRegistry();
    const generator = levelChoices(PROLOGUE, registry);
    const first = [...generator.choices()][0]!;
    const world = generator.build(first);
    run(world, registry);
    expect(world.status).toBe('violated');
    expect(world.properties).toEqual([GIRL_SAFE]);
  });
});

describe('Midnight Ward: the search stands on its own', () => {
  it('S7.5: no source file of the app reads or names the recorded oracle fixture', () => {
    const dir = join(import.meta.dirname, '../src');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/oracle/i);
    }
  });

  it('S7.5: the levels carry their own item list and card list, taken from the level definition', () => {
    expect(PROLOGUE.items).toEqual(['salt']);
    expect(NIGHT_1.items).toEqual(['bell']);
    expect(NIGHT_1.cards).toHaveLength(2);
    expect(NIGHT_4.cards).toEqual([{ kw: 'IF', cond: 'bell_near', act: 'away_girl' }]);
  });
});
