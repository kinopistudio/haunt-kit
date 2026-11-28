import type { Item, World } from 'haunt-kit';
import { NEAR } from '../vocab';
import { dollhouseAspect, makeCamera, project, tileAt } from './camera';
import type { Camera } from './camera';
import { sortDrawables, thingKey } from './drawlist';
import type { Drawable } from './drawlist';
import { FloorLayer, drawFloorStrips } from './floor';
import type { Light, RangeMark } from './floor';
import { drawBell, drawCandle, drawChip, drawGirl, drawSalt, drawWisp, upright } from './sprites';
import { ctxOf, windowColumn } from './surface';
import type { MapInfo, Surface, SurfaceFactory, Tile } from './surface';
import { BLOOD, ROOM } from './theme';
import { brightness, drawWallBlock, wallBlocks } from './walls';
import type { WallBlock } from './walls';

export type ScenePhase = 'plan' | 'night' | 'dawn' | 'caught';

/** How dark the ward is in each phase: a candle-lit room while planning, black at night, a pale room at dawn. */
export const DARKNESS: Record<ScenePhase, number> = { plan: 0.22, night: 0.72, dawn: 0.08, caught: 0.8 };

/** Milliseconds the morning takes to sweep over the room, and the red tint to settle after a capture. */
export const DAWN_MS = 1800;
export const CAUGHT_MS = 900;

export interface SceneEnvironment {
  /** True when the player asked for less motion. */
  reduced: () => boolean;
  /** Device pixel ratio. The scene uses at most 2. */
  dpr: () => number;
  viewportHeight: () => number;
  /** The canvas on the page, in CSS pixels. */
  rect: () => { left: number; top: number; width: number; height: number };
}

export interface SceneMarks {
  /** The tile the coach points at. */
  coach: Tile | null;
  /** The keyboard cursor. */
  cursor: Tile | null;
  /** The tile under the pointer, and whether the selected item may go there. */
  hover: (Tile & { ok: boolean }) | null;
  /** An item that is selected and where it would stand: shows its range. */
  preview: { type: string; x: number; y: number } | null;
  /** An actor whose page is being looked at: it is outlined and its reach is shown. */
  focus: string | null;
}

export interface Hit {
  tile: Tile | null;
  /** Index into `world.items` of the item under the point. */
  item: number | null;
  /** Id of the actor under the point. */
  actor: string | null;
}

interface ActorView {
  id: string;
  kind: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
  x: number;
  y: number;
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** What the scene needs to know about a world's map: its size, walls and the bed. */
export function mapInfo(world: World): MapInfo {
  return { w: world.map.w, h: world.map.h, walls: world.map.walls, bed: world.markers.bed?.[0] ?? null };
}

/** The environment of a page. */
export function pageEnvironment(canvas: HTMLCanvasElement, reduced: () => boolean): SceneEnvironment {
  return {
    reduced,
    dpr: () => Math.min(2, globalThis.devicePixelRatio || 1),
    viewportHeight: () => globalThis.innerHeight || 800,
    rect: () => canvas.getBoundingClientRect(),
  };
}

/**
 * The ward on a canvas: a dollhouse cutaway seen from one fixed camera. The floor is drawn top-down to a texture and
 * projected in strips; walls, items and characters stand up from it in depth order. The scene holds only what it
 * needs to draw (where characters are gliding, how dark it is). What the world contains is given to `setWorld`.
 */
export class Scene {
  private cam: Camera;
  private readonly floor: FloorLayer;
  private readonly blocks: WallBlock[];
  private readonly ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private world: World | null = null;
  private actors: ActorView[] = [];
  private chips = new Map<string, number>();
  private numerals: Record<string, string> = {};
  private marks: SceneMarks = { coach: null, cursor: null, hover: null, preview: null, focus: null };
  private phase: ScenePhase = 'plan';
  private darkness = DARKNESS.plan;
  private phaseSince = 0;
  private tickMs = 620;
  private dirty = true;
  private lastNow = 0;
  private frame = 0;
  private loop = false;

