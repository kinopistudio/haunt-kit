import { project } from './camera';
import type { Camera } from './camera';
import { AMBER, ROOM, TEAL } from './theme';
import { ctxOf, isWall, windowColumn } from './surface';
import type { MapInfo, Surface, SurfaceFactory, Tile } from './surface';

/** Pixels per tile in the floor texture. */
export const TEXTURE_TILE = 96;
/** How many horizontal strips each tile row is cut into when the floor is projected. */
export const STRIPS_PER_ROW = 16;

export interface Light {
  /** Centre in tiles, not tile indexes (a tile's middle is x + 0.5). */
  x: number;
  y: number;
  /** Radius in tiles. */
  radius: number;
  /** 0 to 1: how much darkness the hole removes at its middle. */
  strength: number;
}

export interface RangeMark {
  x: number;
  y: number;
  /** Manhattan radius in tiles. */
  r: number;
  tone: 'bell' | 'candle' | 'ghost';
}

export interface FloorInput {
  /** 0 (bright) to 1 (black). */
  darkness: number;
  /** 0 to 1: the morning sweeping over the floor. */
  dawn: number;
  /** Time in milliseconds, for the flicker of lights. Fixed at 0 when motion is reduced. */
  time: number;
  lights: Light[];
  /** Candle bloom, added over the dark. */
  blooms: Light[];
  ranges: RangeMark[];
  /** The tile the coach points at. */
  coach: Tile | null;
  /** The keyboard cursor. */
  cursor: Tile | null;
  /** The tile under the pointer, and whether an item may go there. */
  hover: (Tile & { ok: boolean }) | null;
  /** 0 to 1 while the girl lies in her bed, else `null`. */
  sleeper: { breath: number } | null;
  /** Pulse of the coach tile, 0 to 1. */
  pulse: number;
}

const RANGE_TONE: Record<RangeMark['tone'], { fill: string; line: string }> = {
  bell: { fill: 'rgba(232, 184, 90, .10)', line: 'rgba(232, 184, 90, .55)' },
  candle: { fill: 'rgba(242, 165, 69, .10)', line: 'rgba(242, 165, 65, .5)' },
  ghost: { fill: 'rgba(127, 209, 199, .08)', line: 'rgba(127, 209, 199, .6)' },
};

