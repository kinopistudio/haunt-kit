import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { WorldError, cloneWorld, createWorld, insertLine, loadSpec, parseGrid } from '../src/index';
import type { Legend, Rule, World, WorldConfig } from '../src/index';
import { createToyRegistry } from './fixtures/toy-vocab';

const registry = createToyRegistry();
const legend: Legend = {
  S: { actor: 'seeker' },
  T: { actor: 'target', marker: 'goal' },
  W: { actor: 'watcher' },
  k: { item: { type: 'key', state: { charge: 1 } } },
  b: { item: { type: 'block', solid: true } },
};

const SPEC = [
  'THE seeker SHALL step toward the target.',
  'WHEN the target is near, THE seeker SHALL do nothing.',
  'THE watcher SHALL do nothing.',
  'WHEN the clock strikes 4, THE watcher SHALL write "THE watcher SHALL flip the switch." at line 1.',
].join('\n');

function config(overrides: Partial<WorldConfig> = {}, rows = ['#######', '#S.T.k#', '#.W.b.#', '#######'], specText = SPEC): WorldConfig {
  const { spec, errors } = loadSpec(specText, registry);
  expect(errors).toEqual([]);
  return { grid: parseGrid(rows, legend), spec, registry, horizon: 12, ...overrides };
}

