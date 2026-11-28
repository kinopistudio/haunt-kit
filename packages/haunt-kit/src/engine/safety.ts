import { printSafety } from '../grammar/print';
import type { SafetyRule } from '../grammar/types';
import { validateSafety } from '../grammar/validate';
import { RegistryError } from '../registry/registry';
import type { Registry } from '../registry/registry';
import type { PropertyDef } from '../registry/types';

/** Turns one safety rule into a property with the given id. Throws `RegistryError` when the rule does not fit the registry. */
export function safetyProperty(rule: SafetyRule, id: string, registry: Registry): PropertyDef {
  const problem = validateSafety(rule, registry);
  if (problem) throw new RegistryError(`safety rule "${id}": ${problem}`, id);
  const prohibition = registry.prohibition(rule.prohibited)!;
  const condition = registry.condition(rule.cond)!;
  const text = printSafety(rule, registry);
  return {
    id,
    description: text,
    check: (world, turn) => {
      if (!turn) return null;
      // The condition is evaluated for each actor of the rule's kind, so "near" means near that actor.
      const broken = world.actors.filter((actor) => {
        if (actor.kind !== rule.actor) return false;
        const ctx = { world, actor, turn };
        return prohibition.occurs(ctx) && condition.test({ world, actor }, rule.n ?? 0);
      });
      return broken.length === 0 ? null : { message: text, actors: broken.map((a) => a.id) };
    },
  };
}

/**
 * Registers one property per safety rule, named `S1`, `S2`, ... in order, and returns the ids.
 * Every rule is checked before the first one is registered.
 */
export function registerSafety(registry: Registry, rules: readonly SafetyRule[]): string[] {
  const ids = rules.map((_, i) => `S${i + 1}`);
  const props = rules.map((rule, i) => safetyProperty(rule, ids[i]!, registry));
  for (const prop of props) registry.addProperty(prop);
  return ids;
}
