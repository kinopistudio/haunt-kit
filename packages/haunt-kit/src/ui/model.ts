import type { LineOrigin } from '../world/types';
import type { LineMark } from './marks';

export interface BookLineView {
  /** `Line.id`. */
  id: number;
  /** The printed EARS sentence. The book does not parse or print rules. */
  text: string;
  origin: LineOrigin;
}

export interface BookNote {
  text: string;
  tone?: 'rewrite' | 'hint';
}

export interface BookActorView {
  id: string;
  title: string;
  /** Small text right of the title, such as a file name. */
  badge?: string;
  /** 0 to 1. Sets `--hk-tension` on the page, which curls its corner. */
  tension?: number;
  lines: BookLineView[];
  notes?: BookNote[];
}

/** Everything the spec book shows. Plain data: the component keeps no rule logic. */
export interface BookView {
  actors: BookActorView[];
  marks?: ReadonlyMap<number, LineMark>;
  tally?: ReadonlyMap<number, number>;
  /** Ids of lines that were just written by a rewrite. They bleed in when `animate` is true. */
  bleed?: ReadonlySet<number>;
  /** Show an insertion slot before every line and after the last. */
  slots?: boolean;
  /** Give lines with origin `card` a remove control. */
  removable?: boolean;
  /** Play the burn, gild, bleed and strike animations. */
  animate?: boolean;
}

/** A text mark for every state that has a colour, so that no state is shown by colour alone. */
export const MARK_GLYPH: Record<LineMark, string> = {
  idle: '',
  lit: '\u2713',
  false: '\u2717',
  skipped: '',
  shadowed: '\u25D0',
  gold: '\u2713',
  ash: '\u2717',
  struck: '\u2717',
};

export const MARK_LABEL: Record<LineMark, string> = {
  idle: 'not read yet',
  lit: 'ran',
  false: 'false',
  skipped: 'not reached',
  shadowed: 'true, but a line above ran first',
  gold: 'ran during the run',
  ash: 'never ran',
  struck: 'struck out',
};

export interface SlotRow {
  kind: 'slot';
  actor: string;
  /** 0-based position the inserted line would take. */
  at: number;
  label: string;
}

export interface LineRow {
  kind: 'line';
  id: number;
  actor: string;
  /** 0-based index in the actor's spec. */
  index: number;
  /** 1-based number shown to the reader. */
  number: number;
  text: string;
  origin: LineOrigin;
  mark: LineMark;
  glyph: string;
  /** What the mark means, for readers who cannot see its colour. */
  markLabel: string;
  /** Accessible label: the line number and what its mark means. */
  label: string;
  /** `×3`, or an empty string for 0. */
  tally: string;
  removable: boolean;
  bleed: boolean;
  classes: string[];
}

export type BookRow = SlotRow | LineRow;

export interface ActorModel {
  id: string;
  title: string;
  badge: string;
  tension: number;
  rows: BookRow[];
  notes: BookNote[];
}

export interface BookModel {
  actors: ActorModel[];
}

/** The rows the book shows, as plain data. Pure: the DOM component and the tests both read this. */
export function bookModel(view: BookView): BookModel {
  const animate = view.animate === true;
  return {
    actors: view.actors.map((actor) => {
      const rows: BookRow[] = [];
      const slot = (at: number): void => {
        if (view.slots) rows.push({ kind: 'slot', actor: actor.id, at, label: `Insert at line ${at + 1}` });
      };
      actor.lines.forEach((line, index) => {
        slot(index);
        const mark = view.marks?.get(line.id) ?? 'idle';
        const count = view.tally?.get(line.id) ?? 0;
        const bleed = animate && line.origin === 'rewrite' && view.bleed?.has(line.id) === true;
        rows.push({
          kind: 'line',
          id: line.id,
          actor: actor.id,
          index,
          number: index + 1,
          text: line.text,
          origin: line.origin,
          mark,
          glyph: MARK_GLYPH[mark],
          markLabel: MARK_LABEL[mark],
          label: `Line ${index + 1}, ${MARK_LABEL[mark]}`,
          tally: count > 0 ? `\u00D7${count}` : '',
          removable: view.removable === true && line.origin === 'card',
          bleed,
          classes: ['hk-line', `hk-origin-${line.origin}`, `hk-mark-${mark}`, ...(count > 0 ? ['hk-ever'] : []), ...(bleed ? ['hk-bleed'] : [])],
        });
      });
      slot(actor.lines.length);
      const tension = actor.tension ?? 0;
      return {
        id: actor.id,
        title: actor.title,
        badge: actor.badge ?? '',
        tension: Number.isFinite(tension) ? Math.min(1, Math.max(0, tension)) : 0,
        rows,
        notes: actor.notes ?? [],
      };
    }),
  };
}
