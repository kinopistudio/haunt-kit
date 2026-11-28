import { Registry, distance, stepAway, stepToward } from '../../src/index';
import type { Actor, EvalContext, Legend, ParsedGrid, PropertyDef, SpecSet, World, WorldConfig } from '../../src/index';
import { createWorld, loadSpec, parseGrid } from '../../src/index';

/**
 * A neutral vocabulary for testing the core. It has no game words: a `seeker` and a `target` on a grid,
 * a `switch` item, and a clock.
 */
const NEAR = 2;
const targetOf = (ctx: EvalContext): Actor | undefined => ctx.world.actors.find((a) => a.kind === 'target');
const switches = (ctx: EvalContext) => ctx.world.items.filter((i) => i.type === 'switch');

export function createToyRegistry(): Registry {
  return new Registry()
    .addCondition({
      id: 'near',
      pattern: 'the target is near',
      test: (ctx) => {
        const t = targetOf(ctx);
        return t !== undefined && distance(ctx.actor.pos, t.pos) <= NEAR;
      },
    })
    .addCondition({
      id: 'far',
      pattern: 'the target is far',
      test: (ctx) => {
        const t = targetOf(ctx);
        return t !== undefined && distance(ctx.actor.pos, t.pos) > NEAR;
      },
    })
    .addCondition({ id: 'switch_on', pattern: 'the switch is on', test: (ctx) => switches(ctx).some((s) => s.state.on === true) })
    .addCondition({ id: 'late', pattern: 'the clock is past {n}', test: (ctx, n) => ctx.world.tick > n })
    .addCondition({ id: 'strikes', pattern: 'the clock strikes {n}', schedule: true, test: (ctx, n) => ctx.world.tick === n })
    .addAction({
      id: 'approach',
      pattern: 'step toward the target',
      run: (ctx) => {
        const t = targetOf(ctx);
        if (t) stepToward(ctx.world, ctx.actor, t.pos);
      },
    })
    .addAction({
      id: 'retreat',
      pattern: 'step away from the target',
      run: (ctx) => {
        const t = targetOf(ctx);
        if (t) stepAway(ctx.world, ctx.actor, t.pos);
      },
    })
    .addAction({ id: 'rest', pattern: 'do nothing', run: () => {} })
    .addAction({
      id: 'flip',
      pattern: 'flip the switch',
      run: (ctx) => {
        const s = switches(ctx)[0];
        if (s) s.state.on = s.state.on !== true;
      },
    });
}

/** Fails when a seeker stands on the target's tile. Not registered by default. */
export const contactProperty: PropertyDef = {
  id: 'no_contact',
  description: 'a seeker never stands on the target',
  check: (world: World) => {
    const target = world.actors.find((a) => a.kind === 'target');
    if (!target) return null;
    const hit = world.actors.filter((a) => a.kind === 'seeker' && a.pos.x === target.pos.x && a.pos.y === target.pos.y);
    return hit.length === 0 ? null : { message: `${hit[0]!.id} reached the target`, actors: hit.map((a) => a.id) };
  },
};

export const TOY_LEGEND: Legend = {
  S: { actor: 'seeker' },
  T: { actor: 'target' },
  W: { actor: 'watcher' },
  s: { item: { type: 'switch', state: { on: false } } },
  b: { item: { type: 'block', solid: true } },
};

export const OPEN_ROW = ['#########', '#.......#', '#########'];

export function toyGrid(rows: string[]): ParsedGrid {
  return parseGrid(rows, TOY_LEGEND);
}

export interface ToyOptions extends Partial<Omit<WorldConfig, 'grid' | 'spec'>> {
  spec?: SpecSet;
}

/** Loads `specText` (it must be valid) and builds a world on `rows` with the toy legend. */
export function toyWorld(rows: string[], specText: string, registry: Registry, options: ToyOptions = {}): World {
  const loaded = loadSpec(specText, registry);
  if (loaded.errors.length > 0) throw new Error(`toy spec is invalid: ${loaded.errors.map((e) => e.message).join('; ')}`);
  return createWorld({ grid: toyGrid(rows), spec: options.spec ?? loaded.spec, registry, horizon: 12, ...options });
}
