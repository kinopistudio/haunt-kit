import type { Registry } from '../registry/registry';
import { ALWAYS } from './types';
import type { Rule, ScheduledEvent } from './types';
import { MAX_N, validateRule } from './validate';

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

/** Prints a scheduled write: `WHEN <schedule condition>, THE <actor> SHALL write "<rule>" at line <k>.` */
export function printEvent(event: ScheduledEvent, registry: Registry): string {
  const schedule = registry.scheduleCondition;
  if (!schedule) throw new Error('cannot print event: no schedule condition is registered');
  if (!Number.isInteger(event.tick) || event.tick < 0 || event.tick > MAX_N) {
    throw new Error(`cannot print event: tick ${event.tick} is not an integer from 0 to ${MAX_N}`);
  }
  if (!Number.isInteger(event.line) || event.line < 1 || event.line > MAX_N) {
    throw new Error(`cannot print event: line ${event.line} is not an integer from 1 to ${MAX_N}`);
  }
  const inner = printRule(event.actor, event.rule, registry);
  const when = schedule.pattern.replace('{n}', String(event.tick));
  return `WHEN ${when}, THE ${event.actor} SHALL write "${inner}" at line ${event.line}.`;
}
