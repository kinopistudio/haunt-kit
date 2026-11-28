import { printRule } from '../grammar/print';
import type { Rule } from '../grammar/types';
import type { Registry } from '../registry/registry';
import type { Line, LineOrigin, World } from '../world/types';
import { lineStats } from './stats';
import type { Recording } from './types';

/** A line as a finding names it. `index` is 0-based and is read at the tick the finding is about. */
export interface LineRef {
  id: number;
  index: number;
  /** The printed EARS sentence. */
  text: string;
  origin: LineOrigin;
}

export type Finding =
  | {
      kind: 'violation';
      tick: number;
      property: string;
      message: string;
      /** The actors the property names. */
      actors: string[];
      /** The actor whose turn broke the property. */
      turnActor: string;
      /** The line that ran on that turn, or `null`. */
      line: LineRef | null;
    }
  | { kind: 'rewrite'; tick: number; actor: string; line: LineRef }
  | { kind: 'shadowed'; actor: string; line: LineRef; tick: number; by: LineRef }
  | { kind: 'never_true'; actor: string; line: LineRef; condition: string };

export interface ExplainOptions {
  /** Display name of an actor id. Default: the id. */
  actorName?: (actorId: string) => string;
  /** What one tick is called, lower case. Default: `tick`. */
  tickWord?: string;
  /** A short note printed in brackets after the actor, by line origin. Default: none. */
  originNote?: Partial<Record<LineOrigin, string>>;
  /** Origins whose lines are reported when they were never true. Default: `['card']`. */
  neverTrueOrigins?: LineOrigin[];
}

export interface Explanation {
  findings: Finding[];
  /** One sentence for each finding, in the same order. */
  sentences: string[];
}

function conditionPhrase(rule: Rule, registry: Registry): string {
  const pattern = registry.condition(rule.cond)?.pattern ?? rule.cond;
  return rule.n === undefined ? pattern : pattern.replace('{n}', String(rule.n));
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const endSentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * Explains a run in structured findings and plain sentences. It reads the traces and the line statistics
 * and nothing else: every number in a sentence is a tick or a 1-based line number from the recording.
 * It changes none of its inputs.
 */
export function explain(recording: Recording, registry: Registry, options: ExplainOptions = {}): Explanation {
  const name = options.actorName ?? ((id: string) => id);
  const tickWord = options.tickWord ?? 'tick';
  const notes = options.originNote ?? {};
  const neverTrueOrigins = options.neverTrueOrigins ?? ['card'];
  const last: World | undefined = recording.frames[recording.frames.length - 1];
  const lastTrace = recording.traces[recording.traces.length - 1];
  if (!last) return { findings: [], sentences: [] };

  const stats = lineStats(recording);
  const findings: Finding[] = [];
  const sentences: string[] = [];

  /** Finds a line and its actor in a frame. */
  const find = (frame: World, id: number): { line: Line; index: number; kind: string } | null => {
    for (const actor of frame.actors) {
      const index = actor.lines.findIndex((l) => l.id === id);
      if (index !== -1) return { line: actor.lines[index]!, index, kind: actor.kind };
    }
    return null;
  };
  const ref = (frame: World, id: number, index: number): LineRef | null => {
    const found = find(frame, id);
    return found ? { id, index, text: printRule(found.kind, found.line.rule, registry), origin: found.line.origin } : null;
  };
  const noteOf = (origin: LineOrigin): string => (notes[origin] ? ` (${notes[origin]})` : '');

  // 1. The violation.
  if (recording.status === 'violated' && lastTrace?.violation) {
    const turn = lastTrace.turns[lastTrace.turns.length - 1];
    const line = turn && turn.firedId !== null && turn.fired !== null ? ref(last, turn.firedId, turn.fired) : null;
    const v = lastTrace.violation;
    findings.push({
      kind: 'violation',
      tick: lastTrace.tick,
      property: v.property,
      message: v.message,
      actors: [...v.actors],
      turnActor: turn?.actor ?? '',
      line,
    });
    let sentence = `${capital(tickWord)} ${lastTrace.tick}: ${endSentence(v.message)}`;
    if (line && turn) sentence += ` ${name(turn.actor)} was running line ${line.index + 1}: \u201c${line.text}\u201d`;
    sentences.push(sentence);
  }

  // 2. Rewrites, in tick order.
  for (const trace of recording.traces) {
    for (const event of trace.events) {
      const line = ref(recording.frames[trace.tick] ?? last, event.lineId, event.index);
      if (!line) continue;
      findings.push({ kind: 'rewrite', tick: trace.tick, actor: event.actor, line });
      const total = recording.frames[trace.tick]?.actors.find((a) => a.id === event.actor)?.lines.length ?? 0;
      let sentence = `At ${tickWord} ${trace.tick}, ${name(event.actor)} wrote itself a new line ${event.index + 1}: \u201c${line.text}\u201d`;
      if (event.index + 1 < total) sentence += ' The lines under it moved down by one.';
      sentences.push(sentence);
    }
  }

  // 3. Shadowed lines, then never-true lines, each by actor order and line order.
  const shadowed: { finding: Finding; sentence: string }[] = [];
  const never: { finding: Finding; sentence: string }[] = [];
  for (const actor of last.actors) {
    actor.lines.forEach((line, finalIndex) => {
      const stat = stats.get(line.id);
      if (!stat || stat.fired > 0) return;
      if (stat.firstShadowed) {
        const at = stat.firstShadowed;
        const frame = recording.frames[at.tick] ?? last;
        const own = ref(frame, line.id, at.index);
        const by = ref(frame, at.byId, at.byIndex);
        if (!own || !by) return;
        shadowed.push({
          finding: { kind: 'shadowed', actor: actor.id, line: own, tick: at.tick, by },
          sentence: `Line ${at.index + 1} of ${name(actor.id)}${noteOf(line.origin)} never fired: line ${at.byIndex + 1} was true first, so it shadowed it at ${tickWord} ${at.tick}.`,
        });
      } else if (stat.idle > 0 && neverTrueOrigins.includes(line.origin)) {
        const own = ref(last, line.id, finalIndex);
        if (!own) return;
        const condition = conditionPhrase(line.rule, registry);
        never.push({
          finding: { kind: 'never_true', actor: actor.id, line: own, condition },
          sentence: `Line ${finalIndex + 1} of ${name(actor.id)}${noteOf(line.origin)} never fired: \u201c${condition}\u201d was never true when it was checked.`,
        });
      }
    });
  }
  for (const item of [...shadowed, ...never]) {
    findings.push(item.finding);
    sentences.push(item.sentence);
  }

  return { findings, sentences };
}
