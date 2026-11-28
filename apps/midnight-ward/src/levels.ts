import { createWorld, insertLine, loadSpec, parseGrid } from 'haunt-kit';
import type { ItemInit, Registry, Rule, World } from 'haunt-kit';
import night1Spec from '../specs/night-1.md?raw';
import night4Spec from '../specs/night-4.md?raw';
import prologueSpec from '../specs/prologue.md?raw';
import { HORIZON, LEGEND, TURN_ORDER, createRegistry } from './vocab';
import type { PlacedItem } from './vocab';

export interface LevelDef {
  id: string;
  name: string;
  /** Map rows. `#` wall, `.` floor, `B` bed and girl, `W` window, `w` wisp, `s` shade, `n` snuffer, `c` lit candle. */
  rows: string[];
  /** The character specs, as EARS sentences. */
  specText: string;
  /** What the player must place on free tiles, one entry per item. Same entries are interchangeable. */
  items: PlacedItem[];
  /** Cards the player may insert into a spec, each once at most. A card is a rule without an actor. */
  cards: Rule[];
}

export const PROLOGUE: LevelDef = {
  id: 'prologue',
  name: 'Prologue',
  rows: ['#########', '#B..#...#', '#...#...#', '#.......#', '#...#...#', '#...#..w#', '#########'],
  specText: prologueSpec,
  items: ['salt'],
  cards: [],
};

export const NIGHT_1: LevelDef = {
  id: 'night1',
  name: 'Night I',
  rows: ['#########', '#w......#', '#.......#', '#.......#', '#...B...#', '#.......#', '#......w#', '#########'],
  specText: night1Spec,
  items: ['bell'],
  cards: [
    { kw: 'IF', cond: 'bell_near', act: 'stay' },
    { kw: 'IF', cond: 'bell_near', act: 'stay' },
  ],
};

export const NIGHT_4: LevelDef = {
  id: 'night4',
  name: 'Night IV',
  rows: ['#########', '#...B...#', '#.......#', '#.......#', '#...w...#', '#.......#', '#.......#', '#.......#', '#########'],
  specText: night4Spec,
  items: ['bell'],
  cards: [{ kw: 'IF', cond: 'bell_near', act: 'away_girl' }],
};

export const LEVELS: readonly LevelDef[] = [PROLOGUE, NIGHT_1, NIGHT_4];

/** A card a player put into an actor's spec. `at` is the 0-based line index; `actor` is an actor id such as `wisp-2`. */
export interface CardInsert {
  actor: string;
  at: number;
  rule: Rule;
}

/**
 * Builds a level's world: the map, the specs, the placed items, and the cards inserted in the given order.
 * Throws when the spec text has errors.
 */
export function buildWorld(
  level: LevelDef,
  placement: ItemInit[] = [],
  cards: CardInsert[] = [],
  registry: Registry = createRegistry(),
): World {
  const { spec, errors } = loadSpec(level.specText, registry);
  if (errors.length > 0) {
    throw new Error(`${level.name} spec has errors:\n${errors.map((e) => `  line ${e.line}: ${e.message}`).join('\n')}`);
  }
  const world = createWorld({
    grid: parseGrid(level.rows, LEGEND),
    spec,
    registry,
    horizon: HORIZON,
    turnOrder: TURN_ORDER,
    items: placement,
  });
  for (const card of cards) insertLine(world, card.actor, card.at, card.rule, 'card');
  return world;
}
