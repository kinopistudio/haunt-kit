// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPlay } from '../src/screens/play';
import type { Screen } from '../src/app';
import { testServices } from './fixtures/services';
import type { StubScene, TestServices } from './fixtures/services';

let root: HTMLElement;
let rig: TestServices;
let screen: Screen;

function open(id: string): StubScene {
  rig = testServices();
  root.replaceChildren();
  screen = mountPlay(root, rig.services, () => {}, { screen: 'night', id });
  return rig.scenes.at(-1)!;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => {
  screen?.destroy();
  vi.restoreAllMocks();
});

const q = <T extends Element = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
const qa = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
const tapTile = (scene: StubScene, x: number, y: number, item: number | null = null) => {
  scene.hitResult = { tile: { x, y }, item, actor: null };
  q('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
};
const live = () => q('#live').textContent;
const lines = (actor: string) => qa(`.hk-spec[data-actor="${actor}"] .hk-line .hk-txt`).map((n) => n.textContent);
const marks = (scene: StubScene) => scene.calls.filter((c) => c[0] === 'setMarks').map((c) => c[1] as Record<string, unknown>);
const pointer = (target: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  target.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1, pointerType: 'mouse', ...extra }));

describe('play screen: the tray and the book', () => {
  it('M3.1: the tray shows every item type with the number left, and every card as its EARS sentence', () => {
    open('night1');
    const tool = q('[data-tool="bell"]');
    expect(tool.textContent).toContain('Bell');
    expect(tool.textContent).toContain('1 left');
    const cards = qa('.card');
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.querySelector('.sentence')!.textContent)).toEqual([
      'IF the bell is near, THEN THE ghost SHALL stay still.',
      'IF the bell is near, THEN THE ghost SHALL stay still.',
    ]);
    open('prologue');
    expect(qa('.tool')).toHaveLength(1);
    expect(q('[data-tool="salt"]').textContent).toContain('1 left');
    expect(qa('.card')).toHaveLength(0);
  });

  it('M3.9: the spec book shows every spec as it will be run, with the cards in place, while the player plans', () => {
    const scene = open('night1');
    expect(qa('.hk-spec').map((p) => p.querySelector('.hk-title')!.textContent)).toEqual(['The girl', 'Wisp I', 'Wisp II']);
    expect(lines('wisp')).toEqual(['THE wisp SHALL move toward the girl.']);
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="0"]').click();
    expect(lines('wisp')).toEqual(['IF the bell is near, THEN THE wisp SHALL stay still.', 'THE wisp SHALL move toward the girl.']);
    expect(scene.calls.some((c) => c[0] === 'setWorld')).toBe(true);
  });

  it('M3.9: a ghost spec says how far "near" reaches, and the writes still to come show as notes', () => {
    open('night4');
    const notes = qa('.hk-spec[data-actor="wisp"] .hk-note').map((n) => n.textContent);
    expect(notes).toContain('At bell 6, this spec writes itself a new line 1: \u201cWHEN the girl is near, THE wisp SHALL move toward the girl.\u201d');
    expect(notes.some((n) => n!.includes('the girl is near: within 3 steps'))).toBe(true);
  });

  it('M8.10: the scene is told the numerals of ghosts that share a kind', () => {
    const scene = open('night1');
    const call = scene.calls.filter((c) => c[0] === 'setNumerals').at(-1)!;
    expect(call[1]).toEqual({ girl: '', wisp: 'I', 'wisp-2': 'II' });
  });
});

