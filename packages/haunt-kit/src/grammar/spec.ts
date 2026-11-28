import type { Registry } from '../registry/registry';
import { parseSentence } from './parse';
import type { SpecError, SpecSet } from './types';

const LIST_MARKER = /^(?:[-*]|\d+[.)])\s+/;
const STARTS_LIKE_SENTENCE = /^(?:THE|WHEN|IF)\b/i;
const HAS_SHALL = /\bSHALL\b/i;

/**
 * Loads a spec file. Each line is read on its own:
 * - A line that starts with THE, WHEN or IF (any case) and contains SHALL (any case) is a sentence,
 *   after leading spaces and one list marker (`-`, `*`, `1.`, `1)`) are removed.
 * - Every other line (blank lines, headings, prose, fences) is ignored.
 *
 * Rules are collected per actor in file order. Write sentences go to `events`, in file order, and
 * make sure their actor exists in `actors`. Every invalid sentence adds one `SpecError`.
 */
export function loadSpec(text: string, registry: Registry): { spec: SpecSet; errors: SpecError[] } {
  const spec: SpecSet = { actors: {}, events: [] };
  const errors: SpecError[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const lineNo = i + 1;
    const indent = raw.length - raw.trimStart().length;
    let rest = raw.slice(indent);
    let offset = indent;
    const marker = LIST_MARKER.exec(rest);
    if (marker) {
      offset += marker[0].length;
      rest = rest.slice(marker[0].length);
    }
    if (!STARTS_LIKE_SENTENCE.test(rest) || !HAS_SHALL.test(rest)) return;

    const parsed = parseSentence(rest, registry);
    if (!parsed.ok) {
      errors.push({ line: lineNo, column: parsed.error.column + offset, message: parsed.error.message, text: raw.trim() });
      return;
    }
    if (parsed.value.type === 'rule') {
      const { actor, rule } = parsed.value;
      (spec.actors[actor] ??= []).push(rule);
    } else if (parsed.value.type === 'write') {
      const { event } = parsed.value;
      spec.actors[event.actor] ??= [];
      spec.events.push(event);
    }
  });

  return { spec, errors };
}
