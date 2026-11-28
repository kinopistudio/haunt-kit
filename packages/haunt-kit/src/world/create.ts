import { validateRule, validateSafety } from '../grammar/validate';
import type { Rule, ScheduledEvent, SpecSet } from '../grammar/types';
import type { Registry } from '../registry/registry';
import type { Actor, Item, ItemInit, Line, LineOrigin, ParsedGrid, Pos, World } from './types';

export class WorldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldError';
  }
}

export interface WorldConfig {
  grid: ParsedGrid;
  spec: SpecSet;
  registry: Registry;
  /** The status becomes `complete` when the clock reaches this tick. A positive integer. */
  horizon: number;
  /** Kinds that take their turns first, in this order. The other actors follow in reading order. */
  turnOrder?: string[];
  /** Extra items, placed after the items of the grid. */
  items?: ItemInit[];
  /** Property ids checked after every turn. Default: every registered property. */
  properties?: string[];
}

const copyPos = (p: Pos): Pos => ({ x: p.x, y: p.y });
const copyRule = (r: Rule): Rule => ({ ...r });

function makeItem(init: ItemInit): Item {
  return { type: init.type, pos: copyPos(init.pos), solid: init.solid ?? false, state: { ...(init.state ?? {}) } };
}

/** Builds a world at tick 0. Throws `WorldError` when the spec, the grid and the registry do not fit together. */
export function createWorld(config: WorldConfig): World {
  const { grid, spec, registry } = config;
  if (!Number.isInteger(config.horizon) || config.horizon < 1) {
    throw new WorldError(`horizon must be a positive integer, got ${config.horizon}`);
  }

  // Turn order: kinds in turnOrder first (in that order), then everything else; reading order within a group.
  const turnOrder = config.turnOrder ?? [];
  const rank = (kind: string): number => {
    const i = turnOrder.indexOf(kind);
    return i === -1 ? turnOrder.length : i;
  };
  const starts = grid.starts
    .map((s, readingIndex) => ({ ...s, readingIndex }))
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.readingIndex - b.readingIndex);

  const kindsOnGrid = new Set(starts.map((s) => s.kind));
  for (const kind of Object.keys(spec.actors)) {
    if (!kindsOnGrid.has(kind)) throw new WorldError(`the spec has rules for "${kind}", but no "${kind}" is on the grid`);
  }

  const seen = new Map<string, number>();
  const ids = new Set<string>();
  let nextLineId = 1;
  const actors: Actor[] = starts.map((s) => {
    const count = (seen.get(s.kind) ?? 0) + 1;
    seen.set(s.kind, count);
    const id = count === 1 ? s.kind : `${s.kind}-${count}`;
    if (ids.has(id)) throw new WorldError(`actor id "${id}" is not unique; rename the kind "${s.kind}"`);
    ids.add(id);
    const rules = spec.actors[s.kind] ?? [];
    const lines: Line[] = rules.map((rule, i) => {
      const problem = validateRule(rule, registry);
      if (problem) throw new WorldError(`line ${i + 1} of "${s.kind}": ${problem}`);
      return { id: nextLineId++, rule: copyRule(rule), origin: 'spec' };
    });
    return { id, kind: s.kind, pos: copyPos(s.pos), lines };
  });

  const events: ScheduledEvent[] = spec.events.map((e) => {
    if (!kindsOnGrid.has(e.actor)) throw new WorldError(`a scheduled write names "${e.actor}", but no "${e.actor}" is on the grid`);
    const problem = validateRule(e.rule, registry);
    if (problem) throw new WorldError(`scheduled write of "${e.actor}" at tick ${e.tick}: ${problem}`);
    if (!Number.isInteger(e.tick) || e.tick < 1) throw new WorldError(`a scheduled write at tick ${e.tick} never happens: ticks start at 1`);
    if (e.tick > config.horizon) throw new WorldError(`a scheduled write at tick ${e.tick} never happens: the horizon is ${config.horizon}`);
    if (!Number.isInteger(e.line) || e.line < 1) throw new WorldError(`a scheduled write at line ${e.line}: lines start at 1`);
    return { tick: e.tick, actor: e.actor, line: e.line, rule: copyRule(e.rule) };
  });

  for (const rule of spec.safety) {
    if (!kindsOnGrid.has(rule.actor)) throw new WorldError(`a safety rule names "${rule.actor}", but no "${rule.actor}" is on the grid`);
    const problem = validateSafety(rule, registry);
    if (problem) throw new WorldError(`safety rule of "${rule.actor}": ${problem}`);
  }

  const properties = config.properties ?? registry.properties().map((p) => p.id);
  for (const id of properties) {
    if (!registry.property(id)) throw new WorldError(`property "${id}" is not registered`);
  }

  const { w, h, walls } = grid.map;
  const items: Item[] = grid.items.map(makeItem);
  for (const init of config.items ?? []) {
    const { x, y } = init.pos;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h || walls.has(y * w + x)) {
      throw new WorldError(`item "${init.type}" at (${x}, ${y}) is outside the map or inside a wall`);
    }
    items.push(makeItem(init));
  }

  const markers: Record<string, Pos[]> = {};
  for (const [name, list] of Object.entries(grid.markers)) markers[name] = list.map(copyPos);

  return {
    map: { w, h, walls },
    markers,
    actors,
    items,
    events,
    properties: [...properties],
    tick: 0,
    horizon: config.horizon,
    status: 'running',
    nextLineId,
  };
}

/**
 * Inserts a rule into an actor's spec. `index` is 0-based; an index past the end appends. Lines at and
 * below the index shift down by one. The new line gets a fresh id.
 */
export function insertLine(world: World, actorId: string, index: number, rule: Rule, origin: LineOrigin): Line {
  const actor = world.actors.find((a) => a.id === actorId);
  if (!actor) throw new Error(`no actor "${actorId}"`);
  if (!Number.isInteger(index) || index < 0) throw new RangeError(`line index must be a non-negative integer, got ${index}`);
  const line: Line = { id: world.nextLineId++, rule: copyRule(rule), origin };
  actor.lines.splice(Math.min(index, actor.lines.length), 0, line);
  return line;
}

/** A deep copy. Only `map.walls` is shared, because it is never mutated. */
export function cloneWorld(world: World): World {
  return {
    map: { w: world.map.w, h: world.map.h, walls: world.map.walls },
    markers: Object.fromEntries(Object.entries(world.markers).map(([k, v]) => [k, v.map(copyPos)])),
    actors: world.actors.map((a) => ({
      id: a.id,
      kind: a.kind,
      pos: copyPos(a.pos),
      lines: a.lines.map((l) => ({ id: l.id, rule: copyRule(l.rule), origin: l.origin })),
    })),
    items: world.items.map(makeItem),
    events: world.events.map((e) => ({ ...e, rule: copyRule(e.rule) })),
    properties: [...world.properties],
    tick: world.tick,
    horizon: world.horizon,
    status: world.status,
    nextLineId: world.nextLineId,
  };
}
