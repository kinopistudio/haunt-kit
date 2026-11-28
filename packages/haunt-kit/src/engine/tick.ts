import type { Rule } from '../grammar/types';
import { ALWAYS } from '../grammar/types';
import type { Registry } from '../registry/registry';
import type { EvalContext } from '../registry/types';
import type { TickTrace, TurnTrace } from '../trace/types';
import { insertLine } from '../world/create';
import type { Actor, World } from '../world/types';

function holds(ctx: EvalContext, rule: Rule, registry: Registry): boolean {
  if (rule.cond === ALWAYS) return true;
  const def = registry.condition(rule.cond);
  if (!def) throw new Error(`unknown condition "${rule.cond}"`);
  return def.test(ctx, rule.n ?? 0);
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

/**
 * Runs one tick and returns its trace, or `null` when the world is not running.
 * Mutates `world`. Deterministic: no clock, no random source.
 */
export function tick(world: World, registry: Registry): TickTrace | null {
  if (world.status !== 'running') return null;
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
    trace.turns.push(takeTurn(world, registry, actor));
  }

  trace.status = world.status;
  return trace;
}
