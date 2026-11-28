import { h } from './dom';
import { replayReduce, replayStart } from './replay';
import type { ReplayAction, ReplayState } from './replay';
import { installSpecBookStyles } from './styles';

export type ReplaySpeed = 1 | 2;

export interface ReplayBarModel {
  playLabel: 'Play' | 'Pause' | 'Replay';
  /** `<tick word> <cursor> of <length>`. */
  position: string;
  value: number;
  max: number;
  canPlay: boolean;
  canStart: boolean;
  canBack: boolean;
  canStep: boolean;
  canEnd: boolean;
}

/** What the bar shows for a replay state. Pure: the DOM bar and the tests both read it. */
export function replayBarModel(state: ReplayState, options: { tickWord?: string } = {}): ReplayBarModel {
  const word = options.tickWord ?? 'Tick';
  const atEnd = state.length > 0 && state.cursor >= state.length;
  return {
    playLabel: state.playing ? 'Pause' : atEnd ? 'Replay' : 'Play',
    position: `${word} ${state.cursor} of ${state.length}`,
    value: state.cursor,
    max: state.length,
    canPlay: state.length > 0,
    canStart: state.cursor > 0,
    canBack: state.cursor > 0,
    canStep: state.cursor < state.length,
    canEnd: state.cursor < state.length,
  };
}

/** The default time between two ticks of a playing replay, in milliseconds. */
export const DEFAULT_INTERVAL_MS: Record<ReplaySpeed, number> = { 1: 620, 2: 260 };

export interface ReplayBarOptions {
  /** How a tick is named in the position label, capitalised. Default `Tick`. */
  tickWord?: string;
  length?: number;
  /** Time between two ticks while playing. */
  intervalMs?: (speed: ReplaySpeed) => number;
  /** Called after every action the bar applies, with the new state. */
  onChange?: (state: ReplayState, action: ReplayAction) => void;
  /** Called when the speed toggle changes. */
  onSpeed?: (speed: ReplaySpeed) => void;
}

/**
 * Play, pause, step, scrub and speed controls for a replay. The bar owns a `ReplayState` and one timer.
 * The timer sends `advance` while the state is playing and stops when it is not, when it is reset and
 * when the bar is destroyed.
 */
export class ReplayBar {
  readonly element: HTMLElement;
  private current: ReplayState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentSpeed: ReplaySpeed = 1;
  private readonly parts: { start: HTMLButtonElement; back: HTMLButtonElement; play: HTMLButtonElement; step: HTMLButtonElement; end: HTMLButtonElement; scrub: HTMLInputElement; position: HTMLElement; speed: HTMLButtonElement };

  constructor(
    root: HTMLElement,
    private readonly options: ReplayBarOptions = {},
  ) {
    const doc = root.ownerDocument;
    installSpecBookStyles(doc);
    this.element = root;
    this.current = replayStart(options.length ?? 0);
    root.classList.add('hk-replay');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Replay');
    root.tabIndex = 0;

    const button = (className: string, text: string, label?: string): HTMLButtonElement => {
      const b = h(doc, 'button', className, text);
      b.type = 'button';
      if (label) b.setAttribute('aria-label', label);
      return b;
    };
    const scrub = h(doc, 'input', 'hk-scrub');
    scrub.type = 'range';
    scrub.min = '0';
    scrub.step = '1';
    scrub.setAttribute('aria-label', 'Scrub through the replay');
    const position = h(doc, 'span', 'hk-position');
    position.setAttribute('role', 'status');
    this.parts = {
      start: button('hk-start', '\u00AB', 'Go to the start'),
      back: button('hk-back', '\u2039', 'Step back'),
      play: button('hk-play', 'Play'),
      step: button('hk-step', '\u203A', 'Step forward'),
      end: button('hk-end', '\u00BB', 'Go to the end'),
      scrub,
      position,
      speed: button('hk-speed', '\u00D71', 'Speed'),
    };
    this.parts.speed.setAttribute('aria-pressed', 'false');
    const { start, back, play, step, end, speed } = this.parts;
    root.replaceChildren(start, back, play, step, end, scrub, position, speed);

    start.addEventListener('click', () => this.dispatch({ type: 'start' }));
    back.addEventListener('click', () => this.dispatch({ type: 'back' }));
    play.addEventListener('click', () => this.dispatch({ type: this.current.playing ? 'pause' : 'play' }));
    step.addEventListener('click', () => this.dispatch({ type: 'step' }));
    end.addEventListener('click', () => this.dispatch({ type: 'end' }));
    scrub.addEventListener('input', () => this.dispatch({ type: 'seek', to: Number(scrub.value) }));
    speed.addEventListener('click', () => this.setSpeed(this.currentSpeed === 1 ? 2 : 1));
    root.addEventListener('keydown', this.onKey);
    this.render();
  }

  get state(): ReplayState {
    return this.current;
  }

  get speed(): ReplaySpeed {
    return this.currentSpeed;
  }

  /** Applies an action, updates the controls, runs or stops the timer and calls `onChange`. */
  dispatch(action: ReplayAction): ReplayState {
    this.current = replayReduce(this.current, action);
    this.render();
    this.schedule();
    this.options.onChange?.(this.current, action);
    return this.current;
  }

  /** Starts over with a new length: cursor 0, not playing, no timer. */
  reset(length: number): void {
    this.dispatch({ type: 'reset', length });
  }

  setSpeed(speed: ReplaySpeed): void {
    if (speed === this.currentSpeed) return;
    this.currentSpeed = speed;
    this.parts.speed.textContent = `\u00D7${speed}`;
    this.parts.speed.setAttribute('aria-pressed', String(speed === 2));
    this.options.onSpeed?.(speed);
    // A playing replay picks up the new interval for its next tick.
    this.schedule(true);
  }

  destroy(): void {
    this.stopTimer();
    this.element.removeEventListener('keydown', this.onKey);
    this.element.replaceChildren();
    this.element.classList.remove('hk-replay');
  }

  private interval(): number {
    return (this.options.intervalMs ?? ((s) => DEFAULT_INTERVAL_MS[s]))(this.currentSpeed);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(restart = false): void {
    if (!this.current.playing) {
      this.stopTimer();
      return;
    }
    if (this.timer !== null && !restart) return;
    this.stopTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.dispatch({ type: 'advance' });
    }, this.interval());
  }

  private render(): void {
    const m = replayBarModel(this.current, { tickWord: this.options.tickWord });
    const { start, back, play, step, end, scrub, position } = this.parts;
    play.textContent = m.playLabel;
    play.disabled = !m.canPlay;
    start.disabled = !m.canStart;
    back.disabled = !m.canBack;
    step.disabled = !m.canStep;
    end.disabled = !m.canEnd;
    scrub.max = String(m.max);
    scrub.value = String(m.value);
    scrub.disabled = !m.canPlay;
    position.textContent = m.position;
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const target = event.target as Element | null;
    // Buttons already act on Space, and the range input already acts on the arrows, Home and End.
    if (target?.tagName === 'INPUT') return;
    const onButton = target?.tagName === 'BUTTON';
    let action: ReplayAction | null = null;
    if (event.key === ' ' && !onButton) action = { type: this.current.playing ? 'pause' : 'play' };
    else if (event.key === 'ArrowRight') action = { type: 'step' };
    else if (event.key === 'ArrowLeft') action = { type: 'back' };
    else if (event.key === 'Home') action = { type: 'start' };
    else if (event.key === 'End') action = { type: 'end' };
    if (!action) return;
    event.preventDefault();
    this.dispatch(action);
  };
}
