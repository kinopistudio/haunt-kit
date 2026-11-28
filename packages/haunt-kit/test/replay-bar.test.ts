// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INTERVAL_MS, ReplayBar, replayBarModel } from '../src/index';
import type { ReplayAction, ReplayState } from '../src/index';

const state = (cursor: number, length = 12, playing = false): ReplayState => ({ cursor, length, playing });

describe('replayBarModel', () => {
  it('U8.1: the play button reads Play, Pause or Replay at the end', () => {
    expect(replayBarModel(state(0)).playLabel).toBe('Play');
    expect(replayBarModel(state(5, 12, true)).playLabel).toBe('Pause');
    expect(replayBarModel(state(12)).playLabel).toBe('Replay');
    expect(replayBarModel(state(0, 0)).playLabel).toBe('Play');
  });

  it('U8.1: the position label uses the tick word, and the range has its value and maximum', () => {
    expect(replayBarModel(state(3), { tickWord: 'Bell' })).toMatchObject({ position: 'Bell 3 of 12', value: 3, max: 12 });
    expect(replayBarModel(state(3)).position).toBe('Tick 3 of 12');
  });

  it('U8.1: the start and back buttons are disabled at 0, the step and end buttons at the end, and nothing plays without ticks', () => {
    expect(replayBarModel(state(0))).toMatchObject({ canStart: false, canBack: false, canStep: true, canEnd: true, canPlay: true });
    expect(replayBarModel(state(6))).toMatchObject({ canStart: true, canBack: true, canStep: true, canEnd: true });
    expect(replayBarModel(state(12))).toMatchObject({ canStart: true, canBack: true, canStep: false, canEnd: false });
    expect(replayBarModel(state(0, 0))).toMatchObject({ canPlay: false, canStep: false });
  });
});

