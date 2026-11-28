import { describe, expect, it } from 'vitest';
import { GridError, parseGrid } from '../src/index';
import type { Legend } from '../src/index';

const legend: Legend = {
  S: { actor: 'seeker' },
  T: { actor: 'target', marker: 'goal' },
  G: { marker: 'goal' },
  k: { item: { type: 'key' } },
  b: { item: { type: 'block', solid: true, state: { weight: 3 } } },
};

const ROWS = ['#######', '#S..k.#', '#.#.#G#', '#T.b..#', '#######'];

describe('parseGrid', () => {
  it('R4.1: returns width, height and the wall set', () => {
    const g = parseGrid(ROWS, legend);
    expect(g.map.w).toBe(7);
    expect(g.map.h).toBe(5);
    expect(g.map.walls.has(0)).toBe(true);
    expect(g.map.walls.has(1 * 7 + 1)).toBe(false);
    expect(g.map.walls.has(2 * 7 + 2)).toBe(true);
    expect(g.map.walls.size).toBe(7 + 2 + 4 + 2 + 7);
  });

  it('R4.1: returns actor starts in reading order', () => {
    const g = parseGrid(ROWS, legend);
    expect(g.starts).toEqual([
      { kind: 'seeker', pos: { x: 1, y: 1 } },
      { kind: 'target', pos: { x: 1, y: 3 } },
    ]);
  });

  it('R4.1: returns items with their solid flag and state, as copies', () => {
    const g = parseGrid(ROWS, legend);
    expect(g.items).toEqual([
      { type: 'key', pos: { x: 4, y: 1 } },
      { type: 'block', pos: { x: 3, y: 3 }, solid: true, state: { weight: 3 } },
    ]);
    g.items[1]!.state!.weight = 99;
    expect(legend.b!.item!.state!.weight).toBe(3);
  });

  it('R4.1: returns named markers, including cells that also hold an actor', () => {
    const g = parseGrid(ROWS, legend);
    expect(g.markers).toEqual({
      goal: [
        { x: 5, y: 2 },
        { x: 1, y: 3 },
      ],
    });
  });

  it('R4.1: free tiles are plain floor only, in reading order', () => {
    const g = parseGrid(['#####', '#S.k#', '#..G#', '#####'], legend);
    expect(g.free).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });

  it('R4.1: the legend can override the defaults', () => {
    const g = parseGrid(['x.'], { x: { wall: true }, '.': { marker: 'floor' } });
    expect(g.map.walls.has(0)).toBe(true);
    expect(g.markers.floor).toEqual([{ x: 1, y: 0 }]);
    expect(g.free).toEqual([]);
  });

  it('R4.2: rows of different length are an error with the row', () => {
    try {
      parseGrid(['####', '#..', '####']);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GridError);
      expect((e as GridError).row).toBe(2);
      expect((e as GridError).message).toContain('row 2');
    }
  });

  it('R4.2: a character that is not in the legend is an error with row and column', () => {
    try {
      parseGrid(['###', '#?#', '###']);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GridError);
      expect(e).toMatchObject({ row: 2, col: 2 });
    }
  });

  it('R4.2: names like toString are not legend entries', () => {
    expect(() => parseGrid(['#t#'], {})).toThrow(GridError);
    expect(() => parseGrid(['#.#'], {})).not.toThrow();
  });

  it('R4.2: an empty grid and a bad legend are errors', () => {
    expect(() => parseGrid([])).toThrow(GridError);
    expect(() => parseGrid([''])).toThrow(GridError);
    expect(() => parseGrid(['x'], { x: { wall: true, actor: 'a' } })).toThrow(/wall/);
    expect(() => parseGrid(['x'], { xy: {} })).toThrow(/one character/);
    expect(() => parseGrid(['x'], { x: { marker: 'Bad Name' } })).toThrow(/marker/);
  });
});
