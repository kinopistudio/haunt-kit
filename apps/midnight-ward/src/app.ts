import { Scene, mapInfo, pageEnvironment } from './render/scene';
import type { SceneApi } from './render/scene';
import { Sfx } from './audio';
import { FxLayer } from './render/fx';
import { LEVELS } from './levels';
import type { LevelDef } from './levels';
import { reducedMotion } from './motion';
import { TITLE, hashFor, parseRoute } from './route';
import type { Route } from './route';
import { Progress, safeStorage } from './storage';
import type { StorageLike } from './storage';
import type { World } from 'haunt-kit';

/** Everything a screen needs from the outside: sound, memory, the levels and a way to make a scene. */
export interface Services {
  sfx: Sfx;
  progress: Progress;
  levels: readonly LevelDef[];
  reduced: () => boolean;
  makeScene: (canvas: HTMLCanvasElement, world: World) => SceneApi;
  /** The page-wide layer for ink threads and ash. */
  makeFx: (canvas: HTMLCanvasElement) => FxApi;
  /** Mutes or unmutes: the sound, the memory and every mute button. */
  setMuted: (muted: boolean) => void;
  /** Calls `listener` when the mute setting changes. Returns a function that stops it. */
  onMute: (listener: (muted: boolean) => void) => () => void;
}

/** What the screens use of the effects layer. */
export type FxApi = Pick<FxLayer, 'thread' | 'ash' | 'resize' | 'stop'>;

/** A mounted screen. `destroy` stops its loops and listeners. */
export interface Screen {
  destroy(): void;
}

export interface ServiceOptions {
  storage?: StorageLike | null;
  sfx?: Sfx;
  reduced?: () => boolean;
  makeScene?: Services['makeScene'];
  makeFx?: Services['makeFx'];
}

export function createServices(options: ServiceOptions = {}): Services {
  const progress = new Progress(options.storage ?? safeStorage());
  const sfx = options.sfx ?? new Sfx(undefined, progress.muted());
  const reduced = options.reduced ?? reducedMotion;
  const listeners = new Set<(muted: boolean) => void>();
  return {
    sfx,
    progress,
    levels: LEVELS,
    reduced,
    makeScene:
      options.makeScene ??
      ((canvas, world) => new Scene(canvas, mapInfo(world), () => canvas.ownerDocument.createElement('canvas'), pageEnvironment(canvas, reduced))),
    makeFx:
      options.makeFx ??
      ((canvas) =>
        new FxLayer(canvas, {
          reduced,
          dpr: () => globalThis.devicePixelRatio || 1,
          viewport: () => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }),
        })),
    setMuted(muted) {
      sfx.setMuted(muted);
      progress.setMuted(muted);
      for (const listener of listeners) listener(muted);
    },
    onMute(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Where the current route comes from. In a page it is the URL hash. */
export interface RouterHost {
  getHash(): string;
  setHash(hash: string): void;
  /** Calls `listener` whenever the hash changes. Returns a function that stops it. */
  onChange(listener: () => void): () => void;
}

export type Mount = (root: HTMLElement, services: Services, go: (route: Route) => void, route: Route) => Screen;

export interface Screens {
  title: Mount;
  nights: Mount;
  night: Mount;
}

/**
 * Shows the screen of the URL hash and swaps it when the hash changes (the back and forward buttons included).
 * An unknown hash shows the title.
 */
export class Router {
  private current: Screen | null = null;
  private stop: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly services: Services,
    private readonly screens: Screens,
    private readonly host: RouterHost,
  ) {}

  get route(): Route {
    return parseRoute(this.host.getHash(), this.services.levels.map((l) => l.id));
  }

  start(): void {
    this.stop = this.host.onChange(() => this.show());
    this.show();
  }

  go = (route: Route): void => {
    const hash = hashFor(route);
    if (this.host.getHash() === hash) this.show();
    else this.host.setHash(hash);
  };

  show(): void {
    const route = this.route;
    this.current?.destroy();
    this.current = null;
    this.root.replaceChildren();
    const mount = route.screen === 'title' ? this.screens.title : route.screen === 'nights' ? this.screens.nights : this.screens.night;
    this.current = mount(this.root, this.services, this.go, route);
  }

  destroy(): void {
    this.stop?.();
    this.current?.destroy();
    this.current = null;
    this.root.replaceChildren();
  }
}

export { TITLE };
