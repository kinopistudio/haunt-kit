import { describe, expect, it } from 'vitest';
import { LEVELS, NIGHT_1, PROLOGUE, buildWorld } from '../src/levels';
import { makeCamera, project } from '../src/render/camera';
import { sortDrawables, thingKey } from '../src/render/drawlist';
import type { Drawable } from '../src/render/drawlist';
import { FloorLayer, STRIPS_PER_ROW, TEXTURE_TILE, drawFloorStrips } from '../src/render/floor';
import type { FloorInput } from '../src/render/floor';
import { WALL_BACK, WALL_FRONT, WALL_SIDE } from '../src/render/geometry';
import { windowColumn } from '../src/render/surface';
import type { MapInfo } from '../src/render/surface';
import { drawBell, drawChip, drawGirl, drawSalt, drawWisp, upright } from '../src/render/sprites';
import { brightness, drawWallBlock, wallBlocks } from '../src/render/walls';
import { fakeContext, fakeSurface, names } from './fixtures/fake-canvas';
import type { FakeSurface } from './fixtures/fake-canvas';

function mapOf(level: (typeof LEVELS)[number]): MapInfo {
  const world = buildWorld(level);
  const bed = world.markers.bed?.[0] ?? null;
  return { w: world.map.w, h: world.map.h, walls: world.map.walls, bed };
}

const input = (overrides: Partial<FloorInput> = {}): FloorInput => ({
  darkness: 0.5,
  dawn: 0,
  time: 0,
  lights: [],
  blooms: [],
  ranges: [],
  coach: null,
  cursor: null,
  hover: null,
  sleeper: null,
  pulse: 0,
  ...overrides,
});

describe('floor texture', () => {
  it('M8.2: the floor is drawn top-down to offscreen surfaces of w × h tiles at a fixed number of pixels per tile', () => {
    const map = mapOf(NIGHT_1);
    const made: FakeSurface[] = [];
    const floor = new FloorLayer(map, () => {
      const s = fakeSurface();
      made.push(s);
      return s;
    });
    expect(made).toHaveLength(3);
    for (const s of made) expect([s.width, s.height]).toEqual([map.w * TEXTURE_TILE, map.h * TEXTURE_TILE]);
    floor.draw(input());
    expect(names(floor.surface === made[0] ? made[0]!.calls : [])).toContain('drawImage');
  });

  it('M8.2: the planks are painted once; later frames copy them and paint only what changes', () => {
    const map = mapOf(PROLOGUE);
    const made: FakeSurface[] = [];
    const floor = new FloorLayer(map, () => {
      const s = fakeSurface();
      made.push(s);
      return s;
    });
    floor.draw(input());
    const base = made[1]!;
    const painted = base.calls.length;
    expect(painted).toBeGreaterThan(map.w * map.h);
    floor.draw(input({ time: 500 }));
    floor.draw(input({ time: 1000 }));
    expect(base.calls.length).toBe(painted);
  });

  it('M8.2: the darkness is a mask with a hole of light for each light, and the level of darkness is its opacity', () => {
    const map = mapOf(NIGHT_1);
    const made: FakeSurface[] = [];
    const floor = new FloorLayer(map, () => {
      const s = fakeSurface();
      made.push(s);
      return s;
    });
    floor.draw(input({ darkness: 0.72, lights: [{ x: 4.5, y: 4.5, radius: 1.2, strength: 0.8 }, { x: 1.5, y: 1.5, radius: 0.9, strength: 0.6 }] }));
    const mask = made[2]!.calls;
    expect(mask.find((c) => c[0] === 'set:fillStyle' && String(c[1]).includes('4, 3, 2'))![1]).toBe('rgba(4, 3, 2, 0.72)');
    const ops = mask.filter((c) => c[0] === 'set:globalCompositeOperation').map((c) => c[1]);
    expect(ops).toEqual(['source-over', 'destination-out', 'source-over']);
    expect(mask.filter((c) => c[0] === 'createRadialGradient')).toHaveLength(2);
    // The texture receives the finished mask.
    expect(names(made[0]!.calls).filter((n) => n === 'drawImage').length).toBeGreaterThanOrEqual(2);
  });

  it('M8.2: range diamonds cover the tiles within the radius and skip walls; marks are drawn after the darkness', () => {
    const map = mapOf(NIGHT_1);
    const made: FakeSurface[] = [];
    const floor = new FloorLayer(map, () => {
      const s = fakeSurface();
      made.push(s);
      return s;
    });
    floor.draw(input({ ranges: [{ x: 4, y: 3, r: 2, tone: 'bell' }], coach: { x: 4, y: 3 }, cursor: { x: 2, y: 2 }, hover: { x: 3, y: 3, ok: true } }));
    const calls = made[0]!.calls;
    // 13 tiles lie within 2 steps of (4, 3) on an open floor.
    const dashed = calls.filter((c) => c[0] === 'setLineDash' && (c[1] as number[]).length > 0).length;
    expect(dashed).toBe(13 + 1);
    const lastMaskDraw = calls.map((c, i) => (c[0] === 'drawImage' ? i : -1)).filter((i) => i >= 0).at(-1)!;
    const coachFill = calls.findIndex((c) => c[0] === 'set:fillStyle' && String(c[1]).startsWith('rgba(242, 165, 65, 0.'));
    expect(coachFill).toBeGreaterThan(lastMaskDraw);
  });

  it('M8.2: the texture is drawn on the canvas in horizontal strips, each wider and lower than the one above', () => {
    for (const level of LEVELS) {
      const map = mapOf(level);
      const cam = makeCamera(map, 800, 640);
      const { ctx, calls } = fakeContext();
      drawFloorStrips(ctx, cam, fakeSurface(), map);
      const strips = calls.filter((c) => c[0] === 'drawImage');
      expect(strips).toHaveLength(map.h * STRIPS_PER_ROW);
      let lastWidth = 0;
      let lastY = -Infinity;
      strips.forEach((c, i) => {
        const [, , sx, sy, sw, sh, dx, dy, dw, dh] = c as [string, unknown, number, number, number, number, number, number, number, number];
        expect([sx, sy, sw]).toEqual([0, (i * TEXTURE_TILE) / STRIPS_PER_ROW, map.w * TEXTURE_TILE]);
        expect(sh).toBe(TEXTURE_TILE / STRIPS_PER_ROW);
        expect(dw).toBeGreaterThan(lastWidth);
        expect(dy).toBeGreaterThan(lastY);
        expect(dh).toBeGreaterThan(0);
        expect(dx).toBeLessThan(cam.x0 + 1);
        lastWidth = dw;
        lastY = dy;
      });
      // The first strip is the back edge of the floor and the last strip's bottom is its front edge.
      const first = strips[0]!;
      expect(first[7]).toBeCloseTo(project(cam, 0, 0, 0).Y, 6);
      const lastStrip = strips.at(-1)! as unknown as number[];
      expect(lastStrip[7]! + lastStrip[9]!).toBeCloseTo(project(cam, 0, map.h, 0).Y + 0.75, 6);
    }
  });
});

