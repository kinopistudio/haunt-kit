import { Registry, distance, firedAction } from 'haunt-kit';
import type { EvalContext, Item, Legend } from 'haunt-kit';

/** How far "near" and "adjacent" reach from a prop, in Manhattan steps. */
export const NEAR = 2;
export const ADJACENT = 1;

/** A visit lasts 12 bells. */
export const HORIZON = 12;

/** Actor kinds. The visitor has no rules: the solver picks every step it takes. */
export const VISITOR = 'visitor';
export const JUMP_SCARE = 'jump-scare';
export const FOG_MACHINE = 'fog machine';
export const EXIT_LIGHT = 'exit light';

/** The visitor walks first, then the props act in this order. */
export const TURN_ORDER = [VISITOR, JUMP_SCARE, FOG_MACHINE, EXIT_LIGHT];

/** Item types that hold a prop's state. */
export const FOG = 'fog';
export const LIGHT = 'exit-light';

/**
 * The map legend. The jump-scare and the fog machine stand on closed tiles (a solid item), so the visitor
 * walks around them. The exit light stands on an open tile: the exit.
 */
export const LEGEND: Legend = {
  V: { actor: VISITOR },
  J: { actor: JUMP_SCARE, item: { type: 'prop', solid: true } },
  F: { actor: FOG_MACHINE, item: { type: FOG, solid: true, state: { on: false } } },
  E: { actor: EXIT_LIGHT, marker: 'exit', item: { type: LIGHT, state: { on: true } } },
};

/** The prop's state item for a kind: the fog of the fog machine, the lamp of the exit light. */
const STATE_ITEM: Record<string, string> = { [FOG_MACHINE]: FOG, [EXIT_LIGHT]: LIGHT };

const items = (ctx: EvalContext, type: string): Item[] => ctx.world.items.filter((i) => i.type === type);

/** Distance from the acting prop to the nearest visitor. */
function visitorDistance(ctx: EvalContext): number {
  let best = Infinity;
  for (const actor of ctx.world.actors) {
    if (actor.kind === VISITOR) best = Math.min(best, distance(ctx.actor.pos, actor.pos));
  }
  return best;
}

const setOn = (ctx: EvalContext, type: string, on: boolean): void => {
  for (const item of items(ctx, type)) item.state.on = on;
};

/** Scare Cue's own words. The rest comes from `haunt-kit`. */
export function createRegistry(): Registry {
  return (
    new Registry()
      .addCondition({ id: 'visitor_near', pattern: 'a visitor is near', test: (ctx) => visitorDistance(ctx) <= NEAR })
      .addCondition({ id: 'visitor_adjacent', pattern: 'a visitor is adjacent', test: (ctx) => visitorDistance(ctx) <= ADJACENT })
      .addCondition({ id: 'fog_on', pattern: 'the fog is on', test: (ctx) => items(ctx, FOG).some((i) => i.state.on === true) })
      .addCondition({ id: 'light_off', pattern: 'the exit light is off', test: (ctx) => items(ctx, LIGHT).some((i) => i.state.on === false) })
      // The jump-scare fires and the world does not change. The level decides who counts as scared.
      .addAction({ id: 'trigger', pattern: 'trigger', run: () => {} })
      .addAction({ id: 'stay', pattern: 'stay still', run: () => {} })
      .addAction({ id: 'spray', pattern: 'spray fog', run: (ctx) => setOn(ctx, FOG, true) })
      .addAction({ id: 'stop', pattern: 'stop the fog', run: (ctx) => setOn(ctx, FOG, false) })
      .addAction({ id: 'turn_off', pattern: 'turn off', run: (ctx) => setOn(ctx, LIGHT, false) })
      .addAction({ id: 'stay_on', pattern: 'stay on', run: (ctx) => setOn(ctx, LIGHT, true) })
      // What a safety rule may forbid: an action on the turn it fires, or a state of the prop itself.
      .addProhibition({ id: 'trigger', pattern: 'trigger', occurs: (ctx) => firedAction(ctx, 'trigger') })
      .addProhibition({
        id: 'be_on',
        pattern: 'be on',
        occurs: (ctx) => {
          const type = STATE_ITEM[ctx.actor.kind];
          return type !== undefined && items(ctx, type).some((i) => i.state.on === true);
        },
      })
  );
}