  constructor(
    private readonly canvas: Surface & { style?: { width: string; height: string } },
    private readonly map: MapInfo,
    make: SurfaceFactory,
    private readonly env: SceneEnvironment,
  ) {
    this.ctx = ctxOf(canvas);
    this.floor = new FloorLayer(map, make);
    this.blocks = wallBlocks(map);
    this.cam = makeCamera(map, 1, 1);
  }

  /** Device pixels per CSS pixel, at most 2: a sharper canvas is not worth four times the fill. */
  private pixelRatio(): number {
    return Math.min(2, Math.max(1, this.env.dpr()));
  }

  /** The camera. It is set by `resize` and never changes between two resizes. */
  get camera(): Camera {
    return this.cam;
  }

  get size(): { width: number; height: number } {
    return { width: this.cssW, height: this.cssH };
  }

  /** Sizes the canvas for a container width: the dollhouse fits, and the canvas is at most 78% of the window tall. */
  resize(width: number): void {
    const w = Math.max(160, Math.floor(width));
    const h = Math.round(Math.min(w * dollhouseAspect(this.map), Math.max(240, this.env.viewportHeight() * 0.78)));
    const dpr = this.pixelRatio();
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.canvas.style) {
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.cam = makeCamera(this.map, w, h);
    this.dirty = true;
  }

  /**
   * Shows a world frame. With `animate`, characters glide from where they are drawn now to their new tiles in
   * `tickMs`; otherwise (a scrub, a reset, reduced motion) they jump.
   */
  setWorld(world: World, options: { animate: boolean; tickMs?: number; now?: number } = { animate: false }): void {
    const now = options.now ?? this.lastNow;
    const glide = options.animate && !this.env.reduced();
    this.tickMs = options.tickMs ?? this.tickMs;
    const before = new Map(this.actors.map((a) => [a.id, a]));
    this.actors = world.actors.map((a) => {
      const old = before.get(a.id);
      const fromX = glide && old ? old.x : a.pos.x;
      const fromY = glide && old ? old.y : a.pos.y;
      return { id: a.id, kind: a.kind, fromX, fromY, toX: a.pos.x, toY: a.pos.y, start: now, x: fromX, y: fromY };
    });
    this.world = world;
    this.dirty = true;
  }

  /** The number of the line each actor ran at this cursor, 1-based, shown as a chip above it. */
  setChips(lines: Map<string, number>): void {
    this.chips = lines;
    this.dirty = true;
  }

  /** Roman numerals for ghosts that share a kind. */
  setNumerals(numerals: Record<string, string>): void {
    this.numerals = numerals;
    this.dirty = true;
  }

  setMarks(marks: Partial<SceneMarks>): void {
    this.marks = { ...this.marks, ...marks };
    this.dirty = true;
  }

  setPhase(phase: ScenePhase, now = this.lastNow): void {
    if (phase === this.phase) return;
    this.phase = phase;
    this.phaseSince = now;
    if (this.env.reduced()) this.darkness = DARKNESS[phase];
    this.dirty = true;
  }

  get currentPhase(): ScenePhase {
    return this.phase;
  }

  /** The current darkness, 0 to 1. */
  get currentDarkness(): number {
    return this.darkness;
  }

  /** Where an actor is drawn now, in tiles (fractional while it glides). */
  position(id: string): { x: number; y: number } | null {
    const a = this.actors.find((v) => v.id === id);
    return a ? { x: a.x, y: a.y } : null;
  }

  /** Where an actor's sprite is on the page (client pixels), for the ink thread that runs to it. */
  actorPoint(id: string): { x: number; y: number } | null {
    const a = this.actors.find((v) => v.id === id);
    if (!a) return null;
    const rect = this.env.rect();
    const p = project(this.cam, a.toX + 0.5, a.toY + 0.62, a.kind === 'girl' ? 0.45 : 0.6);
    return { x: rect.left + (p.X * rect.width) / (this.cssW || 1), y: rect.top + (p.Y * rect.height) / (this.cssH || 1) };
  }

