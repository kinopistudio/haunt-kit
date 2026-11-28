import type { Recording } from '../trace/types';

/**
 * How one line looks at a cursor.
 * - `idle`: nothing has been read yet, or the actor had no turn.
 * - `lit`: the line ran on this tick.
 * - `false`: its condition was checked and was false.
 * - `skipped`: it sits below the line that ran and is not true.
 * - `shadowed`: it is true, but a line above it ran.
 * - `gold`: at the end of a completed run, the line ran at least once.
 * - `ash`: at the end of a completed run, the line never ran.
 * - `struck`: the caller struck it out.
 */
export type LineMark = 'idle' | 'lit' | 'false' | 'skipped' | 'shadowed' | 'gold' | 'ash' | 'struck';

export interface FiredLine {
  actor: string;
  lineId: number;
  /** 0-based index at the tick. */
  index: number;
}

export interface BookState {
  /** One entry for every line of `frames[cursor]`. */
  marks: Map<number, LineMark>;
  /** Ticks up to and including the cursor on which the line ran. */
  tally: Map<number, number>;
  /** Lines that ran on the tick at the cursor. */
  fired: FiredLine[];
  /** Lines a scheduled write added on the tick at the cursor. */
  written: FiredLine[];
}

export interface BookStateOptions {
  /** At the last tick of a completed run, show `gold` and `ash` in place of the tick's marks. */
  final?: boolean;
  /** Line ids that get the mark `struck`, whatever their other mark. */
  struck?: readonly number[];
}

/**
 * The marks, tallies and fired lines at `cursor` of a recording. A pure function of its arguments, so a
 * scrub to a tick shows exactly what stepping to it shows. Throws a `RangeError` when `cursor` is not an
 * integer from 0 to the number of ticks.
 */
export function bookState(recording: Recording, cursor: number, options: BookStateOptions = {}): BookState {
  const length = recording.traces.length;
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > length) {
    throw new RangeError(`cursor must be an integer from 0 to ${length}, got ${cursor}`);
  }
  const frame = recording.frames[cursor]!;
  const marks = new Map<number, LineMark>();
  const tally = new Map<number, number>();
  for (const actor of frame.actors) {
    for (const line of actor.lines) {
      marks.set(line.id, 'idle');
      tally.set(line.id, 0);
    }
  }

  for (let t = 0; t < cursor; t++) {
    for (const turn of recording.traces[t]!.turns) {
      if (turn.firedId !== null) tally.set(turn.firedId, (tally.get(turn.firedId) ?? 0) + 1);
    }
  }

  const fired: FiredLine[] = [];
  const written: FiredLine[] = [];
  if (cursor > 0) {
    const trace = recording.traces[cursor - 1]!;
    for (const turn of trace.turns) {
      const actor = frame.actors.find((a) => a.id === turn.actor);
      // A turn without evaluations is a scripted move: it read no line.
      if (!actor || turn.evals.length === 0) continue;
      actor.lines.forEach((line, index) => {
        if (turn.fired === null || index < turn.fired) marks.set(line.id, 'false');
        else if (index === turn.fired) marks.set(line.id, 'lit');
        else marks.set(line.id, turn.shadowed.includes(index) ? 'shadowed' : 'skipped');
      });
      if (turn.fired !== null && turn.firedId !== null) fired.push({ actor: turn.actor, lineId: turn.firedId, index: turn.fired });
    }
    for (const event of trace.events) written.push({ actor: event.actor, lineId: event.lineId, index: event.index });
  }

  if (options.final && cursor === length && recording.status === 'complete') {
    for (const id of marks.keys()) marks.set(id, (tally.get(id) ?? 0) > 0 ? 'gold' : 'ash');
  }
  for (const id of options.struck ?? []) if (marks.has(id)) marks.set(id, 'struck');

  return { marks, tally, fired, written };
}
