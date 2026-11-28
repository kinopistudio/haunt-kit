import { ReplayBar, SpecBook, bookState, printRule } from 'haunt-kit';
import type { BookView, Registry, ReplayAction, ReplayState, World } from 'haunt-kit';
import type { FxApi, Mount, Screen, Services } from '../app';
import { coachStep, hasCoach } from '../coach';
import type { CoachTarget } from '../coach';
import { levelInfo, makeNames } from '../content';
import type { Names } from '../content';
import { buildWorld } from '../levels';
import type { LevelDef } from '../levels';
import { runNight } from '../night';
import type { NightRun } from '../night';
import { THREAD_MS } from '../render/fx';
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
import { dawnText, lossText, solveCounts } from '../wording';
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
  private coachOn: boolean;
  private coachTile: Tile | null = null;
  private coachId = '';
  private phase: 'plan' | 'night' = 'plan';
  private run: NightRun | null = null;
  private cursor = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
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
    coach: null as unknown as HTMLElement,
    coachTag: null as unknown as HTMLElement,
    coachText: null as unknown as HTMLElement,
    coachToggle: null as unknown as HTMLButtonElement,
    clear: null as unknown as HTMLButtonElement,
    ring: null as unknown as HTMLButtonElement,
    back: null as unknown as HTMLButtonElement,
    bar: null as unknown as HTMLElement,
    dawn: null as unknown as HTMLElement,
  };
  private bar!: ReplayBar;
  private fx!: FxApi;
  private fxCanvas!: HTMLCanvasElement;
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
    this.coachOn = hasCoach(level) && !services.progress.coachDone(level.id);
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
    this.fxCanvas = el(this.doc, 'canvas', 'fx-layer');
    this.fxCanvas.setAttribute('aria-hidden', 'true');
    this.doc.body.append(this.fxCanvas);
    this.fx = services.makeFx(this.fxCanvas);
    this.fx.resize();
    this.bar = new ReplayBar(this.els.bar, {
      tickWord: 'Bell',
      intervalMs: (speed) => (speed === 2 ? 260 : 620) + (services.reduced() ? 100 : 0),
      onChange: (state, action) => this.onReplay(state, action),
    });
    this.wire();
    this.fit();
    this.refresh();
    this.scene.start();
  }

  destroy(): void {
    this.scene.stop();
    this.clearTimers();
    this.bar.destroy();
    this.fx.stop();
    this.fxCanvas.remove();
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
    const toggle = el(doc, 'button', 'btn small', 'Show tutorial');
    toggle.type = 'button';
    toggle.id = 'coach-toggle';
    this.els.coachToggle = toggle;
    tools.append(toggle, mute.button);
    bar.append(back, heading, tools);

    const lesson = el(doc, 'p', 'lesson', info.lesson);

    const coach = el(doc, 'section', 'coach');
    coach.setAttribute('role', 'status');
    coach.setAttribute('aria-live', 'polite');
    const coachRow = el(doc, 'div', 'row');
    const coachTag = el(doc, 'span', 'tag');
    const hide = el(doc, 'button', 'skip', 'Hide tutorial');
    hide.type = 'button';
    hide.id = 'coach-hide';
    coachRow.append(coachTag, hide);
    const coachText = el(doc, 'p', 'text');
    coach.append(coachRow, coachText);
    this.els.coach = coach;
    this.els.coachTag = coachTag;
    this.els.coachText = coachText;

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
    const dawn = el(doc, 'div', 'dawn-card', 'Dawn');
    dawn.hidden = true;
    dawn.setAttribute('aria-hidden', 'true');
    box.append(canvas, dawn);
    this.els.dawn = dawn;
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
    const ring = el(doc, 'button', 'btn primary', 'Ring midnight');
    ring.type = 'button';
    ring.id = 'ring';
    this.els.ring = ring;
    plan.append(clear, ring);
    const night = el(doc, 'div', 'dock-night');
    const barRoot = el(doc, 'div');
    this.els.bar = barRoot;
    const toPlan = el(doc, 'button', 'btn', 'Back to planning');
    toPlan.type = 'button';
    toPlan.id = 'back-to-plan';
    this.els.back = toPlan;
    night.append(barRoot, toPlan);
    dock.append(plan, night);
    this.els.dock = dock;

    const live = el(doc, 'div', 'sr-only');
    live.id = 'live';
    live.setAttribute('aria-live', 'polite');
    this.els.live = live;

    page.append(bar, lesson, coach, stage, dock, live);
    this.root.append(page);
  }

  private wire(): void {
    const { canvas, clear } = this.els;
    const on = <E extends Event>(target: EventTarget, type: string, handler: (e: E) => void): void => {
      target.addEventListener(type, handler as EventListener);
      this.cleanups.push(() => target.removeEventListener(type, handler as EventListener));
    };

    on(this.els.ring, 'click', () => this.ring());
    on(coachHide(this.els.coach), 'click', () => this.setCoach(false));
    on(this.els.coachToggle, 'click', () => this.setCoach(true));
    on(this.els.back, 'click', () => this.backToPlan());
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
        canStart: (e) => this.phase === 'plan' && e.pointerType === 'mouse' && this.scene.hit(e.clientX, e.clientY).item !== null,
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
    if (this.phase === 'night') {
      this.show(this.cursor, 'jump');
      return;
    }
    this.preview = this.buildPreview();
    this.renderTray();
    this.renderBook();
    this.renderClock();
    this.renderCoach();
    this.syncScene();
  }

  private renderClock(): void {
    const run = this.run;
    const lit = this.phase === 'night' ? this.cursor : 0;
    this.els.pips.forEach((pip, i) => pip.classList.toggle('on', i < lit));
    const atEnd = !!run && this.cursor === run.bells;
    this.els.clockState.textContent =
      this.phase === 'plan' || !run ? 'Planning' : atEnd ? (run.outcome === 'won' ? 'Dawn' : `Caught at bell ${run.bells}`) : `Bell ${this.cursor} of ${BELLS}`;
    this.els.dock.dataset.phase = this.phase;
    this.els.page.dataset.phase = this.phase;
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
      button.disabled = left <= 0 || this.phase !== 'plan';
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
      button.disabled = inSpec || this.phase !== 'plan';
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
    if (this.phase === 'night') return;
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
      coach: this.coachTile,
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
    if (this.phase !== 'plan') return;
    const same = this.selection?.kind === 'item' && this.selection.type === type;
    this.selection = same ? null : { kind: 'item', type };
    this.refresh();
  }

  private toggleCard(card: number): void {
    this.services.sfx.unlock();
    if (this.phase !== 'plan') return;
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
    if (this.phase === 'plan' && this.selection?.kind === 'item') {
      if (hit.tile) this.placeAt(hit.tile.x, hit.tile.y);
      return;
    }
    if (this.phase === 'plan' && hit.item !== null && hit.tile && this.pickUp(hit.tile.x, hit.tile.y)) return;
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
      canStart: () => !button.disabled && this.phase === 'plan',
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

  // ---- the coach ----

  private setCoach(on: boolean): void {
    this.coachOn = on;
    if (on) this.services.progress.resetCoach(this.level.id);
    else this.services.progress.markCoachDone(this.level.id);
    this.renderCoach();
    this.scene.setMarks({ coach: this.coachTile });
  }

  private selectorOf(target: CoachTarget): string | null {
    switch (target.kind) {
      case 'tool':
        return `[data-tool="${target.type}"]`;
      case 'card':
        return `[data-card="${target.index}"]`;
      case 'slot':
        return `.hk-spec[data-actor="${target.actor}"] .hk-slot[data-at="${target.at}"]`;
      case 'remove':
        return `.hk-spec[data-actor="${target.actor}"] .hk-line[data-idx="${target.at}"] .hk-rm`;
      case 'ring':
        return '#ring';
      case 'retry':
        return '#retry';
      case 'next':
        return '#next';
      case 'tile':
        return null;
    }
  }

  /** Says the next instruction, and points at the control or tile it is about. */
  private renderCoach(): void {
    const { coach, coachToggle } = this.els;
    const coached = hasCoach(this.level);
    coachToggle.hidden = !coached || this.coachOn;
    for (const old of this.root.querySelectorAll('.pulse')) old.classList.remove('pulse');
    this.coachTile = null;
    const run = this.run;
    const atEnd = !!run && this.cursor === run.bells;
    const phase = this.phase === 'plan' ? 'plan' : atEnd && run ? (run.outcome === 'won' ? 'won' : 'lost') : 'night';
    const index = this.services.levels.findIndex((l) => l.id === this.level.id);
    const step =
      this.coachOn && coached
        ? coachStep(this.level, {
            phase,
            plan: this.plan,
            selection: this.selection,
            hasNext: index >= 0 && index < this.services.levels.length - 1,
            shadowedCard: !!run && [...run.stats.values()].some((s) => s.origin === 'card' && s.fired === 0 && s.shadowed > 0),
          })
        : null;
    coach.hidden = !step;
    coach.classList.toggle('done', step?.id === 'won');
    if (!step) {
      this.coachId = '';
      return;
    }
    this.els.coachTag.textContent = `${step.tag} \u00B7 ${this.level.name}`;
    this.els.coachText.textContent = step.text;
    if (step.target?.kind === 'tile') this.coachTile = { x: step.target.x, y: step.target.y };
    const selector = step.target ? this.selectorOf(step.target) : null;
    const target = selector ? this.root.querySelector<HTMLElement>(selector) : null;
    target?.classList.add('pulse');
    if (target && step.id !== this.coachId && target.scrollIntoView) {
      const rect = target.getBoundingClientRect();
      const height = this.doc.defaultView?.innerHeight ?? 800;
      if (rect.top < 0 || rect.bottom > height - 90) target.scrollIntoView({ block: 'center', behavior: this.services.reduced() ? 'auto' : 'smooth' });
    }
    this.coachId = step.id;
  }

  // ---- the night ----

  private clearTimers(): void {
    for (const t of this.timers.splice(0)) clearTimeout(t);
  }

  private ring(): void {
    if (this.phase !== 'plan') return;
    this.services.sfx.unlock();
    this.run = runNight(this.level, this.plan, this.registry);
    this.phase = 'night';
    this.selection = null;
    this.hover = null;
    this.cursor = 0;
    this.els.canvas.blur();
    this.bar.reset(this.run.bells);
    this.show(0, 'jump');
    this.bar.dispatch({ type: 'play' });
    this.bar.dispatch({ type: 'advance' });
  }

  private backToPlan(): void {
    this.clearTimers();
    this.bar.reset(0);
    this.phase = 'plan';
    this.run = null;
    this.cursor = 0;
    this.selection = null;
    this.els.verdict.replaceChildren();
    this.els.verdict.className = 'verdict';
    this.els.dawn.hidden = true;
    this.refresh();
    this.announce('Back to planning. Your setup is as you left it.');
  }

  private onReplay(state: ReplayState, action: ReplayAction): void {
    if (this.phase !== 'night' || !this.run || action.type === 'reset') return;
    const forward = state.cursor === this.cursor + 1 && (action.type === 'advance' || action.type === 'step');
    this.show(state.cursor, forward ? 'forward' : 'jump');
  }

  /**
   * Shows the night at a cursor. What is shown is a function of the recording and the cursor. Only a step forward by
   * one bell plays sound, threads, glides and the end sequences; any other move snaps and stays silent.
   */
  private show(cursor: number, how: 'forward' | 'jump'): void {
    const run = this.run;
    if (!run) return;
    const { recording } = run;
    const forward = how === 'forward';
    const atEnd = cursor === run.bells;
    const lost = atEnd && run.outcome === 'lost';
    const won = atEnd && run.outcome === 'won';
    const speed = this.bar.speed;
    const frame = recording.frames[cursor]!;
    const state = bookState(recording, cursor, { final: won, struck: lost ? run.struck : [] });
    this.cursor = cursor;
    this.clearTimers();

    this.preview = frame;
    this.book.update(
      bookViewOf(frame, this.registry, this.names, {
        marks: state.marks,
        tally: state.tally,
        bleed: new Set(state.written.map((w) => w.lineId)),
        animate: forward,
      }),
    );

    const chips = new Map<string, number>();
    for (const f of state.fired) chips.set(f.actor, f.index + 1);
    this.scene.setPhase(won ? 'dawn' : lost ? 'caught' : 'night');
    this.scene.setNumerals(Object.fromEntries(frame.actors.map((a) => [a.id, this.names.numeral(a.id)])));
    this.scene.setChips(chips);
    this.scene.setMarks({ hover: null, preview: null, cursor: null, coach: null, focus: this.focus });
    this.scene.setWorld(frame, { animate: forward, tickMs: (speed === 2 ? 260 : 620) - 60 });
    this.renderTray();
    this.renderClock();
    this.renderVerdict(won, lost, forward);
    // After the verdict, so that the coach can point at its buttons.
    this.renderCoach();

    if (!forward) return;
    this.services.sfx.toll(cursor === BELLS ? 1.2 : 1);
    let threads = 0;
    for (const fired of state.fired) {
      const line = this.book.lineElement(fired.lineId);
      const to = this.scene.actorPoint(fired.actor);
      if (!line || !to) continue;
      const rect = line.getBoundingClientRect();
      const girl = this.preview.actors.find((a) => a.id === fired.actor)?.kind === 'girl';
      const drawn = this.fx.thread({ x: rect.left + 10, y: rect.top + rect.height / 2 }, to, {
        ms: THREAD_MS[speed],
        color: girl ? 'rgba(232, 217, 181, .9)' : 'rgba(127, 209, 199, .95)',
      });
      if (drawn) threads++;
    }
    if (threads > 0 || state.written.length > 0) this.services.sfx.scratch();
    if (lost) this.services.sfx.sting();
    if (won) this.dawnSequence(state.marks);
  }

  /** The dawn: the chime, and lines that never ran burn one after the other while the ones that ran turn gold. */
  private dawnSequence(marks: ReadonlyMap<number, string>): void {
    this.services.sfx.chime();
    this.els.dawn.hidden = false;
    this.els.dawn.style.animation = 'none';
    void this.els.dawn.offsetWidth;
    this.els.dawn.style.animation = '';
    let order = 0;
    for (const actor of this.preview.actors) {
      for (const line of actor.lines) {
        const delay = 120 * order++;
        if (marks.get(line.id) !== 'ash') continue;
        this.timers.push(
          setTimeout(() => {
            const element = this.book.lineElement(line.id);
            if (!element) return;
            this.fx.ash(element.getBoundingClientRect());
            this.services.sfx.click();
          }, delay + 450),
        );
      }
    }
  }

  private renderVerdict(won: boolean, lost: boolean, forward: boolean): void {
    const box = this.els.verdict;
    const run = this.run;
    box.replaceChildren();
    box.className = 'verdict';
    if (!run || (!won && !lost)) {
      this.els.dawn.hidden = true;
      return;
    }
    const doc = this.doc;
    const actions = el(doc, 'div', 'actions');
    let primary: HTMLButtonElement;
    if (lost) {
      const text = lossText(run);
      box.classList.add('lost');
      box.append(el(doc, 'p', 'head', text.headline));
      for (const sentence of text.sentences) box.append(el(doc, 'p', '', sentence));
      primary = el(doc, 'button', 'btn primary', 'Try again');
      primary.id = 'retry';
      primary.addEventListener('click', () => this.backToPlan());
      this.els.dawn.hidden = true;
    } else {
      this.services.progress.markCleared(this.level.id);
      if (hasCoach(this.level)) this.services.progress.markCoachDone(this.level.id);
      const text = dawnText(run, solveCounts(this.level));
      box.classList.add('won');
      box.append(el(doc, 'p', 'head', text.headline));
      for (const sentence of text.sentences) box.append(el(doc, 'p', '', sentence));
      const index = this.services.levels.findIndex((l) => l.id === this.level.id);
      const next = this.services.levels[index + 1];
      primary = el(doc, 'button', 'btn primary', next ? `Go to ${next.id === 'prologue' ? next.name : `Night ${levelInfo(next).numeral}`}` : 'Back to the nights');
      primary.id = 'next';
      primary.addEventListener('click', () => {
        window.location.hash = next ? `#/night/${next.id}` : '#/nights';
      });
      if (!forward) this.els.dawn.hidden = true;
    }
    primary.type = 'button';
    actions.append(primary);
    box.append(actions);
    if (forward) {
      this.announce(lost ? 'She is gone.' : 'Dawn. She is still asleep.');
      primary.focus({ preventScroll: true });
      box.scrollIntoView?.({ block: 'nearest', behavior: this.services.reduced() ? 'auto' : 'smooth' });
    }
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
    if (this.phase === 'plan' && this.selection?.kind === 'item') this.placeAt(x, y);
    else if (this.phase !== 'plan' || !this.pickUp(x, y)) {
      const actor = this.preview.actors.find((a) => a.pos.x === x && a.pos.y === y);
      if (actor) this.setFocus(this.focus === actor.id ? null : actor.id);
    }
  }
}

const coachHide = (coach: HTMLElement): HTMLElement => coach.querySelector<HTMLElement>('#coach-hide')!;

export const mountPlay: Mount = (root, services, _go, route) => {
  const level = services.levels.find((l) => route.screen === 'night' && l.id === route.id);
  if (!level) throw new Error('no such level');
  return new PlayScreen(root, services, level);
};
