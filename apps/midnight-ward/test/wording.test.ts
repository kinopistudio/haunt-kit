import { describe, expect, it } from 'vitest';
import { NIGHT_1, NIGHT_4, PROLOGUE, buildWorld } from '../src/levels';
import type { LevelDef } from '../src/levels';
import { runNight } from '../src/night';
import type { NightRun } from '../src/night';
import { freshPlan, insertCard, placeItem } from '../src/plan';
import type { Plan } from '../src/plan';
import { MAX_DETAILS, dawnText, lossText, solveCounts } from '../src/wording';
import { levelChoices, solveLevel } from '../src/solve';
import { planOfChoice } from './fixtures/plan-of-choice';

function must<T>(value: T | null): T {
  if (value === null) throw new Error('expected a value');
  return value;
}

/** Night I with a bell above the girl, one card under the wisp's always-true line, one card above the other wisp's. */
function night1WithShadowedCard(): Plan {
  let plan = must(placeItem(NIGHT_1, freshPlan(NIGHT_1), 'bell', 4, 3));
  plan = must(insertCard(NIGHT_1, plan, 0, 'wisp', 1));
  return must(insertCard(NIGHT_1, plan, 1, 'wisp-2', 0));
}

describe('lossText', () => {
  it('M6.1: the first sentence names the bell, the ghost and the line it ran', () => {
    const night = runNight(NIGHT_1, freshPlan(NIGHT_1));
    const text = lossText(night);
    expect(text.headline).toBe('She is gone.');
    expect(text.sentences[0]).toBe('Bell 5. Wisp II reached the girl while running line 1: \u201cTHE wisp SHALL move toward the girl.\u201d');
    expect(night.bells).toBe(5);
  });

  it('M6.1: a level with one ghost of a kind names it without a numeral', () => {
    const text = lossText(runNight(PROLOGUE, freshPlan(PROLOGUE)));
    expect(text.sentences[0]).toBe('Bell 10. Wisp reached the girl while running line 1: \u201cTHE wisp SHALL move toward the girl.\u201d');
  });

  it('M6.1: when the girl walked into the ghost, the sentence says so and names her line', () => {
    const level: LevelDef = {
      id: 'walk',
      name: 'Walk',
      rows: ['#######', '#B.w.W#', '#######'],
      specText: 'THE girl SHALL walk toward the window.\nTHE wisp SHALL stay still.',
      items: [],
      cards: [],
    };
    const night = runNight(level, freshPlan(level));
    expect(night.outcome).toBe('lost');
    expect(lossText(night).sentences[0]).toBe('Bell 2. The girl walked into Wisp while following line 1: \u201cTHE girl SHALL walk toward the window.\u201d');
  });

  it('M6.2: a card that never fired because a line above it was true first reads like the example, with the bell from the recording', () => {
    const night = runNight(NIGHT_1, night1WithShadowedCard());
    expect(night.outcome).toBe('lost');
    const sentence = lossText(night).sentences.find((s) => s.startsWith('Line 2 of Wisp I'))!;
    expect(sentence).toBe('Line 2 of Wisp I (your card) never fired: line 1 was true first, so it shadowed it at bell 4.');
    const card = night.recording.frames.at(-1)!.actors.find((a) => a.id === 'wisp')!.lines[1]!;
    expect(night.stats.get(card.id)!.firstShadowed!.tick).toBe(4);
  });

  it('M6.3: a card whose condition was never true says so and names the condition', () => {
    let plan = must(insertCard(NIGHT_1, freshPlan(NIGHT_1), 0, 'wisp', 0));
    plan = must(insertCard(NIGHT_1, plan, 1, 'wisp-2', 0));
    const night = runNight(NIGHT_1, plan);
    expect(night.outcome).toBe('lost');
    const sentences = lossText(night).sentences;
    expect(sentences).toContain('Line 1 of Wisp I (your card) never fired: \u201cthe bell is near\u201d was never true when it was checked.');
    expect(sentences).toContain('Line 1 of Wisp II (your card) never fired: \u201cthe bell is near\u201d was never true when it was checked.');
  });

  it('M6.4: after a scheduled write, the text says when who wrote which line and that the lines under it moved down', () => {
    // Night IV: find a setup that loses after the sixth bell.
    const registry = levelChoices(NIGHT_4).choices();
    let found: NightRun | null = null;
    for (const choice of registry) {
      const night = runNight(NIGHT_4, planOfChoice(NIGHT_4, choice));
      if (night.outcome === 'lost' && night.bells > 6) {
        found = night;
        break;
      }
    }
    const night = must(found);
    const sentences = lossText(night).sentences;
    expect(sentences).toContain(
      'At bell 6, Wisp wrote itself a new line 1: \u201cWHEN the girl is near, THE wisp SHALL move toward the girl.\u201d The lines under it moved down by one.',
    );
  });

  it('M6.4: no write is mentioned when the night ended before it', () => {
    const text = lossText(runNight(NIGHT_4, freshPlan(NIGHT_4)));
    expect(text.sentences.some((s) => s.includes('wrote itself'))).toBe(false);
  });

  it('M6.5: says when a card is still in the tray, with the right number', () => {
    expect(lossText(runNight(NIGHT_1, freshPlan(NIGHT_1))).sentences.at(-1)).toBe('2 cards are still in your hand.');
    const one = must(insertCard(NIGHT_1, freshPlan(NIGHT_1), 0, 'girl', 0));
    expect(lossText(runNight(NIGHT_1, one)).sentences.at(-1)).toBe('A card is still in your hand.');
    expect(lossText(runNight(NIGHT_1, night1WithShadowedCard())).sentences.some((s) => s.includes('in your hand'))).toBe(false);
  });

  it('M6.6: shows cards before other lines', () => {
    let plan = must(placeItem(NIGHT_4, freshPlan(NIGHT_4), 'bell', 4, 3));
    plan = must(insertCard(NIGHT_4, plan, 0, 'wisp', 3));
    const sentences = lossText(runNight(NIGHT_4, plan)).sentences;
    const cardAt = sentences.findIndex((s) => s.includes('(your card)'));
    const otherAt = sentences.findIndex((s) => s.startsWith('Line 2 of Wisp never fired'));
    expect(cardAt).toBeGreaterThan(0);
    expect(otherAt).toBeGreaterThan(cardAt);
  });

  it('M6.6: shows at most four sentences after the first, and says how many more there are', () => {
    const cards = Array.from({ length: 6 }, () => ({ kw: 'WHEN' as const, cond: 'tick_after', act: 'stay', n: 50 }));
    const level: LevelDef = { ...PROLOGUE, id: 'many', name: 'Many', cards };
    let plan = freshPlan(level);
    for (let c = 0; c < cards.length; c++) plan = must(insertCard(level, plan, c, 'wisp', 0));
    const night = runNight(level, plan);
    expect(night.outcome).toBe('lost');
    const sentences = lossText(night).sentences;
    expect(MAX_DETAILS).toBe(4);
    expect(sentences).toHaveLength(1 + 4 + 1);
    expect(sentences.slice(1, 5).every((s) => s.includes('(your card) never fired'))).toBe(true);
    expect(sentences[5]).toBe('And 2 more.');
  });

  it('M6.7: every number outside a quotation is a bell or a line number that the recording has', () => {
    for (const plan of [night1WithShadowedCard(), freshPlan(NIGHT_1)]) {
      const night = runNight(NIGHT_1, plan);
      const allowed = new Set<number>(night.recording.traces.map((t) => t.tick));
      for (const frame of night.recording.frames) for (const a of frame.actors) a.lines.forEach((_, i) => allowed.add(i + 1));
      for (const sentence of lossText(night).sentences) {
        const outside = sentence.replace(/\u201c[^\u201d]*\u201d/g, '');
        // The numerals of the names (Wisp II) are letters; the numbers left are bells, lines and counts of cards in the tray.
        for (const m of outside.matchAll(/\b\d+\b/g)) {
          if (/cards are still in your hand/.test(sentence) || /^And \d+ more\.$/.test(sentence)) continue;
          expect(allowed.has(Number(m[0])), `${m[0]} in "${sentence}"`).toBe(true);
        }
      }
    }
  });
});

