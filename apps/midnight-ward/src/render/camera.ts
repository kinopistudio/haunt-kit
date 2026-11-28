import { WALL_BACK, WALL_FRONT } from './geometry';

// One pinhole camera with one fixed pitch (π/2 is straight down). Nothing in the game moves it, zooms it or
// shakes it. It is set once per map and canvas size.
//
// World axes are in tiles: x to the east, y to the south, z up. The camera looks at the middle of the floor from
// `DISTANCE` map-sizes away, tilted by `PITCH`. For a point p, with v = y - cy:
//   depth = D - v·cos(PITCH) - z·sin(PITCH)
//   u = (x - cx) / depth            w = (z·cos(PITCH) - v·sin(PITCH)) / depth
//   X = x0 + zoom·u                  Y = y0 - zoom·w
// and `zoom / depth` is the number of pixels one tile covers at that depth.

export const PITCH = 1.05;
export const DISTANCE = 1.7;
/** How much of the canvas the dollhouse fills. */
export const FILL = 0.96;

const SIN = Math.sin(PITCH);
const COS = Math.cos(PITCH);

export interface MapSize {
  w: number;
  h: number;
}

export interface Camera {
  /** Map size in tiles. */
  w: number;
  h: number;
  /** The floor point the camera looks at. */
  cx: number;
  cy: number;
  /** Distance D, in tiles. */
  dist: number;
  zoom: number;
  x0: number;
  y0: number;
}

export interface Projected {
  X: number;
  Y: number;
  /** Pixels per tile at this depth. */
  scale: number;
  depth: number;
}

function raw(cam: Pick<Camera, 'cx' | 'cy' | 'dist'>, x: number, y: number, z: number): { u: number; w: number; depth: number } {
  const v = y - cam.cy;
  const depth = cam.dist - v * COS - z * SIN;
  return { u: (x - cam.cx) / depth, w: (z * COS - v * SIN) / depth, depth };
}

/** The corners that must be on the canvas: the floor, the top of the back wall and of the front wall. */
function hull(map: MapSize): [number, number, number][] {
  return [
    [0, 0, 0],
    [map.w, 0, 0],
    [0, map.h, 0],
    [map.w, map.h, 0],
    [0, 0, WALL_BACK],
    [map.w, 0, WALL_BACK],
    [0, map.h, WALL_FRONT],
    [map.w, map.h, WALL_FRONT],
  ];
}

function extent(map: MapSize): { cam: Pick<Camera, 'cx' | 'cy' | 'dist'>; u0: number; u1: number; w0: number; w1: number } {
  const cam = { cx: map.w / 2, cy: map.h / 2, dist: DISTANCE * Math.max(map.w, map.h) };
  let u0 = Infinity;
  let u1 = -Infinity;
  let w0 = Infinity;
  let w1 = -Infinity;
  for (const [x, y, z] of hull(map)) {
    const p = raw(cam, x, y, z);
    u0 = Math.min(u0, p.u);
    u1 = Math.max(u1, p.u);
    w0 = Math.min(w0, p.w);
    w1 = Math.max(w1, p.w);
  }
  return { cam, u0, u1, w0, w1 };
}

/** Height of the dollhouse's picture divided by its width: the canvas of a given width is this much taller than wide. */
export function dollhouseAspect(map: MapSize): number {
  const { u0, u1, w0, w1 } = extent(map);
  return (w1 - w0) / (u1 - u0);
}

/** The camera for a map and a canvas size in CSS pixels. The whole dollhouse fits, centred. */
export function makeCamera(map: MapSize, canvasW: number, canvasH: number): Camera {
  const { cam, u0, u1, w0, w1 } = extent(map);
  const zoom = Math.min((canvasW * FILL) / (u1 - u0), (canvasH * FILL) / (w1 - w0));
  return {
    w: map.w,
    h: map.h,
    ...cam,
    zoom,
    x0: canvasW / 2 - (zoom * (u0 + u1)) / 2,
    y0: canvasH / 2 + (zoom * (w0 + w1)) / 2,
  };
}

/** World (tiles) to canvas pixels. */
export function project(cam: Camera, x: number, y: number, z: number): Projected {
  const p = raw(cam, x, y, z);
  return { X: cam.x0 + cam.zoom * p.u, Y: cam.y0 - cam.zoom * p.w, scale: cam.zoom / p.depth, depth: p.depth };
}

/**
 * Canvas pixels to the floor point (z = 0) under them, or `null` for a point at or above the floor's horizon.
 * The inverse of `project` on the floor.
 */
export function unprojectFloor(cam: Camera, X: number, Y: number): { x: number; y: number } | null {
  const u = (X - cam.x0) / cam.zoom;
  const w = (cam.y0 - Y) / cam.zoom;
  const denominator = w * COS - SIN;
  if (denominator >= -1e-9) return null;
  const v = (w * cam.dist) / denominator;
  const depth = cam.dist - v * COS;
  return { x: cam.cx + u * depth, y: cam.cy + v };
}

/** The floor tile under a canvas point, or `null` outside the floor. */
export function tileAt(cam: Camera, X: number, Y: number): { x: number; y: number } | null {
  const p = unprojectFloor(cam, X, Y);
  if (!p) return null;
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= cam.w || y >= cam.h) return null;
  return { x, y };
}

/** The four corners of tile (x, y) at height z, in order: north-west, north-east, south-east, south-west. */
export function tileQuad(cam: Camera, x: number, y: number, z = 0): Projected[] {
  return [project(cam, x, y, z), project(cam, x + 1, y, z), project(cam, x + 1, y + 1, z), project(cam, x, y + 1, z)];
}
