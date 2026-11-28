import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { hashFor, parseRoute, sameRoute } from '../src/route';
import type { Route } from '../src/route';
import { Progress, safeStorage } from '../src/storage';
import type { StorageLike } from '../src/storage';

const ids = LEVELS.map((l) => l.id);

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

describe('route', () => {
  it('M2.3: reads the title, the level select and a level from the hash', () => {
    expect(parseRoute('', ids)).toEqual({ screen: 'title' });
    expect(parseRoute('#', ids)).toEqual({ screen: 'title' });
    expect(parseRoute('#/', ids)).toEqual({ screen: 'title' });
    expect(parseRoute('#/nights', ids)).toEqual({ screen: 'nights' });
    expect(parseRoute('#/night/night1', ids)).toEqual({ screen: 'night', id: 'night1' });
    expect(parseRoute('#/night/prologue', ids)).toEqual({ screen: 'night', id: 'prologue' });
  });

  it('M2.3: any unknown hash shows the title', () => {
    for (const hash of ['#/night/night2', '#/night/', '#/night', '#/nights/x', '#/other', '#/night/%E0%A4%A', '#night1']) {
      expect(parseRoute(hash, ids), hash).toEqual({ screen: 'title' });
    }
  });

  it('M2.3: the hash of a route reads back as the same route, so the back button can replay it', () => {
    const routes: Route[] = [{ screen: 'title' }, { screen: 'nights' }, ...ids.map((id): Route => ({ screen: 'night', id }))];
    for (const route of routes) expect(parseRoute(hashFor(route), ids)).toEqual(route);
    expect(sameRoute({ screen: 'night', id: 'night1' }, { screen: 'night', id: 'night1' })).toBe(true);
    expect(sameRoute({ screen: 'night', id: 'night1' }, { screen: 'night', id: 'night4' })).toBe(false);
  });
});

describe('storage and progress', () => {
  it('M2.4: a cleared level is remembered, once, and read back by a new Progress on the same storage', () => {
    const backing = new FakeStorage();
    const progress = new Progress(safeStorage(() => backing));
    expect(progress.cleared()).toEqual([]);
    progress.markCleared('night1');
    progress.markCleared('night1');
    progress.markCleared('prologue');
    expect(progress.cleared()).toEqual(['night1', 'prologue']);
    expect(progress.isCleared('night1')).toBe(true);
    expect(progress.isCleared('night4')).toBe(false);
    expect(new Progress(safeStorage(() => backing)).cleared()).toEqual(['night1', 'prologue']);
  });

  it('M7.6: a finished coach is remembered per level, and can be brought back', () => {
    const backing = new FakeStorage();
    const progress = new Progress(safeStorage(() => backing));
    expect(progress.coachDone('prologue')).toBe(false);
    progress.markCoachDone('prologue');
    expect(progress.coachDone('prologue')).toBe(true);
    expect(progress.coachDone('night1')).toBe(false);
    expect(new Progress(safeStorage(() => backing)).coachDone('prologue')).toBe(true);
    progress.resetCoach('prologue');
    expect(progress.coachDone('prologue')).toBe(false);
    expect(new Progress(safeStorage(() => backing)).coachDone('prologue')).toBe(false);
  });

  it('M10.2: the mute setting is kept, and off by default', () => {
    const backing = new FakeStorage();
    const progress = new Progress(safeStorage(() => backing));
    expect(progress.muted()).toBe(false);
    progress.setMuted(true);
    expect(new Progress(safeStorage(() => backing)).muted()).toBe(true);
    progress.setMuted(false);
    expect(new Progress(safeStorage(() => backing)).muted()).toBe(false);
  });

  it('M1.4: a storage that throws on every call does not break the game: the values live in memory', () => {
    const progress = new Progress(safeStorage(() => throwing));
    expect(() => progress.markCleared('night1')).not.toThrow();
    expect(progress.isCleared('night1')).toBe(true);
    progress.markCoachDone('prologue');
    expect(progress.coachDone('prologue')).toBe(true);
    progress.setMuted(true);
    expect(progress.muted()).toBe(true);
  });

  it('M1.4: a missing storage, or one that throws when it is looked up, falls back to memory', () => {
    for (const find of [() => undefined, () => null, () => { throw new Error('blocked'); }]) {
      const progress = new Progress(safeStorage(find));
      progress.markCleared('night4');
      expect(progress.cleared()).toEqual(['night4']);
    }
  });

  it('M1.4: stored values that are not what the game wrote are ignored', () => {
    const backing = new FakeStorage();
    backing.setItem('mw.cleared', '{not json');
    backing.setItem('mw.coach', '{"a":1}');
    backing.setItem('mw.muted', 'yes');
    const progress = new Progress(safeStorage(() => backing));
    expect(progress.cleared()).toEqual([]);
    expect(progress.coachDone('prologue')).toBe(false);
    expect(progress.muted()).toBe(false);
    backing.setItem('mw.cleared', '["night1", 4, null, "night4"]');
    expect(progress.cleared()).toEqual(['night1', 'night4']);
  });
});
