import { project, tileQuad } from './camera';
import type { Camera } from './camera';
import { wallHeight } from './geometry';
import { ROOM, shade } from './theme';
import type { Rgb } from './theme';
import { isWall, windowColumn } from './surface';
import type { MapInfo } from './surface';

/** A wall block as the depth sort sees it. */
export interface WallBlock {
  x: number;
  y: number;
  height: number;
  /** Depth key: the y of its front edge, a little less for blocks farther from the middle, so that outer blocks come first. */
  key: number;
}

/** Every wall block of a map with its height and depth key. */
export function wallBlocks(map: MapInfo, cx = map.w / 2): WallBlock[] {
  const blocks: WallBlock[] = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!map.walls.has(y * map.w + x)) continue;
      blocks.push({ x, y, height: wallHeight(map.h, y), key: y + 1 - Math.abs(x + 0.5 - cx) * 0.001 });
    }
  }
  return blocks;
}

function fillQuad(ctx: CanvasRenderingContext2D, points: { X: number; Y: number }[], fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0]!.X, points[0]!.Y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.X, points[i]!.Y);
  ctx.closePath();
  ctx.fill();
}

/** How bright the room's surfaces are: dim at night, lifted at dawn. */
export function brightness(darkness: number, dawn: number): number {
  return Math.max(0.35, 1 - darkness * 0.75) + dawn * 0.3;
}

/**
 * Draws one block: the south face (the one the camera looks at), the side face that turns toward the
 * camera, and the top. The back wall has stripes, a skirting board and the window.
 */
export function drawWallBlock(ctx: CanvasRenderingContext2D, cam: Camera, map: MapInfo, block: WallBlock, light: number): void {
  const { x, y, height: h } = block;
  const p = (px: number, py: number, pz: number) => project(cam, px, py, pz);
  const face = (a: Rgb) => shade(a, light);

  if (cam.cx > x + 1 && !isWall(map, x + 1, y)) {
    fillQuad(ctx, [p(x + 1, y, 0), p(x + 1, y + 1, 0), p(x + 1, y + 1, h), p(x + 1, y, h)], face(ROOM.wallSide));
  }
  if (cam.cx < x && !isWall(map, x - 1, y)) {
    fillQuad(ctx, [p(x, y, 0), p(x, y + 1, 0), p(x, y + 1, h), p(x, y, h)], face(ROOM.wallSide));
  }
  const southOpen = !isWall(map, x, y + 1) || y === map.h - 1;
  if (southOpen) {
    fillQuad(ctx, [p(x, y + 1, 0), p(x + 1, y + 1, 0), p(x + 1, y + 1, h), p(x, y + 1, h)], face(y === 0 ? ROOM.wallBack : ROOM.wallFront));
    if (y === 0) drawBackWallDetail(ctx, cam, map, x, h, light);
  }
  const top = tileQuad(cam, x, y, h);
  fillQuad(ctx, top, face(ROOM.wallTop));
  if (southOpen) {
    ctx.strokeStyle = `rgba(232, 217, 181, ${0.1 * Math.min(1, light)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(top[3]!.X, top[3]!.Y);
    ctx.lineTo(top[2]!.X, top[2]!.Y);
    ctx.stroke();
  }
}

/** Wallpaper stripes, the skirting board and, in one block, the window with its cold glow. */
function drawBackWallDetail(ctx: CanvasRenderingContext2D, cam: Camera, map: MapInfo, x: number, h: number, light: number): void {
  const p = (px: number, pz: number) => project(cam, px, 1, pz);
  ctx.strokeStyle = 'rgba(0, 0, 0, .22)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const a = p(x + i / 4, 0.14);
    const b = p(x + i / 4, h);
    ctx.beginPath();
    ctx.moveTo(a.X, a.Y);
    ctx.lineTo(b.X, b.Y);
    ctx.stroke();
  }
  fillQuad(ctx, [p(x, 0), p(x + 1, 0), p(x + 1, 0.14), p(x, 0.14)], shade(ROOM.skirting, light));
  if (x !== windowColumn(map)) return;

  const pane = [p(x + 0.16, 0.42), p(x + 0.84, 0.42), p(x + 0.84, 1.08), p(x + 0.16, 1.08)];
  const glow = p(x + 0.5, 0.75);
  const g = ctx.createRadialGradient(glow.X, glow.Y, 0, glow.X, glow.Y, glow.scale * 0.9);
  g.addColorStop(0, 'rgba(127, 209, 199, .28)');
  g.addColorStop(1, 'rgba(127, 209, 199, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(glow.X - glow.scale, glow.Y - glow.scale, glow.scale * 2, glow.scale * 2);
  fillQuad(ctx, pane, shade([43, 62, 72], 0.55 + light * 0.5));
  ctx.strokeStyle = shade([13, 11, 10], 1);
  ctx.lineWidth = Math.max(2, (pane[1]!.X - pane[0]!.X) * 0.06);
  ctx.beginPath();
  ctx.moveTo(pane[0]!.X, pane[0]!.Y);
  ctx.lineTo(pane[1]!.X, pane[1]!.Y);
  ctx.lineTo(pane[2]!.X, pane[2]!.Y);
  ctx.lineTo(pane[3]!.X, pane[3]!.Y);
  ctx.closePath();
  const mid = p(x + 0.5, 0.42);
  const midTop = p(x + 0.5, 1.08);
  const left = p(x + 0.16, 0.75);
  const right = p(x + 0.84, 0.75);
  ctx.moveTo(mid.X, mid.Y);
  ctx.lineTo(midTop.X, midTop.Y);
  ctx.moveTo(left.X, left.Y);
  ctx.lineTo(right.X, right.Y);
  ctx.stroke();
}
