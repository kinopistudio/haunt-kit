/** The part of `localStorage` the game uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The only place in the app that touches `localStorage`. When the browser has none, or refuses (private mode,
 * a sandboxed frame, a full disk), reads and writes fall back to memory, so the game plays on and forgets at reload.
 */
export function safeStorage(find: () => StorageLike | null | undefined = () => globalThis.localStorage): StorageLike {
  const memory = new Map<string, string>();
  let backing: StorageLike | null = null;
  try {
    backing = find() ?? null;
  } catch {
    backing = null;
  }
  return {
    getItem(key) {
      try {
        const value = backing?.getItem(key);
        if (value !== undefined && value !== null) return value;
      } catch {
        /* fall through to memory */
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        backing?.setItem(key, value);
      } catch {
        /* kept in memory only */
      }
    },
  };
}

const CLEARED = 'mw.cleared';
const COACH = 'mw.coach';
const MUTED = 'mw.muted';

/** What the game remembers between visits: cleared levels, finished coaches and the mute setting. */
export class Progress {
  constructor(private readonly storage: StorageLike) {}

  private readList(key: string): string[] {
    try {
      const value: unknown = JSON.parse(this.storage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  private add(key: string, id: string): void {
    const list = this.readList(key);
    if (!list.includes(id)) this.storage.setItem(key, JSON.stringify([...list, id]));
  }

  cleared(): string[] {
    return this.readList(CLEARED);
  }

  isCleared(id: string): boolean {
    return this.cleared().includes(id);
  }

  markCleared(id: string): void {
    this.add(CLEARED, id);
  }

  /** True once the coach of a level has been finished or hidden. */
  coachDone(id: string): boolean {
    return this.readList(COACH).includes(id);
  }

  markCoachDone(id: string): void {
    this.add(COACH, id);
  }

  /** Brings a level's coach back. */
  resetCoach(id: string): void {
    this.storage.setItem(COACH, JSON.stringify(this.readList(COACH).filter((x) => x !== id)));
  }

  muted(): boolean {
    return this.storage.getItem(MUTED) === '1';
  }

  setMuted(muted: boolean): void {
    this.storage.setItem(MUTED, muted ? '1' : '0');
  }
}