describe('createWorld', () => {
  it('R4.7: actors take turns in reading order when there is no turn order', () => {
    const w = createWorld(config());
    expect(w.actors.map((a) => a.id)).toEqual(['seeker', 'target', 'watcher']);
  });

  it('R4.7: kinds in turnOrder go first, in that order, then the rest in reading order', () => {
    const w = createWorld(config({ turnOrder: ['watcher', 'target'] }));
    expect(w.actors.map((a) => a.id)).toEqual(['watcher', 'target', 'seeker']);
    const w2 = createWorld(config({ turnOrder: ['target'] }));
    expect(w2.actors.map((a) => a.id)).toEqual(['target', 'seeker', 'watcher']);
  });

  it('R4.7: ids are kind, kind-2, kind-3 in turn order', () => {
    const rows = ['#######', '#W.W.W#', '#######'];
    const w = createWorld(config({}, rows, 'THE watcher SHALL do nothing.'));
    expect(w.actors.map((a) => a.id)).toEqual(['watcher', 'watcher-2', 'watcher-3']);
    expect(w.actors.map((a) => a.pos.x)).toEqual([1, 3, 5]);
  });

  it('R4.7: for any starts and turnOrder, the order is turnOrder kinds first, then reading order', () => {
    const KINDS: string[] = ['a', 'b', 'c'];
    const lg: Legend = { A: { actor: 'a' }, B: { actor: 'b' }, C: { actor: 'c' } };
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('A', 'B', 'C'), { minLength: 1, maxLength: 12 }),
        fc.subarray([...KINDS], { minLength: 0 }).chain((s) => fc.shuffledSubarray(s, { minLength: s.length, maxLength: s.length })),
        (letters, turnOrder) => {
          const row = '#' + letters.join('') + '#';
          const w = createWorld({
            grid: parseGrid([row], lg),
            spec: { actors: {}, events: [], safety: [] },
            registry,
            horizon: 3,
            turnOrder,
          });
          const reading = letters.map((l, i) => ({ kind: l.toLowerCase(), x: i + 1 }));
          const expected = [
            ...turnOrder.flatMap((k) => reading.filter((r) => r.kind === k)),
            ...reading.filter((r) => !turnOrder.includes(r.kind)),
          ];
          expect(w.actors.map((a) => [a.kind, a.pos.x])).toEqual(expected.map((e) => [e.kind, e.x]));
          expect(new Set(w.actors.map((a) => a.id)).size).toBe(w.actors.length);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('R4.7: a new world starts at tick 0, running, with lines from the spec', () => {
    const w = createWorld(config());
    expect(w.tick).toBe(0);
    expect(w.status).toBe('running');
    expect(w.horizon).toBe(12);
    const seeker = w.actors.find((a) => a.id === 'seeker')!;
    expect(seeker.lines.map((l) => [l.rule.act, l.origin])).toEqual([
      ['approach', 'spec'],
      ['rest', 'spec'],
    ]);
    expect(w.actors.find((a) => a.id === 'target')!.lines).toEqual([]);
    expect(w.events).toHaveLength(1);
    expect(w.markers.goal).toEqual([{ x: 3, y: 1 }]);
    expect(w.properties).toEqual([]);
  });

  it('R4.7: line ids are unique across the world', () => {
    const w = createWorld(config());
    const ids = w.actors.flatMap((a) => a.lines.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(w.nextLineId).toBe(Math.max(...ids) + 1);
  });

  it('R4.7: grid items come first, then extra items, with defaults filled in', () => {
    const w = createWorld(config({ items: [{ type: 'lamp', pos: { x: 2, y: 2 }, state: { on: true } }] }));
    expect(w.items.map((i) => [i.type, i.solid])).toEqual([
      ['key', false],
      ['block', true],
      ['lamp', false],
    ]);
    expect(w.items[0]!.state).toEqual({ charge: 1 });
  });

  it('R4.7: properties default to every registered property', () => {
    const reg = createToyRegistry().addProperty({ id: 'p1', description: '', check: () => null }).addProperty({ id: 'p2', description: '', check: () => null });
    const base = config();
    expect(createWorld({ ...base, registry: reg }).properties).toEqual(['p1', 'p2']);
    expect(createWorld({ ...base, registry: reg, properties: ['p2'] }).properties).toEqual(['p2']);
  });

  it('R4.8: a spec kind that is not on the grid is an error', () => {
    const { spec } = loadSpec('THE ghost SHALL do nothing.', registry);
    expect(() => createWorld(config({ spec }))).toThrow(WorldError);
    expect(() => createWorld(config({ spec }))).toThrow(/"ghost"/);
  });

  it('R4.8: a scheduled write for a kind that is not on the grid is an error', () => {
    const { spec } = loadSpec('WHEN the clock strikes 2, THE ghost SHALL write "THE ghost SHALL do nothing." at line 1.', registry);
    expect(() => createWorld(config({ spec }))).toThrow(/"ghost"/);
  });

  it('R4.8: a rule with an unregistered id or a mismatched n is an error that names the line', () => {
    const bad = (rule: Rule): WorldConfig => config({ spec: { actors: { seeker: [{ kw: '', cond: 'always', act: 'rest' }, rule] }, events: [], safety: [] } });
    expect(() => createWorld(bad({ kw: 'WHEN', cond: 'moon', act: 'rest' }))).toThrow(/line 2 of "seeker".*moon/);
    expect(() => createWorld(bad({ kw: 'WHEN', cond: 'near', act: 'dance' }))).toThrow(/dance/);
    expect(() => createWorld(bad({ kw: 'WHEN', cond: 'late', act: 'rest' }))).toThrow(/needs n/);
    expect(() => createWorld(bad({ kw: 'WHEN', cond: 'near', act: 'rest', n: 3 }))).toThrow(/takes no n/);
  });

  it('R4.8: an event with a bad rule, tick or line is an error', () => {
    const rule: Rule = { kw: '', cond: 'always', act: 'rest' };
    const ev = (e: Partial<{ tick: number; line: number; rule: Rule }>) =>
      config({ spec: { actors: { seeker: [] }, events: [{ tick: 3, actor: 'seeker', line: 1, rule, ...e }], safety: [] } });
    expect(() => createWorld(ev({}))).not.toThrow();
    expect(() => createWorld(ev({ rule: { ...rule, act: 'dance' } }))).toThrow(/dance/);
    expect(() => createWorld(ev({ tick: 0 }))).toThrow(/never happens/);
    expect(() => createWorld(ev({ tick: 13 }))).toThrow(/horizon is 12/);
    expect(() => createWorld(ev({ line: 0 }))).toThrow(/lines start at 1/);
  });

  it('R4.8: an unknown property, a bad horizon and a misplaced item are errors', () => {
    expect(() => createWorld(config({ properties: ['nope'] }))).toThrow(/"nope"/);
    expect(() => createWorld(config({ horizon: 0 }))).toThrow(/horizon/);
    expect(() => createWorld(config({ horizon: 2.5 }))).toThrow(/horizon/);
    expect(() => createWorld(config({ items: [{ type: 'lamp', pos: { x: 0, y: 0 } }] }))).toThrow(/wall/);
    expect(() => createWorld(config({ items: [{ type: 'lamp', pos: { x: 99, y: 1 } }] }))).toThrow(/outside/);
  });

  it('R4.8: kinds whose generated ids would collide are an error', () => {
    const lg: Legend = { A: { actor: 'ghost' }, B: { actor: 'ghost-2' } };
    expect(() => createWorld({ grid: parseGrid(['#AAB#'], lg), spec: { actors: {}, events: [], safety: [] }, registry, horizon: 3 })).toThrow(/not unique/);
  });
});

function snapshot(w: World): string {
  return JSON.stringify({ ...w, map: { ...w.map, walls: [...w.map.walls] } });
}

describe('cloneWorld', () => {
  it('R4.9: a clone equals the original', () => {
    const w = createWorld(config({ properties: [] }));
    expect(cloneWorld(w)).toEqual(w);
  });

  it('R4.9: changing the clone leaves the original untouched', () => {
    const w = createWorld(config());
    const before = snapshot(w);
    const c = cloneWorld(w);
    c.actors[0]!.pos.x += 1;
    c.actors[0]!.lines[0]!.rule.act = 'flip';
    insertLine(c, 'seeker', 0, { kw: '', cond: 'always', act: 'rest' }, 'card');
    c.items[0]!.state.charge = 99;
    c.items[0]!.pos.y = 5;
    c.markers.goal![0]!.x = 6;
    c.events[0]!.rule.act = 'flip';
    c.events[0]!.tick = 9;
    c.properties.push('x');
    c.tick = 5;
    c.status = 'violated';
    c.nextLineId = 500;
    expect(snapshot(w)).toBe(before);
  });

  it('R4.9: changing the original leaves the clone untouched', () => {
    const w = createWorld(config());
    const c = cloneWorld(w);
    const before = snapshot(c);
    w.actors[1]!.pos.x = 5;
    w.actors[0]!.lines.pop();
    w.items[0]!.state.charge = 7;
    w.tick = 3;
    expect(snapshot(c)).toBe(before);
  });
});

describe('insertLine', () => {
  const ruleOf = (act: string): Rule => ({ kw: '', cond: 'always', act });

  it('R4.10: inserts at the index and shifts the lines at and below it', () => {
    const w = createWorld(config());
    const seeker = w.actors[0]!;
    const [a, b] = seeker.lines.map((l) => l.id);
    const line = insertLine(w, 'seeker', 1, ruleOf('flip'), 'card');
    expect(seeker.lines.map((l) => l.id)).toEqual([a, line.id, b]);
    expect(line.origin).toBe('card');
    expect(seeker.lines[1]!.rule.act).toBe('flip');
  });

  it('R4.10: index 0 inserts at the top and an index past the end appends', () => {
    const w = createWorld(config());
    const seeker = w.actors[0]!;
    insertLine(w, 'seeker', 0, ruleOf('flip'), 'rewrite');
    expect(seeker.lines[0]!.rule.act).toBe('flip');
    insertLine(w, 'seeker', 99, ruleOf('rest'), 'card');
    expect(seeker.lines.at(-1)!.origin).toBe('card');
    expect(seeker.lines).toHaveLength(4);
  });

  it('R4.10: new ids are fresh, and old ids never change', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 12 }), fc.constantFrom('seeker', 'watcher')), { maxLength: 15 }),
        (initial, inserts) => {
          const rules = Array.from({ length: initial }, () => ruleOf('rest'));
          const w = createWorld(config({ spec: { actors: { seeker: rules, watcher: [ruleOf('rest')] }, events: [], safety: [] } }));
          const seen = new Set(w.actors.flatMap((a) => a.lines.map((l) => l.id)));
          for (const [index, actorId] of inserts) {
            const actor = w.actors.find((x) => x.id === actorId)!;
            const beforeIds = actor.lines.map((l) => l.id);
            const line = insertLine(w, actorId, index, ruleOf('flip'), 'card');
            expect(seen.has(line.id)).toBe(false);
            seen.add(line.id);
            const at = Math.min(index, beforeIds.length);
            expect(actor.lines.map((l) => l.id)).toEqual([...beforeIds.slice(0, at), line.id, ...beforeIds.slice(at)]);
          }
          expect(w.nextLineId).toBe(Math.max(...seen) + 1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('R4.10: does not keep a reference to the rule it was given', () => {
    const w = createWorld(config());
    const rule = ruleOf('flip');
    insertLine(w, 'seeker', 0, rule, 'card');
    rule.act = 'rest';
    expect(w.actors[0]!.lines[0]!.rule.act).toBe('flip');
  });

  it('R4.10: an unknown actor or a bad index is an error', () => {
    const w = createWorld(config());
    expect(() => insertLine(w, 'nobody', 0, ruleOf('rest'), 'card')).toThrow(/nobody/);
    expect(() => insertLine(w, 'seeker', -1, ruleOf('rest'), 'card')).toThrow(RangeError);
    expect(() => insertLine(w, 'seeker', 1.5, ruleOf('rest'), 'card')).toThrow(RangeError);
  });
});

describe('createWorld: safety rules', () => {
  const safetyText = (actor: string): string => `THE ${actor} SHALL NOT be on WHILE the target is near.`;

  it('S6.6: a safety rule for a kind on the grid is accepted and adds no lines', () => {
    const { spec } = loadSpec(`${SPEC}\n${safetyText('seeker')}`, registry);
    expect(spec.safety).toHaveLength(1);
    const w = createWorld(config({ spec }));
    expect(w.actors.find((a) => a.id === 'seeker')!.lines).toHaveLength(2);
  });

  it('S6.6: a safety rule for a kind that is not on the grid throws a WorldError that names the kind', () => {
    const { spec } = loadSpec(`${SPEC}\n${safetyText('ghost')}`, registry);
    expect(() => createWorld(config({ spec }))).toThrow(WorldError);
    expect(() => createWorld(config({ spec }))).toThrow(/"ghost"/);
  });

  it('S6.6: a safety rule that does not fit the registry throws a WorldError', () => {
    const { spec } = loadSpec(SPEC, registry);
    spec.safety.push({ actor: 'seeker', prohibited: 'missing', cond: 'near' });
    expect(() => createWorld(config({ spec }))).toThrow(/prohibition "missing"/);
  });
});