describe('walls', () => {
  it('M8.3: wall blocks carry the heights: tall at the back, low at the front, medium between', () => {
    const map = mapOf(NIGHT_1);
    const blocks = wallBlocks(map);
    expect(blocks.filter((b) => b.y === 0).every((b) => b.height === WALL_BACK)).toBe(true);
    expect(blocks.filter((b) => b.y === map.h - 1).every((b) => b.height === WALL_FRONT)).toBe(true);
    expect(blocks.filter((b) => b.y > 0 && b.y < map.h - 1).every((b) => b.height === WALL_SIDE)).toBe(true);
    expect(blocks).toHaveLength([...map.walls].length);
  });

  it('M8.3: the inner wall of the Prologue is medium high, like the side walls', () => {
    const map = mapOf(PROLOGUE);
    const inner = wallBlocks(map).filter((b) => b.x === 4 && b.y > 0 && b.y < map.h - 1);
    expect(inner.length).toBeGreaterThan(0);
    for (const b of inner) expect(b.height).toBe(WALL_SIDE);
  });

  it('M8.5: a block draws its faces first and its top last, and only the side that turns toward the camera', () => {
    const map = mapOf(NIGHT_1);
    const cam = makeCamera(map, 800, 700);
    const sideLeft = wallBlocks(map).find((b) => b.x === 0 && b.y === 3)!;
    const sideRight = wallBlocks(map).find((b) => b.x === map.w - 1 && b.y === 3)!;
    const count = (block: typeof sideLeft) => {
      const { ctx, calls } = fakeContext();
      drawWallBlock(ctx, cam, map, block, 1);
      return calls.filter((c) => c[0] === 'fill').length;
    };
    // The south face is hidden by the wall below, so the left wall shows its east face and its top, the right wall its west face and its top.
    expect(count(sideLeft)).toBe(2);
    expect(count(sideRight)).toBe(2);
    const { ctx, calls } = fakeContext();
    drawWallBlock(ctx, cam, map, wallBlocks(map).find((b) => b.x === 2 && b.y === map.h - 1)!, 1);
    const fills = calls.filter((c) => c[0] === 'set:fillStyle').map((c) => String(c[1]));
    expect(fills).toHaveLength(2);
    expect(fills[0]).not.toBe(fills[1]);
    expect(names(calls).filter((n) => n === 'fill')).toHaveLength(2);
  });

  it('M8.3: the back wall has the window in one block only, and it glows', () => {
    const map = mapOf(NIGHT_1);
    const cam = makeCamera(map, 800, 700);
    const windows = wallBlocks(map)
      .filter((b) => b.y === 0)
      .filter((b) => {
        const { ctx, calls } = fakeContext();
        drawWallBlock(ctx, cam, map, b, 1);
        return calls.some((c) => c[0] === 'createRadialGradient');
      });
    expect(windows.map((b) => b.x)).toEqual([windowColumn(map)]);
  });

  it('M8.8: surfaces are dimmer while it is dark and lifted at dawn', () => {
    expect(brightness(0.22, 0)).toBeGreaterThan(brightness(0.72, 0));
    expect(brightness(0.72, 1)).toBeGreaterThan(brightness(0.72, 0));
    expect(brightness(1, 0)).toBeGreaterThanOrEqual(0.35);
  });
});

