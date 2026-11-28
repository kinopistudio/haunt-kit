import { Registry } from '../../src/index';

/**
 * A neutral vocabulary for testing the core. It has no game words: a `seeker` and a `target` on a grid,
 * a `switch` item, and a clock.
 */
export function createToyRegistry(): Registry {
  return new Registry()
    .addCondition({ id: 'near', pattern: 'the target is near', test: () => false })
    .addCondition({ id: 'far', pattern: 'the target is far', test: () => false })
    .addCondition({ id: 'switch_on', pattern: 'the switch is on', test: () => false })
    .addCondition({ id: 'late', pattern: 'the clock is past {n}', test: (ctx, n) => ctx.world.tick > n })
    .addCondition({ id: 'strikes', pattern: 'the clock strikes {n}', schedule: true, test: (ctx, n) => ctx.world.tick === n })
    .addAction({ id: 'approach', pattern: 'step toward the target', run: () => {} })
    .addAction({ id: 'retreat', pattern: 'step away from the target', run: () => {} })
    .addAction({ id: 'rest', pattern: 'do nothing', run: () => {} })
    .addAction({ id: 'flip', pattern: 'flip the switch', run: () => {} });
}
