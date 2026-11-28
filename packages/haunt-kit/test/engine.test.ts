import { describe, expect, it } from 'vitest';
import { tick } from '../src/index';
import type { TickTrace } from '../src/index';
import { createToyRegistry, toyWorld } from './fixtures/toy-vocab';

const registry = createToyRegistry();

function must(t: TickTrace | null): TickTrace {
  if (t === null) throw new Error('expected a trace');
  return t;
}

describe('tick: turns', () => {
  const rows = ['#########', '#S.....T#', '#########'];

  it('R5.2: the first true line wins and runs', () => {
    const spec = [
      'WHEN the target is near, THE seeker SHALL step away from the target.',
      'WHEN the target is far, THE seeker SHALL step toward the target.',
      'THE seeker SHALL do nothing.',
    ].join('\n');
    const w = toyWorld(rows, spec, registry);
    const t = must(tick(w, registry));
    const seeker = t.turns.find((x) => x.actor === 'seeker')!;
    expect(seeker.evals).toEqual([false, true]);
    expect(seeker.fired).toBe(1);
    expect(seeker.from).toEqual({ x: 1, y: 1 });
    expect(seeker.to).toEqual({ x: 2, y: 1 });
    expect(w.actors[0]!.pos).toEqual({ x: 2, y: 1 });
  });

  it('R5.2: it evaluates lines top to bottom and stops at the first true one', () => {
    const w = toyWorld(rows, ['THE seeker SHALL do nothing.', 'WHEN the target is far, THE seeker SHALL step toward the target.'].join('\n'), registry);
    const turn = must(tick(w, registry)).turns[0]!;
    expect(turn.evals).toEqual([true]);
    expect(turn.fired).toBe(0);
    expect(w.actors[0]!.pos.x).toBe(1);
  });

  it('R5.2: only one line runs, even when several are true', () => {
    const w = toyWorld(
      ['#####', '#S.s#', '#####'],
      'THE seeker SHALL flip the switch.\nTHE seeker SHALL flip the switch.\nTHE seeker SHALL flip the switch.',
      registry,
    );
    must(tick(w, registry));
    expect(w.items[0]!.state.on).toBe(true);
  });

  it('R5.2: a true line below the fired one does not run', () => {
    const w = toyWorld(['#####', '#S.s#', '#####'], 'THE seeker SHALL do nothing.\nTHE seeker SHALL flip the switch.', registry);
    for (let i = 0; i < 3; i++) must(tick(w, registry));
    expect(w.items[0]!.state.on).toBe(false);
  });

  it('R5.2: each actor runs its own first true line', () => {
    const w = toyWorld(
      ['#########', '#S.s...W#', '#########'],
      ['THE seeker SHALL flip the switch.', 'WHEN the switch is on, THE watcher SHALL do nothing.', 'THE watcher SHALL flip the switch.'].join('\n'),
      registry,
    );
    const t = must(tick(w, registry));
    expect(t.turns.map((x) => [x.actor, x.fired])).toEqual([
      ['seeker', 0],
      ['watcher', 0],
    ]);
    expect(w.items[0]!.state.on).toBe(true);
  });

  it('R5.3: when no line is true the actor stays and fired is null', () => {
    const w = toyWorld(rows, 'WHEN the target is near, THE seeker SHALL step away from the target.\nWHEN the switch is on, THE seeker SHALL do nothing.', registry);
    const turn = must(tick(w, registry)).turns.find((x) => x.actor === 'seeker')!;
    expect(turn.evals).toEqual([false, false]);
    expect(turn.fired).toBeNull();
    expect(turn.firedId).toBeNull();
    expect(turn.shadowed).toEqual([]);
    expect(turn.from).toEqual(turn.to);
    expect(w.actors[0]!.pos).toEqual({ x: 1, y: 1 });
  });

  it('R5.3: an actor with no lines does nothing', () => {
    const w = toyWorld(rows, '', registry);
    const turn = must(tick(w, registry)).turns[0]!;
    expect(turn).toMatchObject({ evals: [], fired: null, shadowed: [] });
  });
});

describe('tick: shared state', () => {
  const rows = ['#########', '#S..W..T#', '#.s.....#', '#########'];
  const spec = ['WHEN the switch is on, THE seeker SHALL step toward the target.', 'THE watcher SHALL flip the switch.'].join('\n');

  it('R5.4: a later actor sees what an earlier actor did in the same tick', () => {
    const w = toyWorld(rows, spec, registry, { turnOrder: ['watcher'] });
    expect(w.actors.map((a) => a.id)).toEqual(['watcher', 'seeker', 'target']);
    const t = must(tick(w, registry));
    const seeker = t.turns.find((x) => x.actor === 'seeker')!;
    expect(seeker.fired).toBe(0);
    expect(seeker.to.x).toBe(2);
  });

  it('R5.4: an earlier actor does not see what a later actor does until the next tick', () => {
    const w = toyWorld(rows, spec, registry, { turnOrder: ['seeker', 'watcher'] });
    const t1 = must(tick(w, registry));
    expect(t1.turns[0]).toMatchObject({ actor: 'seeker', fired: null });
    expect(w.items[0]!.state.on).toBe(true);
    const t2 = must(tick(w, registry));
    expect(t2.turns[0]).toMatchObject({ actor: 'seeker', fired: 0 });
  });

  it('R5.4: turns are listed in actor order', () => {
    const w = toyWorld(rows, spec, registry, { turnOrder: ['target', 'watcher'] });
    expect(must(tick(w, registry)).turns.map((x) => x.actor)).toEqual(['target', 'watcher', 'seeker']);
  });
});

