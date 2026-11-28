import { boardChoices, findSolutions, parseGrid, run } from 'haunt-kit';
import type { BoardChoice, ChoiceGenerator, Registry, SolutionSummary, WorldStatus } from 'haunt-kit';
import { buildWorld } from './levels';
import type { LevelDef } from './levels';
import { LEGEND, createRegistry, makeItem } from './vocab';

/** The property a night must keep: no ghost on the girl's tile. */
export const GIRL_SAFE = 'girl_safe';

/**
 * Every choice a player has on a level: where the items go and which cards go to which spec at which line.
 * This is glue only. The enumeration is the kit's `boardChoices`.
 */
export function levelChoices(level: LevelDef, registry: Registry = createRegistry()): ChoiceGenerator<BoardChoice> {
  return boardChoices({
    base: buildWorld(level, [], [], registry),
    tiles: parseGrid(level.rows, LEGEND).free,
    items: level.items.map((type) => ({ type, make: (pos) => makeItem(type, pos.x, pos.y) })),
    cards: level.cards,
  });
}

/** Runs every choice of the level and counts the ones that keep the girl safe for the whole night. */
export function solveLevel(level: LevelDef): SolutionSummary<BoardChoice> {
  const registry = createRegistry();
  return findSolutions(levelChoices(level, registry), registry, GIRL_SAFE);
}

/** How the night ends when the player places nothing and inserts no card. */
export function emptyBoard(level: LevelDef): WorldStatus {
  const registry = createRegistry();
  const world = buildWorld(level, [], [], registry);
  run(world, registry);
  return world.status;
}
