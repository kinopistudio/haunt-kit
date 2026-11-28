import type { Registry } from '../registry/registry';
import { ALWAYS } from './types';
import type { Rule } from './types';
import { validateRule } from './validate';

function conditionText(rule: Rule, registry: Registry): string {
  const def = registry.condition(rule.cond)!;
  return rule.n === undefined ? def.pattern : def.pattern.replace('{n}', String(rule.n));
}

/**
 * Prints a rule in its canonical form. Throws an `Error` when the rule does not fit the registry
 * (a programmer error: rules from the parser always fit).
 */
export function printRule(actor: string, rule: Rule, registry: Registry): string {
  const problem = validateRule(rule, registry);
  if (problem) throw new Error(`cannot print rule: ${problem}`);
  const action = registry.action(rule.act)!.pattern;
  if (rule.cond === ALWAYS) return `THE ${actor} SHALL ${action}.`;
  const cond = conditionText(rule, registry);
  return rule.kw === 'IF'
    ? `IF ${cond}, THEN THE ${actor} SHALL ${action}.`
    : `WHEN ${cond}, THE ${actor} SHALL ${action}.`;
}
