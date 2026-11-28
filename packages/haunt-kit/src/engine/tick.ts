import type { Rule } from '../grammar/types';
import { ALWAYS } from '../grammar/types';
import type { Registry } from '../registry/registry';
import type { EvalContext } from '../registry/types';
import type { TickTrace, TurnTrace, ViolationTrace } from '../trace/types';
import { insertLine } from '../world/create';
import type { Actor, Pos, World } from '../world/types';

function holds(ctx: EvalContext, rule: Rule, registry: Registry): boolean {
  if (rule.cond === ALWAYS) return true;
  const def = registry.condition(rule.cond);
  if (!def) throw new Error(`unknown condition "${rule.cond}"`);
  return def.test(ctx, rule.n ?? 0);
}

/** Options of one tick. */
export interface TickOptions {
  /**
   * Actor id to the tile it moves to. A scripted actor does not evaluate its lines; it takes its turn
   * in the usual place, and the properties are checked after it. The tile is not checked: the caller
   * passes tiles it knows are legal. Used by the solver for actors that may take any step.
   */
  scripted?: Readonly<Record<string, Pos>>;
}

function scriptedTurn(actor: Actor, to: Pos): TurnTrace {
  const from = { x: actor.pos.x, y: actor.pos.y };
  actor.pos.x = to.x;
  actor.pos.y = to.y;
  return {
    actor: actor.id,
    kind: actor.kind,
    evals: [],
    fired: null,
    firedId: null,
    shadowed: [],
    shadowedIds: [],
    from,
    to: { x: actor.pos.x, y: actor.pos.y },
  };
}

function takeTurn(world: World, registry: Registry, actor: Actor): TurnTrace {
  const ctx: EvalContext = { world, actor };
  const lines = [...actor.lines];

  const evals: boolean[] = [];
  let fired: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const ok = holds(ctx, lines[i]!.rule, registry);
    evals.push(ok);
    if (ok) {
      fired = i;
      break;
    }
  }

  // Lines below the fired one are only looked at, never run. This happens before the action changes the world.
  const shadowed: number[] = [];
  if (fired !== null) {
    for (let i = fired + 1; i < lines.length; i++) {
      if (holds(ctx, lines[i]!.rule, registry)) shadowed.push(i);
    }
  }

  const from = { x: actor.pos.x, y: actor.pos.y };
  if (fired !== null) {
    const rule = lines[fired]!.rule;
    const action = registry.action(rule.act);
    if (!action) throw new Error(`unknown action "${rule.act}"`);
    action.run(ctx);
  }

  return {
    actor: actor.id,
    kind: actor.kind,
    evals,
    fired,
    firedId: fired === null ? null : lines[fired]!.id,
    shadowed,
    shadowedIds: shadowed.map((i) => lines[i]!.id),
    from,
    to: { x: actor.pos.x, y: actor.pos.y },
  };
}

/** Checks the world's properties in order and returns the first failure. */
function checkProperties(world: World, registry: Registry, turn: TurnTrace): ViolationTrace | null {
  for (const id of world.properties) {
    const def = registry.property(id);
    if (!def) throw new Error(`unknown property "${id}"`);
    const failure = def.check(world, turn);
    if (failure) return { property: id, message: failure.message, actors: [...failure.actors] };
  }
  return null;
}

/**
 * Runs one tick and returns its trace, or `null` when the world is not running.
 * Mutates `world`. Deterministic: no clock, no random source.
 */
export function tick(world: World, registry: Registry, options: TickOptions = {}): TickTrace | null {
  if (world.status !== 'running') return null;
  const scripted = options.scripted ?? {};
  for (const id of Object.keys(scripted)) {
    if (!world.actors.some((a) => a.id === id)) throw new Error(`scripted move for "${id}", but there is no such actor`);
  }
  world.tick += 1;
  const trace: TickTrace = { tick: world.tick, events: [], turns: [], violation: null, status: world.status };

  // Scheduled writes come first, in declaration order, so that every actor reads its new spec this tick.
  for (const event of world.events) {
    if (event.tick !== world.tick) continue;
    for (const actor of world.actors) {
      if (actor.kind !== event.actor) continue;
      const index = Math.min(event.line - 1, actor.lines.length);
      const line = insertLine(world, actor.id, index, event.rule, 'rewrite');
      trace.events.push({ actor: actor.id, kind: actor.kind, index, lineId: line.id });
    }
  }

  for (const actor of world.actors) {
    const to = scripted[actor.id];
    const turn = to ? scriptedTurn(actor, to) : takeTurn(world, registry, actor);
    trace.turns.push(turn);
    const violation = checkProperties(world, registry, turn);
    if (violation) {
      world.status = 'violated';
      trace.violation = violation;
      break;
    }
  }

  if (world.status === 'running' && world.tick >= world.horizon) world.status = 'complete';
  trace.status = world.status;
  return trace;
}

/** Ticks until the world is no longer running and returns every trace. */
export function run(world: World, registry: Registry): TickTrace[] {
  const traces: TickTrace[] = [];
  for (let t = tick(world, registry); t !== null; t = tick(world, registry)) traces.push(t);
  return traces;
}
