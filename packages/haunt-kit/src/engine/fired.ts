import type { Rule } from '../grammar/types';
import type { TurnContext } from '../registry/types';
import type { TurnTrace } from '../trace/types';
import type { World } from '../world/types';

/**
 * The rule of the line that fired on `turn`, or `null` when no line fired (or the actor was scripted).
 * Lines are never removed, so this works for a turn of any earlier tick as well.
 */
export function firedRule(world: World, turn: TurnTrace): Rule | null {
  if (turn.firedId === null) return null;
  const actor = world.actors.find((a) => a.id === turn.actor);
  return actor?.lines.find((l) => l.id === turn.firedId)?.rule ?? null;
}

/**
 * True when `ctx.turn` is a turn of `ctx.actor` and the line that fired runs the action `actionId`.
 * A helper for prohibitions such as "trigger".
 */
export function firedAction(ctx: TurnContext, actionId: string): boolean {
  if (ctx.turn.actor !== ctx.actor.id) return false;
  return firedRule(ctx.world, ctx.turn)?.act === actionId;
}
