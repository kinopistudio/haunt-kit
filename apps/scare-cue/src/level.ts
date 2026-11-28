import {
  cloneWorld,
  createWorld,
  distance,
  findCounterexample,
  firedRule,
  insertLine,
  loadSpec,
  parseGrid,
  parseSentence,
  registerSafety,
} from 'haunt-kit';
import type { CounterexampleResult, Registry, Rule, TickTrace, World } from 'haunt-kit';
import propsSpec from '../specs/props.md?raw';
import safetySpec from '../specs/safety.md?raw';
import { HORIZON, JUMP_SCARE, LEGEND, NEAR, TURN_ORDER, VISITOR, createRegistry } from './vocab';

/**
 * The house. `V` the visitor's start, `J` the jump-scare and `F` the fog machine (closed tiles), `E` the exit
 * and its light (an open tile), `#` a wall, `.` floor.
 */
export const ROWS: string[] = [
  '#########',
  '#V..J...#',
  '#.......#',
  '#.#####.#',
  '#.......#',
  '####F#E##',
  '#########',
];

/** A card the player may insert into a prop's spec. It is one EARS sentence. */
export interface CardDef {
  id: string;
  /** What the card is for. A decoy looks like a fix and does not fix anything. */
  role: 'fix' | 'decoy';
  tag: string;
  /** The sentence on the card. */
  text: string;
  /** The actor kind (and id) the sentence is about. */
  actor: string;
  rule: Rule;
}

/** Where a card goes: its index in `CARDS` and the 0-based line index of the prop's spec at the time of insertion. */
export interface CardInsert {
  card: number;
  at: number;
}

const CARD_SOURCES: Omit<CardDef, 'actor' | 'rule'>[] = [
  { id: 'exit-light-fix', role: 'fix', tag: 'Fix for the exit light', text: 'IF the fog is on, THEN THE exit light SHALL stay on.' },
  { id: 'jump-scare-fix', role: 'fix', tag: 'Fix for the jump-scare', text: 'IF a visitor is adjacent, THEN THE jump-scare SHALL stay still.' },
  { id: 'fog-machine-decoy', role: 'decoy', tag: 'Fix for the fog machine', text: 'IF the exit light is off, THEN THE fog machine SHALL stop the fog.' },
];

function parseCards(registry: Registry): CardDef[] {
  return CARD_SOURCES.map((source) => {
    const parsed = parseSentence(source.text, registry);
    if (!parsed.ok || parsed.value.type !== 'rule') throw new Error(`card "${source.id}" is not a rule sentence: ${source.text}`);
    return { ...source, actor: parsed.value.actor, rule: parsed.value.rule };
  });
}

function load(): { registry: Registry; base: World; cards: CardDef[]; safety: string[] } {
  const registry = createRegistry();
  const props = loadSpec(propsSpec, registry);
  const safety = loadSpec(safetySpec, registry);
  const errors = [...props.errors, ...safety.errors];
  if (errors.length > 0) throw new Error(`Scare Cue specs have errors:\n${errors.map((e) => `  line ${e.line}: ${e.message}`).join('\n')}`);
  const safetyIds = registerSafety(registry, safety.spec.safety);
  const base = createWorld({
    grid: parseGrid(ROWS, LEGEND),
    spec: { actors: props.spec.actors, events: [], safety: safety.spec.safety },
    registry,
    horizon: HORIZON,
    turnOrder: TURN_ORDER,
  });
  return { registry, base, cards: parseCards(registry), safety: safetyIds };
}

const level = load();

/** Scare Cue's registry, with the safety rules of `specs/safety.md` registered as properties `S1` and `S2`. */
export const registry: Registry = level.registry;
export const CARDS: readonly CardDef[] = level.cards;
/** The ids of the safety properties, in file order. */
export const SAFETY_IDS: readonly string[] = level.safety;

/** The house with the default prop rules and the given cards inserted, in the order given. */
export function buildScareCue(inserts: readonly CardInsert[] = []): World {
  const world = cloneWorld(level.base);
  for (const { card, at } of inserts) {
    const def = CARDS[card];
    if (!def) throw new Error(`there is no card ${card}`);
    insertLine(world, def.actor, at, def.rule, 'card');
  }
  return world;
}

/** The goal of the check: on this tick the jump-scare fired `trigger` with a visitor within 2 steps, so the guest got a scare. */
export function scared(world: World, trace: TickTrace): boolean {
  return trace.turns.some((turn) => {
    if (turn.kind !== JUMP_SCARE || firedRule(world, turn)?.act !== 'trigger') return false;
    const prop = world.actors.find((a) => a.id === turn.actor)!;
    return world.actors.some((a) => a.kind === VISITOR && distance(a.pos, prop.pos) <= NEAR);
  });
}

/**
 * Checks every walk the visitor can take through the house with the given cards inserted.
 * `paths` of a safe result is the number of walks checked and `goalPaths` how many of them end up with a scare.
 */
export function checkScareCue(inserts: readonly CardInsert[] = []): CounterexampleResult {
  return findCounterexample({ world: buildScareCue(inserts), registry, wanderer: { actor: VISITOR }, goal: scared });
}
