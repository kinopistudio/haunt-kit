import { Sfx } from '../../src/audio';
import { createServices } from '../../src/app';
import type { Services } from '../../src/app';
import type { SceneApi } from '../../src/render/scene';
import type { StorageLike } from '../../src/storage';

export class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

export interface StubScene extends SceneApi {
  calls: [string, ...unknown[]][];
  started: boolean;
  hitResult: ReturnType<SceneApi['hit']>;
}

/** A scene that records what the screens tell it and draws nothing. */
export function stubScene(): StubScene {
  const calls: StubScene['calls'] = [];
  const log = (name: string) => (...args: unknown[]) => void calls.push([name, ...args]);
  const scene = {
    calls,
    started: false,
    hitResult: { tile: null, item: null, actor: null },
    size: { width: 600, height: 480 },
    camera: {} as SceneApi['camera'],
    currentPhase: 'plan' as SceneApi['currentPhase'],
    resize: log('resize'),
    setWorld: log('setWorld'),
    setChips: log('setChips'),
    setNumerals: log('setNumerals'),
    setMarks: log('setMarks'),
    setPhase(phase: SceneApi['currentPhase']) {
      scene.currentPhase = phase;
      calls.push(['setPhase', phase]);
    },
    start() {
      scene.started = true;
      calls.push(['start']);
    },
    stop() {
      scene.started = false;
      calls.push(['stop']);
    },
    hit: () => scene.hitResult,
    actorPoint: () => ({ x: 100, y: 100 }),
  };
  return scene as unknown as StubScene;
}

export interface TestServices {
  services: Services;
  storage: MemoryStorage;
  scenes: StubScene[];
  sfx: Sfx;
  reduced: { value: boolean };
}

export function testServices(options: { reduced?: boolean; storage?: MemoryStorage } = {}): TestServices {
  const storage = options.storage ?? new MemoryStorage();
  const scenes: StubScene[] = [];
  const reduced = { value: options.reduced ?? false };
  const sfx = new Sfx(() => null, storage.getItem('mw.muted') === '1');
  const services = createServices({
    storage,
    sfx,
    reduced: () => reduced.value,
    makeScene: () => {
      const scene = stubScene();
      scenes.push(scene);
      return scene;
    },
  });
  return { services, storage, scenes, sfx, reduced };
}
