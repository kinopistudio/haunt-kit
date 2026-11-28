import type { LineOrigin } from '../world/types';
import type { Recording } from './types';

/** What the traces say about one line over a whole run. */
export interface LineStat {
  /** Actor id. */
  actor: string;
  /** `Line.id`. */
  id: number;
  origin: LineOrigin;
  /** 0 for lines of the spec and for cards, the tick of the write for a rewrite. */
  born: number;
  /** Ticks on which this line was the first true line of its actor, so it ran. */
  fired: number;
  /** Ticks on which it was true while a line above it ran. */
  shadowed: number;
  /** Ticks on which it was checked and was false. */
  idle: number;
  firstFired: number | null;
  /** The first tick on which it was shadowed. Indexes are 0-based and read at that tick. */
  firstShadowed: { tick: number; index: number; byId: number; byIndex: number } | null;
}

/**
 * One entry per line of the last frame, keyed by line id, in actor order and then line order.
 * A turn without evaluations (a scripted move) counts for no line. A tick that a violation cut short
 * counts only for the actors that took their turn.
 */
export function lineStats(recording: Recording): Map<number, LineStat> {
  const last = recording.frames[recording.frames.length - 1];
  const stats = new Map<number, LineStat>();
  if (!last) return stats;

  const born = new Map<number, number>();
  for (const trace of recording.traces) for (const event of trace.events) born.set(event.lineId, trace.tick);

  for (const actor of last.actors) {
    for (const line of actor.lines) {
      stats.set(line.id, {
        actor: actor.id,
        id: line.id,
        origin: line.origin,
        born: born.get(line.id) ?? 0,
        fired: 0,
        shadowed: 0,
        idle: 0,
        firstFired: null,
        firstShadowed: null,
      });
    }
  }

  for (const trace of recording.traces) {
    // Writes happen before the turns of a tick and nothing removes a line, so the frame after the tick
    // has the lines the turns of that tick read.
    const frame = recording.frames[trace.tick];
    if (!frame) continue;
    for (const turn of trace.turns) {
      if (turn.evals.length === 0) continue;
      const actor = frame.actors.find((a) => a.id === turn.actor);
      if (!actor) continue;
      actor.lines.forEach((line, index) => {
        const stat = stats.get(line.id);
        if (!stat) return;
        if (index === turn.fired) {
          stat.fired++;
          stat.firstFired ??= trace.tick;
        } else if (turn.shadowed.includes(index)) {
          stat.shadowed++;
          stat.firstShadowed ??= { tick: trace.tick, index, byId: turn.firedId!, byIndex: turn.fired! };
        } else {
          stat.idle++;
        }
      });
    }
  }
  return stats;
}
