import { run } from '../engine/tick';
import type { Registry } from '../registry/registry';
import type { World, WorldStatus } from '../world/types';
import { SolverError } from './types';
import type { ChoiceGenerator, PropertyId, SolutionSummary } from './types';

/** `run` changes the status, which the compiler cannot see through the earlier check. */
const statusOf = (world: World): WorldStatus => world.status;

/**
 * Builds a world for every choice, runs it to the end with only `property` checked, and counts the
 * worlds that end `complete`. Choices are streamed, so memory does not grow with their number.
 */
export function findSolutions<C>(generator: ChoiceGenerator<C>, registry: Registry, property: PropertyId): SolutionSummary<C> {
  if (!registry.property(property)) throw new SolverError(`property "${property}" is not registered`);

  let solutions = 0;
  let total = 0;
  let firstSolution: C | null = null;
  for (const choice of generator.choices()) {
    total++;
    const world = generator.build(choice);
    if (world.status !== 'running') throw new SolverError(`the world built for choice ${total} is "${world.status}", not "running"`);
    world.properties = [property];
    run(world, registry);
    if (statusOf(world) !== 'complete') continue;
    if (solutions === 0) firstSolution = choice;
    solutions++;
  }
  return { solutions, total, firstSolution };
}
