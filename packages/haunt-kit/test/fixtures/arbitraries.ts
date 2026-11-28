import fc from 'fast-check';
import { ALWAYS } from '../../src/index';
import type { Registry, Rule, SafetyRule } from '../../src/index';

/** Valid actor names: lowercase words, digits and hyphens. */
export const actorArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}( [a-z0-9-]{1,6}){0,2}$/);

/** Any rule that fits `registry`: ubiquitous, WHEN or IF, over any registered condition and action. */
export function ruleArbFor(registry: Registry, maxN = 999_999_999): fc.Arbitrary<Rule> {
  return fc
    .record({
      kw: fc.constantFrom('WHEN', 'IF'),
      cond: fc.constantFrom(...registry.conditions().map((c) => c.id)),
      act: fc.constantFrom(...registry.actions().map((a) => a.id)),
      n: fc.integer({ min: 0, max: maxN }),
    })
    .chain(({ kw, cond, act, n }) =>
      fc.constantFrom<Rule>(
        { kw: '', cond: ALWAYS, act },
        registry.conditionHasParam(cond) ? { kw, cond, act, n } : { kw, cond, act },
      ),
    );
}

/** Any safety rule that fits `registry`: a registered prohibition over a registered condition (never `always`). */
export function safetyArbFor(registry: Registry, maxN = 999_999_999): fc.Arbitrary<SafetyRule> {
  return fc
    .record({
      actor: actorArb,
      prohibited: fc.constantFrom(...registry.prohibitions().map((p) => p.id)),
      cond: fc.constantFrom(...registry.conditions().map((c) => c.id)),
      n: fc.integer({ min: 0, max: maxN }),
    })
    .map(({ actor, prohibited, cond, n }) => (registry.conditionHasParam(cond) ? { actor, prohibited, cond, n } : { actor, prohibited, cond }));
}