describe('dawnText', () => {
  it('M5.4: gives the number of lines that never fired, and the solver counts of this session', () => {
    const { firstSolution } = solveLevel(PROLOGUE);
    const night = runNight(PROLOGUE, planOfChoice(PROLOGUE, firstSolution!));
    expect(night.outcome).toBe('won');
    const text = dawnText(night, solveCounts(PROLOGUE));
    expect(text.headline).toBe('Dawn. She is still asleep.');
    expect(text.sentences[1]).toBe('4 of 29 possible setups survive this night. Yours is one of them.');
    expect(night.burned).toBe(0);
    expect(text.sentences[0]).toBe('Every line fired at least once tonight.');
  });

  it('M5.4: counts burned lines from the statistics, with the right plural', () => {
    const { firstSolution } = solveLevel(NIGHT_4);
    const night = runNight(NIGHT_4, planOfChoice(NIGHT_4, firstSolution!));
    expect(night.outcome).toBe('won');
    expect(night.burned).toBeGreaterThan(0);
    const word = night.burned === 1 ? 'line' : 'lines';
    expect(dawnText(night, solveCounts(NIGHT_4)).sentences[0]).toBe(
      `${night.burned} ${word} never fired all night and burned away. A rule that can never run is a bug in any spec.`,
    );
    expect(dawnText({ ...night, burned: 1 }, solveCounts(NIGHT_4)).sentences[0]).toMatch(/^1 line never fired/);
    expect(dawnText(night, { solutions: 12, total: 2145 }).sentences[1]).toBe('12 of 2,145 possible setups survive this night. Yours is one of them.');
  });

  it('M12.1: the counts come from the solver, are cached per level, and agree with a second search', () => {
    for (const level of [PROLOGUE, NIGHT_1, NIGHT_4]) {
      const counts = solveCounts(level);
      const again = solveLevel(level);
      expect(counts).toEqual({ solutions: again.solutions, total: again.total });
      expect(solveCounts(level)).toBe(counts);
    }
  });

  it('M12.1: the level the text is about is built from its own spec: the world has the lines the statistics count', () => {
    const night = runNight(NIGHT_1, freshPlan(NIGHT_1));
    expect(night.stats.size).toBe(buildWorld(NIGHT_1).actors.flatMap((a) => a.lines).length);
  });
});
