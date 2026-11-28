import { createWorld, parseGrid } from 'haunt-kit';
import type { Actor, EvalContext, ItemInit, Rule, World } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { HORIZON, LEGEND, NEAR, TURN_ORDER, createRegistry, makeItem } from '../src/vocab';

const registry = createRegistry();

/** A 12 x 3 hall. Put the girl `B`, a wisp `w` and other glyphs in `rows`. */
function hall(rows: string[], items: ItemInit[] = [], spec: Record<string, Rule[]> = {}): World {
  return createWorld({
    grid: parseGrid(rows, LEGEND),
    spec: { actors: spec, events: [] },
    registry,
    horizon: HORIZON,
    turnOrder: TURN_ORDER,
    items,
  });
}

const ROW = (cells: string) => ['#'.repeat(cells.length + 2), `#${cells}#`, '#'.repeat(cells.length + 2)];
const ctxOf = (world: World, id: string): EvalContext => ({ world, actor: world.actors.find((a) => a.id === id)! });
const holds = (id: string, world: World, actorId: string, n = 0): boolean => registry.condition(id)!.test(ctxOf(world, actorId), n);
const act = (id: string, world: World, actorId: string): Actor => {
  registry.action(id)!.run(ctxOf(world, actorId));
  return world.actors.find((a) => a.id === actorId)!;
};

describe('Midnight Ward conditions', () => {
  it('R6.1: registers the eight conditions of the ghost grammar with their phrases', () => {
    const phrases: [string, string][] = [
      ['the girl is near', 'girl_near'],
      ['the bell is near', 'bell_near'],
      ['a lit candle is near', 'candle_near'],
      ['it is dark', 'dark'],
      ['salt is adjacent', 'salt_adjacent'],
      ['a ghost is near', 'ghost_near'],
      ['the clock strikes 6', 'tick_is'],
      ['the clock has struck 3', 'tick_after'],
    ];
    expect(registry.conditions()).toHaveLength(8);
    for (const [phrase, id] of phrases) expect(registry.matchCondition(phrase)?.def.id).toBe(id);
    expect(registry.matchCondition('the clock strikes 6')?.n).toBe(6);
    expect(registry.matchCondition('the clock has struck 3')?.n).toBe(3);
    expect(registry.scheduleCondition?.id).toBe('tick_is');
  });

  it('R6.1: the radii are 3 for the girl, 2 for bells and candles, 1 for salt, 2 for ghosts', () => {
    expect(NEAR).toEqual({ girl: 3, bell: 2, candle: 2, dark: 2, salt: 1, ghost: 2 });
  });

  it('R6.1: the girl is near at distance 3 and not at 4', () => {
    const at4 = hall(ROW('B...w......'));
    expect(holds('girl_near', at4, 'wisp')).toBe(false);
    expect(holds('girl_near', hall(ROW('B..w.......')), 'wisp')).toBe(true);
    expect(holds('girl_near', hall(ROW('B.w........')), 'wisp')).toBe(true);
    expect(holds('girl_near', hall(ROW('B..........w')), 'wisp')).toBe(false);
  });

  it('R6.1: distance is Manhattan, so a diagonal counts as two steps', () => {
    const world = hall(['#####', '#B..#', '#.w.#', '#####']);
    expect(holds('girl_near', world, 'wisp')).toBe(true);
    const far = hall(['######', '#B...#', '#...w#', '######']);
    expect(holds('girl_near', far, 'wisp')).toBe(false);
  });

  it('R6.1: the bell is near within 2 steps and not at 3', () => {
    const base = ROW('w.........');
    expect(holds('bell_near', hall(base, [makeItem('bell', 3, 1)]), 'wisp')).toBe(true);
    expect(holds('bell_near', hall(base, [makeItem('bell', 4, 1)]), 'wisp')).toBe(false);
    expect(holds('bell_near', hall(base), 'wisp')).toBe(false);
    expect(holds('bell_near', hall(base, [makeItem('salt', 2, 1)]), 'wisp')).toBe(false);
  });

  it('R6.1: a lit candle is near within 2 steps; an unlit candle does not count', () => {
    const base = ROW('w.........');
    expect(holds('candle_near', hall(base, [makeItem('candle', 3, 1)]), 'wisp')).toBe(true);
    expect(holds('candle_near', hall(base, [makeItem('candle', 4, 1)]), 'wisp')).toBe(false);
    const world = hall(base, [makeItem('candle', 2, 1)]);
    world.items[0]!.state.lit = false;
    expect(holds('candle_near', world, 'wisp')).toBe(false);
  });

  it('R6.1: it is dark when no lit candle is within 2 steps', () => {
    const base = ROW('w.........');
    expect(holds('dark', hall(base), 'wisp')).toBe(true);
    expect(holds('dark', hall(base, [makeItem('candle', 3, 1)]), 'wisp')).toBe(false);
    expect(holds('dark', hall(base, [makeItem('candle', 4, 1)]), 'wisp')).toBe(true);
    const out = hall(base, [makeItem('candle', 2, 1)]);
    out.items[0]!.state.lit = false;
    expect(holds('dark', out, 'wisp')).toBe(true);
  });

  it('R6.1: a fixed candle from the map counts like a placed one', () => {
    const world = hall(ROW('w.c.......'));
    expect(world.items).toHaveLength(1);
    expect(world.items[0]).toMatchObject({ type: 'candle', state: { lit: true } });
    expect(holds('candle_near', world, 'wisp')).toBe(true);
  });

  it('R6.1: salt is adjacent within 1 step and not at 2', () => {
    const base = ROW('w.........');
    expect(holds('salt_adjacent', hall(base, [makeItem('salt', 2, 1)]), 'wisp')).toBe(true);
    expect(holds('salt_adjacent', hall(base, [makeItem('salt', 3, 1)]), 'wisp')).toBe(false);
    expect(holds('salt_adjacent', hall(base, [makeItem('bell', 2, 1)]), 'wisp')).toBe(false);
  });

  it('R6.1: the clock strikes n only on tick n, and has struck n from tick n on', () => {
    const world = hall(ROW('w.........'));
    for (const [tick, is, after] of [[2, false, false], [3, true, true], [4, false, true], [9, false, true]] as const) {
      world.tick = tick;
      expect(holds('tick_is', world, 'wisp', 3)).toBe(is);
      expect(holds('tick_after', world, 'wisp', 3)).toBe(after);
    }
  });

  it('R6.9: a ghost is near counts other ghosts within 2, and not the ghost itself', () => {
    const alone = hall(ROW('B....w.....'));
    expect(holds('ghost_near', alone, 'wisp')).toBe(false);
    const pair = hall(ROW('B....w.s...'));
    expect(holds('ghost_near', pair, 'wisp')).toBe(true);
    expect(holds('ghost_near', pair, 'shade')).toBe(true);
    const apart = hall(ROW('B....w..s..'));
    expect(holds('ghost_near', apart, 'wisp')).toBe(false);
  });

  it('R6.9: the girl is not a ghost, and two ghosts of the same kind are counted', () => {
    const girlOnly = hall(ROW('Bw.........'));
    expect(holds('ghost_near', girlOnly, 'wisp')).toBe(false);
    const twins = hall(ROW('B....w.w...'));
    expect(holds('ghost_near', twins, 'wisp')).toBe(true);
    expect(holds('ghost_near', twins, 'wisp-2')).toBe(true);
  });
});

