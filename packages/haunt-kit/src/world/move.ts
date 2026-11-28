import type { Actor, Pos, World } from './types';

/** Manhattan distance. */
export function distance(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** True for tiles outside the map, wall tiles and tiles with a solid item. Actors never block. */
export function isBlocked(world: Pick<World, 'map' | 'items'>, p: Pos): boolean {
  const { w, h, walls } = world.map;
  if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) return true;
  if (walls.has(p.y * w + p.x)) return true;
  return world.items.some((it) => it.solid && it.pos.x === p.x && it.pos.y === p.y);
}

/**
 * One greedy step along (dx, dy): the axis with the larger absolute value first (x on a tie), then the other axis.
 * Axes whose difference is 0 are skipped. The actor does not move when both steps are blocked.
 */
function stepAlong(world: World, actor: Actor, dx: number, dy: number): boolean {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const order: [number, number][] = Math.abs(dx) >= Math.abs(dy) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
  for (const [ox, oy] of order) {
    if (ox === 0 && oy === 0) continue;
    const next = { x: actor.pos.x + ox, y: actor.pos.y + oy };
    if (isBlocked(world, next)) continue;
    actor.pos.x = next.x;
    actor.pos.y = next.y;
    return true;
  }
  return false;
}

/** Moves the actor one tile toward `target`. Returns whether it moved. */
export function stepToward(world: World, actor: Actor, target: Pos): boolean {
  return stepAlong(world, actor, target.x - actor.pos.x, target.y - actor.pos.y);
}

/** Moves the actor one tile away from `from`: the same rule, mirrored. Returns whether it moved. */
export function stepAway(world: World, actor: Actor, from: Pos): boolean {
  return stepAlong(world, actor, actor.pos.x - from.x, actor.pos.y - from.y);
}

/**
 * The tiles an actor standing on `from` may step to: its own tile first, then the east, west, south and
 * north neighbours, in that order, leaving out blocked tiles. South is `y + 1`.
 */
export function openSteps(world: Pick<World, 'map' | 'items'>, from: Pos): Pos[] {
  const out: Pos[] = [{ x: from.x, y: from.y }];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const next = { x: from.x + dx, y: from.y + dy };
    if (!isBlocked(world, next)) out.push(next);
  }
  return out;
}
