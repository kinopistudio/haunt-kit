// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardChoice } from 'haunt-kit';
import { NIGHT_4 } from '../src/levels';
import type { LevelDef } from '../src/levels';
import { floorTiles } from '../src/plan';
import { mountPlay } from '../src/screens/play';
import type { Screen } from '../src/app';
import { solveLevel } from '../src/solve';
import { testServices } from './fixtures/services';
import type { StubScene, TestServices } from './fixtures/services';

let root: HTMLElement;
let rig: TestServices;
let screen: Screen;
let scene: StubScene;

function open(id: string, options: { reduced?: boolean } = {}): void {
  rig = testServices(options);
  root.replaceChildren();
  screen = mountPlay(root, rig.services, () => {}, { screen: 'night', id });
  scene = rig.scenes.at(-1)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => {
  screen?.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const q = <T extends Element = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
const qa = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
const tapTile = (x: number, y: number) => {
  scene.hitResult = { tile: { x, y }, item: null, actor: null };
  q('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const clock = () => q('.clock-state').textContent;
const pips = () => qa('.pip.on').length;
const worlds = () => scene.calls.filter((c) => c[0] === 'setWorld');
const bookSnapshot = () => qa('.hk-line').map((l) => `${l.dataset.actor}:${l.dataset.idx}:${l.className}:${l.querySelector('.hk-tally')!.textContent}:${l.querySelector('.hk-glyph')!.textContent}`);
const lineEl = (actor: string, index: number) => q(`.hk-spec[data-actor="${actor}"] .hk-line[data-idx="${index}"]`);

/** Plays a choice of the solver on the screen: items by tapping tiles, cards by choosing slots. */
function playChoice(level: LevelDef, choice: BoardChoice): void {
  const tiles = floorTiles(level);
  level.items.forEach((type, k) => {
    q(`[data-tool="${type}"]`).click();
    const tile = tiles[choice.tiles[k]!]!;
    tapTile(tile.x, tile.y);
  });
  choice.cards.forEach((place, c) => {
    if (!place) return;
    q(`[data-card="${c}"]`).click();
    q(`.hk-spec[data-actor="${place.actor}"] .hk-slot[data-at="${place.at}"]`).click();
  });
}

/** Lets the replay run to its end. */
const finish = () => vi.advanceTimersByTime(20000);

function winNight4(): void {
  open('night4');
  playChoice(NIGHT_4, solveLevel(NIGHT_4).firstSolution!);
  q('#ring').click();
}

describe('play screen: ringing the night', () => {
  it('M4.1 / M4.2: ringing records the night and starts the replay by itself: the first bell at once, then one bell at a time', () => {
    open('night1');
    q('#ring').click();
    expect(q('.dock').dataset.phase).toBe('night');
    expect(clock()).toBe('Bell 1 of 12');
    vi.advanceTimersByTime(619);
    expect(clock()).toBe('Bell 1 of 12');
    vi.advanceTimersByTime(1);
    expect(clock()).toBe('Bell 2 of 12');
    expect(q('.hk-position').textContent).toBe('Bell 2 of 5');
  });

  it('M4.2: the replay bar has play, pause, step, step back, scrub and speed', () => {
    open('night1');
    q('#ring').click();
    for (const selector of ['.hk-play', '.hk-start', '.hk-back', '.hk-step', '.hk-end', '.hk-scrub', '.hk-speed']) expect(q(selector), selector).not.toBeNull();
    q('.hk-play').click();
    expect(q('.hk-play').textContent).toBe('Play');
    const at = clock();
    vi.advanceTimersByTime(5000);
    expect(clock()).toBe(at);
    q('.hk-step').click();
    expect(clock()).toBe('Bell 2 of 12');
    q('.hk-back').click();
    expect(clock()).toBe('Bell 1 of 12');
  });

  it('M4.4: the clock has twelve pips, lit up to the cursor, and a label for planning, a bell, a capture and dawn', () => {
    open('night1');
    expect(qa('.pip')).toHaveLength(12);
    expect([pips(), clock()]).toEqual([0, 'Planning']);
    q('#ring').click();
    expect([pips(), clock()]).toEqual([1, 'Bell 1 of 12']);
    q('.hk-step').click();
    q('.hk-step').click();
    expect([pips(), clock()]).toEqual([3, 'Bell 3 of 12']);
    q('.hk-end').click();
    expect([pips(), clock()]).toEqual([5, 'Caught at bell 5']);

    screen.destroy();
    open('prologue');
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    finish();
    expect([pips(), clock()]).toEqual([12, 'Dawn']);
  });

  it('M4.3: at each bell the book shows the marks of that bell: the line that ran is lit, with its tally', () => {
    open('night1');
    q('#ring').click();
    expect(lineEl('wisp', 0).classList.contains('hk-mark-lit')).toBe(true);
    expect(lineEl('wisp', 0).querySelector('.hk-glyph')!.textContent).toBe('\u2713');
    expect(lineEl('wisp', 0).querySelector('.hk-tally')!.textContent).toBe('\u00D71');
    q('.hk-step').click();
    expect(lineEl('wisp', 0).querySelector('.hk-tally')!.textContent).toBe('\u00D72');
    q('.hk-start').click();
    expect(lineEl('wisp', 0).classList.contains('hk-mark-idle')).toBe(true);
    expect(lineEl('wisp', 0).querySelector('.hk-tally')!.textContent).toBe('');
  });

  it('M4.3: the scene shows the world frame of the cursor, and the chip of the line each actor ran', () => {
    open('night1');
    q('#ring').click();
    const chips = scene.calls.filter((c) => c[0] === 'setChips').at(-1)![1] as Map<string, number>;
    expect([...chips.entries()].sort()).toEqual([['girl', 1], ['wisp', 1], ['wisp-2', 1]]);
    const frame = worlds().at(-1)![1] as { tick: number };
    expect(frame.tick).toBe(1);
    q('.hk-end').click();
    expect((worlds().at(-1)![1] as { tick: number }).tick).toBe(5);
    q('.hk-start').click();
    expect((worlds().at(-1)![1] as { tick: number }).tick).toBe(0);
  });

  it('M4.7: moving the cursor with the scrubber shows exactly what stepping to that bell shows', () => {
    const snapshots: string[][] = [];
    open('night1');
    q('#ring').click();
    q('.hk-play').click();
    for (let bell = 1; bell <= 5; bell++) {
      if (bell > 1) q('.hk-step').click();
      snapshots[bell] = bookSnapshot();
    }
    for (const bell of [3, 5, 1, 4, 2, 5]) {
      const range = q<HTMLInputElement>('.hk-scrub');
      range.value = String(bell);
      range.dispatchEvent(new Event('input'));
      expect(clock()).toBe(bell === 5 ? 'Caught at bell 5' : `Bell ${bell} of 12`);
      expect(bookSnapshot(), `bell ${bell}`).toEqual(snapshots[bell]);
    }
  });

  it('M4.5: while a night is shown the plan is locked, and Back to planning gives the plan back as it was', () => {
    open('night1');
    q('[data-tool="bell"]').click();
    tapTile(4, 3);
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="0"]').click();
    q('#ring').click();
    expect(qa('.tool, .card').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(qa('.hk-slot, .hk-rm')).toHaveLength(0);
    tapTile(2, 2);
    scene.hitResult = { tile: { x: 4, y: 3 }, item: 0, actor: null };
    q('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    q('#back-to-plan').click();
    expect(q('.dock').dataset.phase).toBe('plan');
    expect(clock()).toBe('Planning');
    expect(q('[data-tool="bell"]').textContent).toContain('0 left');
    expect(q('[data-card="0"]').classList.contains('used')).toBe(true);
    expect(qa('.hk-origin-card')).toHaveLength(1);
    expect(qa('.hk-mark-lit')).toHaveLength(0);
    vi.advanceTimersByTime(5000);
    expect(clock()).toBe('Planning');
  });

  it('M4.1: ringing again after going back plays the new setup', () => {
    open('prologue');
    q('#ring').click();
    finish();
    expect(clock()).toMatch(/^Caught at bell/);
    q('#back-to-plan').click();
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    finish();
    expect(clock()).toBe('Dawn');
  });
});

describe('play screen: sound and effects of a bell', () => {
  it('M10.1: a bell tolls at each bell that is played, and a scrub is silent', () => {
    open('night1');
    const toll = vi.spyOn(rig.sfx, 'toll');
    q('#ring').click();
    expect(toll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(620);
    expect(toll).toHaveBeenCalledTimes(2);
    const range = q<HTMLInputElement>('.hk-scrub');
    range.value = '4';
    range.dispatchEvent(new Event('input'));
    range.value = '1';
    range.dispatchEvent(new Event('input'));
    q('.hk-start').click();
    q('.hk-end').click();
    expect(toll).toHaveBeenCalledTimes(2);
  });

  it('M9.1: at each bell, an ink thread runs from the line that fired to each actor that ran a line', () => {
    open('night1');
    q('#ring').click();
    expect(rig.fx.threads).toHaveLength(3);
    expect(rig.fx.threads.every((t) => t.to.x === 100)).toBe(true);
    expect(rig.fx.threads.map((t) => t.color)).toEqual(['rgba(232, 217, 181, .9)', 'rgba(127, 209, 199, .95)', 'rgba(127, 209, 199, .95)']);
    expect(rig.fx.threads.every((t) => t.ms === 700)).toBe(true);
    q('.hk-step').click();
    expect(rig.fx.threads).toHaveLength(6);
    q('.hk-start').click();
    q('.hk-end').click();
    expect(rig.fx.threads).toHaveLength(6);
  });

  it('M9.1: at speed ×2 a thread takes 380 ms and the glide 200 ms', () => {
    open('night1');
    q('.hk-speed').click();
    q('#ring').click();
    expect(rig.fx.threads.every((t) => t.ms === 380)).toBe(true);
    const world = worlds().at(-1)!;
    expect((world[2] as { animate: boolean; tickMs: number }).tickMs).toBe(200);
    expect((world[2] as { animate: boolean }).animate).toBe(true);
  });

  it('M8.9: a bell glides the characters, and a jump does not', () => {
    open('night1');
    q('#ring').click();
    expect((worlds().at(-1)![2] as { animate: boolean; tickMs: number })).toEqual({ animate: true, tickMs: 560 });
    q('.hk-end').click();
    expect((worlds().at(-1)![2] as { animate: boolean }).animate).toBe(false);
  });

  it('M9.5: with reduced motion no thread and no ash is drawn, and the end states are shown at once', () => {
    open('prologue', { reduced: true });
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    finish();
    expect(rig.fx.threads).toHaveLength(0);
    expect(rig.fx.ashed).toHaveLength(0);
    expect(clock()).toBe('Dawn');
    expect(qa('.hk-mark-gold').length).toBeGreaterThan(0);
  });
});

describe('play screen: losing', () => {
  it('M9.2: a line that was true but lost to a line above it is shadowed, in mouldy green with ◐', () => {
    open('night1');
    q('[data-tool="bell"]').click();
    tapTile(4, 3);
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="1"]').click();
    q('#ring').click();
    q('.hk-end').click();
    q('.hk-back').click();
    q('.hk-back').click();
    // The card sits at line 2 under an always-true line. It is true from bell 4 on, and never runs.
    const range = q<HTMLInputElement>('.hk-scrub');
    range.value = '4';
    range.dispatchEvent(new Event('input'));
    const card = lineEl('wisp', 1);
    expect(card.classList.contains('hk-mark-shadowed')).toBe(true);
    expect(card.querySelector('.hk-glyph')!.textContent).toBe('\u25D0');
    expect(card.querySelector('.hk-sr')!.textContent).toBe('true, but a line above ran first');
  });

  it('M5.1: when the ghost reaches the girl, the night ends at that bell: the girl\'s line is struck through in red, the scene is tinted, the sting plays and the explanation shows', () => {
    open('night1');
    const sting = vi.spyOn(rig.sfx, 'sting');
    q('[data-tool="bell"]').click();
    tapTile(4, 3);
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="1"]').click();
    q('#ring').click();
    finish();
    expect(clock()).toBe('Caught at bell 5');
    expect(sting).toHaveBeenCalledTimes(1);
    expect(scene.currentPhase).toBe('caught');
    expect(lineEl('girl', 0).classList.contains('hk-mark-struck')).toBe(true);
    expect(lineEl('girl', 0).querySelector('.hk-glyph')!.textContent).toBe('\u2717');
    const verdict = q('.verdict');
    expect(verdict.classList.contains('lost')).toBe(true);
    expect(verdict.querySelector('.head')!.textContent).toBe('She is gone.');
    const sentences = [...verdict.querySelectorAll('p')].map((p) => p.textContent);
    expect(sentences[1]).toBe('Bell 5. Wisp II reached the girl while running line 1: \u201cTHE wisp SHALL move toward the girl.\u201d');
    expect(sentences).toContain('Line 2 of Wisp I (your card) never fired: line 1 was true first, so it shadowed it at bell 4.');
    expect(sentences).toContain('A card is still in your hand.');
    expect(q('.dock').dataset.phase).toBe('night');
  });

  it('M5.2: Try again goes back to planning with the plan as it was', () => {
    open('night1');
    q('[data-tool="bell"]').click();
    tapTile(4, 3);
    q('#ring').click();
    finish();
    q('#retry').click();
    expect(clock()).toBe('Planning');
    expect(q('.verdict').children).toHaveLength(0);
    expect(q('[data-tool="bell"]').textContent).toContain('0 left');
    const world = worlds().at(-1)![1] as { items: { pos: { x: number; y: number } }[] };
    expect(world.items.map((i) => [i.pos.x, i.pos.y])).toEqual([[4, 3]]);
    expect(scene.currentPhase).toBe('plan');
  });

  it('M5.6: the outcome appears only at the last bell, goes away when the cursor moves back, and comes back at the end', () => {
    open('night1');
    q('#ring').click();
    expect(q('.verdict').children).toHaveLength(0);
    finish();
    expect(q('.verdict .head').textContent).toBe('She is gone.');
    q('.hk-back').click();
    expect(q('.verdict').children).toHaveLength(0);
    expect(scene.currentPhase).toBe('night');
    expect(lineEl('girl', 0).classList.contains('hk-mark-struck')).toBe(false);
    q('.hk-end').click();
    expect(q('.verdict .head').textContent).toBe('She is gone.');
    expect(lineEl('girl', 0).classList.contains('hk-mark-struck')).toBe(true);
  });

  it('M5.6: the outcome is announced to screen readers, and the main button gets the focus', () => {
    open('night1');
    q('#ring').click();
    finish();
    expect(q('.verdict').getAttribute('aria-live')).toBe('polite');
    expect(q('#live').textContent).toBe('She is gone.');
    expect(document.activeElement).toBe(q('#retry'));
  });

  it('M4.5: nothing is saved as cleared after a loss', () => {
    open('night1');
    q('#ring').click();
    finish();
    expect(rig.services.progress.cleared()).toEqual([]);
  });
});

describe('play screen: winning', () => {
  it('M5.3: when the twelfth bell passes with the girl safe, the dawn shows: lines that never ran burn to ash, the others are gold, with the chime', () => {
    open('night4');
    const chime = vi.spyOn(rig.sfx, 'chime');
    playChoice(NIGHT_4, solveLevel(NIGHT_4).firstSolution!);
    q('#ring').click();
    finish();
    expect(clock()).toBe('Dawn');
    expect(chime).toHaveBeenCalledTimes(1);
    expect(scene.currentPhase).toBe('dawn');
    expect(q('.verdict .head').textContent).toBe('Dawn. She is still asleep.');
    const gold = qa('.hk-mark-gold');
    const ash = qa('.hk-mark-ash');
    expect(gold.length).toBeGreaterThan(0);
    expect(ash.length).toBeGreaterThan(0);
    expect(gold.length + ash.length).toBe(qa('.hk-line').length);
    for (const line of gold) expect(line.querySelector('.hk-glyph')!.textContent).toBe('\u2713');
    for (const line of ash) expect(line.querySelector('.hk-glyph')!.textContent).toBe('\u2717');
    expect(qa('.hk-animate')).toHaveLength(1);
    expect(q('.dawn-card').hidden).toBe(false);
  });

  it('M9.3: ash rises from each line that burns, one after the other, and not from the lines that turn gold', () => {
    winNight4();
    finish();
    const burning = qa('.hk-mark-ash').length;
    expect(burning).toBeGreaterThan(0);
    expect(rig.fx.ashed).toHaveLength(burning);
  });

  it('M5.4: the dawn text gives the number of lines that never fired and the solver counts of this session', () => {
    winNight4();
    finish();
    const text = [...qa('.verdict p')].map((p) => p.textContent!);
    expect(text[1]).toMatch(/^\d+ lines? never fired all night and burned away\./);
    expect(text[1]).toContain(`${qa('.hk-mark-ash').length} line`);
    expect(text[2]).toBe('7 of 329 possible setups survive this night. Yours is one of them.');
  });

  it('M5.5: a won night offers the next night, and the last night offers the way back to the nights', () => {
    open('prologue');
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    finish();
    expect(q('#next').textContent).toBe('Go to Night I');
    screen.destroy();
    winNight4();
    finish();
    expect(q('#next').textContent).toBe('Back to the nights');
  });

  it('M2.4: a won night is stored as cleared', () => {
    open('prologue');
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    expect(rig.services.progress.isCleared('prologue')).toBe(false);
    finish();
    expect(rig.services.progress.isCleared('prologue')).toBe(true);
    expect(rig.storage.data.get('mw.cleared')).toBe('["prologue"]');
  });

  it('M5.6: scrubbing back from dawn hides the outcome and the gold and ash', () => {
    open('prologue');
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    finish();
    q('.hk-back').click();
    expect(q('.verdict').children).toHaveLength(0);
    expect(qa('.hk-mark-gold, .hk-mark-ash')).toHaveLength(0);
    expect(scene.currentPhase).toBe('night');
  });

  it('M4.6: when a scheduled write happens the new line appears in red ink that bleeds through, with the scratch', () => {
    open('night4');
    playChoice(NIGHT_4, solveLevel(NIGHT_4).firstSolution!);
    q('#ring').click();
    q('.hk-play').click();
    const scratch = vi.spyOn(rig.sfx, 'scratch');
    for (let i = 1; i < 5; i++) q('.hk-step').click();
    expect(qa('.hk-origin-rewrite')).toHaveLength(0);
    expect(qa('.hk-note-rewrite').map((n) => n.textContent)).toEqual([expect.stringContaining('At bell 6, this spec writes itself a new line 1')]);
    scratch.mockClear();
    q('.hk-step').click();
    const written = qa('.hk-origin-rewrite');
    expect(written).toHaveLength(1);
    expect(written[0]!.classList.contains('hk-bleed')).toBe(true);
    expect(written[0]!.querySelector('.hk-txt')!.textContent).toBe('WHEN the girl is near, THE wisp SHALL move toward the girl.');
    expect(written[0]!.dataset.idx).toBe('0');
    expect(scratch).toHaveBeenCalled();
    expect(qa('.hk-note-rewrite')).toHaveLength(0);
    q('.hk-step').click();
    expect(qa('.hk-bleed')).toHaveLength(0);
    // Scrubbing back before the write takes the new line away again.
    const range = q<HTMLInputElement>('.hk-scrub');
    range.value = '3';
    range.dispatchEvent(new Event('input'));
    expect(qa('.hk-origin-rewrite')).toHaveLength(0);
  });

  it('M12.1: the bell numbers and tallies on the screen are read from the recording: the tally of the girl\'s line is the number of bells played', () => {
    open('prologue');
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    finish();
    expect(lineEl('girl', 0).querySelector('.hk-tally')!.textContent).toBe('\u00D712');
    expect(lineEl('wisp', 0).querySelector('.hk-tally')!.textContent).toBe('\u00D712');
  });
});

describe('play screen: reading the page', () => {
  it('M2.5: the play screen always has a way back to the nights and a mute toggle', () => {
    open('night1');
    for (const phase of ['plan', 'night']) {
      if (phase === 'night') q('#ring').click();
      expect(q<HTMLAnchorElement>('a.back').getAttribute('href')).toBe('#/nights');
      expect(q('button.mute')).not.toBeNull();
    }
  });

  it('M4.4: the page says which phase it is in', () => {
    open('night1');
    expect(q('.play').dataset.phase).toBe('plan');
    q('#ring').click();
    expect(q('.play').dataset.phase).toBe('night');
  });

  it('M8.10: the scene shows the numerals during the night as well', () => {
    open('night1');
    q('#ring').click();
    expect(scene.calls.filter((c) => c[0] === 'setNumerals').at(-1)![1]).toEqual({ girl: '', wisp: 'I', 'wisp-2': 'II' });
  });
});
