import { distance, printRule } from 'haunt-kit';
import type { BookActorView, BookNote, BookView, LineMark, Registry, Rule, World } from 'haunt-kit';
import type { Names } from '../content';
import { NEAR } from '../vocab';

/** How far each condition reaches, in words: the boundary a reader should know. */
const REACH: Record<string, string> = {
  girl_near: `the girl is near: within ${NEAR.girl} steps`,
  bell_near: `the bell is near: within ${NEAR.bell} steps`,
  candle_near: `a lit candle is near: within ${NEAR.candle} steps`,
  salt_adjacent: `salt is adjacent: within ${NEAR.salt} step`,
  ghost_near: `a ghost is near: within ${NEAR.ghost} steps`,
};

export interface BookViewOptions {
  slots?: boolean;
  removable?: boolean;
  marks?: ReadonlyMap<number, LineMark>;
  tally?: ReadonlyMap<number, number>;
  bleed?: ReadonlySet<number>;
  animate?: boolean;
}

/** Spec pages for a world: the printed lines of every actor, the reach of its conditions, and the writes still to come. */
export function bookViewOf(world: World, registry: Registry, names: Names, options: BookViewOptions = {}): BookView {
  const girl = world.actors.find((a) => a.kind === 'girl');
  const actors: BookActorView[] = world.actors.map((actor) => {
    const notes: BookNote[] = [];
    for (const event of world.events) {
      if (event.actor === actor.kind && event.tick > world.tick) {
        notes.push({
          tone: 'rewrite',
          text: `At bell ${event.tick}, this spec writes itself a new line ${event.line}: \u201c${printRule(actor.kind, event.rule, registry)}\u201d`,
        });
      }
    }
    const reach = [...new Set(actor.lines.map((l) => l.rule.cond))].map((c) => REACH[c]).filter((r): r is string => r !== undefined);
    if (reach.length > 0) notes.push({ tone: 'hint', text: reach.join(' \u00B7 ') });
    const nearest = actor.kind === 'girl' ? Math.min(...world.actors.filter((a) => a.kind !== 'girl').map((a) => distance(a.pos, actor.pos)), 99) : 99;
    return {
      id: actor.id,
      title: names.title(actor.id),
      badge: `specs/${actor.kind}.md`,
      tension: girl && actor.id === girl.id ? Math.max(0, Math.min(1, (6 - nearest) / 5)) : 0,
      lines: actor.lines.map((l) => ({ id: l.id, text: printRule(actor.kind, l.rule as Rule, registry), origin: l.origin })),
      notes,
    };
  });
  return { actors, ...options };
}
