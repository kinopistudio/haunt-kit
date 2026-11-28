import { explain } from 'haunt-kit';
import type { Finding } from 'haunt-kit';
import { makeNames } from './content';
import type { LevelDef } from './levels';
import type { NightRun } from './night';
import { usedCards } from './plan';
import { solveLevel } from './solve';

/** How many sentences follow the first one in the explanation of a loss. */
export const MAX_DETAILS = 4;

export interface LossText {
  headline: string;
  /** The first sentence, then at most `MAX_DETAILS` more, then the note about unused cards. */
  sentences: string[];
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

type LineFinding = Exclude<Finding, { kind: 'violation' }>;

/** Findings in the order a player should read them: cards first, then rewrites, then other lines. */
function readingOrder(findings: Finding[]): LineFinding[] {
  const rest = findings.filter((f): f is LineFinding => f.kind !== 'violation');
  const card = (f: LineFinding): boolean => f.line.origin === 'card' && f.kind !== 'rewrite';
  return [...rest.filter(card), ...rest.filter((f) => f.kind === 'rewrite'), ...rest.filter((f) => f.kind !== 'rewrite' && !card(f))];
}

/**
 * The plain-English reason a night was lost. The first sentence names the bell, the ghost and the line that
 * ran. The others are the kit's sentences about lines that never fired and about rewrites. Every number is read
 * from the recording by `explain`.
 */
export function lossText(night: NightRun): LossText {
  const { recording, registry, level, plan } = night;
  const names = makeNames(recording.frames[0]!.actors);
  const explanation = explain(recording, registry, {
    actorName: names.name,
    tickWord: 'bell',
    originNote: { card: 'your card' },
  });
  const sentences: string[] = [];

  const violation = explanation.findings.find((f) => f.kind === 'violation');
  if (violation && violation.kind === 'violation') {
    const ghost = violation.actors[0] ?? violation.turnActor;
    const line = violation.line;
    const quote = line ? `line ${line.index + 1}: \u201c${line.text}\u201d` : '';
    if (violation.turnActor !== ghost) {
      sentences.push(`Bell ${violation.tick}. ${names.title(violation.turnActor)} walked into ${names.name(ghost)}${line ? ` while following ${quote}` : '.'}`);
    } else {
      sentences.push(`Bell ${violation.tick}. ${names.title(ghost)} reached the girl${line ? ` while running ${quote}` : '.'}`);
    }
  }

  const sentenceOf = new Map<Finding, string>();
  explanation.findings.forEach((finding, i) => sentenceOf.set(finding, explanation.sentences[i]!));
  const ordered = readingOrder(explanation.findings);
  sentences.push(...ordered.slice(0, MAX_DETAILS).map((f) => sentenceOf.get(f)!));
  if (ordered.length > MAX_DETAILS) sentences.push(`And ${ordered.length - MAX_DETAILS} more.`);

  const inHand = level.cards.length - usedCards(plan).size;
  if (inHand > 0) sentences.push(`${plural(inHand, 'A card is', `${inHand} cards are`)} still in your hand.`);

  return { headline: 'She is gone.', sentences };
}

export interface SolveCounts {
  solutions: number;
  total: number;
}

const solved = new Map<string, SolveCounts>();

/** How many setups of the level survive, found by the solver in this session. Cached per level. */
export function solveCounts(level: LevelDef): SolveCounts {
  let counts = solved.get(level.id);
  if (!counts) {
    const { solutions, total } = solveLevel(level);
    counts = { solutions, total };
    solved.set(level.id, counts);
  }
  return counts;
}

export interface DawnText {
  headline: string;
  sentences: string[];
}

/** What the dawn says: how many lines never ran, and how many setups of this level survive (from the solver). */
export function dawnText(night: NightRun, counts: SolveCounts): DawnText {
  const { burned } = night;
  const sentences = [
    burned > 0
      ? `${burned} ${plural(burned, 'line', 'lines')} never fired all night and burned away. A rule that can never run is a bug in any spec.`
      : 'Every line fired at least once tonight.',
    `${counts.solutions.toLocaleString('en-US')} of ${counts.total.toLocaleString('en-US')} possible setups survive this night. Yours is one of them.`,
  ];
  return { headline: 'Dawn. She is still asleep.', sentences };
}
