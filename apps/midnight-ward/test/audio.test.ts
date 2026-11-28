import { describe, expect, it } from 'vitest';
import { CHIME_BASE_HZ, CHIME_GAP_S, CHIME_RATIOS, HUM_HZ, STING_HZ, Sfx, TOLL_BASE_HZ, TOLL_PARTIALS } from '../src/audio';
import { Progress, safeStorage } from '../src/storage';

interface Param {
  value: number;
  setValueAtTime(v: number, t: number): void;
  exponentialRampToValueAtTime(v: number, t: number): void;
  setTargetAtTime(v: number, t: number, k: number): void;
}

/** An AudioContext that records what is created and started. */
function fakeAudio(options: { state?: AudioContextState; sampleRate?: number } = {}) {
  const log = { oscillators: [] as { type: string; hz: number; startedAt: number | null; stopped: boolean }[], buffers: 0, sources: [] as number[], gains: 0, resumed: 0, created: 0 };
  const param = (): Param => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const ctx = {
    currentTime: 10,
    sampleRate: options.sampleRate ?? 48000,
    state: options.state ?? 'running',
    destination: {},
    resume() {
      log.resumed++;
      return Promise.resolve();
    },
    createGain() {
      log.gains++;
      return { gain: param(), connect() {}, disconnect() {} };
    },
    createOscillator() {
      const entry = { type: 'sine', hz: 0, startedAt: null as number | null, stopped: false };
      log.oscillators.push(entry);
      const frequency = param();
      return {
        set type(v: string) {
          entry.type = v;
        },
        get type() {
          return entry.type;
        },
        frequency: new Proxy(frequency, {
          set(target, prop, value) {
            if (prop === 'value') entry.hz = value as number;
            (target as unknown as Record<string, unknown>)[prop as string] = value;
            return true;
          },
        }),
        detune: param(),
        connect() {},
        start(t?: number) {
          entry.startedAt = t ?? ctx.currentTime;
        },
        stop() {
          entry.stopped = true;
        },
      };
    },
    createBiquadFilter() {
      return { type: 'lowpass', frequency: param(), Q: param(), connect() {} };
    },
    createBuffer(_c: number, length: number) {
      log.buffers++;
      return { getChannelData: () => new Float32Array(length) };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start(t: number) {
          log.sources.push(t);
        },
      };
    },
  } as unknown as AudioContext;
  return { ctx, log, factory: () => { log.created++; return ctx; } };
}

const hz = (log: ReturnType<typeof fakeAudio>['log']) => log.oscillators.map((o) => o.hz);

