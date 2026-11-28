import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as cameraModule from '../src/render/camera';
import { DISTANCE, FILL, PITCH, dollhouseAspect, makeCamera, project, tileAt, tileQuad, unprojectFloor } from '../src/render/camera';
import { WALL_BACK, WALL_FRONT, WALL_SIDE, wallHeight } from '../src/render/geometry';
import { LEVELS, buildWorld } from '../src/levels';

const SIZES = [
  [320, 300],
  [343, 290],
  [375, 320],
  [900, 700],
  [1280, 640],
] as const;

describe('camera', () => {
  it('M8.1: the camera has one fixed pitch and distance: constants of the module, not arguments or fields', () => {
    expect(typeof PITCH).toBe('number');
    expect(typeof DISTANCE).toBe('number');
    expect(cameraModule.makeCamera.length).toBe(3);
    const cam = makeCamera({ w: 9, h: 7 }, 900, 700);
    expect(Object.keys(cam).sort()).toEqual(['cx', 'cy', 'dist', 'h', 'w', 'x0', 'y0', 'zoom']);
    // The same map on two canvases gives the same view, only scaled.
    const small = makeCamera({ w: 9, h: 7 }, 450, 350);
    expect(small.dist).toBe(cam.dist);
    const a = project(cam, 3, 2, 0.5);
    const b = project(small, 3, 2, 0.5);
    expect(a.scale / cam.zoom).toBeCloseTo(b.scale / small.zoom, 12);
  });

  it('M8.1: asking twice gives the same camera, so nothing in it depends on the time or on earlier calls', () => {
    expect(makeCamera({ w: 9, h: 8 }, 600, 500)).toEqual(makeCamera({ w: 9, h: 8 }, 600, 500));
  });

  it('M8.6: the projected centre of every floor tile gives that tile back, on every level and canvas size', () => {
    for (const level of LEVELS) {
      const { map } = buildWorld(level);
      for (const [cw, ch] of SIZES) {
        const cam = makeCamera(map, cw, ch);
        for (let y = 0; y < map.h; y++) {
          for (let x = 0; x < map.w; x++) {
            const p = project(cam, x + 0.5, y + 0.5, 0);
            expect(tileAt(cam, p.X, p.Y), `${level.id} ${cw}x${ch} (${x},${y})`).toEqual({ x, y });
          }
        }
      }
    }
  });

  it('M8.6: unprojectFloor inverts project on the floor for any point (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 16 }),
        fc.integer({ min: 3, max: 16 }),
        fc.integer({ min: 320, max: 1600 }),
        fc.integer({ min: 240, max: 1000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (w, h, cw, ch, fx, fy) => {
          const cam = makeCamera({ w, h }, cw, ch);
          const x = fx * w;
          const y = fy * h;
          const p = project(cam, x, y, 0);
          const back = unprojectFloor(cam, p.X, p.Y)!;
          expect(back.x).toBeCloseTo(x, 6);
          expect(back.y).toBeCloseTo(y, 6);
        },
      ),
    );
  });

  it('M8.6: a point outside the floor gives null', () => {
    const cam = makeCamera({ w: 9, h: 7 }, 900, 700);
    const left = project(cam, -0.5, 3, 0);
    const right = project(cam, 9.5, 3, 0);
    const behind = project(cam, 4, -0.5, 0);
    const front = project(cam, 4, 7.5, 0);
    for (const p of [left, right, behind, front]) expect(tileAt(cam, p.X, p.Y)).toBeNull();
    expect(tileAt(cam, -50, -50)).toBeNull();
    expect(tileAt(cam, 5000, 5000)).toBeNull();
    // At or above the horizon of the floor there is no floor point at all.
    expect(unprojectFloor(cam, 450, -1e9)).toBeNull();
  });

  it('M8.6: the edges of a tile belong to it: a point just inside each corner gives that tile', () => {
    const cam = makeCamera({ w: 9, h: 7 }, 900, 700);
    const [nw, ne, se, sw] = tileQuad(cam, 4, 3);
    const mid = (a: { X: number; Y: number }, b: { X: number; Y: number }) => ({ X: (a.X + b.X) / 2, Y: (a.Y + b.Y) / 2 });
    const centre = mid(mid(nw!, se!), mid(ne!, sw!));
    expect(tileAt(cam, centre.X, centre.Y)).toEqual({ x: 4, y: 3 });
    for (const corner of [nw!, ne!, se!, sw!]) {
      const inside = { X: corner.X + (centre.X - corner.X) * 0.02, Y: corner.Y + (centre.Y - corner.Y) * 0.02 };
      expect(tileAt(cam, inside.X, inside.Y)).toEqual({ x: 4, y: 3 });
    }
  });

  it('M8.7: the whole dollhouse fits canvases from 320 px wide up, with the walls', () => {
    for (const level of LEVELS) {
      const { map } = buildWorld(level);
      for (const cw of [320, 375, 480, 768, 1024, 1600]) {
        const ch = Math.round(cw * dollhouseAspect(map));
        const cam = makeCamera(map, cw, ch);
        const points: [number, number, number][] = [[0, 0, 0], [map.w, 0, 0], [0, map.h, 0], [map.w, map.h, 0], [0, 0, WALL_BACK], [map.w, 0, WALL_BACK], [0, map.h, WALL_FRONT], [map.w, map.h, WALL_FRONT]];
        for (const [x, y, z] of points) {
          const p = project(cam, x, y, z);
          expect(p.X, `${level.id} ${cw} x`).toBeGreaterThanOrEqual(-0.5);
          expect(p.X).toBeLessThanOrEqual(cw + 0.5);
          expect(p.Y, `${level.id} ${cw} y`).toBeGreaterThanOrEqual(-0.5);
          expect(p.Y).toBeLessThanOrEqual(ch + 0.5);
        }
      }
    }
  });

  it('M8.7: when the canvas is wider or taller than the dollhouse, it is centred and fills FILL of the limiting side', () => {
    const map = { w: 9, h: 7 };
    const cam = makeCamera(map, 900, 2000);
    const left = project(cam, 0, map.h, 0);
    const right = project(cam, map.w, map.h, 0);
    expect(left.X + right.X).toBeCloseTo(900, 6);
    expect(right.X - left.X).toBeLessThanOrEqual(900 * FILL + 1e-6);
    const tall = makeCamera(map, 5000, 400);
    const top = project(tall, 0, 0, WALL_BACK);
    const bottom = project(tall, 0, map.h, 0);
    expect(top.Y + bottom.Y).toBeCloseTo(400, 6);
    expect(bottom.Y - top.Y).toBeCloseTo(400 * FILL, 6);
  });

  it('M8.2: tiles nearer to the camera are lower on the screen and larger, and height lifts a point up', () => {
    const cam = makeCamera({ w: 9, h: 8 }, 900, 700);
    let last = project(cam, 4, 0, 0);
    for (let y = 1; y <= 8; y++) {
      const p = project(cam, 4, y, 0);
      expect(p.Y).toBeGreaterThan(last.Y);
      expect(p.scale).toBeGreaterThan(last.scale);
      last = p;
    }
    expect(project(cam, 4, 4, 1).Y).toBeLessThan(project(cam, 4, 4, 0).Y);
    // Left of the middle is left on the screen.
    expect(project(cam, 1, 4, 0).X).toBeLessThan(project(cam, 7, 4, 0).X);
  });
});

describe('wall heights', () => {
  it('M8.3: the back wall is taller than a side wall, and a side wall taller than the front wall', () => {
    expect(WALL_BACK).toBeGreaterThan(WALL_SIDE);
    expect(WALL_SIDE).toBeGreaterThan(WALL_FRONT);
    for (const rows of [7, 8, 9]) {
      expect(wallHeight(rows, 0)).toBe(WALL_BACK);
      expect(wallHeight(rows, rows - 1)).toBe(WALL_FRONT);
      for (let y = 1; y < rows - 1; y++) expect(wallHeight(rows, y)).toBe(WALL_SIDE);
    }
  });
});
