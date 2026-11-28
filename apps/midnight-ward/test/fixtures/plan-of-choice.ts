import type { BoardChoice } from 'haunt-kit';
import type { LevelDef } from '../../src/levels';
import { floorTiles, freshPlan, insertCard, placeItem } from '../../src/plan';
import type { Plan } from '../../src/plan';

function must<T>(value: T | null): T {
  if (value === null) throw new Error('expected a value');
  return value;
}

/** The plan that equals a solver choice: tokens on their tiles, cards inserted in card order. */
export function planOfChoice(level: LevelDef, choice: BoardChoice): Plan {
  const tiles = floorTiles(level);
  let plan = freshPlan(level);
  level.items.forEach((type, k) => {
    const tile = tiles[choice.tiles[k]!]!;
    plan = must(placeItem(level, plan, type, tile.x, tile.y));
  });
  choice.cards.forEach((place, c) => {
    if (place) plan = must(insertCard(level, plan, c, place.actor, place.at));
  });
  return plan;
}
