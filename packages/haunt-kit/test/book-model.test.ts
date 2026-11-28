import { describe, expect, it } from 'vitest';
import { MARK_GLYPH, MARK_LABEL, bookModel } from '../src/index';
import type { BookView, LineMark, LineRow } from '../src/index';

const view = (overrides: Partial<BookView> = {}): BookView => ({
  actors: [
    {
      id: 'a',
      title: 'Actor A',
      badge: 'spec a',
      lines: [
        { id: 10, text: 'THE a SHALL stay.', origin: 'spec' },
        { id: 11, text: 'WHEN x, THE a SHALL go.', origin: 'card' },
        { id: 12, text: 'WHEN y, THE a SHALL come.', origin: 'rewrite' },
      ],
      notes: [{ text: 'Rewrites itself at tick 6.', tone: 'rewrite' }],
    },
    { id: 'b', title: 'Actor B', lines: [{ id: 20, text: 'THE b SHALL wait.', origin: 'spec' }] },
  ],
  ...overrides,
});

const lines = (model: ReturnType<typeof bookModel>, actor: number): LineRow[] => model.actors[actor]!.rows.filter((r): r is LineRow => r.kind === 'line');

describe('bookModel', () => {
  it('U7.1: gives each actor in order with its title, badge, 1-based line numbers, text, origin and notes', () => {
    const model = bookModel(view());
    expect(model.actors.map((a) => [a.id, a.title, a.badge])).toEqual([
      ['a', 'Actor A', 'spec a'],
      ['b', 'Actor B', ''],
    ]);
    expect(lines(model, 0).map((l) => [l.id, l.number, l.index, l.text, l.origin])).toEqual([
      [10, 1, 0, 'THE a SHALL stay.', 'spec'],
      [11, 2, 1, 'WHEN x, THE a SHALL go.', 'card'],
      [12, 3, 2, 'WHEN y, THE a SHALL come.', 'rewrite'],
    ]);
    expect(model.actors[0]!.notes).toEqual([{ text: 'Rewrites itself at tick 6.', tone: 'rewrite' }]);
    expect(model.actors[1]!.notes).toEqual([]);
  });

  it('U7.1: a line without a mark is idle, and the classes name the origin and the mark', () => {
    const [first] = lines(bookModel(view()), 0);
    expect(first!.mark).toBe('idle');
    expect(first!.classes).toEqual(['hk-line', 'hk-origin-spec', 'hk-mark-idle']);
  });

  it('U7.1: the tension is limited to 0..1', () => {
    const actors = (tension: number | undefined) => [{ id: 'a', title: 'A', tension, lines: [] }];
    expect(bookModel({ actors: actors(2) }).actors[0]!.tension).toBe(1);
    expect(bookModel({ actors: actors(-1) }).actors[0]!.tension).toBe(0);
    expect(bookModel({ actors: actors(Number.NaN) }).actors[0]!.tension).toBe(0);
    expect(bookModel({ actors: actors(undefined) }).actors[0]!.tension).toBe(0);
    expect(bookModel({ actors: actors(0.4) }).actors[0]!.tension).toBe(0.4);
  });

  it('U7.2: every mark except idle and skipped has a text glyph, and every mark has an accessible label', () => {
    const marks: LineMark[] = ['idle', 'lit', 'false', 'skipped', 'shadowed', 'gold', 'ash', 'struck'];
    const glyphs = Object.fromEntries(marks.map((m) => [m, MARK_GLYPH[m]]));
    expect(glyphs).toEqual({ idle: '', lit: '\u2713', false: '\u2717', skipped: '', shadowed: '\u25D0', gold: '\u2713', ash: '\u2717', struck: '\u2717' });
    for (const m of marks) expect(MARK_LABEL[m].length).toBeGreaterThan(2);
    for (const mark of marks) {
      const model = bookModel(view({ marks: new Map([[10, mark]]) }));
      const row = lines(model, 0)[0]!;
      expect(row.glyph).toBe(MARK_GLYPH[mark]);
      expect(row.label).toBe(`Line 1, ${MARK_LABEL[mark]}`);
      expect(row.classes).toContain(`hk-mark-${mark}`);
    }
  });

  it('U7.3: with slots on, n lines have n + 1 slots at positions 0 to n, around the lines', () => {
    const model = bookModel(view({ slots: true }));
    const rows = model.actors[0]!.rows;
    expect(rows.map((r) => r.kind)).toEqual(['slot', 'line', 'slot', 'line', 'slot', 'line', 'slot']);
    const slots = rows.filter((r) => r.kind === 'slot');
    expect(slots.map((s) => [s.actor, s.at, s.label])).toEqual([
      ['a', 0, 'Insert at line 1'],
      ['a', 1, 'Insert at line 2'],
      ['a', 2, 'Insert at line 3'],
      ['a', 3, 'Insert at line 4'],
    ]);
    expect(model.actors[1]!.rows.filter((r) => r.kind === 'slot')).toHaveLength(2);
  });

  it('U7.3: with slots off or missing, there are no slots, and an actor without lines still has one slot when on', () => {
    expect(bookModel(view()).actors[0]!.rows.every((r) => r.kind === 'line')).toBe(true);
    expect(bookModel(view({ slots: false })).actors[0]!.rows.every((r) => r.kind === 'line')).toBe(true);
    const empty = bookModel({ actors: [{ id: 'z', title: 'Z', lines: [] }], slots: true });
    expect(empty.actors[0]!.rows).toEqual([{ kind: 'slot', actor: 'z', at: 0, label: 'Insert at line 1' }]);
  });

  it('U7.4: with removable on, only lines with origin card have a remove control', () => {
    const on = lines(bookModel(view({ removable: true })), 0);
    expect(on.map((l) => l.removable)).toEqual([false, true, false]);
    const off = lines(bookModel(view()), 0);
    expect(off.every((l) => !l.removable)).toBe(true);
  });

  it('U7.5: shows a tally of ×n when n is above 0 and nothing at 0', () => {
    const model = bookModel(view({ tally: new Map([[10, 3], [11, 0]]) }));
    expect(lines(model, 0).map((l) => l.tally)).toEqual(['\u00D73', '', '']);
    expect(lines(model, 0)[0]!.classes).toContain('hk-ever');
    expect(lines(model, 0)[1]!.classes).not.toContain('hk-ever');
  });

  it('U7.9: a rewrite line bleeds only when it is listed and animation is on', () => {
    const bleed = new Set([12, 11]);
    expect(lines(bookModel(view({ bleed, animate: true })), 0).map((l) => l.bleed)).toEqual([false, false, true]);
    expect(lines(bookModel(view({ bleed, animate: false })), 0).every((l) => !l.bleed)).toBe(true);
    expect(lines(bookModel(view({ animate: true })), 0).every((l) => !l.bleed)).toBe(true);
  });
});
