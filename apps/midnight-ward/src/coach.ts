import { buildWorld } from './levels';
import type { LevelDef } from './levels';
import { itemTypes, levelActors, pieceAt, remaining, usedCards } from './plan';
import type { Plan, Selection } from './plan';
import type { PlacedItem } from './vocab';

/** The control or tile the coach points at. */
export type CoachTarget =
  | { kind: 'tool'; type: PlacedItem }
  | { kind: 'tile'; x: number; y: number }
  | { kind: 'card'; index: number }
  | { kind: 'slot'; actor: string; at: number }
  | { kind: 'remove'; actor: string; at: number }
  | { kind: 'ring' }
  | { kind: 'retry' }
  | { kind: 'next' };

export interface CoachStep {
  id: string;
  /** Short label above the text. */
  tag: string;
  text: string;
  target: CoachTarget | null;
}

/** One winning setup that the coach walks the player through. Tests run it to check that it wins. */
export interface Hint {
  items: { type: PlacedItem; x: number; y: number; text: string }[];
  cards: { card: number; actor: string; at: number; text: string }[];
}

export const HINTS: Record<string, Hint> = {
  prologue: {
    items: [{ type: 'salt', x: 4, y: 3, text: 'Put the salt in the gap in the wall. Every way to the girl goes through it.' }],
    cards: [],
  },
  night1: {
    items: [
      {
        type: 'bell',
        x: 4,
        y: 3,
        text: 'Put the bell right above the girl. A bell is heard within 2 steps, so both wisps hear it before they reach her.',
      },
    ],
    cards: [
      { card: 0, actor: 'wisp', at: 0, text: 'Insert it at line 1 of Wisp I. Only the first true line runs, so a card under an always-true line never fires.' },
      { card: 1, actor: 'wisp-2', at: 0, text: 'Wisp II has its own spec. Insert the card at line 1 of Wisp II as well.' },
    ],
  },
};

const INTRO: Record<string, string> = {
  prologue: 'The wisp has one rule: it always moves toward the girl. Salt blocks its way. Pick up the salt.',
  night1: 'Both wisps always move toward the girl. A bell can stop them, but only if a rule listens for it. Start with the bell.',
};

export function hasCoach(level: LevelDef): boolean {
  return level.id in HINTS;
}

export interface CoachInput {
  phase: 'plan' | 'night' | 'won' | 'lost';
  plan: Plan;
  selection: Selection | null;
  /** After a loss: a card of the player's was true but never ran because a line above it ran first. */
  shadowedCard?: boolean;
  /** After a win: there is a next level. */
  hasNext?: boolean;
}

const step = (id: string, text: string, target: CoachTarget | null): CoachStep => ({ id, tag: 'Tutorial', text, target });

/** True when a line above position `at` of an actor's list is a rule that is always true. */
function alwaysTrueAbove(level: LevelDef, plan: Plan, actor: string, at: number): boolean {
  const base = buildWorld(level).actors.find((a) => a.id === actor)?.lines ?? [];
  const list = plan.lists[actor] ?? [];
  return list.slice(0, at).some((entry) => (entry.t === 'base' ? base[entry.i]?.rule : level.cards[entry.c])?.cond === 'always');
}

/**
 * What the coach says and points at. A function of the level, the phase, the plan and the selection only.
 * Returns `null` for a level without a coach.
 */
export function coachStep(level: LevelDef, input: CoachInput): CoachStep | null {
  const hint = HINTS[level.id];
  if (!hint) return null;
  const { plan, selection } = input;

  if (input.phase === 'night') {
    return step('night', 'Each bell, the lit line is the one that ran. The thread shows which ghost obeyed it. You can pause, step or scrub.', null);
  }
  if (input.phase === 'lost') {
    return input.shadowedCard
      ? step('lost-shadow', 'Your card never ran: a line above it was true first. Press Try again, and put the card at line 1.', { kind: 'retry' })
      : step('lost', 'She was caught. The note under the board says which line did it. Press Try again.', { kind: 'retry' });
  }
  if (input.phase === 'won') {
    return step(
      'won',
      'Dawn. The gold lines are the ones that kept her safe. The ash is what never ran.',
      input.hasNext ? { kind: 'next' } : null,
    );
  }

  // Planning. A card that sits under an always-true line comes first: it can never fire.
  for (const actor of levelActors(level)) {
    const list = plan.lists[actor.id] ?? [];
    for (let at = 0; at < list.length; at++) {
      if (list[at]!.t === 'card' && alwaysTrueAbove(level, plan, actor.id, at)) {
        return step(
          'shadow',
          `This card is shadowed. A line above it is always true, so that line runs first and nothing below it ever fires. Take the card out with \u00D7, then put it at line 1.`,
          { kind: 'remove', actor: actor.id, at },
        );
      }
    }
  }

  const used = usedCards(plan);
  if (selection?.kind === 'card' && !used.has(selection.card)) {
    const wanted = hint.cards.find((c) => c.card === selection.card);
    return wanted
      ? step(`slot-${selection.card}`, wanted.text, { kind: 'slot', actor: wanted.actor, at: wanted.at })
      : step('slot', 'Pick a line in a spec. Each bell, an actor runs only its first true line.', null);
  }
  if (selection?.kind === 'item') {
    const wanted = hint.items.find((i) => i.type === selection.type && !pieceAt(plan, i.x, i.y));
    return wanted
      ? step(`tile-${wanted.type}`, wanted.text, { kind: 'tile', x: wanted.x, y: wanted.y })
      : step('tile', 'Tap a floor tile. The dotted diamond shows how far it reaches.', null);
  }

  for (const type of itemTypes(level)) {
    const needed = hint.items.filter((i) => i.type === type).length;
    if (needed > 0 && remaining(level, plan, type) > 0 && plan.items.filter((p) => p.type === type).length < needed) {
      return step(`tool-${type}`, INTRO[level.id]!, { kind: 'tool', type });
    }
  }
  const next = hint.cards.find((c) => !used.has(c.card));
  if (next) {
    const first = used.size === 0;
    return step(
      `card-${next.card}`,
      first ? 'A card is one EARS rule that you can write into a spec. Take a card.' : 'One more card. Take it.',
      { kind: 'card', index: next.card },
    );
  }
  return step('ring', 'Ring midnight. Twelve bells will ring, and every spec is read from the top at each one.', { kind: 'ring' });
}
