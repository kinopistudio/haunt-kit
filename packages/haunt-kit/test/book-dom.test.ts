// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SpecBook } from '../src/index';
import type { BookView, LineMark } from '../src/index';

const base = (overrides: Partial<BookView> = {}): BookView => ({
  actors: [
    {
      id: 'a',
      title: 'Actor A',
      badge: 'spec a',
      tension: 0.5,
      lines: [
        { id: 10, text: 'THE a SHALL stay.', origin: 'spec' },
        { id: 11, text: 'WHEN x, THE a SHALL go.', origin: 'card' },
      ],
      notes: [{ text: 'Rewrites at tick 6.', tone: 'rewrite' }],
    },
    { id: 'b', title: 'Actor B', lines: [{ id: 20, text: 'THE b SHALL wait.', origin: 'spec' }] },
  ],
  ...overrides,
});

let root: HTMLElement;
beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root')!;
});

describe('SpecBook', () => {
  it('U7.1: builds a page per actor with numbered lines, text, glyph, tally and the title and badge', () => {
    const book = new SpecBook(root);
    book.update(base({ marks: new Map<number, LineMark>([[10, 'lit'], [11, 'shadowed']]), tally: new Map([[10, 3]]) }));
    const pages = [...root.querySelectorAll('.hk-spec')];
    expect(pages.map((p) => (p as HTMLElement).dataset.actor)).toEqual(['a', 'b']);
    expect(pages[0]!.querySelector('.hk-title')!.textContent).toBe('Actor A');
    expect(pages[0]!.querySelector('.hk-badge')!.textContent).toBe('spec a');
    const first = book.lineElement(10)!;
    expect(first.querySelector('.hk-ln')!.textContent).toBe('1');
    expect(first.querySelector('.hk-txt')!.textContent).toBe('THE a SHALL stay.');
    expect(first.querySelector('.hk-glyph')!.textContent).toBe('\u2713');
    expect(first.querySelector('.hk-tally')!.textContent).toBe('\u00D73');
    expect(first.querySelector('.hk-sr')!.textContent).toBe('ran');
    expect(first.classList.contains('hk-mark-lit')).toBe(true);
    const second = book.lineElement(11)!;
    expect(second.querySelector('.hk-glyph')!.textContent).toBe('\u25D0');
    expect(second.classList.contains('hk-mark-shadowed')).toBe(true);
    expect(second.classList.contains('hk-origin-card')).toBe(true);
  });

  it('U7.1: installs the book styles once in the document of its root', () => {
    new SpecBook(root);
    new SpecBook(root);
    expect(document.head.querySelectorAll('style#hk-book-styles')).toHaveLength(1);
  });

  it('U7.6: updating with the same lines keeps the elements and changes only their classes and text', () => {
    const book = new SpecBook(root);
    book.update(base());
    const before = [book.lineElement(10), book.lineElement(11), book.actorElement('a')];
    book.update(base({ marks: new Map<number, LineMark>([[10, 'false'], [11, 'lit']]), tally: new Map([[11, 1]]) }));
    expect([book.lineElement(10), book.lineElement(11), book.actorElement('a')]).toEqual(before);
    expect(book.lineElement(10)).toBe(before[0]);
    expect(book.lineElement(11)).toBe(before[1]);
    expect(before[0]!.classList.contains('hk-mark-false')).toBe(true);
    expect(before[1]!.classList.contains('hk-mark-lit')).toBe(true);
    expect(before[1]!.querySelector('.hk-tally')!.textContent).toBe('\u00D71');
  });

  it('U7.6: a line that burns keeps its element, and so its animation, through later updates', () => {
    const book = new SpecBook(root);
    book.update(base({ animate: true, marks: new Map<number, LineMark>([[10, 'ash'], [11, 'gold']]) }));
    const ash = book.lineElement(10)!;
    expect(root.classList.contains('hk-animate')).toBe(true);
    book.update(base({ animate: true, marks: new Map<number, LineMark>([[10, 'ash'], [11, 'gold']]), tally: new Map([[11, 2]]) }));
    expect(book.lineElement(10)).toBe(ash);
    expect(ash.isConnected).toBe(true);
  });

  it('U7.6: when the lines change, the book rebuilds them', () => {
    const book = new SpecBook(root);
    book.update(base());
    const old = book.lineElement(10)!;
    const view = base();
    view.actors[0]!.lines.unshift({ id: 12, text: 'WHEN y, THE a SHALL come.', origin: 'rewrite' });
    book.update(view);
    expect(book.lineElement(12)).not.toBeNull();
    expect(book.lineElement(10)).not.toBe(old);
    expect(book.lineElement(10)!.querySelector('.hk-ln')!.textContent).toBe('2');
    expect([...root.querySelectorAll('.hk-spec')[0]!.querySelectorAll('.hk-line')]).toHaveLength(3);
  });

  it('U7.6: turning slots on rebuilds the lists and adds n + 1 slots to each actor', () => {
    const book = new SpecBook(root);
    book.update(base());
    expect(root.querySelectorAll('.hk-slot')).toHaveLength(0);
    book.update(base({ slots: true }));
    expect(root.querySelectorAll('.hk-spec')[0]!.querySelectorAll('.hk-slot')).toHaveLength(3);
    expect(root.querySelectorAll('.hk-spec')[1]!.querySelectorAll('.hk-slot')).toHaveLength(2);
    expect(book.slotElement('a', 2)!.textContent).toBe('Insert at line 3');
    expect(book.slotElement('a', 9)).toBeNull();
  });

  it('U7.7: choosing a slot calls onSlot with the actor and the position', () => {
    const calls: [string, number][] = [];
    const book = new SpecBook(root, { onSlot: (actor, at) => calls.push([actor, at]) });
    book.update(base({ slots: true }));
    book.slotElement('a', 1)!.click();
    book.slotElement('b', 0)!.click();
    expect(calls).toEqual([['a', 1], ['b', 0]]);
  });

  it('U7.7: choosing a remove control calls onRemove with the line id, and only card lines have one', () => {
    const removed: number[] = [];
    const book = new SpecBook(root, { onRemove: (id) => removed.push(id) });
    book.update(base({ removable: true }));
    expect(root.querySelectorAll('.hk-rm')).toHaveLength(1);
    expect(book.lineElement(10)!.querySelector('.hk-rm')).toBeNull();
    book.lineElement(11)!.querySelector<HTMLButtonElement>('.hk-rm')!.click();
    expect(removed).toEqual([11]);
  });

  it('U7.7: the pointer or focus entering and leaving a page calls onActorFocus', () => {
    const calls: (string | null)[] = [];
    const book = new SpecBook(root, { onActorFocus: (id) => calls.push(id) });
    book.update(base({ removable: true }));
    const page = book.actorElement('a')!;
    page.dispatchEvent(new MouseEvent('mouseenter'));
    page.dispatchEvent(new MouseEvent('mouseleave'));
    book.actorElement('b')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(calls).toEqual(['a', null, 'b']);
    calls.length = 0;
    page.dispatchEvent(new FocusEvent('focusin'));
    page.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null }));
    expect(calls).toEqual(['a', null]);
  });

  it('U7.8: lineElement gives the element of a line or null, and slotAt reads the slot under a point', () => {
    const book = new SpecBook(root);
    book.update(base({ slots: true }));
    expect(book.lineElement(10)).toBe(root.querySelector('[data-line="10"]'));
    expect(book.lineElement(999)).toBeNull();
    const slot = book.slotElement('a', 2)!;
    const original = document.elementFromPoint;
    document.elementFromPoint = (x: number) => (x === 5 ? slot : x === 6 ? document.body : null);
    try {
      expect(book.slotAt(5, 0)).toEqual({ actor: 'a', at: 2 });
      expect(book.slotAt(6, 0)).toBeNull();
      expect(book.slotAt(7, 0)).toBeNull();
    } finally {
      document.elementFromPoint = original;
    }
  });

  it('U7.8: slotAt ignores a slot of another book', () => {
    const other = document.createElement('div');
    document.body.append(other);
    const otherBook = new SpecBook(other);
    otherBook.update(base({ slots: true }));
    const book = new SpecBook(root);
    book.update(base({ slots: true }));
    const foreign = otherBook.slotElement('a', 0)!;
    const original = document.elementFromPoint;
    document.elementFromPoint = () => foreign;
    try {
      expect(book.slotAt(1, 1)).toBeNull();
    } finally {
      document.elementFromPoint = original;
    }
  });

  it('U7.8: setHotSlot marks one slot as the drop target and clears the one before', () => {
    const book = new SpecBook(root);
    book.update(base({ slots: true }));
    book.setHotSlot({ actor: 'a', at: 0 });
    expect(book.slotElement('a', 0)!.classList.contains('hk-hot')).toBe(true);
    book.setHotSlot({ actor: 'b', at: 1 });
    expect(book.slotElement('a', 0)!.classList.contains('hk-hot')).toBe(false);
    expect(book.slotElement('b', 1)!.classList.contains('hk-hot')).toBe(true);
    book.setHotSlot(null);
    expect(root.querySelectorAll('.hk-hot')).toHaveLength(0);
  });

  it('U7.9: a rewrite line in the bleed set gets the bleed class when animating, and the tension sets --hk-tension', () => {
    const book = new SpecBook(root);
    const view = base({ animate: true, bleed: new Set([12]) });
    view.actors[0]!.lines.unshift({ id: 12, text: 'WHEN y, THE a SHALL come.', origin: 'rewrite' });
    book.update(view);
    expect(book.lineElement(12)!.classList.contains('hk-bleed')).toBe(true);
    expect(book.lineElement(10)!.classList.contains('hk-bleed')).toBe(false);
    expect(book.actorElement('a')!.style.getPropertyValue('--hk-tension')).toBe('0.5');
    expect(book.actorElement('b')!.style.getPropertyValue('--hk-tension')).toBe('0');
    book.update({ ...view, animate: false });
    expect(book.lineElement(12)!.classList.contains('hk-bleed')).toBe(false);
  });

  it('U7.1: the notes of an actor are listed with their tone, and change without rebuilding the lines', () => {
    const book = new SpecBook(root);
    book.update(base());
    const line = book.lineElement(10);
    expect([...root.querySelectorAll('.hk-spec')[0]!.querySelectorAll('.hk-note')].map((n) => [n.textContent, n.className])).toEqual([
      ['Rewrites at tick 6.', 'hk-note hk-note-rewrite'],
    ]);
    const view = base();
    view.actors[0]!.notes = [];
    book.update(view);
    expect(root.querySelectorAll('.hk-note')).toHaveLength(0);
    expect(book.lineElement(10)).toBe(line);
  });

  it('U7.10: the component does not import the grammar, the registry or the engine', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/ui/book.ts'), 'utf8');
    for (const forbidden of ['grammar', 'registry', 'engine', 'parseSentence', 'printRule']) expect(source).not.toContain(forbidden);
  });

  it('U7.1: destroy empties the book and stops its events', () => {
    const calls: number[] = [];
    const book = new SpecBook(root, { onRemove: (id) => calls.push(id) });
    book.update(base({ removable: true }));
    const remove = book.lineElement(11)!.querySelector<HTMLButtonElement>('.hk-rm')!;
    book.destroy();
    expect(root.children).toHaveLength(0);
    root.append(remove);
    remove.click();
    expect(calls).toEqual([]);
  });
});
