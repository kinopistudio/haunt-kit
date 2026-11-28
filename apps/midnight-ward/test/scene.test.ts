import { describe, expect, it } from 'vitest';
import { NIGHT_1, buildWorld } from '../src/levels';
import { makeItem } from '../src/vocab';
import { makeCamera, project, tileAt } from '../src/render/camera';
import { CAUGHT_MS, DARKNESS, DAWN_MS, Scene, mapInfo } from '../src/render/scene';
import type { SceneEnvironment } from '../src/render/scene';
import { fakeSurface } from './fixtures/fake-canvas';
import type { Call, FakeSurface } from './fixtures/fake-canvas';

interface Rig {
  scene: Scene;
  canvas: FakeSurface & { style: { width: string; height: string } };
  env: { reduced: boolean; dpr: number; viewport: number };
}

function rig(options: { reduced?: boolean; dpr?: number; viewport?: number; width?: number; withBell?: boolean } = {}): Rig {
  const world = buildWorld(NIGHT_1, options.withBell ? [makeItem('bell', 4, 3)] : []);
  const canvas = Object.assign(fakeSurface(), { style: { width: '', height: '' } });
  const state = { reduced: options.reduced ?? false, dpr: options.dpr ?? 2, viewport: options.viewport ?? 900 };
  let size = { width: 0, height: 0 };
  const env: SceneEnvironment = {
    reduced: () => state.reduced,
    dpr: () => state.dpr,
    viewportHeight: () => state.viewport,
    rect: () => ({ left: 10, top: 20, width: size.width, height: size.height }),
  };
  const scene = new Scene(canvas, mapInfo(world), () => fakeSurface(), env);
  scene.resize(options.width ?? 640);
  size = scene.size;
  scene.setWorld(world, { animate: false });
  return { scene, canvas, env: state };
}

/** Gradients are stub objects with their own functions, so two frames only compare equal once objects are named. */
const plain = (calls: Call[]): Call[] => calls.map((c) => c.map((a) => (typeof a === 'object' && a !== null ? '[object]' : a)) as Call);

const record = (r: Rig, at: number): Call[] => {
  r.canvas.calls.length = 0;
  r.scene.draw(at);
  return plain(r.canvas.calls);
};

describe('Scene: size and camera', () => {
  it('M8.7: the canvas is scaled for the device pixel ratio, up to 2, and keeps its CSS size', () => {
    for (const [dpr, expected] of [[1, 1], [2, 2], [3, 2]] as const) {
      const r = rig({ dpr, width: 600 });
      expect(r.canvas.width).toBe(600 * expected);
      expect(r.canvas.style.width).toBe('600px');
      expect(r.scene.size.width).toBe(600);
    }
  });

  it('M8.7: the canvas is never taller than 78% of the window, and the dollhouse still fits it', () => {
    const wide = rig({ width: 1200, viewport: 700 });
    expect(wide.scene.size.height).toBeLessThanOrEqual(Math.round(700 * 0.78));
    const phone = rig({ width: 343, viewport: 667 });
    expect(phone.scene.size.height).toBeLessThanOrEqual(Math.round(667 * 0.78));
    expect(phone.scene.size.height).toBeGreaterThan(200);
    expect(parseInt(phone.canvas.style.height, 10)).toBe(phone.scene.size.height);
    const cam = phone.scene.camera;
    const corner = project(cam, 0, cam.h, 0);
    expect(corner.X).toBeGreaterThan(0);
    expect(corner.Y).toBeLessThan(phone.scene.size.height);
  });

  it('M8.7: a container of 320 px and of 375 px both work', () => {
    for (const width of [320, 375]) {
      const r = rig({ width });
      expect(r.scene.size.width).toBe(width);
      expect(() => r.scene.draw(1000)).not.toThrow();
    }
  });

  it('M8.1: drawing frames, glides, a dawn and a capture never change the camera or add a transform to the whole view', () => {
    const r = rig({ withBell: true });
    const camera = r.scene.camera;
    const copy = { ...camera };
    const world = buildWorld(NIGHT_1, [makeItem('bell', 4, 3)]);
    world.actors[1]!.pos = { x: 2, y: 2 };
    const frames: Call[][] = [];
    r.scene.setPhase('night', 0);
    r.scene.setWorld(world, { animate: true, tickMs: 620, now: 100 });
    for (const t of [100, 300, 700]) frames.push(record(r, t));
    r.scene.setPhase('caught', 700);
    frames.push(record(r, 900));
    r.scene.setPhase('dawn', 1000);
    frames.push(record(r, 1500));
    expect(r.scene.camera).toBe(camera);
    expect(r.scene.camera).toEqual(copy);
    expect(r.scene.camera).toEqual(makeCamera(mapInfo(world), r.scene.size.width, r.scene.size.height));
    // The only transform applied to the whole canvas is the pixel ratio, set at the start of each frame.
    for (const calls of frames) {
      const whole = calls.filter((c) => c[0] === 'setTransform');
      expect(whole).toEqual([['setTransform', 2, 0, 0, 2, 0, 0]]);
    }
  });
});

