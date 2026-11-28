import { loadSpec } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { LEVELS, NIGHT_1, NIGHT_4, PROLOGUE, buildWorld } from '../src/levels';
import { createRegistry } from '../src/vocab';

const registry = createRegistry();
const files = import.meta.glob('../specs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('character specs', () => {
  it('R6.6: every spec file in specs/ loads with no errors', () => {
    const paths = Object.keys(files);
    expect(paths.length).toBeGreaterThanOrEqual(3);
    for (const path of paths) {
      const { errors } = loadSpec(files[path]!, registry);
      expect(errors, path).toEqual([]);
    }
  });

  it('R6.6: every spec file has at least one rule', () => {
    for (const [path, text] of Object.entries(files)) {
      const { spec } = loadSpec(text, registry);
      expect(Object.values(spec.actors).flat().length, path).toBeGreaterThan(0);
    }
  });

  it('R6.6: every level spec is one of the files, and the levels build into worlds', () => {
    const texts = new Set(Object.values(files));
    for (const level of LEVELS) {
      expect(texts.has(level.specText), level.id).toBe(true);
      const world = buildWorld(level);
      expect(world.status).toBe('running');
      expect(world.actors[0]!.id).toBe('girl');
    }
  });

  it('R6.6: the Prologue has a girl and one wisp, each with one line', () => {
    const world = buildWorld(PROLOGUE);
    expect(world.actors.map((a) => [a.id, a.lines.length])).toEqual([['girl', 1], ['wisp', 1]]);
  });

  it('R6.6: Night I has a girl and two wisps with the same spec', () => {
    const world = buildWorld(NIGHT_1);
    expect(world.actors.map((a) => [a.id, a.lines.length])).toEqual([['girl', 1], ['wisp', 1], ['wisp-2', 1]]);
    expect(world.actors[1]!.pos).toEqual({ x: 1, y: 1 });
    expect(world.actors[2]!.pos).toEqual({ x: 7, y: 6 });
  });

  it('R6.7: Night IV has three wisp lines and one scheduled write at tick 6', () => {
    const world = buildWorld(NIGHT_4);
    expect(world.actors.map((a) => [a.id, a.lines.length])).toEqual([['girl', 1], ['wisp', 3]]);
    expect(world.events).toEqual([
      { tick: 6, actor: 'wisp', line: 1, rule: { kw: 'WHEN', cond: 'girl_near', act: 'toward_girl' } },
    ]);
  });

  it('R6.6: a spec with an error stops the level from building and says which line', () => {
    expect(() => buildWorld({ ...PROLOGUE, specText: 'THE girl SHALL stay still.\nTHE wisp SHALL fly.' })).toThrow(/line 2.*unknown action/);
  });
});