describe('tick: shadowed lines', () => {
  const rows = ['#########', '#S.....T#', '#.s.....#', '#########'];

  it('R5.5: lower lines that are also true are recorded as shadowed and not run', () => {
    const spec = [
      'WHEN the target is far, THE seeker SHALL step toward the target.',
      'WHEN the switch is on, THE seeker SHALL flip the switch.',
      'THE seeker SHALL flip the switch.',
      'WHEN the target is near, THE seeker SHALL do nothing.',
      'WHEN the target is far, THE seeker SHALL do nothing.',
    ].join('\n');
    const w = toyWorld(rows, spec, registry);
    const lines = w.actors[0]!.lines;
    const turn = must(tick(w, registry)).turns[0]!;
    expect(turn.fired).toBe(0);
    expect(turn.shadowed).toEqual([2, 4]);
    expect(turn.firedId).toBe(lines[0]!.id);
    expect(turn.shadowedIds).toEqual([lines[2]!.id, lines[4]!.id]);
    expect(w.items[0]!.state.on).toBe(false);
  });

  it('R5.5: shadowed lines are judged before the action runs', () => {
    const spec = ['THE seeker SHALL flip the switch.', 'WHEN the switch is on, THE seeker SHALL do nothing.'].join('\n');
    const w = toyWorld(rows, spec, registry);
    const turn = must(tick(w, registry)).turns[0]!;
    expect(w.items[0]!.state.on).toBe(true);
    expect(turn.shadowed).toEqual([]);
    const turn2 = must(tick(w, registry)).turns[0]!;
    expect(turn2.shadowed).toEqual([1]);
  });

  it('R5.5: lines above the fired line are never listed as shadowed', () => {
    const spec = ['WHEN the target is near, THE seeker SHALL do nothing.', 'THE seeker SHALL do nothing.', 'THE seeker SHALL do nothing.'].join('\n');
    const w = toyWorld(rows, spec, registry);
    const turn = must(tick(w, registry)).turns[0]!;
    expect(turn.fired).toBe(1);
    expect(turn.shadowed).toEqual([2]);
  });

  it('R5.5: with no true line there is nothing shadowed', () => {
    const w = toyWorld(rows, 'WHEN the switch is on, THE seeker SHALL do nothing.', registry);
    expect(must(tick(w, registry)).turns[0]!.shadowed).toEqual([]);
  });
});

describe('tick: trace shape', () => {
  it('R5.11: a turn lists the actor, its kind, evals, fired and shadowed indexes and ids, from and to', () => {
    const w = toyWorld(['#########', '#S.....T#', '#########'], 'THE seeker SHALL step toward the target.\nTHE seeker SHALL do nothing.', registry);
    const t = must(tick(w, registry));
    expect(t.tick).toBe(1);
    expect(t.events).toEqual([]);
    expect(t.violation).toBeNull();
    expect(Object.keys(t.turns[0]!).sort()).toEqual(['actor', 'evals', 'fired', 'firedId', 'from', 'kind', 'shadowed', 'shadowedIds', 'to']);
    expect(t.turns[0]).toMatchObject({ actor: 'seeker', kind: 'seeker', evals: [true], fired: 0, shadowed: [1] });
    expect(t.turns).toHaveLength(2);
    expect(t.turns[1]).toMatchObject({ actor: 'target', kind: 'target', evals: [], fired: null });
  });

  it('R5.11: from is a copy, not a reference to the actor position', () => {
    const w = toyWorld(['#########', '#S.....T#', '#########'], 'THE seeker SHALL step toward the target.', registry);
    const t = must(tick(w, registry));
    must(tick(w, registry));
    expect(t.turns[0]!.from).toEqual({ x: 1, y: 1 });
    expect(t.turns[0]!.to).toEqual({ x: 2, y: 1 });
  });
});

