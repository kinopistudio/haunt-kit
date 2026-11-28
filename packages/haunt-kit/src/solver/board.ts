import type { Rule } from '../grammar/types';
import { addItem, cloneWorld, insertLine } from '../world/create';
import type { ItemInit, Pos, World } from '../world/types';
import { SolverError } from './types';
import type { ChoiceGenerator } from './types';

/** An item a player puts on the board. Tokens of the same `type` are interchangeable. */
export interface ItemToken {
  type: string;
  make(pos: Pos): ItemInit;
}

export interface BoardOptions {
  /** The level before anything is placed. Never changed: every built world is a clone. */
  base: World;
  /** Tiles where items may go, in a fixed order (reading order). */
  tiles: Pos[];
  /** Items to place. All of them are placed, each on its own tile. */
  items: ItemToken[];
  /** Cards. Each is left out or inserted once, as a line of one actor. */
  cards: Rule[];
  /** Ids of the actors that may receive cards. Default: every actor of `base`. */
  actors?: string[];
}

/** One way to set up the board. */
export interface BoardChoice {
  /** For each item token, the index into `tiles` where it goes. */
  tiles: number[];
  /** For each card, `null` when unused, else the actor and the 0-based line index at the moment of insertion. */
  cards: ({ actor: string; at: number } | null)[];
}

/** Every way to place the tokens: each on its own tile, same-type tokens as a set. */
function* placements(tileCount: number, items: ItemToken[]): Generator<number[]> {
  const chosen: number[] = [];
  const used = new Set<number>();
  function* place(k: number): Generator<number[]> {
    if (k === items.length) {
      yield chosen.slice();
      return;
    }
    // A token of an earlier type-mate must sit on an earlier tile, so each set of tiles is listed once.
    let start = 0;
    for (let j = k - 1; j >= 0; j--) {
      if (items[j]!.type === items[k]!.type) {
        start = chosen[j]! + 1;
        break;
      }
    }
    for (let i = start; i < tileCount; i++) {
      if (used.has(i)) continue;
      used.add(i);
      chosen.push(i);
      yield* place(k + 1);
      chosen.pop();
      used.delete(i);
    }
  }
  yield* place(0);
}

/**
 * Every way to insert the cards, in card order. A card is unused, or goes into one actor at an index from
 * 0 to the number of lines the actor has at that moment, counting the cards already inserted into it.
 */
function* arrangements(lines: Map<string, number>, actors: string[], cardCount: number): Generator<BoardChoice['cards']> {
  const chosen: BoardChoice['cards'] = [];
  const extra = new Map<string, number>();
  function* arrange(i: number): Generator<BoardChoice['cards']> {
    if (i === cardCount) {
      yield chosen.slice();
      return;
    }
    chosen.push(null);
    yield* arrange(i + 1);
    chosen.pop();
    for (const actor of actors) {
      const top = lines.get(actor)! + (extra.get(actor) ?? 0);
      extra.set(actor, (extra.get(actor) ?? 0) + 1);
      for (let at = 0; at <= top; at++) {
        chosen.push({ actor, at });
        yield* arrange(i + 1);
        chosen.pop();
      }
      extra.set(actor, extra.get(actor)! - 1);
    }
  }
  yield* arrange(0);
}

/**
 * A choice generator for "put these items on free tiles and insert these cards into specs".
 * Placements are the outer loop and card arrangements the inner loop.
 */
export function boardChoices(options: BoardOptions): ChoiceGenerator<BoardChoice> {
  const { base, tiles, items, cards } = options;
  if (base.status !== 'running') throw new SolverError(`the base world is "${base.status}", not "running"`);
  const actors = options.actors ?? base.actors.map((a) => a.id);
  const lines = new Map<string, number>();
  for (const id of actors) {
    const actor = base.actors.find((a) => a.id === id);
    if (!actor) throw new SolverError(`cards may go to "${id}", but the base world has no such actor`);
    lines.set(id, actor.lines.length);
  }

  return {
    *choices() {
      for (const tileIndexes of placements(tiles.length, items)) {
        for (const cardChoices of arrangements(lines, actors, cards.length)) yield { tiles: tileIndexes, cards: cardChoices };
      }
    },
    build(choice) {
      const world = cloneWorld(base);
      choice.tiles.forEach((tile, k) => addItem(world, items[k]!.make(tiles[tile]!)));
      choice.cards.forEach((card, i) => {
        if (card) insertLine(world, card.actor, card.at, cards[i]!, 'card');
      });
      return world;
    },
  };
}