  /** What is under a point of the page: an item or character if one is drawn there, else the floor tile. */
  hit(clientX: number, clientY: number): Hit {
    const rect = this.env.rect();
    const X = ((clientX - rect.left) * this.cssW) / (rect.width || 1);
    const Y = ((clientY - rect.top) * this.cssH) / (rect.height || 1);
    const candidates: { key: number; item: number | null; actor: string | null; tile: Tile }[] = [];
    const inside = (x: number, y: number, lift: number, width: number, height: number): boolean => {
      const p = project(this.cam, x + 0.5, y + 0.62, lift);
      return Math.abs(X - p.X) <= (p.scale * width) / 2 && Y <= p.Y + p.scale * 0.08 && Y >= p.Y - p.scale * height;
    };
    this.world?.items.forEach((item, index) => {
      if (inside(item.pos.x, item.pos.y, 0, 0.7, item.type === 'salt' ? 0.4 : 0.7)) {
        candidates.push({ key: item.pos.y, item: index, actor: null, tile: { x: item.pos.x, y: item.pos.y } });
      }
    });
    for (const a of this.actors) {
      if (inside(a.x, a.y, a.kind === 'girl' ? 0 : 0.18, 0.6, 0.95)) {
        candidates.push({ key: a.y, item: null, actor: a.id, tile: { x: Math.round(a.x), y: Math.round(a.y) } });
      }
    }
    const front = candidates.sort((p, q) => q.key - p.key)[0];
    if (front) return { tile: front.tile, item: front.item, actor: front.actor };
    return { tile: tileAt(this.cam, X, Y), item: null, actor: null };
  }

  /** Starts the frame loop. It draws every frame unless the player asked for less motion, then only when something changed. */
  start(): void {
    if (this.loop) return;
    this.loop = true;
    const step = (now: number): void => {
      if (!this.loop) return;
      this.frame = globalThis.requestAnimationFrame(step);
      if (!this.env.reduced() || this.dirty || this.moving(now) || this.settling(now)) this.draw(now);
    };
    this.frame = globalThis.requestAnimationFrame(step);
  }

  stop(): void {
    this.loop = false;
    globalThis.cancelAnimationFrame?.(this.frame);
  }

  private moving(now: number): boolean {
    const first = this.actors[0];
    return !!first && this.actors.some((a) => a.x !== a.toX || a.y !== a.toY) && now - first.start < this.tickMs + 50;
  }

  private settling(now: number): boolean {
    return Math.abs(this.darkness - DARKNESS[this.phase]) > 0.003 || now - this.phaseSince < DAWN_MS + 50;
  }

