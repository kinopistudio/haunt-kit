import { h } from './dom';
import { bookModel } from './model';
import type { ActorModel, BookNote, BookView, LineRow } from './model';
import { installSpecBookStyles } from './styles';

export interface SpecBookHandlers {
  /** A slot was chosen: the actor id and the 0-based position the new line would take. */
  onSlot?: (actor: string, at: number) => void;
  /** The remove control of a line was chosen. */
  onRemove?: (lineId: number) => void;
  /** The pointer or focus entered (an actor id) or left (null) an actor's page. */
  onActorFocus?: (actor: string | null) => void;
}

export interface SlotRef {
  actor: string;
  at: number;
}

const slotKey = (actor: string, at: number): string => `${actor}\u0000${at}`;

/** The delay between two lines when a finished run burns and gilds them one after the other, in seconds. */
const LINE_DELAY = 0.12;

/**
 * The spec book: every actor's lines as a page of numbered rules. It turns a `BookView` into DOM and
 * reports events. It parses, prints and evaluates nothing.
 *
 * While the actors and lines stay the same, `update` patches the existing elements, so that a running
 * animation (a burning line, a strike) does not restart.
 */
export class SpecBook {
  readonly element: HTMLElement;
  private readonly doc: Document;
  private structure = '';
  private readonly lineEls = new Map<number, HTMLElement>();
  private readonly actorEls = new Map<string, HTMLElement>();
  private readonly slotEls = new Map<string, HTMLElement>();
  private hot: HTMLElement | null = null;
  private notesText = new Map<string, string>();

  constructor(
    root: HTMLElement,
    private readonly handlers: SpecBookHandlers = {},
  ) {
    this.element = root;
    this.doc = root.ownerDocument;
    installSpecBookStyles(this.doc);
    root.classList.add('hk-book');
    root.addEventListener('click', this.onClick);
  }

  update(view: BookView): void {
    const model = bookModel(view);
    const structure = JSON.stringify([
      view.slots === true,
      view.removable === true,
      model.actors.map((a) => [a.id, a.rows.map((r) => (r.kind === 'line' ? r.id : `s${r.at}`))]),
    ]);
    if (structure !== this.structure) {
      this.rebuild(model.actors);
      this.structure = structure;
    }
    this.element.classList.toggle('hk-animate', view.animate === true);

    let order = 0;
    for (const actor of model.actors) {
      const page = this.actorEls.get(actor.id)!;
      page.style.setProperty('--hk-tension', String(actor.tension));
      page.querySelector('.hk-title')!.textContent = actor.title;
      page.querySelector('.hk-badge')!.textContent = actor.badge;
      this.patchNotes(actor, page);
      for (const row of actor.rows) {
        if (row.kind === 'line') this.patchLine(row, order++);
      }
    }
  }

  /** The element of one line, or `null`. Apps use it to draw a thread from the line. */
  lineElement(lineId: number): HTMLElement | null {
    return this.lineEls.get(lineId) ?? null;
  }

  actorElement(actorId: string): HTMLElement | null {
    return this.actorEls.get(actorId) ?? null;
  }

  slotElement(actor: string, at: number): HTMLElement | null {
    return this.slotEls.get(slotKey(actor, at)) ?? null;
  }

  /** The slot under a point in the window, or `null`. */
  slotAt(x: number, y: number): SlotRef | null {
    const hit = this.doc.elementFromPoint(x, y);
    const slot = hit?.closest<HTMLElement>('.hk-slot');
    if (!slot || !this.element.contains(slot)) return null;
    return { actor: slot.dataset.actor ?? '', at: Number(slot.dataset.at) };
  }

  /** Marks one slot as the drop target, or none. */
  setHotSlot(slot: SlotRef | null): void {
    const next = slot ? (this.slotEls.get(slotKey(slot.actor, slot.at)) ?? null) : null;
    if (next === this.hot) return;
    this.hot?.classList.remove('hk-hot');
    next?.classList.add('hk-hot');
    this.hot = next;
  }

  /** Outlines one actor's page, or none. Used when the pointer is over that actor somewhere else. */
  setActorHighlight(actorId: string | null): void {
    for (const [id, page] of this.actorEls) page.classList.toggle('hk-focus', id === actorId);
  }

  destroy(): void {
    this.element.removeEventListener('click', this.onClick);
    this.element.replaceChildren();
    this.element.classList.remove('hk-book', 'hk-animate');
    this.lineEls.clear();
    this.actorEls.clear();
    this.slotEls.clear();
    this.hot = null;
    this.structure = '';
  }

