import type { LevelDef } from './levels';

/** What a level teaches, in the words the level select and the play screen show. */
export interface LevelInfo {
  /** The numeral or name on the title card: `Prologue`, `I`, `IV`. */
  numeral: string;
  /** The idea the level teaches, in a few words. */
  concept: string;
  /** One or two plain sentences. */
  lesson: string;
}

export const LEVEL_INFO: Record<string, LevelInfo> = {
  prologue: {
    numeral: 'Prologue',
    concept: 'Condition and action',
    lesson: 'Salt blocks a ghost. Read the wisp\u2019s spec, then put the salt where it must pass.',
  },
  night1: {
    numeral: 'I',
    concept: 'Rule order',
    lesson: 'Only the first true line runs. A card placed under an always-true line can never fire.',
  },
  night4: {
    numeral: 'IV',
    concept: 'Contradiction and change',
    lesson: 'Two lines can be true at once, and the first one wins. At the sixth bell the wisp writes itself a new first line.',
  },
};

export function levelInfo(level: LevelDef): LevelInfo {
  return LEVEL_INFO[level.id] ?? { numeral: level.name, concept: '', lesson: '' };
}

const KIND_WORD: Record<string, string> = { girl: 'girl', wisp: 'wisp', shade: 'shade', snuffer: 'snuffer' };
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export interface Names {
  /** For a page title or a label: `The girl`, `Wisp I`. */
  title(actorId: string): string;
  /** Inside a sentence: `the girl`, `Wisp I`. */
  name(actorId: string): string;
  /** `I` or `II` when several actors share a kind, else an empty string. */
  numeral(actorId: string): string;
}

/** Names for the actors of a world. Several actors of one kind are told apart by numerals, in turn order. */
export function makeNames(actors: readonly { id: string; kind: string }[]): Names {
  const byId = new Map(actors.map((a) => [a.id, a]));
  const numeral = (id: string): string => {
    const actor = byId.get(id);
    if (!actor) return '';
    const same = actors.filter((a) => a.kind === actor.kind);
    return same.length > 1 ? (NUMERALS[same.indexOf(actor)] ?? String(same.indexOf(actor) + 1)) : '';
  };
  const word = (id: string): string => KIND_WORD[byId.get(id)?.kind ?? ''] ?? id;
  const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
  const ghost = (id: string): string => `${capital(word(id))}${numeral(id) ? ` ${numeral(id)}` : ''}`;
  return {
    numeral,
    title: (id) => (byId.get(id)?.kind === 'girl' ? 'The girl' : ghost(id)),
    name: (id) => (byId.get(id)?.kind === 'girl' ? 'the girl' : ghost(id)),
  };
}
