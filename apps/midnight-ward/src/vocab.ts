import { Registry, distance, stepAway, stepToward } from 'haunt-kit';
import type { Actor, EvalContext, Item, ItemInit, Legend, Pos } from 'haunt-kit';

/** How far "near" and "adjacent" reach, in Manhattan steps. */
export const NEAR = { girl: 3, bell: 2, candle: 2, dark: 2, salt: 1, ghost: 2 } as const;

/** A night lasts 12 bells. */
export const HORIZON = 12;

/** The girl takes her turn first; ghosts follow in reading order. */
export const TURN_ORDER = ['girl'];

export const GHOST_KINDS = ['wisp', 'shade', 'snuffer'] as const;

export const LEGEND: Legend = {
  B: { actor: 'girl', marker: 'bed' },
  W: { marker: 'window' },
  w: { actor: 'wisp' },
  s: { actor: 'shade' },
  n: { actor: 'snuffer' },
  c: { item: { type: 'candle', state: { lit: true } } },
};

export type PlacedItem = 'bell' | 'salt' | 'candle';

/** An item a player can place. Salt blocks movement and a candle starts lit. */
export function makeItem(type: PlacedItem, x: number, y: number): ItemInit {
  const pos = { x, y };
  switch (type) {
    case 'bell':
      return { type, pos };
    case 'salt':
      return { type, pos, solid: true };
    case 'candle':
      return { type, pos, state: { lit: true } };
  }
}

const isGhost = (a: Actor): boolean => (GHOST_KINDS as readonly string[]).includes(a.kind);
const girlOf = (ctx: EvalContext): Actor | undefined => ctx.world.actors.find((a) => a.kind === 'girl');
const litCandles = (ctx: EvalContext): Item[] => ctx.world.items.filter((i) => i.type === 'candle' && i.state.lit === true);
const within = (ctx: EvalContext, items: Item[], radius: number): boolean => items.some((i) => distance(ctx.actor.pos, i.pos) <= radius);

/** The item closest to the actor. On a tie the earlier item in the list wins. */
function nearest(ctx: EvalContext, items: Item[]): Item | undefined {
  let best: Item | undefined;
  let bestDistance = Infinity;
  for (const item of items) {
    const d = distance(ctx.actor.pos, item.pos);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

const marker = (ctx: EvalContext, name: string): Pos | undefined => ctx.world.markers[name]?.[0];

/** The Midnight Ward vocabulary: the words of the ghost grammar. */
export function createRegistry(): Registry {
  return new Registry()
    .addCondition({
      id: 'girl_near',
      pattern: 'the girl is near',
      test: (ctx) => {
        const girl = girlOf(ctx);
        return girl !== undefined && distance(ctx.actor.pos, girl.pos) <= NEAR.girl;
      },
    })
    .addCondition({
      id: 'bell_near',
      pattern: 'the bell is near',
      test: (ctx) => within(ctx, ctx.world.items.filter((i) => i.type === 'bell'), NEAR.bell),
    })
    .addCondition({
      id: 'candle_near',
      pattern: 'a lit candle is near',
      test: (ctx) => within(ctx, litCandles(ctx), NEAR.candle),
    })
    .addCondition({
      id: 'dark',
      pattern: 'it is dark',
      test: (ctx) => !within(ctx, litCandles(ctx), NEAR.dark),
    })
    .addCondition({
      id: 'salt_adjacent',
      pattern: 'salt is adjacent',
      test: (ctx) => within(ctx, ctx.world.items.filter((i) => i.type === 'salt'), NEAR.salt),
    })
    .addCondition({
      id: 'ghost_near',
      pattern: 'a ghost is near',
      // Other ghosts only: the evaluating ghost does not count itself.
      test: (ctx) => ctx.world.actors.some((a) => a.id !== ctx.actor.id && isGhost(a) && distance(ctx.actor.pos, a.pos) <= NEAR.ghost),
    })
    .addCondition({
      id: 'tick_is',
      pattern: 'the clock strikes {n}',
      schedule: true,
      test: (ctx, n) => ctx.world.tick === n,
    })
    .addCondition({
      id: 'tick_after',
      pattern: 'the clock has struck {n}',
      test: (ctx, n) => ctx.world.tick >= n,
    })
    .addAction({
      id: 'toward_girl',
      pattern: 'move toward the girl',
      run: (ctx) => {
        const girl = girlOf(ctx);
        if (girl) stepToward(ctx.world, ctx.actor, girl.pos);
      },
    })
    .addAction({
      id: 'away_girl',
      pattern: 'move away from the girl',
      run: (ctx) => {
        const girl = girlOf(ctx);
        if (girl) stepAway(ctx.world, ctx.actor, girl.pos);
      },
    })
    .addAction({ id: 'stay', pattern: 'stay still', run: () => {} })
    .addAction({
      id: 'toward_candle',
      pattern: 'move toward the candle',
      run: (ctx) => {
        const candle = nearest(ctx, litCandles(ctx));
        if (candle) stepToward(ctx.world, ctx.actor, candle.pos);
      },
    })
    .addAction({
      id: 'away_candle',
      pattern: 'move away from the candle',
      run: (ctx) => {
        const candle = nearest(ctx, litCandles(ctx));
        if (candle) stepAway(ctx.world, ctx.actor, candle.pos);
      },
    })
    .addAction({
      id: 'snuff',
      pattern: 'snuff the candle',
      run: (ctx) => {
        const candle = nearest(ctx, litCandles(ctx).filter((c) => distance(ctx.actor.pos, c.pos) <= NEAR.candle));
        if (candle) candle.state.lit = false;
      },
    })
    .addAction({
      id: 'toward_window',
      pattern: 'walk toward the window',
      run: (ctx) => {
        const window = marker(ctx, 'window');
        if (window) stepToward(ctx.world, ctx.actor, window);
      },
    })
    .addAction({
      id: 'toward_bed',
      pattern: 'walk back to bed',
      run: (ctx) => {
        const bed = marker(ctx, 'bed');
        if (bed) stepToward(ctx.world, ctx.actor, bed);
      },
    })
    .addProperty({
      id: 'girl_safe',
      description: 'no ghost stands on the girl\u2019s tile',
      check: (world) => {
        const girl = world.actors.find((a) => a.kind === 'girl');
        if (!girl) return null;
        const onGirl = world.actors.filter((a) => isGhost(a) && a.pos.x === girl.pos.x && a.pos.y === girl.pos.y);
        const first = onGirl[0];
        return first ? { message: `${first.id} caught the girl.`, actors: onGirl.map((a) => a.id) } : null;
      },
    });
}
