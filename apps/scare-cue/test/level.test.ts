import { isBlocked, loadSpec, parseGrid, printRule, printSafety } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { CARDS, ROWS, SAFETY_IDS, buildScareCue, registry } from '../src/level';
import { EXIT_LIGHT, FOG_MACHINE, HORIZON, JUMP_SCARE, LEGEND, TURN_ORDER, VISITOR, createRegistry } from '../src/vocab';

const files = import.meta.glob('../specs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('Scare Cue specs', () => {
  it('S8.2: every spec file in specs/ loads with no errors under the Scare Cue vocabulary', () => {
    const paths = Object.keys(files);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    for (const path of paths) expect(loadSpec(files[path]!, createRegistry()).errors, path).toEqual([]);
  });

  it('S8.2: props.md gives the default rules of the three props, in the order of the prototype', () => {
    const { spec } = loadSpec(files['../specs/props.md']!, createRegistry());
    expect(spec.actors).toEqual({
      'jump-scare': [{ kw: 'WHEN', cond: 'visitor_near', act: 'trigger' }],
      'fog machine': [
        { kw: 'WHEN', cond: 'visitor_near', act: 'spray' },
        { kw: '', cond: 'always', act: 'stop' },
      ],
      'exit light': [
        { kw: 'WHEN', cond: 'fog_on', act: 'turn_off' },
        { kw: '', cond: 'always', act: 'stay_on' },
      ],
    });
    expect(spec.safety).toEqual([]);
  });

  it('S8.2: safety.md gives two safety rules, S1 for the fog machine and S2 for the jump-scare, and no prop rules', () => {
    const { spec } = loadSpec(files['../specs/safety.md']!, createRegistry());
    expect(spec.actors).toEqual({});
    expect(spec.safety.map((r) => printSafety(r, registry))).toEqual([
      'THE fog machine SHALL NOT be on WHILE the exit light is off.',
      'THE jump-scare SHALL NOT trigger WHILE a visitor is adjacent.',
    ]);
    expect(SAFETY_IDS).toEqual(['S1', 'S2']);
    expect(registry.property('S1')!.description).toBe('THE fog machine SHALL NOT be on WHILE the exit light is off.');
    expect(registry.property('S2')!.description).toBe('THE jump-scare SHALL NOT trigger WHILE a visitor is adjacent.');
  });
});

describe('Scare Cue level', () => {
  it('S8.3: the map is 9 by 7 with every prop on its tile and the visitor at (1, 1)', () => {
    const grid = parseGrid(ROWS, LEGEND);
    expect([grid.map.w, grid.map.h]).toEqual([9, 7]);
    const world = buildScareCue();
    const at = (id: string) => world.actors.find((a) => a.id === id)!.pos;
    expect(at(VISITOR)).toEqual({ x: 1, y: 1 });
    expect(at(JUMP_SCARE)).toEqual({ x: 4, y: 1 });
    expect(at(FOG_MACHINE)).toEqual({ x: 4, y: 5 });
    expect(at(EXIT_LIGHT)).toEqual({ x: 6, y: 5 });
    expect(world.markers.exit).toEqual([{ x: 6, y: 5 }]);
  });

  it('S8.3: a visit lasts 12 ticks and the turn order is visitor, jump-scare, fog machine, exit light', () => {
    const world = buildScareCue();
    expect(world.horizon).toBe(12);
    expect(HORIZON).toBe(12);
    expect(TURN_ORDER).toEqual(['visitor', 'jump-scare', 'fog machine', 'exit light']);
    expect(world.actors.map((a) => a.id)).toEqual(['visitor', 'jump-scare', 'fog machine', 'exit light']);
    expect(world.status).toBe('running');
    expect(world.tick).toBe(0);
  });

  it('S8.3: the fog starts off, the exit light starts on, and both safety rules are checked', () => {
    const world = buildScareCue();
    expect(world.items.find((i) => i.type === 'fog')!.state.on).toBe(false);
    expect(world.items.find((i) => i.type === 'exit-light')!.state.on).toBe(true);
    expect(world.properties).toEqual(['S1', 'S2']);
    expect(world.events).toEqual([]);
  });

  it('S8.3: the visitor cannot step onto the jump-scare or the fog machine, and the exit is open', () => {
    const world = buildScareCue();
    expect(isBlocked(world, { x: 4, y: 1 })).toBe(true);
    expect(isBlocked(world, { x: 4, y: 5 })).toBe(true);
    expect(isBlocked(world, { x: 6, y: 5 })).toBe(false);
    const open = ROWS.flatMap((row, y) => [...row].map((_, x) => ({ x, y }))).filter((p) => !isBlocked(world, p));
    expect(open).toHaveLength(23);
  });

  it('S8.3: the props start with their default rules', () => {
    const world = buildScareCue();
    expect(world.actors.map((a) => [a.id, a.lines.length])).toEqual([
      ['visitor', 0],
      ['jump-scare', 1],
      ['fog machine', 2],
      ['exit light', 2],
    ]);
  });
});

describe('Scare Cue cards', () => {
  it('S8.4: there are three cards in order: the exit-light fix, the jump-scare fix and the fog-machine decoy', () => {
    expect(CARDS.map((c) => [c.id, c.role, c.actor])).toEqual([
      ['exit-light-fix', 'fix', 'exit light'],
      ['jump-scare-fix', 'fix', 'jump-scare'],
      ['fog-machine-decoy', 'decoy', 'fog machine'],
    ]);
  });

  it('S8.4: each card is the EARS sentence it was written from', () => {
    for (const card of CARDS) expect(printRule(card.actor, card.rule, registry), card.id).toBe(card.text);
    expect(CARDS.map((c) => c.text)).toEqual([
      'IF the fog is on, THEN THE exit light SHALL stay on.',
      'IF a visitor is adjacent, THEN THE jump-scare SHALL stay still.',
      'IF the exit light is off, THEN THE fog machine SHALL stop the fog.',
    ]);
  });

  it('S8.4: any card can be inserted at any line of its prop, and the new line has origin card', () => {
    CARDS.forEach((card, index) => {
      const length = buildScareCue().actors.find((a) => a.id === card.actor)!.lines.length;
      for (let at = 0; at <= length; at++) {
        const lines = buildScareCue([{ card: index, at }]).actors.find((a) => a.id === card.actor)!.lines;
        expect(lines, `${card.id} at ${at}`).toHaveLength(length + 1);
        expect(lines[at]!.origin).toBe('card');
        expect(lines[at]!.rule).toEqual(card.rule);
        expect(lines.filter((l) => l.origin === 'card')).toHaveLength(1);
      }
    });
  });

  it('S8.4: cards go in the order given, and an index past the end appends', () => {
    const world = buildScareCue([{ card: 0, at: 0 }, { card: 1, at: 0 }, { card: 2, at: 9 }]);
    const lines = (id: string) => world.actors.find((a) => a.id === id)!.lines.map((l) => l.origin);
    expect(lines('exit light')).toEqual(['card', 'spec', 'spec']);
    expect(lines('jump-scare')).toEqual(['card', 'spec']);
    expect(lines('fog machine')).toEqual(['spec', 'spec', 'card']);
  });

  it('S8.4: building does not change the level or the next build, and an unknown card is an error', () => {
    const before = JSON.stringify(buildScareCue());
    buildScareCue([{ card: 0, at: 0 }]);
    expect(JSON.stringify(buildScareCue())).toBe(before);
    expect(() => buildScareCue([{ card: 7, at: 0 }])).toThrow(/no card 7/);
  });
});