describe('Midnight Ward actions', () => {
  it('R6.2: registers the eight actions of the ghost grammar with their phrases', () => {
    const phrases: [string, string][] = [
      ['move toward the girl', 'toward_girl'],
      ['move away from the girl', 'away_girl'],
      ['stay still', 'stay'],
      ['move toward the candle', 'toward_candle'],
      ['move away from the candle', 'away_candle'],
      ['snuff the candle', 'snuff'],
      ['walk toward the window', 'toward_window'],
      ['walk back to bed', 'toward_bed'],
    ];
    expect(registry.actions()).toHaveLength(8);
    for (const [phrase, id] of phrases) expect(registry.matchAction(phrase)?.id).toBe(id);
  });

  it('R6.2: move toward and away from the girl', () => {
    expect(act('toward_girl', hall(ROW('B....w.....')), 'wisp').pos).toEqual({ x: 5, y: 1 });
    expect(act('away_girl', hall(ROW('B....w.....')), 'wisp').pos).toEqual({ x: 7, y: 1 });
  });

  it('R6.2: stay still does not move', () => {
    expect(act('stay', hall(ROW('B....w.....')), 'wisp').pos).toEqual({ x: 6, y: 1 });
  });

  it('R6.2: move toward and away from the nearest lit candle', () => {
    const base = ROW('w.........');
    const items = [makeItem('candle', 8, 1), makeItem('candle', 4, 1)];
    expect(act('toward_candle', hall(base, items), 'wisp').pos).toEqual({ x: 2, y: 1 });
    expect(act('away_candle', hall(['#######', '#.....#', '#..w..#', '#######'], [makeItem('candle', 1, 2)]), 'wisp').pos).toEqual({ x: 4, y: 2 });
  });

  it('R6.2: candle actions ignore unlit candles and stay when none is lit', () => {
    const world = hall(ROW('w.........'), [makeItem('candle', 4, 1)]);
    world.items[0]!.state.lit = false;
    expect(act('toward_candle', world, 'wisp').pos).toEqual({ x: 1, y: 1 });
    expect(act('away_candle', world, 'wisp').pos).toEqual({ x: 1, y: 1 });
    expect(act('toward_candle', hall(ROW('w.........')), 'wisp').pos).toEqual({ x: 1, y: 1 });
  });

  it('R6.2: on a tie the earlier candle in the item list is the nearest', () => {
    const world = hall(['#######', '#.....#', '#..w..#', '#.....#', '#######'], [makeItem('candle', 3, 1), makeItem('candle', 3, 3)]);
    expect(act('toward_candle', world, 'wisp').pos).toEqual({ x: 3, y: 1 });
  });

  it('R6.2: snuff the candle puts out the nearest lit candle within 2 and does nothing beyond', () => {
    const base = ROW('n.........');
    const near = hall(base, [makeItem('candle', 5, 1), makeItem('candle', 3, 1)]);
    act('snuff', near, 'snuffer');
    expect(near.items.map((i) => i.state.lit)).toEqual([true, false]);
    const far = hall(base, [makeItem('candle', 4, 1)]);
    act('snuff', far, 'snuffer');
    expect(far.items[0]!.state.lit).toBe(true);
  });

  it('R6.2: snuffing does not move the snuffer, and an unlit candle is skipped for the next lit one', () => {
    const world = hall(ROW('n.........'), [makeItem('candle', 2, 1), makeItem('candle', 3, 1)]);
    world.items[0]!.state.lit = false;
    const snuffer = act('snuff', world, 'snuffer');
    expect(snuffer.pos).toEqual({ x: 1, y: 1 });
    expect(world.items.map((i) => i.state.lit)).toEqual([false, false]);
  });

  it('R6.2: walk toward the window and walk back to bed use the map markers', () => {
    const rows = ['#######', '#B...W#', '#.....#', '#######'];
    const toWindow = hall(rows);
    expect(act('toward_window', toWindow, 'girl').pos).toEqual({ x: 2, y: 1 });
    const world = hall(rows);
    world.actors[0]!.pos = { x: 4, y: 2 };
    expect(act('toward_bed', world, 'girl').pos).toEqual({ x: 3, y: 2 });
  });

  it('R6.2: walking to a marker that is not on the map does nothing', () => {
    const world = hall(['#####', '#B.w#', '#####']);
    expect(act('toward_window', world, 'wisp').pos).toEqual({ x: 3, y: 1 });
  });

  it('R6.2: salt blocks movement', () => {
    const world = hall(['#####', '#B.w#', '#####'], [makeItem('salt', 2, 1)]);
    expect(act('toward_girl', world, 'wisp').pos).toEqual({ x: 3, y: 1 });
  });
});