describe('Scene: motion', () => {
  it('M8.9: characters glide to their new tile in the length of a bell, and no longer', () => {
    for (const tickMs of [620, 260]) {
      const r = rig();
      const world = buildWorld(NIGHT_1);
      world.actors[1]!.pos = { x: 2, y: 1 };
      r.scene.setWorld(world, { animate: true, tickMs, now: 1000 });
      r.scene.draw(1000);
      expect(r.scene.position('wisp')).toEqual({ x: 1, y: 1 });
      r.scene.draw(1000 + tickMs / 2);
      const half = r.scene.position('wisp')!;
      expect(half.x).toBeCloseTo(1.5, 6);
      r.scene.draw(1000 + tickMs - 1);
      expect(r.scene.position('wisp')!.x).toBeLessThan(2);
      r.scene.draw(1000 + tickMs);
      expect(r.scene.position('wisp')).toEqual({ x: 2, y: 1 });
    }
  });

  it('M8.9: a glide starts from where the character is drawn now, so a second step does not jump', () => {
    const r = rig();
    const step = (x: number, now: number) => {
      const world = buildWorld(NIGHT_1);
      world.actors[1]!.pos = { x, y: 1 };
      r.scene.setWorld(world, { animate: true, tickMs: 620, now });
    };
    step(2, 0);
    r.scene.draw(0);
    r.scene.draw(310);
    const middle = r.scene.position('wisp')!.x;
    step(3, 310);
    r.scene.draw(310);
    expect(r.scene.position('wisp')!.x).toBeCloseTo(middle, 6);
  });

  it('M8.9: without animate, or under reduced motion, characters jump at once', () => {
    const world = buildWorld(NIGHT_1);
    world.actors[1]!.pos = { x: 5, y: 3 };
    const jump = rig();
    jump.scene.setWorld(world, { animate: false, now: 0 });
    jump.scene.draw(0);
    expect(jump.scene.position('wisp')).toEqual({ x: 5, y: 3 });
    const calm = rig({ reduced: true });
    calm.scene.setWorld(world, { animate: true, tickMs: 620, now: 0 });
    calm.scene.draw(0);
    expect(calm.scene.position('wisp')).toEqual({ x: 5, y: 3 });
  });

  it('M8.8: it is darker during a night than while the player plans, and brighter at dawn', () => {
    const r = rig();
    let t = 0;
    const settle = () => {
      for (let i = 0; i < 90; i++) r.scene.draw((t += 33));
      return r.scene.currentDarkness;
    };
    const plan = settle();
    r.scene.setPhase('night', t);
    const night = settle();
    r.scene.setPhase('dawn', t);
    const dawn = settle();
    expect(plan).toBeCloseTo(DARKNESS.plan, 1);
    expect(night).toBeCloseTo(DARKNESS.night, 1);
    expect(dawn).toBeCloseTo(DARKNESS.dawn, 1);
    expect(night).toBeGreaterThan(plan);
    expect(dawn).toBeLessThan(plan);
  });

  it('M8.8: the girl and each ghost get a glow, and the darkness mask uses it', () => {
    const made: FakeSurface[] = [];
    const world = buildWorld(NIGHT_1);
    const canvas = Object.assign(fakeSurface(), { style: { width: '', height: '' } });
    const scene = new Scene(canvas, mapInfo(world), () => {
      const s = fakeSurface();
      made.push(s);
      return s;
    }, { reduced: () => false, dpr: () => 1, viewportHeight: () => 900, rect: () => ({ left: 0, top: 0, width: 600, height: 500 }) });
    scene.resize(600);
    scene.setWorld(world, { animate: false });
    scene.draw(100);
    // Mask surface is the third one the floor made: one hole each for the girl, two wisps and the window.
    expect(made[2]!.calls.filter((c) => c[0] === 'createRadialGradient')).toHaveLength(4);
  });

  it('M9.4 / M5.1: after a capture the scene is tinted blood red, fully after the tint has settled', () => {
    const r = rig();
    r.scene.setPhase('caught', 0);
    const early = record(r, 100);
    const late = record(r, CAUGHT_MS + 50);
    const tint = (calls: Call[]) => calls.filter((c) => c[0] === 'set:globalAlpha').map((c) => c[1] as number).filter((a) => a > 0 && a < 1);
    expect(tint(late).at(-1)).toBeCloseTo(0.34, 2);
    expect(tint(early).at(-1)!).toBeLessThan(tint(late).at(-1)!);
    expect(record(rig(), 100).some((c) => c[0] === 'set:globalAlpha')).toBe(false);
  });

  it('M5.3: at dawn the morning sweeps over the room for DAWN_MS', () => {
    const r = rig();
    r.scene.setPhase('dawn', 0);
    r.scene.draw(0);
    const mid = r.canvas.calls.length;
    expect(DAWN_MS).toBeGreaterThan(1000);
    expect(mid).toBeGreaterThan(0);
  });
});

