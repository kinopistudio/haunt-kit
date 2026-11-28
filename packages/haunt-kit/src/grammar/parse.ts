import type { Registry } from '../registry/registry';
import { ALWAYS } from './types';
import type { Keyword, ParseResult, Rule, Sentence } from './types';

const ACTOR_RE = /^[a-z][a-z0-9-]*(?: [a-z0-9-]+)*$/;

/** One regex per sentence form. Group 1 is the opening keyword; the groups named in `kw` are checked for letter case. */
interface Form {
  kind: Keyword;
  exact: RegExp;
  loose: RegExp;
  /** Group numbers of: condition (0 if none), actor, action. */
  cond: number;
  actor: number;
  act: number;
}

const SRC = {
  WHEN: '^(WHEN) (.+?), (THE) (.+?) (SHALL) (.+)\\.$',
  IF: '^(IF) (.+?), (THEN) (THE) (.+?) (SHALL) (.+)\\.$',
  '': '^(THE) (.+?) (SHALL) (.+)\\.$',
} as const;

const FORMS: Form[] = [
  { kind: 'WHEN', exact: new RegExp(SRC.WHEN, 'd'), loose: new RegExp(SRC.WHEN, 'di'), cond: 2, actor: 4, act: 6 },
  { kind: 'IF', exact: new RegExp(SRC.IF, 'd'), loose: new RegExp(SRC.IF, 'di'), cond: 2, actor: 5, act: 7 },
  { kind: '', exact: new RegExp(SRC[''], 'd'), loose: new RegExp(SRC[''], 'di'), cond: 0, actor: 2, act: 4 },
];

const KEYWORD_GROUPS: Record<Keyword, number[]> = { WHEN: [1, 3, 5], IF: [1, 3, 4, 6], '': [1, 3] };

function fail<T>(message: string, column: number): ParseResult<T> {
  return { ok: false, error: { message, column } };
}

/** Parses one EARS sentence. Never throws. Columns in errors are 1-based. */
export function parseSentence(text: string, registry: Registry): ParseResult<Sentence> {
  const lead = text.length - text.trimStart().length;
  const body = text.trim();
  if (body === '') return fail('the sentence is empty', 1);
  const col = (index: number): number => lead + index + 1;

  if (!body.endsWith('.')) return fail('a sentence ends with a period', col(body.length));

  for (const form of FORMS) {
    const m = form.exact.exec(body);
    if (!m || !m.indices) continue;
    const at = (g: number): { text: string; column: number } => ({ text: m[g]!, column: col(m.indices![g]![0]) });
    return finish(form, at, registry);
  }

  for (const form of FORMS) {
    const m = form.loose.exec(body);
    if (!m || !m.indices) continue;
    for (const g of KEYWORD_GROUPS[form.kind]) {
      const kw = m[g]!;
      if (kw !== kw.toUpperCase()) {
        return fail(`the keyword "${kw}" must be written in capitals: ${kw.toUpperCase()}`, col(m.indices[g]![0]));
      }
    }
  }

  if (/^(THE|WHEN|IF)\b/.test(body)) {
    return fail(
      'expected one of: THE <actor> SHALL <action>. | WHEN <condition>, THE <actor> SHALL <action>. | IF <condition>, THEN THE <actor> SHALL <action>.',
      col(0),
    );
  }
  return fail('a sentence starts with THE, WHEN or IF', col(0));
}

function finish(
  form: Form,
  at: (group: number) => { text: string; column: number },
  registry: Registry,
): ParseResult<Sentence> {
  const actor = at(form.actor);
  if (!ACTOR_RE.test(actor.text)) {
    return fail(`"${actor.text}" is not an actor name (lowercase words, digits and hyphens)`, actor.column);
  }

  let condId = ALWAYS;
  let n: number | undefined;
  if (form.cond !== 0) {
    const c = at(form.cond);
    const hit = registry.matchCondition(c.text);
    if (!hit) {
      const hint = c.text.trim().toLowerCase() === ALWAYS ? ': write the ubiquitous form THE <actor> SHALL <action>.' : '';
      return fail(`unknown condition "${c.text}"${hint}`, c.column);
    }
    condId = hit.def.id;
    n = hit.n;
  }

  const a = at(form.act);
  const action = registry.matchAction(a.text);
  if (!action) return fail(`unknown action "${a.text}"`, a.column);

  const rule: Rule = { kw: form.kind, cond: condId, act: action.id };
  if (n !== undefined) rule.n = n;
  return { ok: true, value: { type: 'rule', actor: actor.text, rule } };
}
