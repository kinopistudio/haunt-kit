import type { Registry } from '../registry/registry';
import type { Recording } from '../trace/types';
import { cloneWorld } from '../world/create';
import type { World } from '../world/types';
import { tick } from './tick';

/**
 * Runs a copy of `world` until it is no longer running and keeps every step: the world before the
 * first tick, the world after each tick, and the engine's trace of each tick. The given world is not
 * changed, and no two frames share mutable state, so any frame can be read in any order.
 */
export function recordRun(world: World, registry: Registry): Recording {
  const work = cloneWorld(world);
  const frames: World[] = [cloneWorld(work)];
  const traces: Recording['traces'] = [];
  for (let t = tick(work, registry); t !== null; t = tick(work, registry)) {
    traces.push(t);
    frames.push(cloneWorld(work));
  }
  return { frames, traces, status: work.status };
}
