// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from '../src/app';
import type { RouterHost, Screens } from '../src/app';
import { LEVELS } from '../src/levels';
import { hashFor } from '../src/route';
import { mountLevels } from '../src/screens/levels';
import { mountTitle } from '../src/screens/title';
import { testServices } from './fixtures/services';

let root: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => vi.useRealTimers());

const text = (selector: string) => root.querySelector(selector)?.textContent ?? null;

describe('title screen', () => {
  it('M2.1: shows the name, the tagline, a Begin button and a mute toggle', () => {
    const { services } = testServices();
    mountTitle(root, services, () => {}, { screen: 'title' });
    expect(text('h1')).toBe('Midnight Ward');
    expect(text('.tagline')).toBe('A ghost that obeys its spec.');
    expect(text('button.primary')).toBe('Begin');
    expect(root.querySelector('button.mute')).not.toBeNull();
  });

  it('M2.1: Begin opens the level select', () => {
    const { services } = testServices();
    const routes: unknown[] = [];
    mountTitle(root, services, (r) => routes.push(r), { screen: 'title' });
    root.querySelector<HTMLButtonElement>('button.primary')!.click();
    expect(routes).toEqual([{ screen: 'nights' }]);
  });

  it('M10.2: the mute toggle on the title flips the setting, keeps it, and says what it will do', () => {
    const { services, storage, sfx } = testServices();
    mountTitle(root, services, () => {}, { screen: 'title' });
    const button = root.querySelector<HTMLButtonElement>('button.mute')!;
    expect(button.textContent).toBe('Sound on');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(sfx.muted).toBe(true);
    expect(button.textContent).toBe('Sound off');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(storage.data.get('mw.muted')).toBe('1');
    button.click();
    expect(storage.data.get('mw.muted')).toBe('0');
  });

  it('M10.2: a setting kept from an earlier visit shows when the title opens', () => {
    const first = testServices();
    first.services.setMuted(true);
    const { services } = testServices({ storage: first.storage });
    mountTitle(root, services, () => {}, { screen: 'title' });
    expect(text('button.mute')).toBe('Sound off');
  });

  it('M8.1: the title shows the ward with a wisp that walks, by stepping the engine recording, and stops with the screen', () => {
    const { services, scenes } = testServices();
    const screen = mountTitle(root, services, () => {}, { screen: 'title' });
    const scene = scenes[0]!;
    expect(scene.started).toBe(true);
    const before = scene.calls.filter((c) => c[0] === 'setWorld').length;
    vi.advanceTimersByTime(2000);
    expect(scene.calls.filter((c) => c[0] === 'setWorld').length).toBeGreaterThan(before);
    screen.destroy();
    expect(scene.started).toBe(false);
    const after = scene.calls.length;
    vi.advanceTimersByTime(5000);
    expect(scene.calls.length).toBe(after);
  });

  it('M9.5: with reduced motion the wisp on the title stands still', () => {
    const { services, scenes } = testServices({ reduced: true });
    mountTitle(root, services, () => {}, { screen: 'title' });
    const before = scenes[0]!.calls.length;
    vi.advanceTimersByTime(10000);
    expect(scenes[0]!.calls.length).toBe(before);
  });
});

