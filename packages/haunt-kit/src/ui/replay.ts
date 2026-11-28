/** Where a replay is: how many ticks have been shown, out of how many, and whether it is running by itself. */
export interface ReplayState {
  cursor: number;
  length: number;
  playing: boolean;
}

export type ReplayAction =
  | { type: 'play' | 'pause' | 'step' | 'back' | 'advance' | 'start' | 'end' }
  | { type: 'seek'; to: number }
  | { type: 'reset'; length: number };

export function replayStart(length: number): ReplayState {
  const n = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  return { cursor: 0, length: n, playing: false };
}

const clamp = (n: number, length: number): number => Math.min(length, Math.max(0, n));

/**
 * The replay state machine. It never changes its input.
 * - `play` starts from 0 when the cursor is at the end, and does nothing when there is nothing to play.
 * - `step`, `back`, `seek`, `start` and `end` are the player's own moves: they pause.
 * - `advance` is what a timer sends: one tick forward while playing, and a stop at the end.
 */
export function replayReduce(state: ReplayState, action: ReplayAction): ReplayState {
  const { length } = state;
  switch (action.type) {
    case 'play':
      if (length === 0) return state;
      return { ...state, cursor: state.cursor >= length ? 0 : state.cursor, playing: true };
    case 'pause':
      return state.playing ? { ...state, playing: false } : state;
    case 'step':
      return { ...state, cursor: clamp(state.cursor + 1, length), playing: false };
    case 'back':
      return { ...state, cursor: clamp(state.cursor - 1, length), playing: false };
    case 'start':
      return { ...state, cursor: 0, playing: false };
    case 'end':
      return { ...state, cursor: length, playing: false };
    case 'seek':
      return { ...state, cursor: clamp(Number.isFinite(action.to) ? Math.round(action.to) : 0, length), playing: false };
    case 'advance': {
      if (!state.playing) return state;
      const cursor = clamp(state.cursor + 1, length);
      return { ...state, cursor, playing: cursor < length };
    }
    case 'reset':
      return replayStart(action.length);
  }
}
