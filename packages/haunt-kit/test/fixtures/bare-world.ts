import { parseGrid } from '../../src/index';
import type { Actor, Item, Legend, Pos, World } from '../../src/index';

/** Builds a World by hand, without createWorld, for tests of single modules. */
export function bareWorld(rows: string[], opts: { legend?: Legend; actors?: { id: string; kind: string; pos: Pos }[]; items?: Item[] } = {}): World {
  const grid = parseGrid(rows, opts.legend);
  const actors: Actor[] = (opts.actors ?? []).map((a) => ({ ...a, pos: { ...a.pos }, lines: [] }));
  return {
    map: grid.map,
    markers: grid.markers,
    actors,
    items: opts.items ?? [],
    events: [],
    properties: [],
    tick: 0,
    horizon: 12,
    status: 'running',
    nextLineId: 1,
  };
}