  /** Draws one frame. */
  draw(now: number): void {
    const world = this.world;
    if (!world || this.cssW === 0) return;
    const reduced = this.env.reduced();
    const dt = Math.min(500, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    this.dirty = false;
    const time = reduced ? 0 : now;

    // Glide, and ease the darkness.
    for (const a of this.actors) {
      const k = reduced || this.tickMs <= 0 ? 1 : clamp01((now - a.start) / this.tickMs);
      const e = ease(k);
      a.x = a.fromX + (a.toX - a.fromX) * e;
      a.y = a.fromY + (a.toY - a.fromY) * e;
    }
    const target = DARKNESS[this.phase];
    this.darkness = reduced ? target : this.darkness + (target - this.darkness) * (1 - Math.pow(0.002, dt / 1000));
    const since = now - this.phaseSince;
    const dawn = this.phase === 'dawn' ? (reduced ? 1 : clamp01(since / DAWN_MS)) : 0;
    const caught = this.phase === 'caught' ? (reduced ? 1 : clamp01(since / CAUGHT_MS)) : 0;

    const { map, cam } = this;
    const girl = this.actors.find((a) => a.kind === 'girl');
    const inBed = !!(girl && map.bed && Math.abs(girl.x - map.bed.x) < 0.01 && Math.abs(girl.y - map.bed.y) < 0.01);
    const breath = (Math.sin(time / 900) * 0.5 + 0.5) * (reduced ? 0 : 1);

    // 1. The floor texture, then 2. its projection.
    this.floor.draw({
      darkness: this.darkness,
      dawn,
      time,
      lights: this.lights(world, girl),
      blooms: world.items.filter((i) => i.type === 'candle' && i.state.lit === true).map((i) => ({ x: i.pos.x + 0.5, y: i.pos.y + 0.55, radius: 1.6, strength: 1 })),
      ranges: this.ranges(world),
      coach: this.marks.coach,
      cursor: this.marks.cursor,
      hover: this.marks.hover,
      sleeper: inBed ? { breath } : null,
      pulse: reduced ? 1 : Math.sin(now / 240) * 0.5 + 0.5,
    });
    const ctx = this.ctx;
    const dpr = this.pixelRatio();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = ROOM.void;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    drawFloorStrips(ctx, cam, this.floor.surface, map);

    // 3. Walls and things that stand up, back to front.
    const light = brightness(this.darkness, dawn);
    const drawables: Drawable[] = this.blocks.map((block) => ({ kind: 'wall', key: block.key, block }) as Drawable);
    world.items.forEach((item, index) => drawables.push(this.itemDrawable(item, index, time)));
    for (const a of this.actors) {
      if (a.kind === 'girl' && inBed) continue;
      drawables.push(this.actorDrawable(a, time, breath));
    }
    for (const d of sortDrawables(drawables)) {
      if (d.kind === 'wall') drawWallBlock(ctx, cam, map, d.block, light);
      else d.draw();
    }

    // 4. Chips above characters: the line each one ran, and the numerals that tell two ghosts apart.
    this.drawChips(ctx, inBed);

    // 5. Light in screen space, the vignette, and the red of a capture.
    ctx.globalCompositeOperation = 'lighter';
    for (const item of world.items) {
      if (item.type !== 'candle' || item.state.lit !== true) continue;
      const p = project(cam, item.pos.x + 0.5, item.pos.y + 0.55, 0.55);
      const r = p.scale * 1.3;
      const g = ctx.createRadialGradient(p.X, p.Y, 0, p.X, p.Y, r);
      g.addColorStop(0, 'rgba(242, 165, 65, .22)');
      g.addColorStop(1, 'rgba(242, 165, 65, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.X - r, p.Y - r, r * 2, r * 2);
    }
    if (dawn > 0) {
      ctx.fillStyle = `rgba(255, 214, 150, ${0.08 * dawn})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    ctx.globalCompositeOperation = 'source-over';
    const vignette = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, Math.min(this.cssW, this.cssH) * 0.35, this.cssW / 2, this.cssH / 2, Math.max(this.cssW, this.cssH) * 0.75);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, `rgba(0, 0, 0, ${0.55 - dawn * 0.3})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (caught > 0) {
      ctx.fillStyle = BLOOD;
      ctx.globalAlpha = 0.34 * caught;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.globalAlpha = 1;
    }
  }

  private lights(world: World, girl: ActorView | undefined): Light[] {
    const lights: Light[] = [];
    const { map } = this;
    if (girl) lights.push({ x: girl.x + 0.5, y: girl.y + 0.5, radius: 1.15, strength: 0.8 });
    for (const a of this.actors) if (a.kind !== 'girl') lights.push({ x: a.x + 0.5, y: a.y + 0.5, radius: 0.9, strength: 0.6 });
    for (const item of world.items) {
      if (item.type === 'candle' && item.state.lit === true) lights.push({ x: item.pos.x + 0.5, y: item.pos.y + 0.5, radius: 2.6, strength: 1 });
    }
    lights.push({ x: windowColumn(map) + 0.5, y: 1.6, radius: 1.6, strength: 0.4 });
    return lights;
  }

  private ranges(world: World): RangeMark[] {
    const ranges: RangeMark[] = [];
    if (this.phase === 'plan') {
      for (const item of world.items) {
        if (item.type === 'bell') ranges.push({ x: item.pos.x, y: item.pos.y, r: NEAR.bell, tone: 'bell' });
        if (item.type === 'candle') ranges.push({ x: item.pos.x, y: item.pos.y, r: NEAR.candle, tone: 'candle' });
      }
      const p = this.marks.preview;
      if (p && (p.type === 'bell' || p.type === 'candle')) ranges.push({ x: p.x, y: p.y, r: p.type === 'bell' ? NEAR.bell : NEAR.candle, tone: p.type === 'bell' ? 'bell' : 'candle' });
    }
    const focus = this.actors.find((a) => a.id === this.marks.focus && a.kind !== 'girl');
    if (focus) ranges.push({ x: Math.round(focus.x), y: Math.round(focus.y), r: NEAR.girl, tone: 'ghost' });
    return ranges;
  }

  private itemDrawable(item: Item, index: number, time: number): Drawable {
    return {
      kind: 'thing',
      id: `item-${index}`,
      key: thingKey(item.pos.y),
      draw: () => {
        const ctx = this.ctx;
        const options = { shadow: item.type === 'salt' ? 0.34 : 0.26, shadowAlpha: item.type === 'salt' ? 0.18 : 0.3 };
        upright(ctx, this.cam, item.pos.x, item.pos.y, options, () => {
          if (item.type === 'salt') drawSalt(ctx);
          else if (item.type === 'bell') drawBell(ctx, time);
          else if (item.type === 'candle') drawCandle(ctx, item.state.lit === true, time);
        });
      },
    };
  }

  private actorDrawable(a: ActorView, time: number, breath: number): Drawable {
    const ghost = a.kind !== 'girl';
    const phase = (a.id.length + a.id.charCodeAt(a.id.length - 1)) * 0.9;
    const bob = ghost ? Math.sin(time / 420 + phase) * 0.04 * (this.env.reduced() ? 0 : 1) : 0;
    return {
      kind: 'thing',
      id: a.id,
      key: thingKey(a.y),
      draw: () => {
        const ctx = this.ctx;
        upright(ctx, this.cam, a.x, a.y, { shadow: ghost ? 0.24 : 0.24, shadowAlpha: ghost ? 0.2 : 0.35, lift: ghost ? 0.18 + bob : 0 }, () => {
          if (ghost) drawWisp(ctx, { time, phase, highlight: this.marks.focus === a.id });
          else drawGirl(ctx, breath);
        });
      },
    };
  }

  private drawChips(ctx: CanvasRenderingContext2D, girlInBed: boolean): void {
    const ghostTiles = new Set(this.actors.filter((a) => a.kind !== 'girl').map((a) => `${Math.round(a.x)},${Math.round(a.y)}`));
    for (const a of this.actors) {
      const ghost = a.kind !== 'girl';
      const p = project(this.cam, a.x + 0.5, a.y + 0.62, ghost ? 0.18 : 0);
      const size = Math.max(9, Math.min(14, p.scale * 0.2));
      const line = this.chips.get(a.id);
      const hidden = !ghost && ghostTiles.has(`${Math.round(a.x)},${Math.round(a.y)}`);
      if (line !== undefined && !hidden && this.phase !== 'plan') {
        const lift = girlInBed && !ghost ? 0.55 : ghost ? 1.0 : 0.85;
        const head = project(this.cam, a.x + 0.5, a.y + 0.62, lift + (ghost ? 0.18 : 0));
        drawChip(ctx, { text: `L${line}`, X: head.X, Y: head.Y, size, tone: ghost ? 'line' : 'girl' });
      }
      const numeral = this.numerals[a.id];
      if (numeral && ghost) drawChip(ctx, { text: numeral, X: p.X, Y: p.Y + size * 1.9, size: size * 0.9, tone: 'numeral' });
    }
  }
}
