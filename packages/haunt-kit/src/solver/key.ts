import type { World } from '../world/types';

/**
 * A string that is equal for two worlds exactly when the engine would treat them the same from now on.
 * It covers the status, each actor's tile and line ids, and each item's tile, solid flag and state.
 * It leaves out the tick: the search compares worlds of the same tick only. Maps, markers, events and
 * properties never change during a run.
 */
export function stateKey(world: World): string {
  const actors = world.actors.map((a) => `${a.id}@${a.pos.x},${a.pos.y}#${a.lines.map((l) => l.id).join('.')}`);
  const items = world.items.map((i) => {
    const state = Object.keys(i.state)
      .sort()
      .map((k) => `${k}=${String(i.state[k])}`)
      .join(',');
    return `${i.type}@${i.pos.x},${i.pos.y}${i.solid ? '!' : ''}{${state}}`;
  });
  return `${world.status}|${actors.join(';')}|${items.join(';')}`;
}