describe('Midnight Ward property', () => {
  it('R6.3: registers girl_safe', () => {
    expect(registry.properties().map((p) => p.id)).toEqual(['girl_safe']);
  });

  it('R6.3: passes while ghosts are on other tiles, even next to the girl', () => {
    expect(registry.property('girl_safe')!.check(hall(ROW('Bw.........')))).toBeNull();
  });

  it('R6.3: fails when a ghost stands on the girl, and names the ghost', () => {
    const world = hall(ROW('B....w.....'));
    world.actors.find((a) => a.id === 'wisp')!.pos = { x: 1, y: 1 };
    expect(registry.property('girl_safe')!.check(world)).toEqual({ message: 'wisp caught the girl.', actors: ['wisp'] });
  });

  it('R6.3: lists every ghost on the girl\u2019s tile, in turn order, and the first is named', () => {
    const world = hall(ROW('B....w.s...'));
    for (const a of world.actors) if (a.kind !== 'girl') a.pos = { x: 1, y: 1 };
    expect(registry.property('girl_safe')!.check(world)).toEqual({ message: 'wisp caught the girl.', actors: ['wisp', 'shade'] });
  });

  it('R6.3: a world without a girl cannot fail it', () => {
    expect(registry.property('girl_safe')!.check(hall(ROW('...w......')))).toBeNull();
  });
});

describe('makeItem', () => {
  it('R6.1: salt is solid, a candle starts lit, a bell is plain', () => {
    expect(makeItem('salt', 1, 2)).toEqual({ type: 'salt', pos: { x: 1, y: 2 }, solid: true });
    expect(makeItem('candle', 1, 2)).toEqual({ type: 'candle', pos: { x: 1, y: 2 }, state: { lit: true } });
    expect(makeItem('bell', 3, 4)).toEqual({ type: 'bell', pos: { x: 3, y: 4 } });
  });
});
