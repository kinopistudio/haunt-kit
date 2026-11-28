import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ASH_COUNT, FxLayer, THREAD_MS } from '../src/render/fx';
import type { FxEnvironment } from '../src/render/fx';
import { fakeSurface } from './fixtures/fake-canvas';

const g = globalThis as unknown as { requestAnimationFrame: (f: (n: number) => void) => number; cancelAnimationFrame: (n: number) => void };
let frames: ((now: number) => void)[] = [];
let saved: [typeof g.requestAnimationFrame, typeof g.cancelAnimationFrame];

beforeEach(() => {
  frames = [];
  saved = [g.requestAnimationFrame, g.cancelAnimationFrame];
  g.requestAnimationFrame = (f) => frames.push(f);
  g.cancelAnimationFrame = () => {};
});
afterEach(() => {
  [g.requestAnimationFrame, g.cancelAnimationFrame] = saved;
});

function layer(reduced = false) {
  const canvas = fakeSurface();
  const env: FxEnvironment = { reduced: () => reduced, dpr: () => 2, viewport: () => ({ width: 800, height: 600 }) };
  let n = 0;
  const fx = new FxLayer(canvas, env, () => ((n = (n * 7 + 3) % 11) / 11));
  fx.resize();
  return { fx, canvas };
}

const from = { x: 700, y: 300 };
const to = { x: 200, y: 400 };

describe('FxLayer: ink threads', () => {
  it('M9.1: a thread lasts between 380 and 700 ms to arrive, and then fades out', () => {
    expect(THREAD_MS[1]).toBe(700);
    expect(THREAD_MS[2]).toBe(380);
    for (const ms of Object.values(THREAD_MS)) {
      expect(ms).toBeGreaterThanOrEqual(380);
      expect(ms).toBeLessThanOrEqual(700);
    }
    const { fx, canvas } = layer();
    expect(fx.thread(from, to, { ms: 700, color: '#7fd1c7', now: 1000 })).toBe(true);
    expect(fx.threadCount).toBe(1);
    fx.draw(1000);
    fx.draw(1350);
    // Half way: the thread is drawn up to half of its length, with a bead at the head.
    canvas.calls.length = 0;
    fx.draw(1350);
    const lines = canvas.calls.filter((c) => c[0] === 'lineTo').length;
    expect(lines).toBeGreaterThan(15);
    expect(lines).toBeLessThanOrEqual(21);
    expect(canvas.calls.filter((c) => c[0] === 'arc')).toHaveLength(6);
    // On arrival it is whole, and then it fades.
    canvas.calls.length = 0;
    fx.draw(1700);
    expect(canvas.calls.filter((c) => c[0] === 'lineTo').length).toBe(40);
    const alphas = (calls: typeof canvas.calls) => calls.filter((c) => c[0] === 'set:globalAlpha').map((c) => c[1] as number);
    expect(alphas(canvas.calls)[0]).toBeCloseTo(0.9, 6);
    canvas.calls.length = 0;
    fx.draw(1700 + 700 * 0.125);
    expect(alphas(canvas.calls)[0]!).toBeLessThan(0.9);
    expect(alphas(canvas.calls)[0]!).toBeGreaterThan(0);
    fx.draw(1700 + 700 * 0.25 + 1);
    expect(fx.threadCount).toBe(0);
    expect(fx.active).toBe(false);
  });

  it('M9.1: the thread runs from the line to the actor: it starts at the line and ends on the actor', () => {
    const { fx, canvas } = layer();
    fx.thread(from, to, { ms: 700, color: '#7fd1c7', now: 0 });
    canvas.calls.length = 0;
    fx.draw(700);
    const move = canvas.calls.find((c) => c[0] === 'moveTo')!;
    // The thread wobbles by up to 2 px, like ink on a quill.
    expect(move[1]).toBeCloseTo(from.x, 6);
    expect(Math.abs((move[2] as number) - from.y)).toBeLessThanOrEqual(2);
    const last = canvas.calls.filter((c) => c[0] === 'lineTo').at(-1)!;
    expect(last[1] as number).toBeCloseTo(to.x, 6);
    expect(Math.abs((last[2] as number) - to.y)).toBeLessThan(3);
  });

  it('M9.1: several threads of one bell are drawn together, one per actor that ran a line', () => {
    const { fx, canvas } = layer();
    fx.thread(from, to, { ms: 700, color: 'a', now: 0 });
    fx.thread({ x: 600, y: 320 }, { x: 300, y: 380 }, { ms: 700, color: 'b', now: 0 });
    expect(fx.threadCount).toBe(2);
    canvas.calls.length = 0;
    fx.draw(350);
    expect(canvas.calls.filter((c) => c[0] === 'stroke')).toHaveLength(2);
  });

  it('M9.5: with reduced motion no thread is drawn and nothing starts', () => {
    const { fx, canvas } = layer(true);
    expect(fx.thread(from, to, { ms: 700, color: '#7fd1c7' })).toBe(false);
    expect(fx.threadCount).toBe(0);
    expect(frames).toHaveLength(0);
    expect(canvas.calls.length).toBe(0);
  });

  it('M9.1: the layer is sized to the page at the device pixel ratio, up to 2', () => {
    const { canvas } = layer();
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
  });
});