/** A small deterministic scatter in 0..1 for grain and knots, so that the floor looks the same every time. */
const hash = (x: number, y: number, k: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function drawBase(ctx: CanvasRenderingContext2D, map: MapInfo): void {
  const T = TEXTURE_TILE;
  ctx.fillStyle = ROOM.void;
  ctx.fillRect(0, 0, map.w * T, map.h * T);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (isWall(map, x, y)) continue;
      const px = x * T;
      const py = y * T;
      ctx.fillStyle = (x + y) & 1 ? ROOM.floorA : ROOM.floorB;
      ctx.fillRect(px, py, T, T);
      // Planks run east to west, three to a tile, with a slightly different tone each.
      for (let i = 0; i < 3; i++) {
        const top = py + (i * T) / 3;
        ctx.fillStyle = `rgba(${hash(x, y, i) > 0.5 ? '255, 235, 200' : '0, 0, 0'}, ${0.015 + hash(x, y, i + 9) * 0.035})`;
        ctx.fillRect(px, top, T, T / 3);
        ctx.fillStyle = ROOM.plankLine;
        ctx.fillRect(px, top, T, 1.5);
        // The joint between two boards.
        const joint = px + hash(x, y, i + 3) * T;
        ctx.fillRect(joint, top, 1.5, T / 3);
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, .22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      if (hash(x, y, 20) > 0.8) {
        ctx.fillStyle = 'rgba(0, 0, 0, .25)';
        ctx.beginPath();
        ctx.ellipse(px + hash(x, y, 21) * T, py + hash(x, y, 22) * T, 4, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Moonlight from the window in the back wall, falling on the floor in front of it.
  const wx = windowColumn(map);
  if (!isWall(map, wx, 1)) {
    const g = ctx.createLinearGradient(0, T, 0, T * Math.min(map.h - 1, 4.5));
    g.addColorStop(0, 'rgba(127, 209, 199, .13)');
    g.addColorStop(1, 'rgba(127, 209, 199, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo((wx + 0.15) * T, T);
    ctx.lineTo((wx + 0.85) * T, T);
    ctx.lineTo((wx + 1.6) * T, T * Math.min(map.h - 1, 4.5));
    ctx.lineTo((wx - 0.6) * T, T * Math.min(map.h - 1, 4.5));
    ctx.closePath();
    ctx.fill();
  }
}

/** The bed seen from above: frame, sheet, pillow. The sleeper is drawn on it while the girl lies there. */
function drawBed(ctx: CanvasRenderingContext2D, bed: Tile, sleeper: FloorInput['sleeper']): void {
  const T = TEXTURE_TILE;
  const x = bed.x * T;
  const y = bed.y * T;
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.fillRect(x + T * 0.04, y + T * 0.08, T * 0.92, T * 0.92);
  ctx.fillStyle = ROOM.wood;
  ctx.fillRect(x + T * 0.06, y + T * 0.04, T * 0.88, T * 0.92);
  ctx.fillStyle = ROOM.sheet;
  ctx.fillRect(x + T * 0.13, y + T * 0.1, T * 0.74, T * 0.8);
  ctx.fillStyle = '#e6dbbd';
  ctx.beginPath();
  ctx.roundRect(x + T * 0.2, y + T * 0.13, T * 0.6, T * 0.2, T * 0.06);
  ctx.fill();
  if (!sleeper) return;
  const breath = sleeper.breath;
  ctx.fillStyle = ROOM.skin;
  ctx.beginPath();
  ctx.arc(x + T * 0.5, y + T * 0.25, T * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ROOM.hair;
  ctx.beginPath();
  ctx.arc(x + T * 0.5, y + T * 0.22, T * 0.115, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  ctx.fillStyle = ROOM.blanket;
  ctx.beginPath();
  ctx.roundRect(x + T * 0.17, y + T * (0.36 - breath * 0.015), T * 0.66, T * (0.5 + breath * 0.03), T * 0.05);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, .25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + T * 0.22, y + T * 0.5);
  ctx.lineTo(x + T * 0.78, y + T * 0.5);
  ctx.stroke();
}

function diamond(ctx: CanvasRenderingContext2D, map: MapInfo, mark: RangeMark): void {
  const T = TEXTURE_TILE;
  const tone = RANGE_TONE[mark.tone];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (isWall(map, x, y) || Math.abs(x - mark.x) + Math.abs(y - mark.y) > mark.r) continue;
      ctx.fillStyle = tone.fill;
      ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
      ctx.strokeStyle = tone.line;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.strokeRect(x * T + 6, y * T + 6, T - 12, T - 12);
      ctx.setLineDash([]);
    }
  }
}

function hole(ctx: CanvasRenderingContext2D, light: Light): void {
  const T = TEXTURE_TILE;
  const g = ctx.createRadialGradient(light.x * T, light.y * T, 0, light.x * T, light.y * T, light.radius * T);
  g.addColorStop(0, `rgba(0, 0, 0, ${light.strength})`);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(light.x * T, light.y * T, light.radius * T, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The floor as a top-down texture: planks, the bed, range diamonds, then the darkness with holes of light,
 * candle bloom, the morning, and finally the marks that must not be dimmed (the coach tile, the cursor).
 */
export class FloorLayer {
  readonly surface: Surface;
  private readonly base: Surface;
  private readonly mask: Surface;
  private baseDrawn = false;

  constructor(
    private readonly map: MapInfo,
    make: SurfaceFactory,
  ) {
    const size = (s: Surface): Surface => {
      s.width = map.w * TEXTURE_TILE;
      s.height = map.h * TEXTURE_TILE;
      return s;
    };
    this.surface = size(make());
    this.base = size(make());
    this.mask = size(make());
  }

  draw(input: FloorInput): void {
    const { map } = this;
    const T = TEXTURE_TILE;
    const W = map.w * T;
    const H = map.h * T;
    const ctx = ctxOf(this.surface);
    if (!this.baseDrawn) {
      drawBase(ctxOf(this.base), map);
      this.baseDrawn = true;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.base as unknown as CanvasImageSource, 0, 0);
    if (map.bed) drawBed(ctx, map.bed, input.sleeper);
    for (const mark of input.ranges) diamond(ctx, map, mark);

    // Darkness with holes in it.
    const m = ctxOf(this.mask);
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, W, H);
    m.fillStyle = `rgba(4, 3, 2, ${input.darkness})`;
    m.fillRect(0, 0, W, H);
    m.globalCompositeOperation = 'destination-out';
    for (const light of input.lights) hole(m, light);
    if (input.dawn > 0) {
      m.fillStyle = `rgba(0, 0, 0, ${Math.min(1, input.dawn)})`;
      m.fillRect(0, 0, W, H);
    }
    m.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.mask as unknown as CanvasImageSource, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    for (const bloom of input.blooms) {
      const g = ctx.createRadialGradient(bloom.x * T, bloom.y * T, 0, bloom.x * T, bloom.y * T, bloom.radius * T);
      g.addColorStop(0, `rgba(242, 165, 65, ${0.3 * bloom.strength})`);
      g.addColorStop(1, 'rgba(242, 165, 65, 0)');
      ctx.fillStyle = g;
      ctx.fillRect((bloom.x - bloom.radius) * T, (bloom.y - bloom.radius) * T, bloom.radius * 2 * T, bloom.radius * 2 * T);
    }
    if (input.dawn > 0) {
      const sweep = Math.min(1, input.dawn * 1.2);
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(Math.max(0, sweep - 0.3), 'rgba(255, 214, 150, 0)');
      g.addColorStop(sweep, `rgba(255, 214, 150, ${0.22 * input.dawn})`);
      g.addColorStop(Math.min(1, sweep + 0.01), 'rgba(255, 214, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';

    if (input.coach) {
      const { x, y } = input.coach;
      ctx.fillStyle = `rgba(242, 165, 65, ${0.14 + 0.18 * input.pulse})`;
      ctx.fillRect(x * T + 4, y * T + 4, T - 8, T - 8);
      ctx.strokeStyle = `rgba(255, 205, 130, ${0.55 + 0.45 * input.pulse})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(x * T + 6, y * T + 6, T - 12, T - 12);
    }
    if (input.hover) {
      const { x, y, ok } = input.hover;
      ctx.strokeStyle = ok ? 'rgba(242, 165, 65, .85)' : 'rgba(232, 217, 181, .35)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 7]);
      ctx.strokeRect(x * T + 8, y * T + 8, T - 16, T - 16);
      ctx.setLineDash([]);
    }
    if (input.cursor) {
      const { x, y } = input.cursor;
      ctx.strokeStyle = TEAL;
      ctx.lineWidth = 3;
      ctx.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1;
      ctx.strokeRect(x * T + 8, y * T + 8, T - 16, T - 16);
    }
  }
}

/**
 * Draws the floor texture on the canvas, cut into horizontal strips. Each strip is placed between the projected
 * top and bottom edges of its slice of the floor, at the scale of its depth, so the floor narrows away from the
 * camera without any per-pixel work.
 */
export function drawFloorStrips(ctx: CanvasRenderingContext2D, cam: Camera, texture: Surface, map: Pick<MapInfo, 'w' | 'h'>): void {
  const T = TEXTURE_TILE;
  const slice = T / STRIPS_PER_ROW;
  for (let i = 0; i < map.h * STRIPS_PER_ROW; i++) {
    const top = i / STRIPS_PER_ROW;
    const a = project(cam, 0, top, 0);
    const b = project(cam, map.w, top, 0);
    const c = project(cam, 0, (i + 1) / STRIPS_PER_ROW, 0);
    // A 0.75 px overlap hides the seams between strips.
    ctx.drawImage(texture as unknown as CanvasImageSource, 0, i * slice, map.w * T, slice, a.X, a.Y, b.X - a.X, c.Y - a.Y + 0.75);
  }
}
