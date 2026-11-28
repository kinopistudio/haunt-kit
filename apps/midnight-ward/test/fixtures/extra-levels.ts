import type { LevelDef } from '../../src/levels';

/**
 * Night II and Night III are outside the product scope. They are test fixtures only: they run the
 * clock conditions, the candle actions and the snuffer through the oracle comparison.
 */
export const NIGHT_2: LevelDef = {
  id: 'night2',
  name: 'Night II',
  rows: ['#########', '#.......#', '#.B.....#', '#.......#', '#....s..#', '#.......#', '#......W#', '#########'],
  specText: `# Night II

WHEN the clock has struck 3, THE girl SHALL walk toward the window.

WHEN the girl is near, THE shade SHALL move toward the girl.
THE shade SHALL stay still.
`,
  items: ['salt', 'salt'],
  cards: [],
};

export const NIGHT_3: LevelDef = {
  id: 'night3',
  name: 'Night III',
  rows: ['#########', '#n......#', '#.....w.#', '#.......#', '#.......#', '#.......#', '#...B...#', '#########'],
  specText: `# Night III

THE girl SHALL stay still.

WHEN a lit candle is near, THE snuffer SHALL snuff the candle.
WHEN the girl is near, THE snuffer SHALL move toward the girl.
THE snuffer SHALL move toward the candle.

IF a lit candle is near, THEN THE wisp SHALL stay still.
THE wisp SHALL move toward the girl.
`,
  items: ['candle', 'salt'],
  cards: [],
};