  private readonly onClick = (event: Event): void => {
    const target = event.target as Element | null;
    const slot = target?.closest<HTMLElement>('.hk-slot');
    if (slot && this.element.contains(slot)) {
      this.handlers.onSlot?.(slot.dataset.actor ?? '', Number(slot.dataset.at));
      return;
    }
    const remove = target?.closest<HTMLElement>('.hk-rm');
    if (remove && this.element.contains(remove)) this.handlers.onRemove?.(Number(remove.dataset.line));
  };

  private rebuild(actors: ActorModel[]): void {
    this.lineEls.clear();
    this.actorEls.clear();
    this.slotEls.clear();
    this.notesText.clear();
    this.hot = null;
    const doc = this.doc;
    const pages = actors.map((actor) => {
      const page = h(doc, 'article', 'hk-spec');
      page.dataset.actor = actor.id;
      const head = h(doc, 'h3', 'hk-head');
      head.append(h(doc, 'span', 'hk-title'), h(doc, 'span', 'hk-badge'));
      const list = h(doc, 'ol', 'hk-lines');
      for (const row of actor.rows) {
        const item = h(doc, 'li');
        if (row.kind === 'slot') {
          item.className = 'hk-slot-row';
          const button = h(doc, 'button', 'hk-slot', row.label);
          button.type = 'button';
          button.dataset.actor = row.actor;
          button.dataset.at = String(row.at);
          item.append(button);
          this.slotEls.set(slotKey(row.actor, row.at), button);
        } else {
          item.dataset.line = String(row.id);
          item.dataset.actor = row.actor;
          item.append(h(doc, 'span', 'hk-ln'), h(doc, 'span', 'hk-txt'), h(doc, 'span', 'hk-tally'), h(doc, 'span', 'hk-glyph'));
          item.querySelector('.hk-glyph')!.setAttribute('aria-hidden', 'true');
          item.append(h(doc, 'span', 'hk-sr'));
          if (row.removable) {
            const remove = h(doc, 'button', 'hk-rm', '\u00D7');
            remove.type = 'button';
            remove.dataset.line = String(row.id);
            remove.dataset.actor = row.actor;
            item.append(remove);
          }
          this.lineEls.set(row.id, item);
        }
        list.append(item);
      }
      const notes = h(doc, 'ul', 'hk-notes');
      page.append(head, list, notes);
      page.addEventListener('mouseenter', () => this.handlers.onActorFocus?.(actor.id));
      page.addEventListener('mouseleave', () => this.handlers.onActorFocus?.(null));
      page.addEventListener('focusin', () => this.handlers.onActorFocus?.(actor.id));
      page.addEventListener('focusout', (e) => {
        if (!page.contains((e as FocusEvent).relatedTarget as Node | null)) this.handlers.onActorFocus?.(null);
      });
      this.actorEls.set(actor.id, page);
      return page;
    });
    this.element.replaceChildren(...pages);
  }

  private patchLine(row: LineRow, order: number): void {
    const item = this.lineEls.get(row.id)!;
    const className = row.classes.join(' ');
    if (item.className !== className) item.className = className;
    item.dataset.idx = String(row.index);
    item.dataset.mark = row.mark;
    item.style.setProperty('--hk-delay', `${(order * LINE_DELAY).toFixed(2)}s`);
    this.setText(item, '.hk-ln', String(row.number));
    this.setText(item, '.hk-txt', row.text);
    this.setText(item, '.hk-tally', row.tally);
    this.setText(item, '.hk-glyph', row.glyph);
    this.setText(item, '.hk-sr', row.mark === 'idle' ? '' : row.markLabel);
    const remove = item.querySelector('.hk-rm');
    if (remove) remove.setAttribute('aria-label', `Remove the card on line ${row.number}`);
  }

  private setText(item: HTMLElement, selector: string, text: string): void {
    const target = item.querySelector(selector)!;
    if (target.textContent !== text) target.textContent = text;
  }

  private patchNotes(actor: ActorModel, page: HTMLElement): void {
    const signature = JSON.stringify(actor.notes);
    if (this.notesText.get(actor.id) === signature) return;
    this.notesText.set(actor.id, signature);
    const list = page.querySelector('.hk-notes')!;
    list.replaceChildren(
      ...actor.notes.map((note: BookNote) => {
        const item = h(this.doc, 'li', `hk-note${note.tone ? ` hk-note-${note.tone}` : ''}`, note.text);
        return item;
      }),
    );
  }
}