describe('play screen: items', () => {
  it('M3.2: selecting an item and tapping a free tile places it and reduces the count', () => {
    const scene = open('night1');
    q('[data-tool="bell"]').click();
    expect(q('[data-tool="bell"]').getAttribute('aria-pressed')).toBe('true');
    tapTile(scene, 4, 3);
    const world = scene.calls.filter((c) => c[0] === 'setWorld').at(-1)![1] as { items: { type: string; pos: { x: number; y: number } }[] };
    expect(world.items.map((i) => [i.type, i.pos.x, i.pos.y])).toEqual([['bell', 4, 3]]);
    expect(q('[data-tool="bell"]').textContent).toContain('0 left');
    expect(q<HTMLButtonElement>('[data-tool="bell"]').disabled).toBe(true);
    expect(q('[data-tool="bell"]').getAttribute('aria-pressed')).toBe('false');
    expect(live()).toBe('Bell placed at column 5, row 4.');
  });

  it('M3.3: a wall, a ghost, the bed or an occupied tile refuses the item and keeps the selection', () => {
    const scene = open('night1');
    q('[data-tool="bell"]').click();
    for (const [x, y] of [[0, 0], [1, 1], [4, 4]] as const) {
      tapTile(scene, x, y);
      expect(live()).toBe('That tile is not free.');
      expect(q('[data-tool="bell"]').textContent).toContain('1 left');
    }
    expect(q('[data-tool="bell"]').getAttribute('aria-pressed')).toBe('true');
    tapTile(scene, 4, 3);
    expect(q('[data-tool="bell"]').textContent).toContain('0 left');
  });

  it('M3.2: tapping a tile with nothing selected places nothing', () => {
    const scene = open('night1');
    tapTile(scene, 4, 3);
    expect(q('[data-tool="bell"]').textContent).toContain('1 left');
  });

  it('M3.4: tapping a placed item takes it back into the tray and selects its type', () => {
    const scene = open('night1');
    q('[data-tool="bell"]').click();
    tapTile(scene, 4, 3);
    tapTile(scene, 4, 3, 0);
    expect(q('[data-tool="bell"]').textContent).toContain('1 left');
    expect(q('[data-tool="bell"]').getAttribute('aria-pressed')).toBe('true');
    expect(live()).toBe('Bell taken back from column 5, row 4.');
    tapTile(scene, 2, 2);
    expect(q('[data-tool="bell"]').textContent).toContain('0 left');
  });

  it('M3.5: dragging an item from the tray onto a free tile places it, and a drop elsewhere leaves it in the tray', () => {
    const scene = open('night1');
    const tool = q('[data-tool="bell"]');
    scene.hitResult = { tile: { x: 3, y: 2 }, item: null, actor: null };
    pointer(tool, 'pointerdown', 10, 10);
    pointer(tool, 'pointermove', 40, 40);
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    pointer(tool, 'pointerup', 40, 40);
    expect(document.querySelector('.drag-ghost')).toBeNull();
    expect(q('[data-tool="bell"]').textContent).toContain('0 left');

    const second = open('night1');
    const again = q('[data-tool="bell"]');
    second.hitResult = { tile: { x: 0, y: 0 }, item: null, actor: null };
    pointer(again, 'pointerdown', 10, 10);
    pointer(again, 'pointermove', 40, 40);
    pointer(again, 'pointerup', 40, 40);
    expect(q('[data-tool="bell"]').textContent).toContain('1 left');
    expect(q('[data-tool="bell"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('M3.5: a press on a tray item that does not move is a tap, not a drag', () => {
    open('night1');
    const tool = q('[data-tool="bell"]');
    pointer(tool, 'pointerdown', 10, 10);
    pointer(tool, 'pointermove', 12, 11);
    pointer(tool, 'pointerup', 12, 11);
    expect(document.querySelector('.drag-ghost')).toBeNull();
    tool.click();
    expect(q('[data-tool="bell"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('M3.5: with a mouse, a placed item can be dragged to another tile, and a failed drop puts it back', () => {
    const scene = open('night1');
    q('[data-tool="bell"]').click();
    tapTile(scene, 4, 3);
    const canvas = q('canvas');
    scene.hitResult = { tile: { x: 4, y: 3 }, item: 0, actor: null };
    pointer(canvas, 'pointerdown', 100, 100);
    pointer(canvas, 'pointermove', 140, 140);
    scene.hitResult = { tile: { x: 5, y: 5 }, item: null, actor: null };
    pointer(canvas, 'pointermove', 150, 150);
    pointer(canvas, 'pointerup', 150, 150);
    let world = scene.calls.filter((c) => c[0] === 'setWorld').at(-1)![1] as { items: { pos: { x: number; y: number } }[] };
    expect(world.items.map((i) => [i.pos.x, i.pos.y])).toEqual([[5, 5]]);

    scene.hitResult = { tile: { x: 5, y: 5 }, item: 0, actor: null };
    pointer(canvas, 'pointerdown', 100, 100);
    pointer(canvas, 'pointermove', 140, 140);
    scene.hitResult = { tile: { x: 0, y: 0 }, item: null, actor: null };
    pointer(canvas, 'pointerup', 140, 140);
    world = scene.calls.filter((c) => c[0] === 'setWorld').at(-1)![1] as typeof world;
    expect(world.items.map((i) => [i.pos.x, i.pos.y])).toEqual([[5, 5]]);
    expect(q('[data-tool="bell"]').textContent).toContain('0 left');
  });

  it('M3.9: the scene is told to show the range of an item that is selected over a free tile, and of none over a wall', () => {
    const scene = open('night1');
    q('[data-tool="bell"]').click();
    const canvas = q('canvas');
    scene.hitResult = { tile: { x: 3, y: 3 }, item: null, actor: null };
    pointer(canvas, 'pointermove', 50, 50);
    expect(marks(scene).at(-1)).toMatchObject({ hover: { x: 3, y: 3, ok: true }, preview: { type: 'bell', x: 3, y: 3 } });
    scene.hitResult = { tile: { x: 0, y: 3 }, item: null, actor: null };
    pointer(canvas, 'pointermove', 51, 50);
    expect(marks(scene).at(-1)).toMatchObject({ hover: { x: 0, y: 3, ok: false }, preview: null });
  });
});

describe('play screen: cards', () => {
  it('M3.6: selecting a card opens a slot above and below every line of every spec', () => {
    open('night1');
    expect(qa('.hk-slot')).toHaveLength(0);
    q('[data-card="0"]').click();
    expect(qa('.hk-spec[data-actor="girl"] .hk-slot')).toHaveLength(2);
    expect(qa('.hk-slot')).toHaveLength(6);
    q('[data-card="0"]').click();
    expect(qa('.hk-slot')).toHaveLength(0);
  });

  it('M3.6: choosing a slot writes the card at that line and moves the lines below it down', () => {
    open('night4');
    expect(lines('wisp')).toHaveLength(3);
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="1"]').click();
    expect(lines('wisp')).toEqual([
      'WHEN the girl is near, THE wisp SHALL move toward the girl.',
      'IF the bell is near, THEN THE wisp SHALL move away from the girl.',
      'IF the bell is near, THEN THE wisp SHALL move away from the girl.',
      'THE wisp SHALL move toward the girl.',
    ]);
    expect(qa('.hk-slot')).toHaveLength(0);
    expect(live()).toBe('Card written at line 2 of Wisp. The lines below it moved down.');
  });

  it('M3.8: the inserted card is a card line with a remove control, the card in the tray looks used, and the control returns it', () => {
    open('night1');
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp-2"] .hk-slot[data-at="0"]').click();
    const card = q('.hk-spec[data-actor="wisp-2"] .hk-line.hk-origin-card');
    expect(card).not.toBeNull();
    const remove = card.querySelector<HTMLButtonElement>('.hk-rm')!;
    expect(remove).not.toBeNull();
    expect(q('[data-card="0"]').classList.contains('used')).toBe(true);
    expect(q<HTMLButtonElement>('[data-card="0"]').disabled).toBe(true);
    expect(q('[data-card="1"]').classList.contains('used')).toBe(false);
    remove.click();
    expect(qa('.hk-origin-card')).toHaveLength(0);
    expect(q('[data-card="0"]').classList.contains('used')).toBe(false);
    expect(live()).toBe('Card taken out of Wisp II. It is back in the tray.');
  });

  it('M3.8: a card is in at most one spec: both cards can be placed, each once', () => {
    open('night1');
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="0"]').click();
    q('[data-card="1"]').click();
    q('.hk-spec[data-actor="wisp-2"] .hk-slot[data-at="0"]').click();
    expect(qa('.hk-origin-card')).toHaveLength(2);
    expect(qa('.card.used')).toHaveLength(2);
    expect(qa('.hk-slot')).toHaveLength(0);
  });

  it('M3.7: dragging a card over a slot marks it as the drop target, and dropping inserts the card', () => {
    open('night1');
    const card = q('[data-card="0"]');
    pointer(card, 'pointerdown', 10, 10);
    pointer(card, 'pointermove', 60, 60);
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    const slot = q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="1"]');
    const original = document.elementFromPoint;
    document.elementFromPoint = () => slot;
    try {
      pointer(card, 'pointermove', 70, 70);
      expect(slot.classList.contains('hk-hot')).toBe(true);
      pointer(card, 'pointerup', 70, 70);
    } finally {
      document.elementFromPoint = original;
    }
    expect(document.querySelector('.drag-ghost')).toBeNull();
    expect(lines('wisp')).toEqual(['THE wisp SHALL move toward the girl.', 'IF the bell is near, THEN THE wisp SHALL stay still.']);
    expect(qa('.hk-hot')).toHaveLength(0);
  });

  it('M3.7: dropping a card anywhere else leaves it in the tray and closes the slots', () => {
    open('night1');
    const card = q('[data-card="0"]');
    pointer(card, 'pointerdown', 10, 10);
    pointer(card, 'pointermove', 60, 60);
    const original = document.elementFromPoint;
    document.elementFromPoint = () => document.body;
    try {
      pointer(card, 'pointerup', 60, 60);
    } finally {
      document.elementFromPoint = original;
    }
    expect(qa('.hk-origin-card')).toHaveLength(0);
    expect(qa('.hk-slot')).toHaveLength(0);
    expect(q('[data-card="0"]').classList.contains('used')).toBe(false);
  });
});

describe('play screen: clearing and keyboard', () => {
  it('M3.10: Clear board returns every item and card to the tray', () => {
    const scene = open('night1');
    q('[data-tool="bell"]').click();
    tapTile(scene, 4, 3);
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="0"]').click();
    q('#clear').click();
    expect(q('[data-tool="bell"]').textContent).toContain('1 left');
    expect(qa('.card.used')).toHaveLength(0);
    expect(qa('.hk-origin-card')).toHaveLength(0);
    expect(live()).toContain('Board cleared');
  });

  it('M3.12: with the keyboard alone, the arrows move a tile cursor, Enter places the item, and Enter on it picks it up', () => {
    const scene = open('night1');
    const canvas = q('canvas');
    const key = (k: string) => canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new Event('focus'));
    // The cursor starts on the free tile nearest the middle of the room.
    expect(marks(scene).at(-1)!.cursor).toEqual({ x: 5, y: 4 });
    q('[data-tool="bell"]').click();
    key('ArrowLeft');
    key('ArrowUp');
    expect(marks(scene).at(-1)!.cursor).toEqual({ x: 4, y: 3 });
    expect(live()).toBe('Column 5, row 4. Free floor.');
    key('Enter');
    expect(q('[data-tool="bell"]').textContent).toContain('0 left');
    expect(live()).toBe('Bell placed at column 5, row 4.');
    key('Enter');
    expect(q('[data-tool="bell"]').textContent).toContain('1 left');
    expect(q('[data-tool="bell"]').getAttribute('aria-pressed')).toBe('true');
    key('Escape');
    expect(q('[data-tool="bell"]').getAttribute('aria-pressed')).toBe('false');
    canvas.dispatchEvent(new Event('blur'));
    expect(marks(scene).at(-1)!.cursor).toBeNull();
  });

  it('M3.12: the keyboard cursor stops at walls', () => {
    const scene = open('night1');
    const canvas = q('canvas');
    canvas.dispatchEvent(new Event('focus'));
    for (let i = 0; i < 12; i++) canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(marks(scene).at(-1)!.cursor).toEqual({ x: 1, y: 4 });
  });

  it('M3.12: the tray buttons and the slots are buttons, so the Tab key reaches them', () => {
    open('night1');
    q('[data-card="0"]').click();
    for (const b of [...qa('.tool'), ...qa('.card'), ...qa('.hk-slot')]) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('tabindex')).not.toBe('-1');
    }
    expect(q('canvas').tabIndex).toBe(0);
    expect(q('#live').getAttribute('aria-live')).toBe('polite');
  });

  it('M3.12: Enter on a ghost\'s tile shows its page in the book, and again hides it', () => {
    const scene = open('night1');
    const canvas = q('canvas');
    canvas.dispatchEvent(new Event('focus'));
    // Walk to the first wisp's tile at (1, 1).
    const key = (k: string) => canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp']) key(k);
    expect(live()).toBe('Column 2, row 2. Wisp I starts here.');
    key('Enter');
    expect(q('.hk-spec[data-actor="wisp"]').classList.contains('hk-focus')).toBe(true);
    expect(marks(scene).at(-1)!.focus).toBe('wisp');
    key('Enter');
    expect(q('.hk-spec[data-actor="wisp"]').classList.contains('hk-focus')).toBe(false);
  });
});