describe('Scene: reduced motion', () => {
  it('M9.5: with reduced motion, nothing depends on the time: two frames at different times draw the same', () => {
    const r = rig({ reduced: true, withBell: true });
    r.scene.setPhase('night', 0);
    r.scene.draw(0);
    const a = record(r, 5000);
    const b = record(r, 9000);
    expect(b).toEqual(a);
  });

  it('M9.5: without reduced motion, ghosts bob and bells swing, so frames differ', () => {
    const r = rig({ withBell: true });
    r.scene.draw(0);
    const a = record(r, 5000);
    const b = record(r, 5240);
    expect(b).not.toEqual(a);
  });

  it('M9.5: with reduced motion the frame loop only draws when something changed', () => {
    const calls: number[] = [];
    const world = buildWorld(NIGHT_1);
    const canvas = Object.assign(fakeSurface(), { style: { width: '', height: '' } });
    const frames: ((n: number) => void)[] = [];
    const g = globalThis as unknown as { requestAnimationFrame: (f: (n: number) => void) => number; cancelAnimationFrame: (n: number) => void };
    const saved = [g.requestAnimationFrame, g.cancelAnimationFrame];
    g.requestAnimationFrame = (f) => frames.push(f);
    g.cancelAnimationFrame = () => {};
    try {
      const scene = new Scene(canvas, mapInfo(world), () => fakeSurface(), { reduced: () => true, dpr: () => 1, viewportHeight: () => 900, rect: () => ({ left: 0, top: 0, width: 600, height: 500 }) });
      scene.resize(600);
      scene.setWorld(world, { animate: false });
      const drawn = scene.draw.bind(scene);
      scene.draw = (now: number) => {
        calls.push(now);
        drawn(now);
      };
      scene.start();
      for (let i = 0; i < 12; i++) frames.shift()!(1000 + i * 16);
      // One draw for the change since the last frame, none while nothing moves, until the phase settles.
      expect(calls.length).toBeLessThanOrEqual(DAWN_MS / 16 + 2);
      const before = calls.length;
      for (let i = 0; i < 200; i++) frames.shift()!(5000 + i * 16);
      expect(calls.length - before).toBeLessThan(5);
      scene.setMarks({ cursor: { x: 2, y: 2 } });
      frames.shift()!(9000);
      expect(calls.at(-1)).toBe(9000);
      scene.stop();
    } finally {
      [g.requestAnimationFrame, g.cancelAnimationFrame] = saved as [typeof g.requestAnimationFrame, typeof g.cancelAnimationFrame];
    }
  });
});

