import { parseGrid } from 'haunt-kit';
import type { ItemInit, Rule } from 'haunt-kit';
import { buildWorld } from './levels';
import type { CardInsert, LevelDef } from './levels';
import { LEGEND, makeItem } from './vocab';
import type { PlacedItem } from './vocab';

/** One item the player has put on a tile. */
export interface PlacedPiece {
  type: PlacedItem;
  x: number;
  y: number;
}

/** One line of a spec as the player sees it: a line of the level (`base`, by its index) or a card (by its index in the level's list). */
export type ListEntry = { t: 'base'; i: number } | { t: 'card'; c: number };

/**
 * What the player has chosen before a night. `lists` has one entry per actor id, in turn order. It holds the
 * lines of that actor's spec in the order they will be read, with the cards between them.
 */
export interface Plan {
  items: PlacedPiece[];
  lists: Record<string, ListEntry[]>;
}

/** What the player has picked up from the tray and not yet put down. */
export type Selection = { kind: 'item'; type: PlacedItem } | { kind: 'card'; card: number };

interface Layout {
  actors: { id: string; kind: string; lines: number }[];
  free: { x: number; y: number }[];
}

const layouts = new WeakMap<LevelDef, Layout>();

function layoutOf(level: LevelDef): Layout {
  let layout = layouts.get(level);
  if (!layout) {
    const world = buildWorld(level);
    layout = {
      actors: world.actors.map((a) => ({ id: a.id, kind: a.kind, lines: a.lines.length })),
      free: parseGrid(level.rows, LEGEND).free,
    };
    layouts.set(level, layout);
  }
  return layout;
}

/** The actors of a level in turn order, with the number of lines each starts with. */
export function levelActors(level: LevelDef): readonly { id: string; kind: string; lines: number }[] {
  return layoutOf(level).actors;
}

/** The plain floor tiles of a level in reading order: the tiles where items may go. */
export function floorTiles(level: LevelDef): readonly { x: number; y: number }[] {
  return layoutOf(level).free;
}

/** Nothing placed, no card inserted. */
export function freshPlan(level: LevelDef): Plan {
  const lists: Plan['lists'] = {};
  for (const actor of layoutOf(level).actors) lists[actor.id] = Array.from({ length: actor.lines }, (_, i) => ({ t: 'base', i }));
  return { items: [], lists };
}

/** How many items of a type the player may still place. */
export function remaining(level: LevelDef, plan: Plan, type: PlacedItem): number {
  return level.items.filter((t) => t === type).length - plan.items.filter((p) => p.type === type).length;
}

/** The item types of a level, each once, in the order the level lists them. */
export function itemTypes(level: LevelDef): PlacedItem[] {
  return [...new Set(level.items)];
}

export function pieceAt(plan: Plan, x: number, y: number): PlacedPiece | undefined {
  return plan.items.find((p) => p.x === x && p.y === y);
}

/** True for a plain floor tile that holds no placed item. Walls, the bed and the ghosts' starting tiles are not floor. */
export function isFreeTile(level: LevelDef, plan: Plan, x: number, y: number): boolean {
  return layoutOf(level).free.some((t) => t.x === x && t.y === y) && !pieceAt(plan, x, y);
}

/** Places an item. Returns `null` when none of that type is left or the tile is not free. */
export function placeItem(level: LevelDef, plan: Plan, type: PlacedItem, x: number, y: number): Plan | null {
  if (remaining(level, plan, type) <= 0 || !isFreeTile(level, plan, x, y)) return null;
  return { ...plan, items: [...plan.items, { type, x, y }] };
}

/** Takes the item off a tile. Returns `null` when the tile has none. */
export function takeItem(plan: Plan, x: number, y: number): { plan: Plan; type: PlacedItem } | null {
  const piece = pieceAt(plan, x, y);
  if (!piece) return null;
  return { plan: { ...plan, items: plan.items.filter((p) => p !== piece) }, type: piece.type };
}

/** Moves a placed item to another free tile. Returns `null` when there is no item or the target is not free. */
export function moveItem(level: LevelDef, plan: Plan, from: { x: number; y: number }, to: { x: number; y: number }): Plan | null {
  const taken = takeItem(plan, from.x, from.y);
  if (!taken) return null;
  return placeItem(level, taken.plan, taken.type, to.x, to.y);
}

/** The cards that are in some spec. */
export function usedCards(plan: Plan): Set<number> {
  const used = new Set<number>();
  for (const list of Object.values(plan.lists)) for (const e of list) if (e.t === 'card') used.add(e.c);
  return used;
}

/** Where a card is: the actor and the 0-based line, or `null` when it is in the tray. */
export function cardPlace(plan: Plan, card: number): { actor: string; at: number } | null {
  for (const [actor, list] of Object.entries(plan.lists)) {
    const at = list.findIndex((e) => e.t === 'card' && e.c === card);
    if (at !== -1) return { actor, at };
  }
  return null;
}

/**
 * Puts a card into an actor's spec so that it becomes line `at + 1` (0-based `at`, from 0 to the number of lines).
 * The lines at and below it move down by one. Returns `null` for an unknown card or actor, a position out of range,
 * or a card that is already in a spec.
 */
export function insertCard(level: LevelDef, plan: Plan, card: number, actor: string, at: number): Plan | null {
  const list = plan.lists[actor];
  if (!list || !Number.isInteger(card) || card < 0 || card >= level.cards.length) return null;
  if (!Number.isInteger(at) || at < 0 || at > list.length) return null;
  if (usedCards(plan).has(card)) return null;
  return { ...plan, lists: { ...plan.lists, [actor]: [...list.slice(0, at), { t: 'card', c: card }, ...list.slice(at)] } };
}

/** Takes a card out of its spec and back into the tray. Returns the plan unchanged when the card is in the tray. */
export function removeCard(plan: Plan, card: number): Plan {
  const place = cardPlace(plan, card);
  if (!place) return plan;
  const list = plan.lists[place.actor]!;
  return { ...plan, lists: { ...plan.lists, [place.actor]: list.filter((e) => !(e.t === 'card' && e.c === card)) } };
}

/**
 * The items to add to the world. They are in the order the solver adds them: by the order of the level's item
 * list, and for items of one type by tile in reading order. The order matters for the rules (the first of two
 * equal candidates wins a tie), and keeps a plan equal to the solver's choice.
 */
export function toPlacement(level: LevelDef, plan: Plan): ItemInit[] {
  const rank = (type: PlacedItem): number => level.items.indexOf(type);
  return [...plan.items]
    .sort((a, b) => rank(a.type) - rank(b.type) || a.y - b.y || a.x - b.x)
    .map((p) => makeItem(p.type, p.x, p.y));
}

/**
 * The cards as inserts, for every actor in turn order and in ascending line position. Inserted in this order, each
 * card ends up at the position it has in its list.
 */
export function toInserts(level: LevelDef, plan: Plan): CardInsert[] {
  const inserts: CardInsert[] = [];
  for (const [actor, list] of Object.entries(plan.lists)) {
    list.forEach((entry, at) => {
      if (entry.t === 'card') inserts.push({ actor, at, rule: level.cards[entry.c] as Rule });
    });
  }
  return inserts;
}
