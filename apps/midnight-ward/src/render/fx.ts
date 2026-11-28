import type { Surface } from './surface';
import { ctxOf } from './surface';

export interface Point {
  x: number;
  y: number;
}

export interface FxEnvironment {
  reduced: () => boolean;
  dpr: () => number;
  /** The size of the page area the layer covers, in CSS pixels. */
  viewport: () => { width: number; height: number };
}

/** How long an ink thread takes to run from its line to its ghost, by replay speed. */
export const THREAD_MS = { 1: 700, 2: 380 } as const;
/** A thread fades out over a quarter of its length after it arrives. */
const FADE = 0.25;
export const ASH_COUNT = 26;
const ASH_LIFE_MS = 1500;

interface Thread {
  from: Point;
  to: Point;
  start: number;
  ms: number;
  color: string;
}

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  hot: boolean;
}

/**
 * A canvas over the whole page, with no pointer events. It draws the ink threads that lift off a firing line and run
 * to its ghost, and the ash that rises from lines that burn. It does nothing when the player asked for less motion,
 * and its frame loop stops when there is nothing left to draw.
 */
export class FxLayer {
  private threads: Thread[] = [];
  private specks: Speck[] = [];
  private frame = 0;
  private running = false;
  private lastNow = 0;

  constructor(
    private readonly canvas: Surface,
    private readonly env: FxEnvironment,
    private readonly rng: () => number = Math.random,
  ) {}

  /** True while something is being drawn. */
  get active(): boolean {
    return this.threads.length > 0 || this.specks.length > 0;
  }

  get threadCount(): number {
    return this.threads.length;
  }

  get speckCount(): number {
    return this.specks.length;
  }

  resize(): void {
    const { width, height } = this.env.viewport();
    const dpr = Math.min(2, Math.max(1, this.env.dpr()));
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  /** Starts a thread. Returns false when motion is reduced and nothing is drawn. */
  thread(from: Point, to: Point, options: { ms: number; color: string; now?: number }): boolean {
    if (this.env.reduced()) return false;
    const now = options.now ?? this.lastNow;
    this.threads.push({ from, to, start: now, ms: options.ms, color: options.color });
    this.kick();
    return true;
  }

  /** Lets ash rise from a rectangle of the page. Returns false when motion is reduced. */
  ash(rect: { left: number; top: number; width: number; height: number }): boolean {
    if (this.env.reduced()) return false;
    for (let i = 0; i < ASH_COUNT; i++) {
      this.specks.push({
        x: rect.left + this.rng() * rect.width,
        y: rect.top + this.rng() * rect.height,
        vx: (this.rng() - 0.3) * 0.04,
        vy: -0.02 - this.rng() * 0.07,
        age: 0,
        hot: this.rng() < 0.5,
      });
    }
    this.kick();
    return true;
  }

  /** Draws one frame and drops what has finished. */
  draw(now: number): void {
    const dt = this.lastNow === 0 ? 16 : Math.min(100, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    const ctx = ctxOf(this.canvas);
    const dpr = Math.min(2, Math.max(1, this.env.dpr()));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width, height } = this.env.viewport();
    ctx.clearRect(0, 0, width, height);

    this.threads = this.threads.filter((t) => (now - t.start) / t.ms <= 1 + FADE);
    for (const t of this.threads) this.drawThread(ctx, t, now);

    for (const s of this.specks) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy *= 0.995;
    }
    this.specks = this.specks.filter((s) => s.age < ASH_LIFE_MS);
    for (const s of this.specks) {
      const life = 1 - s.age / ASH_LIFE_MS;
      ctx.fillStyle = s.hot ? `rgba(249, 140, 40, ${life})` : `rgba(70, 60, 50, ${life})`;
      ctx.fillRect(s.x, s.y, 2, 2);
    }
  }

  stop(): void {
    this.running = false;
    globalThis.cancelAnimationFrame?.(this.frame);
  }

  private kick(): void {
    if (this.running) return;
    this.running = true;
    const step = (now: number): void => {
      if (!this.running) return;
      this.draw(now);
      if (this.active) this.frame = globalThis.requestAnimationFrame(step);
      else this.running = false;
    };
    this.frame = globalThis.requestAnimationFrame(step);
  }

  private drawThread(ctx: CanvasRenderingContext2D, t: Thread, now: number): void {
    const k = (now - t.start) / t.ms;
    if (k < 0) return;
    const progress = Math.min(1, k);
    const alpha = k > 1 ? Math.max(0, 1 - (k - 1) / FADE) : 0.9;
    const cx = (t.from.x + t.to.x) / 2;
    const cy = Math.min(t.from.y, t.to.y) - 60;
    const at = (u: number): Point => ({
      x: (1 - u) * (1 - u) * t.from.x + 2 * (1 - u) * u * cx + u * u * t.to.x,
      y: (1 - u) * (1 - u) * t.from.y + 2 * (1 - u) * u * cy + u * u * t.to.y + Math.sin(u * 18 + now / 80) * 2,
    });
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const steps = 40;
    for (let s = 0; s <= steps * progress; s++) {
      const p = at(s / steps);
      if (s === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.fillStyle = t.color;
    for (let j = 0; j < 6; j++) {
      const p = at(Math.max(0, progress - j * 0.04));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4 - j * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