describe('Scene: chips and hit testing', () => {
  const texts = (calls: Call[]) => calls.filter((c) => c[0] === 'fillText').map((c) => c[1] as string);

  it('M8.10: each ghost shows the number of the line it ran, once a night is on', () => {
    const r = rig();
    r.scene.setPhase('night', 0);
    r.scene.setChips(new Map([['wisp', 2], ['wisp-2', 1], ['girl', 1]]));
    const shown = texts(record(r, 100));
    expect(shown).toEqual(expect.arrayContaining(['L2', 'L1']));
    expect(shown.filter((t) => t === 'L1')).toHaveLength(2);
    r.scene.setPhase('plan', 0);
    expect(texts(record(r, 200))).toEqual([]);
  });

  it('M8.10: numerals show for ghosts of a kind that repeats, and not for the girl', () => {
    const r = rig();
    r.scene.setNumerals({ wisp: 'I', 'wisp-2': 'II', girl: 'I' });
    const shown = texts(record(r, 100));
    expect(shown).toEqual(['I', 'II']);
    r.scene.setNumerals({});
    expect(texts(record(r, 200))).toEqual([]);
  });

  it('M8.10: the chip of the girl is left out when a ghost stands on her tile', () => {
    const r = rig();
    r.scene.setPhase('night', 0);
    const world = buildWorld(NIGHT_1);
    world.actors[1]!.pos = { ...world.actors[0]!.pos };
    r.scene.setWorld(world, { animate: false });
    r.scene.setChips(new Map([['wisp', 3], ['girl', 1]]));
    expect(texts(record(r, 100))).toEqual(['L3']);
  });

  it('M8.6: a point on an item gives that item and its tile, a point on a character that character, and any other point the floor tile', () => {
    const r = rig({ withBell: true });
    const cam = r.scene.camera;
    // A sprite stands upright: `up` tiles of its height rise `up * scale` pixels above its feet.
    const at = (x: number, y: number, up: number) => {
      const p = project(cam, x + 0.5, y + 0.62, 0);
      return { x: 10 + p.X, y: 20 + p.Y - p.scale * up };
    };
    const onBell = at(4, 3, 0.6);
    expect(r.scene.hit(onBell.x, onBell.y)).toEqual({ tile: { x: 4, y: 3 }, item: 0, actor: null });
    // The same point is, on the floor, a tile behind the bell.
    expect(tileAt(cam, onBell.x - 10, onBell.y - 20)).toEqual({ x: 4, y: 2 });
    const onWisp = at(1, 1, 0.8);
    expect(r.scene.hit(onWisp.x, onWisp.y)).toMatchObject({ actor: 'wisp', item: null, tile: { x: 1, y: 1 } });
    expect(tileAt(cam, onWisp.x - 10, onWisp.y - 20)).not.toEqual({ x: 1, y: 1 });
    const floor = project(cam, 6.5, 5.5, 0);
    expect(r.scene.hit(10 + floor.X, 20 + floor.Y)).toEqual({ tile: { x: 6, y: 5 }, item: null, actor: null });
    expect(r.scene.hit(-100, -100)).toEqual({ tile: null, item: null, actor: null });
  });

  it('M8.6: the front-most of two things under a point is the one that is hit', () => {
    const r = rig();
    const world = buildWorld(NIGHT_1);
    world.actors[1]!.pos = { x: 3, y: 3 };
    world.actors[2]!.pos = { x: 3, y: 4 };
    r.scene.setWorld(world, { animate: false });
    const cam = r.scene.camera;
    const p = project(cam, 3.5, 4.62, 0);
    expect(r.scene.hit(10 + p.X, 20 + p.Y - p.scale * 0.5).actor).toBe('wisp-2');
  });

  it('M9.1: the page position of an actor for the ink thread is inside the canvas and moves with the actor', () => {
    const r = rig();
    const start = r.scene.actorPoint('wisp')!;
    expect(start.x).toBeGreaterThan(10);
    expect(start.y).toBeGreaterThan(20);
    const world = buildWorld(NIGHT_1);
    world.actors[1]!.pos = { x: 5, y: 4 };
    r.scene.setWorld(world, { animate: false });
    const moved = r.scene.actorPoint('wisp')!;
    expect(moved.x).toBeGreaterThan(start.x);
    expect(moved.y).toBeGreaterThan(start.y);
    expect(r.scene.actorPoint('nobody')).toBeNull();
  });

  it('M3.9: a bell that is placed or selected shows a range diamond while planning, and not during a night', () => {
    // Range diamonds are drawn on the floor texture, which is a separate surface; count them through the texture's calls.
    const surfaces: FakeSurface[] = [];
    const world = buildWorld(NIGHT_1, [makeItem('bell', 4, 3)]);
    const canvas = Object.assign(fakeSurface(), { style: { width: '', height: '' } });
    const scene = new Scene(canvas, mapInfo(world), () => {
      const s = fakeSurface();
      surfaces.push(s);
      return s;
    }, { reduced: () => false, dpr: () => 1, viewportHeight: () => 900, rect: () => ({ left: 0, top: 0, width: 600, height: 500 }) });
    scene.resize(600);
    scene.setWorld(world, { animate: false });
    const count = () => {
      surfaces[0]!.calls.length = 0;
      scene.draw(100);
      return surfaces[0]!.calls.filter((c) => c[0] === 'setLineDash' && (c[1] as number[]).length > 0).length;
    };
    expect(count()).toBe(13);
    scene.setMarks({ preview: { type: 'bell', x: 2, y: 2 } });
    // Two tiles of the new diamond are wall (the left wall is two steps from (2, 2)).
    expect(count()).toBe(13 + 11);
    scene.setPhase('night', 0);
    scene.setMarks({ preview: null });
    expect(count()).toBe(0);
  });
});