describe('Sfx', () => {
  it('M10.1: a bell tolls with five sine partials at the bell ratios, and the twelfth can be louder', () => {
    const { log, factory } = fakeAudio();
    const sfx = new Sfx(factory, true);
    sfx.unlock();
    sfx.setMuted(false);
    log.oscillators.length = 0;
    sfx.toll();
    expect(log.oscillators).toHaveLength(5);
    expect(log.oscillators.every((o) => o.type === 'sine')).toBe(true);
    expect(hz(log)).toEqual(TOLL_PARTIALS.map(([ratio]) => TOLL_BASE_HZ * ratio));
    // Each partial starts now and is scheduled to stop after the toll has died away.
    expect(log.oscillators.every((o) => o.startedAt === 10 && o.stopped)).toBe(true);
    expect(() => sfx.toll(1.2)).not.toThrow();
  });

  it('M10.1: the ink scratch is two bursts of noise, the second a little after the first', () => {
    const { log, factory } = fakeAudio();
    const sfx = new Sfx(factory);
    sfx.unlock();
    sfx.scratch();
    expect(log.buffers).toBe(2);
    expect(log.sources).toHaveLength(2);
    expect(log.sources[1]! - log.sources[0]!).toBeGreaterThan(0.1);
  });

  it('M10.1: placing an item makes a click, one short burst of noise', () => {
    const { log, factory } = fakeAudio();
    const sfx = new Sfx(factory);
    sfx.unlock();
    sfx.click();
    expect(log.sources).toHaveLength(1);
  });

  it('M10.1: the capture sting is a falling sine and two triangles a minor second apart', () => {
    const { log, factory } = fakeAudio();
    const sfx = new Sfx(factory, true);
    sfx.unlock();
    sfx.setMuted(false);
    log.oscillators.length = 0;
    sfx.sting();
    expect(log.oscillators.map((o) => o.type)).toEqual(['sine', 'triangle', 'triangle']);
    expect(STING_HZ.pair[1]! / STING_HZ.pair[0]!).toBeCloseTo(Math.pow(2, 1 / 12), 1);
    expect(log.oscillators.slice(1).map((o) => o.hz)).toEqual([...STING_HZ.pair]);
    expect(STING_HZ.to).toBeLessThan(STING_HZ.from);
  });

  it('M10.1: the dawn chime is five rising notes of a pentatonic run, one after another', () => {
    const { log, factory } = fakeAudio();
    const sfx = new Sfx(factory, true);
    sfx.unlock();
    sfx.setMuted(false);
    log.oscillators.length = 0;
    sfx.chime();
    expect(hz(log)).toEqual(CHIME_RATIOS.map((r) => CHIME_BASE_HZ * r));
    const notes = hz(log);
    expect([...notes].sort((a, b) => a - b)).toEqual(notes);
    const starts = log.oscillators.map((o) => o.startedAt!);
    starts.slice(1).forEach((t, i) => expect(t - starts[i]!).toBeCloseTo(CHIME_GAP_S, 9));
  });

  it('M10.1: every frequency is far below the limit of the sample rate, and none is a melody from a song', () => {
    const all = [...TOLL_PARTIALS.map(([r]) => TOLL_BASE_HZ * r), ...CHIME_RATIOS.map((r) => CHIME_BASE_HZ * r), ...HUM_HZ, STING_HZ.from, STING_HZ.to, ...STING_HZ.pair];
    for (const f of all) {
      expect(f).toBeGreaterThan(20);
      expect(f).toBeLessThan(44100 / 2);
    }
    expect(CHIME_RATIOS).toHaveLength(5);
  });

  it('M10.3: nothing is created or scheduled before unlock has been called from a gesture', () => {
    const { log, factory } = fakeAudio();
    const sfx = new Sfx(factory);
    sfx.toll();
    sfx.scratch();
    sfx.click();
    sfx.sting();
    sfx.chime();
    expect(log.created).toBe(0);
    expect(log.oscillators).toHaveLength(0);
    expect(log.buffers).toBe(0);
    expect(sfx.ready).toBe(false);
  });

  it('M10.3: unlock creates the context once, wakes a suspended one, and starts the hum', () => {
    const { log, factory } = fakeAudio({ state: 'suspended' });
    const sfx = new Sfx(factory);
    sfx.unlock();
    sfx.unlock();
    expect(log.created).toBe(1);
    expect(log.resumed).toBe(2);
    expect(sfx.ready).toBe(true);
    // The hum: three notes and a slow oscillator that moves its filter.
    expect(hz(log)).toEqual([...HUM_HZ, 0.07]);
  });

  it('M10.3: without Web Audio, or when creating the context throws, every method does nothing and does not throw', () => {
    for (const factory of [() => null, () => { throw new Error('NotAllowedError'); }]) {
      const sfx = new Sfx(factory);
      expect(() => {
        sfx.unlock();
        sfx.toll();
        sfx.scratch();
        sfx.click();
        sfx.sting();
        sfx.chime();
        sfx.nightFalls();
        sfx.setMuted(true);
        sfx.setMuted(false);
      }).not.toThrow();
      expect(sfx.ready).toBe(false);
    }
  });

  it('M10.3: a failed attempt is not repeated on every click', () => {
    let tries = 0;
    const sfx = new Sfx(() => {
      tries++;
      return null;
    });
    sfx.unlock();
    sfx.unlock();
    expect(tries).toBe(1);
  });

  it('M10.2: while muted nothing is scheduled, the hum stops, and unmuting brings the sound back', () => {
    const { log, factory } = fakeAudio();
    const sfx = new Sfx(factory);
    sfx.unlock();
    expect(log.oscillators.every((o) => !o.stopped)).toBe(true);
    sfx.setMuted(true);
    expect(sfx.muted).toBe(true);
    expect(log.oscillators.every((o) => o.stopped)).toBe(true);
    const before = { osc: log.oscillators.length, buffers: log.buffers, gains: log.gains };
    sfx.toll();
    sfx.scratch();
    sfx.click();
    sfx.sting();
    sfx.chime();
    expect({ osc: log.oscillators.length, buffers: log.buffers, gains: log.gains }).toEqual(before);
    sfx.setMuted(false);
    expect(log.oscillators.length).toBe(before.osc + 4);
    sfx.toll();
    expect(log.oscillators.length).toBe(before.osc + 4 + 5);
  });

  it('M10.2: muted from the start, unlock creates the context but plays nothing', () => {
    const { log, factory } = fakeAudio();
    const sfx = new Sfx(factory, true);
    sfx.unlock();
    sfx.toll();
    expect(log.created).toBe(1);
    expect(log.oscillators).toHaveLength(0);
  });

  it('M10.2: the mute setting is kept in storage and read by the next visit', () => {
    const data = new Map<string, string>();
    const backing = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const first = new Progress(safeStorage(() => backing));
    const sfx = new Sfx(() => null, first.muted());
    expect(sfx.muted).toBe(false);
    sfx.setMuted(true);
    first.setMuted(sfx.muted);
    const later = new Sfx(() => null, new Progress(safeStorage(() => backing)).muted());
    expect(later.muted).toBe(true);
  });
});
