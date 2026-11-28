// Every sound in the game is made here with the Web Audio API, from numbers. There are no audio files and no tune.

/** Bell partials as ratios of the base note and their loudness. The ratios are inharmonic, like cast bronze. */
export const TOLL_BASE_HZ = 196;
export const TOLL_PARTIALS: readonly (readonly [ratio: number, gain: number])[] = [
  [1, 1],
  [2.01, 0.5],
  [2.76, 0.35],
  [5.4, 0.18],
  [8.9, 0.08],
];

/** The dawn chime: a rising run of five notes on a major pentatonic scale, in ratios of C5. */
export const CHIME_BASE_HZ = 523.25;
export const CHIME_RATIOS: readonly number[] = [1, 5 / 4, 3 / 2, 5 / 3, 2];
export const CHIME_GAP_S = 0.14;

/** The low hum under the night: three notes a fifth apart, slightly detuned. */
export const HUM_HZ: readonly number[] = [55, 82.4, 110.3];

/** The capture sting: a sine that falls to nothing, and two triangles a minor second apart. */
export const STING_HZ = { from: 90, to: 30, pair: [233, 247] as const };

export type ContextFactory = () => AudioContext | null;

const defaultFactory: ContextFactory = () => {
  const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
};

/**
 * The game's sounds. Nothing is scheduled until `unlock` has been called from a click, tap or key press, and nothing is
 * scheduled while muted. Where the browser has no Web Audio, every method does nothing.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { stop: () => void; level: GainNode } | null = null;
  private failed = false;
  private mutedNow: boolean;

  constructor(
    private readonly create: ContextFactory = defaultFactory,
    muted = false,
  ) {
    this.mutedNow = muted;
  }

  get muted(): boolean {
    return this.mutedNow;
  }

  /** True once a context exists, so that sound can play. */
  get ready(): boolean {
    return this.ctx !== null;
  }

  setMuted(muted: boolean): void {
    this.mutedNow = muted;
    if (muted) this.stopHum();
    else this.startHum();
  }

  /** Creates the audio context, or wakes it up. Call it from a user gesture. */
  unlock(): void {
    if (!this.ctx && !this.failed) {
      try {
        this.ctx = this.create();
        if (this.ctx) {
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.9;
          this.master.connect(this.ctx.destination);
        } else {
          this.failed = true;
        }
      } catch {
        this.ctx = null;
        this.master = null;
        this.failed = true;
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
    this.startHum();
  }

  /** The toll of a bell. The twelfth is louder. */
  toll(strength = 1): void {
    const c = this.audible();
    if (!c) return;
    const { ctx, master } = c;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.3 * strength, t + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    out.connect(master);
    for (const [ratio, gain] of TOLL_PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = TOLL_BASE_HZ * ratio;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 3.3);
    }
  }

  /** The scratch of a quill: two short bursts of high, filtered noise. */
  scratch(): void {
    this.noise(0.18, 3800, 1.2, 0.5, 0);
    this.noise(0.12, 4600, 1.5, 0.35, 0.12);
  }

  /** A soft click, for putting an item down. */
  click(): void {
    this.noise(0.06, 1800, 2, 0.25, 0);
  }

  /** The sting of a capture: a low fall and two notes that disagree. */
  sting(): void {
    const c = this.audible();
    if (!c) return;
    const { ctx, master } = c;
    const t = ctx.currentTime;
    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.setValueAtTime(STING_HZ.from, t);
    low.frequency.exponentialRampToValueAtTime(STING_HZ.to, t + 0.9);
    const lowGain = ctx.createGain();
    lowGain.gain.setValueAtTime(0.6, t);
    lowGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    low.connect(lowGain);
    lowGain.connect(master);
    low.start(t);
    low.stop(t + 1.3);
    for (const hz of STING_HZ.pair) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 2.6);
    }
  }

  /** The chime of dawn: five bright bell notes rising. The hum under the night falls away. */
  chime(): void {
    const c = this.audible();
    if (!c) return;
    const { ctx, master } = c;
    CHIME_RATIOS.forEach((ratio, i) => {
      const t = ctx.currentTime + i * CHIME_GAP_S;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = CHIME_BASE_HZ * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 1.7);
    });
    this.hum?.level.gain.setTargetAtTime(0.008, ctx.currentTime, 1.5);
  }

  /** Brings the hum back to its night level, after a dawn. */
  nightFalls(): void {
    if (this.ctx && this.hum) this.hum.level.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.8);
  }

  private audible(): { ctx: AudioContext; master: GainNode } | null {
    return this.ctx && this.master && !this.mutedNow ? { ctx: this.ctx, master: this.master } : null;
  }

  private noise(seconds: number, hz: number, q: number, volume: number, delay: number): void {
    const c = this.audible();
    if (!c) return;
    const { ctx, master } = c;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(ctx.currentTime + delay);
  }

  private startHum(): void {
    const c = this.audible();
    if (!c || this.hum) return;
    const { ctx, master } = c;
    const level = ctx.createGain();
    level.gain.value = 0.035;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const oscillators = HUM_HZ.map((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sawtooth';
      osc.frequency.value = hz;
      osc.detune.value = (i - 1) * 6;
      osc.connect(filter);
      osc.start();
      return osc;
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 120;
    lfo.connect(depth);
    depth.connect(filter.frequency);
    lfo.start();
    filter.connect(level);
    level.connect(master);
    this.hum = {
      level,
      stop: () => {
        for (const o of [...oscillators, lfo]) {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        }
        level.disconnect();
      },
    };
  }

  private stopHum(): void {
    this.hum?.stop();
    this.hum = null;
  }
}
