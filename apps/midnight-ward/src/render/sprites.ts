import { PITCH, project } from './camera';
import type { Camera } from './camera';
import { AMBER, FONT_MONO, INK, PARCHMENT, ROOM, TEAL } from './theme';

// Sprites are drawn upright in tile units: the origin is the middle of the feet, x runs east and y runs up the
// screen as negative numbers. `upright` places one on the floor, with a contact shadow under it.

/** Where on its tile a sprite stands: a little south of the middle, so it reads as standing on the tile. */
export const FOOT_OFFSET = 0.62;

export interface UprightOptions {
  /** Radius of the contact shadow in tiles. */
  shadow: number;
  /** Opacity of the contact shadow. */
  shadowAlpha: number;
  /** Floats this far above the floor, in tiles (ghosts hover). */
  lift?: number;
}

/**
 * Draws a sprite standing on tile position (x, y), which may be fractional while it glides. First an ellipse on
 * the floor, flattened by the camera pitch, then the sprite itself, scaled to the depth of its feet.
 */
export function upright(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, options: UprightOptions, draw: () => void): void {
  const floor = project(cam, x + 0.5, y + FOOT_OFFSET, 0);
  const rx = floor.scale * options.shadow;
  ctx.fillStyle = `rgba(0, 0, 0, ${options.shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(floor.X, floor.Y, rx, rx * Math.sin(PITCH) * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  const feet = project(cam, x + 0.5, y + FOOT_OFFSET, options.lift ?? 0);
  ctx.save();
  ctx.translate(feet.X, feet.Y);
  ctx.scale(feet.scale, feet.scale);
  draw();
  ctx.restore();
}

export interface GhostLook {
  /** Milliseconds, for the hem and the glow. Fixed at 0 when motion is reduced. */
  time: number;
  /** Phase offset so that two ghosts do not move together. */
  phase: number;
  /** A ghost that the player is looking at gets a brighter outline. */
  highlight: boolean;
}

/** A wisp: a teal teardrop of light with a wavy hem, two dark eyes and a halo. */
export function drawWisp(ctx: CanvasRenderingContext2D, look: GhostLook): void {
  const t = look.time / 160 + look.phase;
  const halo = ctx.createRadialGradient(0, -0.4, 0, 0, -0.4, 0.8);
  halo.addColorStop(0, 'rgba(127, 209, 199, .38)');
  halo.addColorStop(1, 'rgba(127, 209, 199, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-0.9, -1.2, 1.8, 1.6);

  const half = 0.3;
  const body = ctx.createLinearGradient(0, -0.9, 0, -0.05);
  body.addColorStop(0, 'rgba(214, 250, 244, .96)');
  body.addColorStop(1, 'rgba(127, 209, 199, .72)');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -0.88);
  ctx.bezierCurveTo(half * 1.1, -0.76, half * 1.2, -0.42, half, -0.16);
  const hemY = -0.1;
  const teeth = 4;
  for (let i = 0; i < teeth; i++) {
    const x1 = half - ((i + 0.5) / teeth) * half * 2;
    const x2 = half - ((i + 1) / teeth) * half * 2;
    const wave = Math.sin(t + i * 1.7) * 0.025;
    ctx.quadraticCurveTo(x1 + 0.02, hemY + 0.09 + wave, x2, hemY - 0.01 + wave * 0.5);
  }
  ctx.bezierCurveTo(-half * 1.2, -0.42, -half * 1.1, -0.76, 0, -0.88);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = look.highlight ? AMBER : 'rgba(127, 209, 199, .85)';
  ctx.lineWidth = look.highlight ? 0.035 : 0.018;
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(-0.09, -0.52, 0.035, 0.055, 0, 0, Math.PI * 2);
  ctx.ellipse(0.09, -0.52, 0.035, 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -0.4, 0.028, 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** The girl standing: a nightgown, a pale face and dark hair. While she sleeps she is part of the floor texture. */
export function drawGirl(ctx: CanvasRenderingContext2D, breath: number): void {
  ctx.fillStyle = ROOM.gown;
  ctx.beginPath();
  ctx.moveTo(-0.11, -0.5);
  ctx.quadraticCurveTo(0, -0.56 - breath * 0.01, 0.11, -0.5);
  ctx.lineTo(0.2, -0.07);
  ctx.quadraticCurveTo(0, -0.02, -0.2, -0.07);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, .12)';
  ctx.fillRect(-0.02, -0.46, 0.04, 0.38);
  ctx.fillStyle = ROOM.skin;
  ctx.beginPath();
  ctx.arc(0, -0.64, 0.115, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ROOM.hair;
  ctx.beginPath();
  ctx.arc(0, -0.67, 0.13, Math.PI * 0.92, Math.PI * 2.08);
  ctx.fill();
  ctx.fillRect(-0.14, -0.68, 0.045, 0.2);
  ctx.fillRect(0.095, -0.68, 0.045, 0.2);
  ctx.fillStyle = ROOM.skin;
  ctx.fillRect(-0.09, -0.05, 0.06, 0.05);
  ctx.fillRect(0.03, -0.05, 0.06, 0.05);
}

/** A pile of salt: a white mound with a few grains around it. */
export function drawSalt(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = ROOM.salt;
  ctx.beginPath();
  ctx.moveTo(-0.3, 0);
  ctx.quadraticCurveTo(-0.16, -0.06, -0.1, -0.2);
  ctx.quadraticCurveTo(0, -0.34, 0.1, -0.2);
  ctx.quadraticCurveTo(0.16, -0.06, 0.3, 0);
  ctx.quadraticCurveTo(0, 0.05, -0.3, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, .12)';
  ctx.beginPath();
  ctx.moveTo(0.02, -0.3);
  ctx.quadraticCurveTo(0.14, -0.08, 0.3, 0);
  ctx.quadraticCurveTo(0.12, 0.02, 0.02, -0.02);
  ctx.fill();
  ctx.fillStyle = ROOM.salt;
  for (const [x, y] of [[-0.36, 0.02], [0.37, 0.03], [-0.2, 0.06], [0.22, 0.07], [0.0, 0.08]] as const) ctx.fillRect(x, y, 0.025, 0.025);
}

/** A hand bell on a short stand. It swings a little. */
export function drawBell(ctx: CanvasRenderingContext2D, time: number): void {
  const swing = Math.sin(time / 300) * 0.06;
  ctx.strokeStyle = ROOM.wood;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.17, 0);
  ctx.lineTo(-0.17, -0.55);
  ctx.lineTo(0.17, -0.55);
  ctx.lineTo(0.17, 0);
  ctx.stroke();
  ctx.save();
  ctx.translate(0, -0.55);
  ctx.rotate(swing);
  ctx.strokeStyle = ROOM.brassDark;
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 0.07);
  ctx.stroke();
  ctx.fillStyle = ROOM.brass;
  ctx.beginPath();
  ctx.moveTo(0, 0.06);
  ctx.bezierCurveTo(0.13, 0.06, 0.13, 0.22, 0.17, 0.3);
  ctx.lineTo(-0.17, 0.3);
  ctx.bezierCurveTo(-0.13, 0.22, -0.13, 0.06, 0, 0.06);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 245, 210, .35)';
  ctx.fillRect(-0.07, 0.1, 0.025, 0.14);
  ctx.fillStyle = ROOM.brassDark;
  ctx.beginPath();
  ctx.arc(0, 0.33, 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A candle, lit or snuffed. */
export function drawCandle(ctx: CanvasRenderingContext2D, lit: boolean, time: number): void {
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(-0.14, -0.04, 0.28, 0.05);
  ctx.fillStyle = ROOM.wax;
  ctx.fillRect(-0.07, -0.44, 0.14, 0.4);
  if (lit) {
    const flick = Math.sin(time / 90) * 0.02;
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.ellipse(0, -0.54 + flick, 0.04, 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff2c8';
    ctx.beginPath();
    ctx.ellipse(0, -0.52 + flick, 0.018, 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(200, 200, 200, .35)';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const px = Math.sin(time / 400 + i) * 0.04;
      const py = -0.46 - i * 0.06;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

export interface Chip {
  text: string;
  /** Centre in canvas pixels. */
  X: number;
  /** Bottom edge in canvas pixels. */
  Y: number;
  /** Font size in pixels. */
  size: number;
  /** `line` chips show a line number in amber, `numeral` chips the roman numeral of a ghost in teal. */
  tone: 'line' | 'girl' | 'numeral';
}

/** A small label chip, drawn in screen space after the sprites so that nothing hides it. */
export function drawChip(ctx: CanvasRenderingContext2D, chip: Chip): void {
  ctx.font = `500 ${chip.size}px ${FONT_MONO}`;
  const w = ctx.measureText(chip.text).width + chip.size * 0.9;
  const h = chip.size * 1.45;
  const x = chip.X - w / 2;
  const y = chip.Y - h;
  ctx.fillStyle = chip.tone === 'line' ? 'rgba(242, 165, 65, .96)' : chip.tone === 'girl' ? 'rgba(232, 217, 181, .96)' : 'rgba(13, 11, 10, .85)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();
  if (chip.tone === 'numeral') {
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = chip.tone === 'numeral' ? PARCHMENT : INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(chip.text, chip.X, y + h / 2 + 0.5);
}
