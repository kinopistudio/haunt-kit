import type { Rule } from '../grammar/types';
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