describe('ReplayBar', () => {
  let root: HTMLElement;
  let calls: [ReplayState, ReplayAction][];
  const make = (options: ConstructorParameters<typeof ReplayBar>[1] = {}) => {
    calls = [];
    return new ReplayBar(root, { length: 12, tickWord: 'Bell', onChange: (s, a) => calls.push([s, a]), ...options });
  };
  const click = (selector: string) => root.querySelector<HTMLElement>(selector)!.click();
  const label = () => root.querySelector('.hk-position')!.textContent;

  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
  });
  afterEach(() => vi.useRealTimers());

  it('U8.2: builds five buttons, a range input, a position label and a speed toggle', () => {
    make();
    expect([...root.querySelectorAll('button')].map((b) => b.className)).toEqual(['hk-start', 'hk-back', 'hk-play', 'hk-step', 'hk-end', 'hk-speed']);
    const range = root.querySelector<HTMLInputElement>('input.hk-scrub')!;
    expect([range.type, range.min, range.max, range.value]).toEqual(['range', '0', '12', '0']);
    expect(label()).toBe('Bell 0 of 12');
    expect(root.getAttribute('role')).toBe('group');
    expect(root.querySelector('.hk-start')!.getAttribute('aria-label')).toBe('Go to the start');
  });

  it('U8.2: the buttons apply their actions and call onChange with the new state and the action', () => {
    const bar = make();
    click('.hk-step');
    click('.hk-step');
    expect(bar.state.cursor).toBe(2);
    click('.hk-back');
    expect(bar.state.cursor).toBe(1);
    click('.hk-end');
    expect(bar.state.cursor).toBe(12);
    click('.hk-start');
    expect(bar.state.cursor).toBe(0);
    expect(calls.map(([, a]) => a.type)).toEqual(['step', 'step', 'back', 'end', 'start']);
    expect(calls[1]![0].cursor).toBe(2);
    expect(label()).toBe('Bell 0 of 12');
    expect(root.querySelector<HTMLButtonElement>('.hk-back')!.disabled).toBe(true);
  });

  it('U8.2: the play button toggles between Play and Pause', () => {
    const bar = make();
    click('.hk-play');
    expect(bar.state.playing).toBe(true);
    expect(root.querySelector('.hk-play')!.textContent).toBe('Pause');
    click('.hk-play');
    expect(bar.state.playing).toBe(false);
    expect(root.querySelector('.hk-play')!.textContent).toBe('Play');
  });

  it('U8.2: moving the range input seeks to that tick and updates the label', () => {
    const bar = make();
    const range = root.querySelector<HTMLInputElement>('.hk-scrub')!;
    range.value = '7';
    range.dispatchEvent(new Event('input'));
    expect(bar.state.cursor).toBe(7);
    expect(calls.at(-1)![1]).toEqual({ type: 'seek', to: 7 });
    expect(label()).toBe('Bell 7 of 12');
  });

  it('U8.2: Space, ArrowRight, ArrowLeft, Home and End on the bar apply play, step, back, start and end', () => {
    const bar = make();
    const press = (key: string) => root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowLeft');
    expect(bar.state.cursor).toBe(1);
    press('End');
    expect(bar.state.cursor).toBe(12);
    press('Home');
    expect(bar.state.cursor).toBe(0);
    press(' ');
    expect(bar.state.playing).toBe(true);
    press(' ');
    expect(bar.state.playing).toBe(false);
    const before = calls.length;
    press('x');
    expect(calls).toHaveLength(before);
  });

  it('U8.2: keys pressed on a button or on the range input are left to the browser', () => {
    const bar = make();
    const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key(root.querySelector('.hk-play')!, ' ');
    key(root.querySelector('.hk-scrub')!, 'ArrowRight');
    expect(bar.state.cursor).toBe(0);
    expect(bar.state.playing).toBe(false);
    key(root.querySelector('.hk-play')!, 'ArrowRight');
    expect(bar.state.cursor).toBe(1);
  });

  it('U8.3: while playing, the bar advances after the interval and stops at the end', () => {
    const bar = make({ length: 3 });
    click('.hk-play');
    expect(bar.state.cursor).toBe(0);
    vi.advanceTimersByTime(DEFAULT_INTERVAL_MS[1] - 1);
    expect(bar.state.cursor).toBe(0);
    vi.advanceTimersByTime(1);
    expect(bar.state.cursor).toBe(1);
    vi.advanceTimersByTime(DEFAULT_INTERVAL_MS[1] * 5);
    expect(bar.state).toEqual({ cursor: 3, length: 3, playing: false });
    expect(vi.getTimerCount()).toBe(0);
    expect(root.querySelector('.hk-play')!.textContent).toBe('Replay');
    expect(calls.filter(([, a]) => a.type === 'advance')).toHaveLength(3);
  });

  it('U8.3: the timer stops on pause, on a scrub, on reset and on destroy', () => {
    const bar = make();
    click('.hk-play');
    expect(vi.getTimerCount()).toBe(1);
    click('.hk-play');
    expect(vi.getTimerCount()).toBe(0);
    click('.hk-play');
    root.querySelector<HTMLInputElement>('.hk-scrub')!.dispatchEvent(new Event('input'));
    expect(vi.getTimerCount()).toBe(0);
    bar.dispatch({ type: 'play' });
    bar.reset(5);
    expect(vi.getTimerCount()).toBe(0);
    expect(bar.state).toEqual({ cursor: 0, length: 5, playing: false });
    expect(root.querySelector<HTMLInputElement>('.hk-scrub')!.max).toBe('5');
    bar.dispatch({ type: 'play' });
    bar.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(bar.state.cursor).toBe(0);
  });

  it('U8.3: never has more than one timer, even when play is applied twice', () => {
    const bar = make();
    bar.dispatch({ type: 'play' });
    bar.dispatch({ type: 'play' });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('U8.3: an interval function from the options sets the pace', () => {
    const bar = make({ intervalMs: () => 50 });
    click('.hk-play');
    vi.advanceTimersByTime(150);
    expect(bar.state.cursor).toBe(3);
  });

  it('U8.4: the speed toggle switches between ×1 and ×2, and ×2 is faster', () => {
    const speeds: number[] = [];
    const bar = make({ onSpeed: (s) => speeds.push(s) });
    expect(DEFAULT_INTERVAL_MS[2]).toBeLessThan(DEFAULT_INTERVAL_MS[1]);
    const toggle = root.querySelector<HTMLButtonElement>('.hk-speed')!;
    expect(toggle.textContent).toBe('\u00D71');
    toggle.click();
    expect([bar.speed, toggle.textContent, toggle.getAttribute('aria-pressed')]).toEqual([2, '\u00D72', 'true']);
    click('.hk-play');
    vi.advanceTimersByTime(DEFAULT_INTERVAL_MS[2]);
    expect(bar.state.cursor).toBe(1);
    toggle.click();
    expect([bar.speed, toggle.textContent, toggle.getAttribute('aria-pressed')]).toEqual([1, '\u00D71', 'false']);
    expect(speeds).toEqual([2, 1]);
  });

  it('U8.4: changing the speed while playing uses the new interval for the next tick', () => {
    const bar = make();
    click('.hk-play');
    vi.advanceTimersByTime(300);
    bar.setSpeed(2);
    vi.advanceTimersByTime(DEFAULT_INTERVAL_MS[2]);
    expect(bar.state.cursor).toBe(1);
  });
});