describe('FxLayer: ash', () => {
  const rect = { left: 400, top: 200, width: 300, height: 30 };

  it('M9.3: a burning line lets a handful of ash rise from its rectangle, which then fades away', () => {
    const { fx, canvas } = layer();
    expect(fx.ash(rect)).toBe(true);
    expect(fx.speckCount).toBe(ASH_COUNT);
    fx.draw(16);
    const first = canvas.calls.filter((c) => c[0] === 'fillRect').slice(-ASH_COUNT);
    expect(first).toHaveLength(ASH_COUNT);
    for (const c of first) {
      expect(c[1] as number).toBeGreaterThanOrEqual(rect.left - 5);
      expect(c[1] as number).toBeLessThanOrEqual(rect.left + rect.width + 5);
    }
    // The ash rises: after a second, the specks are above where they started.
    for (let t = 32; t <= 1000; t += 16) fx.draw(t);
    canvas.calls.length = 0;
    fx.draw(1016);
    const later = canvas.calls.filter((c) => c[0] === 'fillRect').slice(-ASH_COUNT);
    expect(later.length).toBeGreaterThan(0);
    for (const c of later) expect(c[2] as number).toBeLessThan(rect.top + rect.height);
    for (let t = 1032; t <= 3000; t += 16) fx.draw(t);
    expect(fx.speckCount).toBe(0);
  });

  it('M9.5: with reduced motion there is no ash', () => {
    const { fx } = layer(true);
    expect(fx.ash(rect)).toBe(false);
    expect(fx.speckCount).toBe(0);
    expect(frames).toHaveLength(0);
  });
});

describe('FxLayer: frame loop', () => {
  it('M9.1: the frame loop starts with the first thread, and stops by itself when nothing is left to draw', () => {
    const { fx } = layer();
    expect(frames).toHaveLength(0);
    fx.thread(from, to, { ms: 380, color: '#7fd1c7', now: 0 });
    expect(frames).toHaveLength(1);
    let now = 0;
    for (let i = 0; i < 200 && frames.length > 0; i++) frames.shift()!((now += 16));
    expect(fx.active).toBe(false);
    expect(frames).toHaveLength(0);
    // And it can start again.
    fx.thread(from, to, { ms: 380, color: '#7fd1c7', now });
    expect(frames).toHaveLength(1);
  });

  it('M9.1: starting a second thread while the loop runs does not start a second loop', () => {
    const { fx } = layer();
    fx.thread(from, to, { ms: 700, color: 'a', now: 0 });
    fx.thread(from, to, { ms: 700, color: 'b', now: 0 });
    expect(frames).toHaveLength(1);
    fx.stop();
  });
});
