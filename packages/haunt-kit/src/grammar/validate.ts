import type { Registry } from '../registry/registry';
import { ALWAYS } from './types';
import type { Rule } from './types';

const MAX_N = 999_999_999;

/** Returns a message when `rule` cannot be printed or run with `registry`, and `null` when it is fine. */
export function validateRule(rule: Rule, registry: Registry): string | null {
  if (rule.kw !== '' && rule.kw !== 'WHEN' && rule.kw !== 'IF') return `unknown keyword "${String(rule.kw)}"`;
  if ((rule.kw === '') !== (rule.cond === ALWAYS)) {
    return rule.kw === '' ? `a ubiquitous rule must use "${ALWAYS}", not "${rule.cond}"` : `"${ALWAYS}" can only be written as a ubiquitous rule`;
  }
  if (rule.cond !== ALWAYS) {
    const cond = registry.condition(rule.cond);
    if (!cond) return `condition "${rule.cond}" is not registered`;
    const wantsN = registry.conditionHasParam(rule.cond);
    if (wantsN && (rule.n === undefined || !Number.isInteger(rule.n) || rule.n < 0 || rule.n > MAX_N)) {
      return `condition "${rule.cond}" needs n to be an integer from 0 to ${MAX_N}`;
    }
    if (!wantsN && rule.n !== undefined) return `condition "${rule.cond}" takes no n`;
  } else if (rule.n !== undefined) {
    return `"${ALWAYS}" takes no n`;
  }
  if (!registry.action(rule.act)) return `action "${rule.act}" is not registered`;
  return null;
}
