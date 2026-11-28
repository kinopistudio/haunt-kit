// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPlay } from '../src/screens/play';
import type { Screen } from '../src/app';
import { MemoryStorage, testServices } from './fixtures/services';
import type { StubScene, TestServices } from './fixtures/services';

let root: HTMLElement;
let rig: TestServices;
let screen: Screen;
let scene: StubScene;

function open(id: string, storage?: MemoryStorage): void {
  rig = testServices({ storage });
  root.replaceChildren();
  screen = mountPlay(root, rig.services, () => {}, { screen: 'night', id });
  scene = rig.scenes.at(-1)!;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => {
  screen?.destroy();
  vi.useRealTimers();
});

const q = <T extends Element = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
const qa = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
const tapTile = (x: number, y: number) => {
  scene.hitResult = { tile: { x, y }, item: null, actor: null };
  q('canvas').dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const pulsing = () => qa('.pulse').map((e) => e.id || e.dataset.tool || (e.dataset.card && `card-${e.dataset.card}`) || e.className);
const coachTile = () => (scene.calls.filter((c) => c[0] === 'setMarks').at(-1)![1] as { coach: unknown }).coach;
const visible = () => !q('.coach').hidden;

describe('coach', () => {
  it('M7.1: the Prologue and Night I show a coach on the first visit, and Night IV does not', () => {
    open('prologue');
    expect(visible()).toBe(true);
    expect(q('.coach .tag').textContent).toBe('Tutorial \u00B7 Prologue');
    open('night1');
    expect(visible()).toBe(true);
    open('night4');
    expect(visible()).toBe(false);
    expect(q('#coach-toggle').hidden).toBe(true);
    expect(pulsing()).toEqual([]);
  });

  it('M7.2: the Prologue coach points at the salt, then at the glowing tile, then at the Ring button', () => {
    open('prologue');
    expect(q('.coach .text').textContent).toContain('Pick up the salt');
    expect(pulsing()).toEqual(['salt']);
    expect(coachTile()).toBeNull();
    q('[data-tool="salt"]').click();
    expect(pulsing()).toEqual([]);
    expect(coachTile()).toEqual({ x: 4, y: 3 });
    expect(q('.coach .text').textContent).toContain('gap in the wall');
    tapTile(4, 3);
    expect(pulsing()).toEqual(['ring']);
    expect(coachTile()).toBeNull();
  });

  it('M7.2: the Night I coach walks through the bell, two cards and their slots, and the Ring button', () => {
    open('night1');
    const seen: string[][] = [pulsing()];
    q('[data-tool="bell"]').click();
    expect(coachTile()).toEqual({ x: 4, y: 3 });
    tapTile(4, 3);
    seen.push(pulsing());
    q('[data-card="0"]').click();
    seen.push(qa('.pulse').map((e) => `${e.dataset.actor}@${e.dataset.at}`));
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="0"]').click();
    seen.push(pulsing());
    q('[data-card="1"]').click();
    seen.push(qa('.pulse').map((e) => `${e.dataset.actor}@${e.dataset.at}`));
    q('.hk-spec[data-actor="wisp-2"] .hk-slot[data-at="0"]').click();
    seen.push(pulsing());
    expect(seen).toEqual([['bell'], ['card-0'], ['wisp@0'], ['card-1'], ['wisp-2@0'], ['ring']]);
  });

  it('M7.3 / M7.2: following the coach to the end wins the night', () => {
    open('night1');
    q('[data-tool="bell"]').click();
    tapTile(4, 3);
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="0"]').click();
    q('[data-card="1"]').click();
    q('.hk-spec[data-actor="wisp-2"] .hk-slot[data-at="0"]').click();
    q('.pulse').click();
    vi.advanceTimersByTime(20000);
    expect(q('.clock-state').textContent).toBe('Dawn');
    expect(pulsing()).toEqual(['next']);
    expect(q('.coach').classList.contains('done')).toBe(true);
  });

  it('M7.4: a card under an always-true line gets the shadow warning, pointing at its remove control', () => {
    open('night1');
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="1"]').click();
    expect(q('.coach .text').textContent).toContain('This card is shadowed');
    const pulse = qa('.pulse');
    expect(pulse).toHaveLength(1);
    expect(pulse[0]!.classList.contains('hk-rm')).toBe(true);
    pulse[0]!.click();
    expect(q('.coach .text').textContent).not.toContain('shadowed');
  });

  it('M7.5: after a lost night the coach points at Try again, and says why when a card was shadowed', () => {
    open('night1');
    q('[data-tool="bell"]').click();
    tapTile(4, 3);
    q('[data-card="0"]').click();
    q('.hk-spec[data-actor="wisp"] .hk-slot[data-at="1"]').click();
    q('#coach-hide').click();
    q('#coach-toggle').click();
    q('#ring').click();
    vi.advanceTimersByTime(20000);
    expect(pulsing()).toEqual(['retry']);
    expect(q('.coach .text').textContent).toContain('a line above it was true first');
    q('#retry').click();
    expect(q('.coach .text').textContent).toContain('shadowed');
  });

  it('M7.5: after a won night the coach points at the next level', () => {
    open('prologue');
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    vi.advanceTimersByTime(20000);
    expect(pulsing()).toEqual(['next']);
    expect(q('.coach .text').textContent).toContain('gold lines');
  });

  it('M7.6: Hide tutorial hides the coach and remembers it, so that the next visit has none', () => {
    open('prologue');
    q('#coach-hide').click();
    expect(visible()).toBe(false);
    expect(pulsing()).toEqual([]);
    expect(coachTile()).toBeNull();
    expect(rig.storage.data.get('mw.coach')).toBe('["prologue"]');
    expect(q('#coach-toggle').hidden).toBe(false);
    const storage = rig.storage;
    screen.destroy();
    open('prologue', storage);
    expect(visible()).toBe(false);
    expect(pulsing()).toEqual([]);
    open('night1', storage);
    expect(visible()).toBe(true);
  });

  it('M7.6: Show tutorial brings the coach back, and it stays after a reload', () => {
    open('prologue');
    q('#coach-hide').click();
    q('#coach-toggle').click();
    expect(visible()).toBe(true);
    expect(pulsing()).toEqual(['salt']);
    expect(q('#coach-toggle').hidden).toBe(true);
    expect(rig.storage.data.get('mw.coach')).toBe('[]');
    const storage = rig.storage;
    screen.destroy();
    open('prologue', storage);
    expect(visible()).toBe(true);
  });

  it('M7.6: clearing a coached level remembers its coach, and the coach does not show on the next visit', () => {
    open('prologue');
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    vi.advanceTimersByTime(20000);
    expect(visible()).toBe(true);
    expect(rig.storage.data.get('mw.coach')).toBe('["prologue"]');
    const storage = rig.storage;
    screen.destroy();
    open('prologue', storage);
    expect(visible()).toBe(false);
  });

  it('M7.2: while a night is shown, the coach explains the lit line and points at nothing', () => {
    open('prologue');
    q('[data-tool="salt"]').click();
    tapTile(4, 3);
    q('#ring').click();
    expect(q('.coach .text').textContent).toContain('lit line');
    expect(pulsing()).toEqual([]);
  });
});
