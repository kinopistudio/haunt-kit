import { SpecBook, printRule } from 'haunt-kit';
import type { BookView, Registry, World } from 'haunt-kit';
import type { Mount, Screen, Services } from '../app';
import { levelInfo, makeNames } from '../content';
import type { Names } from '../content';
import { buildWorld } from '../levels';
import type { LevelDef } from '../levels';
import {
  floorTiles,
  freshPlan,
  insertCard,
  isFreeTile,
  itemTypes,
  levelActors,
  pieceAt,
  placeItem,
  remaining,
  removeCard,
  takeItem,
  toInserts,
  toPlacement,
  usedCards,
} from '../plan';
import type { Plan, Selection } from '../plan';
import type { Hit, SceneApi } from '../render/scene';
import type { Tile } from '../render/surface';
import { createRegistry } from '../vocab';
import type { PlacedItem } from '../vocab';
import { bookViewOf } from './book-view';
import { el, muteButton } from './dom';
import { makeDraggable } from './drag';
import { ICONS, ITEM_LABEL } from './icons';

const BELLS = 12;

/** The play screen of one level. */
class PlayScreen implements Screen {
  private readonly doc: Document;
  private readonly registry: Registry = createRegistry();
  private readonly names: Names;
  private plan: Plan;
  private selection: Selection | null = null;
  private focus: string | null = null;
  private hover: Tile | null = null;
  private keyboard: Tile;
  private keyboardOn = false;
  private grabbed: { type: PlacedItem; x: number; y: number } | null = null;
  private readonly cleanups: (() => void)[] = [];

  private readonly els = {
    page: null as unknown as HTMLElement,
    canvas: null as unknown as HTMLCanvasElement,
    box: null as unknown as HTMLElement,
    tray: null as unknown as HTMLElement,
    clock: null as unknown as HTMLElement,
    pips: [] as HTMLElement[],
    clockState: null as unknown as HTMLElement,
    verdict: null as unknown as HTMLElement,
    live: null as unknown as HTMLElement,
    dock: null as unknown as HTMLElement,
    clear: null as unknown as HTMLButtonElement,
  };
  private readonly book: SpecBook;
  private readonly scene: SceneApi;
  private preview: World;