describe('sprites and depth order', () => {
  it('M8.4: an upright sprite is preceded by an ellipse on the floor and is drawn scaled to the depth of its feet', () => {
    const map = mapOf(NIGHT_1);
    const cam = makeCamera(map, 800, 700);
    const { ctx, calls } = fakeContext();
    let drawn = -1;
    upright(ctx, cam, 4, 3, { shadow: 0.26, shadowAlpha: 0.3 }, () => {
      drawn = calls.length;
      drawWisp(ctx, { time: 0, phase: 0, highlight: false });
    });
    const order = names(calls);
    expect(order.indexOf('ellipse')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('ellipse')).toBeLessThan(order.indexOf('translate'));
    expect(order.indexOf('translate')).toBeLessThan(order.indexOf('scale'));
    expect(drawn).toBeGreaterThan(order.indexOf('scale'));
    const feet = project(cam, 4.5, 3 + 0.62, 0);
    const translate = calls.find((c) => c[0] === 'translate')!;
    expect(translate[1]).toBeCloseTo(feet.X, 9);
    expect(translate[2]).toBeCloseTo(feet.Y, 9);
    const scale = calls.find((c) => c[0] === 'scale')!;
    expect(scale[1]).toBeCloseTo(feet.scale, 9);
    expect(order.at(-1)).toBe('restore');
  });

  it('M8.4: the shadow is wider for a sprite nearer the camera, and flatter than a circle', () => {
    const map = mapOf(NIGHT_1);
    const cam = makeCamera(map, 800, 700);
    const radii = [1, 6].map((y) => {
      const { ctx, calls } = fakeContext();
      upright(ctx, cam, 4, y, { shadow: 0.26, shadowAlpha: 0.3 }, () => {});
      const e = calls.find((c) => c[0] === 'ellipse')!;
      return [e[3] as number, e[4] as number];
    });
    expect(radii[1]![0]).toBeGreaterThan(radii[0]![0]!);
    for (const [rx, ry] of radii) expect(ry).toBeLessThan(rx!);
  });

  it('M8.4: a sprite that hovers lifts above its contact shadow', () => {
    const cam = makeCamera({ w: 9, h: 8 }, 800, 700);
    const lifted = fakeContext();
    upright(lifted.ctx, cam, 4, 3, { shadow: 0.2, shadowAlpha: 0.2, lift: 0.2 }, () => {});
    const flat = fakeContext();
    upright(flat.ctx, cam, 4, 3, { shadow: 0.2, shadowAlpha: 0.2 }, () => {});
    const y = (calls: typeof lifted.calls) => calls.find((c) => c[0] === 'translate')![2] as number;
    expect(y(lifted.calls)).toBeLessThan(y(flat.calls));
    const shadow = (calls: typeof lifted.calls) => calls.find((c) => c[0] === 'ellipse')![2] as number;
    expect(shadow(lifted.calls)).toBe(shadow(flat.calls));
  });

  it('M8.4: every sprite and chip draws without error on a recording context', () => {
    const { ctx, calls } = fakeContext();
    drawWisp(ctx, { time: 123, phase: 1, highlight: true });
    drawGirl(ctx, 0.5);
    drawSalt(ctx);
    drawBell(ctx, 100);
    drawChip(ctx, { text: 'L2', X: 10, Y: 10, size: 11, tone: 'line' });
    drawChip(ctx, { text: 'II', X: 10, Y: 10, size: 11, tone: 'numeral' });
    expect(calls.length).toBeGreaterThan(40);
    expect(calls.find((c) => c[0] === 'fillText')![1]).toBe('L2');
  });

  it('M8.5: walls, items and characters are drawn back to front by the depth of their feet', () => {
    const map = mapOf(NIGHT_1);
    const wall = (y: number): Drawable => ({ kind: 'wall', key: y + 1, block: { x: 2, y, height: 0.55, key: y + 1 } });
    const thing = (id: string, y: number): Drawable => ({ kind: 'thing', id, key: thingKey(y), draw: () => {} });
    const order = sortDrawables([thing('front', 5), wall(3), thing('behind-wall', 2), thing('beside-wall', 3), thing('behind', 1), wall(0), thing('in-front-of-wall', 4)]);
    const labels = order.map((d) => (d.kind === 'wall' ? `wall${d.block.y}` : d.id));
    expect(labels).toEqual(['wall0', 'behind', 'behind-wall', 'beside-wall', 'wall3', 'in-front-of-wall', 'front']);
    expect(map.h).toBeGreaterThan(5);
  });

  it('M8.5: things with equal depth keep the order they were given', () => {
    const t = (id: string): Drawable => ({ kind: 'thing', id, key: 2.62, draw: () => {} });
    expect(sortDrawables([t('a'), t('b'), t('c')]).map((d) => (d.kind === 'thing' ? d.id : ''))).toEqual(['a', 'b', 'c']);
  });
});