describe('tick: scheduled events', () => {
  const rows = ['#########', '#S.....T#', '#.s.....#', '#########'];
  const WRITE = (tick: number, rule: string, line: number) => `WHEN the clock strikes ${tick}, THE seeker SHALL write "${rule}" at line ${line}.`;

  it('R5.1: each tick advances the clock by one', () => {
    const w = toyWorld(rows, '', registry);
    expect(w.tick).toBe(0);
    expect(must(tick(w, registry)).tick).toBe(1);
    expect(must(tick(w, registry)).tick).toBe(2);
    expect(w.tick).toBe(2);
  });

  it('R5.1: an event is applied only on its tick', () => {
    const spec = ['THE seeker SHALL do nothing.', WRITE(3, 'THE seeker SHALL flip the switch.', 1)].join('\n');
    const w = toyWorld(rows, spec, registry);
    expect(must(tick(w, registry)).events).toEqual([]);
    expect(must(tick(w, registry)).events).toEqual([]);
    expect(w.actors[0]!.lines).toHaveLength(1);
    const t3 = must(tick(w, registry));
    expect(t3.events).toHaveLength(1);
    expect(w.actors[0]!.lines).toHaveLength(2);
    expect(must(tick(w, registry)).events).toEqual([]);
    expect(w.actors[0]!.lines).toHaveLength(2);
  });

  it('R5.1: events are applied before any actor takes a turn, so the new line can fire the same tick', () => {
    const spec = ['THE seeker SHALL do nothing.', WRITE(2, 'THE seeker SHALL flip the switch.', 1)].join('\n');
    const w = toyWorld(rows, spec, registry, { turnOrder: ['target', 'seeker'] });
    must(tick(w, registry));
    expect(w.items[0]!.state.on).toBe(false);
    const t2 = must(tick(w, registry));
    const seeker = t2.turns.find((x) => x.actor === 'seeker')!;
    expect(seeker.fired).toBe(0);
    expect(seeker.firedId).toBe(t2.events[0]!.lineId);
    expect(seeker.shadowed).toEqual([1]);
    expect(w.items[0]!.state.on).toBe(true);
  });

  it('R5.1: events at the same tick are applied in declaration order', () => {
    const spec = [
      'THE seeker SHALL do nothing.',
      WRITE(1, 'THE seeker SHALL step toward the target.', 1),
      WRITE(1, 'THE seeker SHALL flip the switch.', 1),
    ].join('\n');
    const w = toyWorld(rows, spec, registry);
    const t = must(tick(w, registry));
    expect(t.events.map((e) => e.index)).toEqual([0, 0]);
    expect(w.actors[0]!.lines.map((l) => l.rule.act)).toEqual(['flip', 'approach', 'rest']);
    expect(t.turns[0]!.fired).toBe(0);
  });

  it('R5.6: the rule is inserted at the 1-based line and the lines below shift down', () => {
    const spec = ['THE seeker SHALL do nothing.', 'THE seeker SHALL flip the switch.', WRITE(1, 'THE seeker SHALL step toward the target.', 2)].join('\n');
    const w = toyWorld(rows, spec, registry);
    const before = w.actors[0]!.lines.map((l) => l.id);
    const t = must(tick(w, registry));
    expect(w.actors[0]!.lines.map((l) => l.rule.act)).toEqual(['rest', 'approach', 'flip']);
    expect(w.actors[0]!.lines[0]!.id).toBe(before[0]);
    expect(w.actors[0]!.lines[2]!.id).toBe(before[1]);
    expect(t.events).toEqual([{ actor: 'seeker', kind: 'seeker', index: 1, lineId: w.actors[0]!.lines[1]!.id }]);
  });

  it('R5.6: a line past the end appends', () => {
    const spec = ['THE seeker SHALL do nothing.', WRITE(1, 'THE seeker SHALL flip the switch.', 9)].join('\n');
    const w = toyWorld(rows, spec, registry);
    const t = must(tick(w, registry));
    expect(w.actors[0]!.lines.map((l) => l.rule.act)).toEqual(['rest', 'flip']);
    expect(t.events[0]!.index).toBe(1);
  });

  it('R5.6: the new line has origin rewrite and a fresh id', () => {
    const spec = ['THE seeker SHALL do nothing.', WRITE(1, 'THE seeker SHALL flip the switch.', 1)].join('\n');
    const w = toyWorld(rows, spec, registry);
    const old = w.actors[0]!.lines[0]!;
    must(tick(w, registry));
    const added = w.actors[0]!.lines[0]!;
    expect(added.origin).toBe('rewrite');
    expect(added.id).not.toBe(old.id);
    expect(old.origin).toBe('spec');
  });

  it('R5.6: every actor of that kind gets the line, and other kinds do not', () => {
    const spec = ['THE seeker SHALL do nothing.', WRITE(1, 'THE seeker SHALL flip the switch.', 1)].join('\n');
    const w = toyWorld(['#########', '#S.S.S.T#', '#########'], spec, registry);
    const t = must(tick(w, registry));
    expect(t.events.map((e) => e.actor)).toEqual(['seeker', 'seeker-2', 'seeker-3']);
    expect(w.actors.filter((a) => a.kind === 'seeker').every((a) => a.lines[0]!.origin === 'rewrite')).toBe(true);
    expect(w.actors.find((a) => a.kind === 'target')!.lines).toEqual([]);
    expect(new Set(t.events.map((e) => e.lineId)).size).toBe(3);
  });

  it('R5.6: a written line stays for the rest of the night', () => {
    const spec = ['THE seeker SHALL do nothing.', WRITE(1, 'THE seeker SHALL flip the switch.', 1)].join('\n');
    const w = toyWorld(rows, spec, registry);
    for (let i = 0; i < 4; i++) must(tick(w, registry));
    expect(w.items[0]!.state.on).toBe(false); // flipped four times
    expect(w.actors[0]!.lines).toHaveLength(2);
  });
});