  constructor(
    private readonly root: HTMLElement,
    private readonly services: Services,
    private readonly level: LevelDef,
  ) {
    this.doc = root.ownerDocument;
    this.plan = freshPlan(level);
    this.preview = this.buildPreview();
    this.names = makeNames(levelActors(level));
    const tiles = floorTiles(level);
    const centre = { x: this.preview.map.w / 2, y: this.preview.map.h / 2 };
    this.keyboard = [...tiles].sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))[0] ?? { x: 1, y: 1 };

    this.build();
    this.book = new SpecBook(this.els.page.querySelector<HTMLElement>('.book')!, {
      onSlot: (actor, at) => this.insert(actor, at),
      onRemove: (lineId) => this.removeLine(lineId),
      onActorFocus: (id) => this.setFocus(id),
    });
    this.scene = services.makeScene(this.els.canvas, this.preview);
    this.wire();
    this.fit();
    this.refresh();
    this.scene.start();
  }

  destroy(): void {
    this.scene.stop();
    for (const stop of this.cleanups.splice(0)) stop();
    this.book.destroy();
  }

  // ---- building the page ----

  private build(): void {
    const { doc, level } = this;
    const info = levelInfo(level);
    const page = el(doc, 'main', 'play');
    this.els.page = page;

    const bar = el(doc, 'header', 'bar');
    const back = el(doc, 'a', 'btn back', '\u2039 Nights');
    back.setAttribute('href', '#/nights');
    back.setAttribute('aria-label', 'Back to the nights');
    const heading = el(doc, 'div', 'heading');
    heading.append(el(doc, 'span', 'numeral', level.id === 'prologue' ? 'Prologue' : `Night ${info.numeral}`), el(doc, 'span', 'concept', info.concept));
    const tools = el(doc, 'div', 'bar-tools');
    const mute = muteButton(doc, this.services);
    this.cleanups.push(mute.destroy);
    tools.append(mute.button);
    bar.append(back, heading, tools);

    const lesson = el(doc, 'p', 'lesson', info.lesson);

    const stage = el(doc, 'div', 'stage');
    const room = el(doc, 'section', 'room');
    room.setAttribute('aria-label', 'The ward');
    const clock = el(doc, 'div', 'clock');
    const pips = el(doc, 'div', 'pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < BELLS; i++) {
      const pip = el(doc, 'span', 'pip');
      this.els.pips.push(pip);
      pips.append(pip);
    }
    const clockState = el(doc, 'span', 'clock-state');
    clock.append(el(doc, 'span', '', 'BELL'), pips, clockState);
    this.els.clock = clock;
    this.els.clockState = clockState;

    const box = el(doc, 'div', 'canvas-box');
    const canvas = el(doc, 'canvas');
    canvas.id = 'room';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute(
      'aria-label',
      'The ward. Use the arrow keys to move over the floor. Enter puts down the selected item, or picks up the item on the tile. Escape lets go.',
    );
    box.append(canvas);
    this.els.box = box;
    this.els.canvas = canvas;

    const tray = el(doc, 'div', 'tray');
    tray.setAttribute('role', 'group');
    tray.setAttribute('aria-label', 'Items and cards');
    this.els.tray = tray;
    const verdict = el(doc, 'div', 'verdict');
    verdict.setAttribute('aria-live', 'polite');
    this.els.verdict = verdict;
    room.append(clock, box, tray, verdict);

    const book = el(doc, 'section', 'book');
    book.setAttribute('aria-label', 'Spec book');
    stage.append(room, book);

    const dock = el(doc, 'div', 'dock');
    dock.dataset.phase = 'plan';
    const plan = el(doc, 'div', 'dock-plan');
    const clear = el(doc, 'button', 'btn', 'Clear board');
    clear.type = 'button';
    clear.id = 'clear';
    this.els.clear = clear;
    plan.append(clear);
    dock.append(plan);
    this.els.dock = dock;

    const live = el(doc, 'div', 'sr-only');
    live.id = 'live';
    live.setAttribute('aria-live', 'polite');
    this.els.live = live;

    page.append(bar, lesson, stage, dock, live);
    this.root.append(page);
  }

  private wire(): void {
    const { canvas, clear } = this.els;
    const on = <E extends Event>(target: EventTarget, type: string, handler: (e: E) => void): void => {
      target.addEventListener(type, handler as EventListener);
      this.cleanups.push(() => target.removeEventListener(type, handler as EventListener));
    };

    on(clear, 'click', () => {
      this.plan = freshPlan(this.level);
      this.selection = null;
      this.announce('Board cleared. Every item and card is back in the tray.');
      this.refresh();
    });

    on<MouseEvent>(canvas, 'click', (e) => this.tapBoard(this.scene.hit(e.clientX, e.clientY)));
    on<PointerEvent>(canvas, 'pointermove', (e) => {
      const hit = this.scene.hit(e.clientX, e.clientY);
      const moved = hit.tile?.x !== this.hover?.x || hit.tile?.y !== this.hover?.y;
      this.hover = hit.tile;
      this.setFocus(hit.actor);
      if (moved) this.syncScene();
    });
    on(canvas, 'pointerleave', () => {
      this.hover = null;
      this.setFocus(null);
      this.syncScene();
    });
    on(canvas, 'focus', () => {
      this.keyboardOn = true;
      this.syncScene();
    });
    on(canvas, 'blur', () => {
      this.keyboardOn = false;
      this.syncScene();
    });
    on<KeyboardEvent>(canvas, 'keydown', (e) => this.onKey(e));

    // A mouse can drag a placed item to another tile. A touch taps it up and taps it down.
    this.cleanups.push(
      makeDraggable(canvas, {
        canStart: (e) => e.pointerType === 'mouse' && this.scene.hit(e.clientX, e.clientY).item !== null,
        ghost: () => this.itemGhost(this.grabType()),
        onStart: (x, y) => {
          const tile = this.scene.hit(x, y).tile;
          const piece = tile ? pieceAt(this.plan, tile.x, tile.y) : undefined;
          if (!piece) return;
          this.grabbed = { ...piece };
          this.plan = takeItem(this.plan, piece.x, piece.y)!.plan;
          this.selection = { kind: 'item', type: piece.type };
          this.refresh();
        },
        onMove: (x, y) => this.dragOver(x, y),
        onEnd: (x, y) => this.dropItem(x, y),
        onCancel: () => this.cancelDrag(),
      }),
    );

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.fit());
      observer.observe(this.els.box);
      this.cleanups.push(() => observer.disconnect());
    }
    const view = this.doc.defaultView;
    if (view) on(view, 'resize', () => this.fit());
  }

  private fit(): void {
    const width = this.els.box.clientWidth;
    if (width > 0) this.scene.resize(width);
  }

  // ---- state to screen ----

  private buildPreview(): World {
    return buildWorld(this.level, toPlacement(this.level, this.plan), toInserts(this.level, this.plan), this.registry);
  }

  private refresh(): void {
    this.preview = this.buildPreview();
    this.renderTray();
    this.renderBook();
    this.renderClock();
    this.syncScene();
  }

  private renderClock(): void {
    for (const pip of this.els.pips) pip.classList.remove('on');
    this.els.clockState.textContent = 'Planning';
  }

  private renderTray(): void {
    const { doc, level, plan, selection } = this;
    const tray = this.els.tray;
    tray.replaceChildren();
    for (const type of itemTypes(level)) {
      const left = remaining(level, plan, type);
      const button = el(doc, 'button', 'btn tool');
      button.type = 'button';
      button.dataset.tool = type;
      button.innerHTML = ICONS[type] ?? '';
      button.append(el(doc, 'span', '', ITEM_LABEL[type] ?? type), el(doc, 'span', 'count', `${left} left`));
      button.setAttribute('aria-pressed', String(selection?.kind === 'item' && selection.type === type));
      button.disabled = left <= 0;
      button.addEventListener('click', () => this.toggleItem(type));
      this.dragSource(button, () => this.beginItemDrag(type));
      tray.append(button);
    }
    const used = usedCards(plan);
    level.cards.forEach((rule, index) => {
      const inSpec = used.has(index);
      const button = el(doc, 'button', `card${inSpec ? ' used' : ''}`);
      button.type = 'button';
      button.dataset.card = String(index);
      button.append(el(doc, 'span', 'tag', inSpec ? 'Card \u00B7 in a spec' : 'Card \u00B7 tap, then pick a line'), el(doc, 'span', 'sentence', printRule('ghost', rule, this.registry)));
      button.setAttribute('aria-pressed', String(selection?.kind === 'card' && selection.card === index));
      button.disabled = inSpec;
      button.addEventListener('click', () => this.toggleCard(index));
      this.dragSource(button, () => this.beginCardDrag(index));
      tray.append(button);
    });
    if (tray.children.length === 0) tray.append(el(doc, 'span', 'tray-empty', 'Nothing to place.'));
  }

  private bookView(): BookView {
    return bookViewOf(this.preview, this.registry, this.names, { slots: this.selection?.kind === 'card', removable: true });
  }

  private renderBook(): void {
    this.book.update(this.bookView());
  }

  /** Pushes what the scene shows: the world, the pointer marks, the focus and the numerals. */
  private syncScene(): void {
    const { selection, hover, plan } = this;
    const holding = selection?.kind === 'item' ? selection : null;
    const tile = hover ?? null;
    const ok = !!(tile && holding && isFreeTile(this.level, plan, tile.x, tile.y));
    this.scene.setPhase('plan');
    this.scene.setWorld(this.preview, { animate: false });
    this.scene.setNumerals(Object.fromEntries(this.preview.actors.map((a) => [a.id, this.names.numeral(a.id)])));
    this.scene.setMarks({
      hover: tile && holding ? { ...tile, ok } : null,
      preview: ok && holding && tile ? { type: holding.type, x: tile.x, y: tile.y } : null,
      cursor: this.keyboardOn ? this.keyboard : null,
      focus: this.focus,
      coach: null,
    });
  }

  private setFocus(id: string | null): void {
    if (id === this.focus) return;
    this.focus = id;
    this.book.setActorHighlight(id);
    this.scene.setMarks({ focus: id });
  }

  private announce(text: string): void {
    this.els.live.textContent = '';
    this.els.live.textContent = text;
  }

  // ---- the player's moves ----

  private toggleItem(type: PlacedItem): void {
    this.services.sfx.unlock();
    const same = this.selection?.kind === 'item' && this.selection.type === type;
    this.selection = same ? null : { kind: 'item', type };
    this.refresh();
  }

  private toggleCard(card: number): void {
    this.services.sfx.unlock();
    const same = this.selection?.kind === 'card' && this.selection.card === card;
    this.selection = same ? null : { kind: 'card', card };
    this.refresh();
    if (!same) this.showBook();
  }

  /** On a narrow screen the book is below the board: bring its first page into view when a card has been picked. */
  private showBook(): void {
    const page = this.book.element.firstElementChild as HTMLElement | null;
    if (!page?.scrollIntoView) return;
    const rect = page.getBoundingClientRect();
    const height = this.doc.defaultView?.innerHeight ?? 800;
    if (rect.top > height * 0.7 || rect.bottom < 0) page.scrollIntoView({ block: 'center', behavior: this.services.reduced() ? 'auto' : 'smooth' });
  }

  private placeAt(x: number, y: number): boolean {
    const sel = this.selection;
    if (sel?.kind !== 'item') return false;
    const next = placeItem(this.level, this.plan, sel.type, x, y);
    if (!next) {
      this.announce('That tile is not free.');
      return false;
    }
    this.plan = next;
    if (remaining(this.level, next, sel.type) <= 0) this.selection = null;
    this.services.sfx.click();
    this.announce(`${ITEM_LABEL[sel.type] ?? sel.type} placed at column ${x + 1}, row ${y + 1}.`);
    this.refresh();
    return true;
  }

  private pickUp(x: number, y: number): boolean {
    const taken = takeItem(this.plan, x, y);
    if (!taken) return false;
    this.plan = taken.plan;
    this.selection = { kind: 'item', type: taken.type };
    this.services.sfx.click();
    this.announce(`${ITEM_LABEL[taken.type] ?? taken.type} taken back from column ${x + 1}, row ${y + 1}.`);
    this.refresh();
    return true;
  }

  private tapBoard(hit: Hit): void {
    this.services.sfx.unlock();
    if (this.selection?.kind === 'item') {
      if (hit.tile) this.placeAt(hit.tile.x, hit.tile.y);
      return;
    }
    if (hit.item !== null && hit.tile && this.pickUp(hit.tile.x, hit.tile.y)) return;
    if (hit.actor) this.setFocus(this.focus === hit.actor ? null : hit.actor);
  }

  private insert(actor: string, at: number): void {
    const sel = this.selection;
    if (sel?.kind !== 'card') return;
    const next = insertCard(this.level, this.plan, sel.card, actor, at);
    if (!next) return;
    this.plan = next;
    this.selection = null;
    this.services.sfx.scratch();
    this.announce(`Card written at line ${at + 1} of ${this.names.title(actor)}. The lines below it moved down.`);
    this.refresh();
  }

  private removeLine(lineId: number): void {
    for (const actor of this.preview.actors) {
      const index = actor.lines.findIndex((l) => l.id === lineId);
      if (index === -1) continue;
      const entry = this.plan.lists[actor.id]?.[index];
      if (entry?.t !== 'card') return;
      this.plan = removeCard(this.plan, entry.c);
      this.announce(`Card taken out of ${this.names.title(actor.id)}. It is back in the tray.`);
      this.refresh();
      return;
    }
  }

  // ---- dragging ----

  /** Makes a tray button a drag source. */
  private dragSource(button: HTMLButtonElement, begin: () => void): void {
    makeDraggable(button, {
      canStart: () => !button.disabled,
      ghost: () => {
        const copy = button.cloneNode(true) as HTMLElement;
        copy.classList.add('drag-ghost');
        copy.removeAttribute('data-tool');
        copy.removeAttribute('data-card');
        return copy;
      },
      onStart: begin,
      onMove: (x, y) => this.dragOver(x, y),
      onEnd: (x, y) => (this.selection?.kind === 'card' ? this.dropCard(x, y) : this.dropItem(x, y)),
      onCancel: () => this.cancelDrag(),
    });
  }

  private beginItemDrag(type: PlacedItem): void {
    this.selection = { kind: 'item', type };
    this.refresh();
  }

  private beginCardDrag(card: number): void {
    this.selection = { kind: 'card', card };
    this.refresh();
  }

  private grabType(): PlacedItem {
    return this.grabbed?.type ?? (this.selection?.kind === 'item' ? this.selection.type : 'salt');
  }

  private itemGhost(type: PlacedItem): HTMLElement {
    const ghost = el(this.doc, 'div', 'btn tool drag-ghost');
    ghost.innerHTML = ICONS[type] ?? '';
    return ghost;
  }

  private dragOver(x: number, y: number): void {
    if (this.selection?.kind === 'card') {
      this.book.setHotSlot(this.book.slotAt(x, y));
      return;
    }
    this.hover = this.scene.hit(x, y).tile;
    this.syncScene();
  }

  private dropItem(x: number, y: number): void {
    const tile = this.scene.hit(x, y).tile;
    const placed = !!tile && this.placeAt(tile.x, tile.y);
    if (!placed) this.cancelDrag();
    this.grabbed = null;
    this.hover = null;
  }

  private dropCard(x: number, y: number): void {
    const slot = this.book.slotAt(x, y);
    this.book.setHotSlot(null);
    if (slot) this.insert(slot.actor, slot.at);
    else this.cancelDrag();
  }

  /** The drag did not land: an item goes back to where it was picked up, a card stays in the tray. */
  private cancelDrag(): void {
    const back = this.grabbed;
    this.grabbed = null;
    if (back) this.plan = placeItem(this.level, this.plan, back.type, back.x, back.y) ?? this.plan;
    this.selection = null;
    this.book.setHotSlot(null);
    this.hover = null;
    this.refresh();
  }

  // ---- keyboard ----

  private describe(tile: Tile): string {
    const world = this.preview;
    const parts = [`Column ${tile.x + 1}, row ${tile.y + 1}.`];
    const piece = pieceAt(this.plan, tile.x, tile.y);
    if (piece) parts.push(`${ITEM_LABEL[piece.type] ?? piece.type} here.`);
    const actor = world.actors.find((a) => a.pos.x === tile.x && a.pos.y === tile.y);
    if (actor) parts.push(`${this.names.title(actor.id)} starts here.`);
    if (!piece && !actor) parts.push(isFreeTile(this.level, this.plan, tile.x, tile.y) ? 'Free floor.' : 'Not free.');
    return parts.join(' ');
  }

  private onKey(e: KeyboardEvent): void {
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = step[e.key];
    if (d) {
      const { map } = this.preview;
      const x = this.keyboard.x + d[0];
      const y = this.keyboard.y + d[1];
      if (x >= 0 && y >= 0 && x < map.w && y < map.h && !map.walls.has(y * map.w + x)) {
        this.keyboard = { x, y };
        this.hover = null;
        this.syncScene();
        this.announce(this.describe(this.keyboard));
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      this.selection = null;
      this.refresh();
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const { x, y } = this.keyboard;
    if (this.selection?.kind === 'item') this.placeAt(x, y);
    else if (!this.pickUp(x, y)) {
      const actor = this.preview.actors.find((a) => a.pos.x === x && a.pos.y === y);
      if (actor) this.setFocus(this.focus === actor.id ? null : actor.id);
    }
  }
}

export const mountPlay: Mount = (root, services, _go, route) => {
  const level = services.levels.find((l) => route.screen === 'night' && l.id === route.id);
  if (!level) throw new Error('no such level');
  return new PlayScreen(root, services, level);
};