describe('level select', () => {
  it('M2.2: lists the Prologue, Night I and Night IV with the idea each teaches, and none is locked', () => {
    const { services } = testServices();
    mountLevels(root, services, () => {}, { screen: 'nights' });
    const folios = [...root.querySelectorAll<HTMLAnchorElement>('a.folio')];
    expect(folios.map((f) => f.querySelector('.folio-numeral')!.textContent)).toEqual(['Prologue', 'I', 'IV']);
    expect(folios.map((f) => f.querySelector('.folio-concept')!.textContent)).toEqual(['Condition and action', 'Rule order', 'Contradiction and change']);
    expect(folios.map((f) => f.getAttribute('href'))).toEqual(['#/night/prologue', '#/night/night1', '#/night/night4']);
    for (const f of folios) {
      expect(f.getAttribute('aria-disabled')).toBeNull();
      expect(f.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('M2.2 / M2.4: a cleared level has a ✓ mark in words, and the others do not', () => {
    const { services } = testServices();
    services.progress.markCleared('night1');
    mountLevels(root, services, () => {}, { screen: 'nights' });
    const states = [...root.querySelectorAll('.folio-state')].map((s) => s.textContent);
    expect(states).toEqual(['Not yet cleared', '\u2713 Cleared', 'Not yet cleared']);
    expect(root.querySelectorAll('.folio.cleared')).toHaveLength(1);
  });

  it('M2.4: a level cleared before a reload is shown cleared after it', () => {
    const first = testServices();
    first.services.progress.markCleared('prologue');
    const second = testServices({ storage: first.storage });
    mountLevels(root, second.services, () => {}, { screen: 'nights' });
    expect(root.querySelector('.folio.cleared')?.getAttribute('href')).toBe('#/night/prologue');
  });
});

describe('router', () => {
  function rig(initial = '') {
    const state = { hash: initial };
    const listeners = new Set<() => void>();
    const host: RouterHost = {
      getHash: () => state.hash,
      setHash(hash) {
        state.hash = hash;
        for (const l of listeners) l();
      },
      onChange(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    };
    const log: string[] = [];
    const screen = (name: string): Screens['title'] => (r, _s, _go, route) => {
      log.push(`mount ${name}${route.screen === 'night' ? ` ${route.id}` : ''}`);
      r.append(Object.assign(document.createElement('p'), { textContent: name }));
      return { destroy: () => void log.push(`destroy ${name}`) };
    };
    const { services } = testServices();
    const router = new Router(root, services, { title: screen('title'), nights: screen('nights'), night: screen('night') }, host);
    return { router, state, log, listeners };
  }

  it('M2.3: shows the screen of the hash, and the title for an empty or unknown hash', () => {
    for (const [hash, expected] of [['', 'title'], ['#/nights', 'nights'], ['#/night/night1', 'night'], ['#/night/night9', 'title'], ['#/junk', 'title']] as const) {
      const { router } = rig(hash);
      router.start();
      expect(root.textContent, hash).toBe(expected);
      router.destroy();
    }
  });

  it('M2.3: swaps the screen when the hash changes, destroying the old one first, as the back button does', () => {
    const { router, state, log } = rig('#/nights');
    router.start();
    router.go({ screen: 'night', id: 'night4' });
    expect(state.hash).toBe('#/night/night4');
    expect(log).toEqual(['mount nights', 'destroy nights', 'mount night night4']);
    state.hash = '#/nights';
    router.show();
    expect(log.slice(-2)).toEqual(['destroy night', 'mount nights']);
    expect(root.children).toHaveLength(1);
  });

  it('M2.3: going to the route that is already shown shows it again, so that a level can be restarted', () => {
    const { router, log } = rig('#/night/night1');
    router.start();
    router.go({ screen: 'night', id: 'night1' });
    expect(log).toEqual(['mount night night1', 'destroy night', 'mount night night1']);
  });

  it('M2.3: destroy removes the screen and stops listening to the hash', () => {
    const { router, listeners, log } = rig('#/nights');
    router.start();
    expect(listeners.size).toBe(1);
    router.destroy();
    expect(listeners.size).toBe(0);
    expect(log.at(-1)).toBe('destroy nights');
    expect(root.children).toHaveLength(0);
  });

  it('M2.3: every level route is a hash that parses back to its level', () => {
    for (const level of LEVELS) {
      const { router } = rig(hashFor({ screen: 'night', id: level.id }));
      expect(router.route).toEqual({ screen: 'night', id: level.id });
    }
  });
});

describe('look', () => {
  const css = readFileSync(join(import.meta.dirname, '../src/styles.css'), 'utf8');
  const html = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8');

  it('M11.5: the stylesheet uses the palette of game-feel.md and the two typefaces', () => {
    for (const hex of ['#0d0b0a', '#e8d9b5', '#f2a541', '#7fd1c7', '#8c1c13']) expect(css).toContain(hex);
    expect(css).toContain('"IM Fell English"');
    expect(css).toContain('"IBM Plex Mono"');
  });

  it('M11.5: blood red is used only for failure: the failed verdict and the danger button', () => {
    const blocks = css.split('}').filter((b) => /var\(--blood\)|#8c1c13/.test(b));
    for (const block of blocks) expect(block, block).toMatch(/lost|danger|--blood:/);
  });

  it('M11.5: both fonts load from Google Fonts, and the page is English', () => {
    expect(html).toContain('fonts.googleapis.com/css2?family=IBM+Plex+Mono');
    expect(html).toContain('IM+Fell+English');
    expect(html).toContain('<html lang="en">');
  });
});
