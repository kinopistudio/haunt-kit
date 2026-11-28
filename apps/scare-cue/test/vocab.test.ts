import { createWorld, loadSpec, parseGrid, tick } from 'haunt-kit';
import type { Pos, TurnTrace, World } from 'haunt-kit';
import { describe, expect, it } from 'vitest';
import { ADJACENT, EXIT_LIGHT, FOG_MACHINE, HORIZON, JUMP_SCARE, LEGEND, NEAR, TURN_ORDER, VISITOR, createRegistry } from '../src/vocab';

const registry = createRegistry();

/** A world on `rows` with Scare Cue's legend and the given prop rules. No property is checked. */
function world(rows: string[], specText = ''): World {
  const { spec, errors } = loadSpec(specText, registry);
  expect(errors).toEqual([]);
  return createWorld({ grid: parseGrid(rows, LEGEND), spec, registry, horizon: HORIZON, turnOrder: TURN_ORDER, properties: [] });
}

const actor = (w: World, id: string) => w.actors.find((a) => a.id === id)!;
const fog = (w: World) => w.items.find((i) => i.type === 'fog')!;
const lamp = (w: World) => w.items.find((i) => i.type === 'exit-light')!;

describe('Scare Cue vocabulary: conditions', () => {
  const test = (id: string, w: World, who: string): boolean => registry.condition(id)!.test({ world: w, actor: actor(w, who) }, 0);

  it('S8.1: the registry has exactly the four conditions, with their phrases', () => {
    expect(registry.conditions().map((c) => [c.id, c.pattern])).toEqual([
      ['visitor_near', 'a visitor is near'],
      ['visitor_adjacent', 'a visitor is adjacent'],
      ['fog_on', 'the fog is on'],
      ['light_off', 'the exit light is off'],
    ]);
    expect(registry.scheduleCondition).toBeUndefined();
  });

  it('S8.1: a visitor is near within 2 steps of the prop and not at 3', () => {
    expect(test('visitor_near', world(['#########', '#.V.J...#', '#########']), JUMP_SCARE)).toBe(true);
    expect(test('visitor_near', world(['#########', '#V..J...#', '#########']), JUMP_SCARE)).toBe(false);
    expect(test('visitor_near', world(['#########', '#...J.V.#', '#########']), JUMP_SCARE)).toBe(true);
    expect(test('visitor_near', world(['#########', '#...J..V#', '#########']), JUMP_SCARE)).toBe(false);
    expect(NEAR).toBe(2);
  });

  it('S8.1: a visitor is adjacent within 1 step and not at 2', () => {
    expect(test('visitor_adjacent', world(['#########', '#..VJ...#', '#########']), JUMP_SCARE)).toBe(true);
    expect(test('visitor_adjacent', world(['#########', '#.V.J...#', '#########']), JUMP_SCARE)).toBe(false);
    expect(ADJACENT).toBe(1);
  });

  it('S8.1: distance is Manhattan, so a diagonal neighbour is 2 steps away', () => {
    const w = world(['#####', '#V..#', '#.J.#', '#####']);
    expect(test('visitor_near', w, JUMP_SCARE)).toBe(true);
    expect(test('visitor_adjacent', w, JUMP_SCARE)).toBe(false);
  });

  it('S8.1: the distance is measured from the prop that is asking, to the nearest visitor', () => {
    const one = world(['###########', '#...J...FV#', '###########']);
    expect(test('visitor_near', one, JUMP_SCARE)).toBe(false);
    expect(test('visitor_near', one, FOG_MACHINE)).toBe(true);
    const two = world(['###########', '#V..J.V.F.#', '###########']);
    expect(test('visitor_near', two, FOG_MACHINE)).toBe(true);
    expect(test('visitor_near', two, JUMP_SCARE)).toBe(true);
    expect(two.actors.filter((a) => a.kind === VISITOR).map((a) => a.id)).toEqual(['visitor', 'visitor-2']);
  });

  it('S8.1: with no visitor on the map no condition about visitors holds', () => {
    const w = world(['#####', '#.J.#', '#####']);
    expect(test('visitor_near', w, JUMP_SCARE)).toBe(false);
    expect(test('visitor_adjacent', w, JUMP_SCARE)).toBe(false);
  });

  it('S8.1: the fog is on follows the fog state, and the exit light is off follows the lamp state', () => {
    const w = world(['#######', '#V.F.E#', '#######']);
    expect(test('fog_on', w, EXIT_LIGHT)).toBe(false);
    expect(test('light_off', w, FOG_MACHINE)).toBe(false);
    fog(w).state.on = true;
    lamp(w).state.on = false;
    expect(test('fog_on', w, EXIT_LIGHT)).toBe(true);
    expect(test('light_off', w, FOG_MACHINE)).toBe(true);
  });

  it('S8.1: a map with no fog machine has no fog, and one with no exit light never has the light off', () => {
    const w = world(['#####', '#V.J#', '#####']);
    expect(test('fog_on', w, JUMP_SCARE)).toBe(false);
    expect(test('light_off', w, JUMP_SCARE)).toBe(false);
  });
});

describe('Scare Cue vocabulary: actions', () => {
  const rows = ['#######', '#V.F.E#', '#######'];
  const act = (id: string, w: World, who: string): void => registry.action(id)!.run({ world: w, actor: actor(w, who) });

  it('S8.1: the registry has exactly the six actions, with their phrases', () => {
    expect(registry.actions().map((a) => [a.id, a.pattern])).toEqual([
      ['trigger', 'trigger'],
      ['stay', 'stay still'],
      ['spray', 'spray fog'],
      ['stop', 'stop the fog'],
      ['turn_off', 'turn off'],
      ['stay_on', 'stay on'],
    ]);
  });

  it('S8.1: spray fog turns the fog on and stop the fog turns it off', () => {
    const w = world(rows);
    act('spray', w, FOG_MACHINE);
    expect(fog(w).state.on).toBe(true);
    act('spray', w, FOG_MACHINE);
    expect(fog(w).state.on).toBe(true);
    act('stop', w, FOG_MACHINE);
    expect(fog(w).state.on).toBe(false);
  });

  it('S8.1: turn off switches the light off and stay on switches it on', () => {
    const w = world(rows);
    act('turn_off', w, EXIT_LIGHT);
    expect(lamp(w).state.on).toBe(false);
    act('stay_on', w, EXIT_LIGHT);
    expect(lamp(w).state.on).toBe(true);
  });

  it('S8.1: trigger and stay still change nothing', () => {
    const w = world(rows);
    const before = JSON.stringify(w);
    act('trigger', w, FOG_MACHINE);
    act('stay', w, EXIT_LIGHT);
    expect(JSON.stringify(w)).toBe(before);
  });

  it('S8.1: the fog starts off and the light starts on', () => {
    const w = world(rows);
    expect(fog(w).state.on).toBe(false);
    expect(lamp(w).state.on).toBe(true);
  });
});

describe('Scare Cue vocabulary: prohibitions', () => {
  const rows = ['##########', '#V..J.F.E#', '##########'];
  const trigger = registry.prohibition('trigger')!;
  const beOn = registry.prohibition('be_on')!;

  /** Runs one tick with the visitor moving to `to`, and returns the world and the turn of `who`. */
  function play(rules: string, who: string, to: Pos = { x: 2, y: 1 }): { w: World; turn: TurnTrace } {
    const w = world(rows, rules);
    const trace = tick(w, registry, { scripted: { visitor: to } })!;
    return { w, turn: trace.turns.find((t) => t.actor === who)! };
  }

  it('S8.1: the registry has the prohibitions trigger and be on', () => {
    expect(registry.prohibitions().map((p) => [p.id, p.pattern])).toEqual([
      ['trigger', 'trigger'],
      ['be_on', 'be on'],
    ]);
  });

  it('S8.1: trigger occurs on the turn in which that prop fired the action trigger', () => {
    const { w, turn } = play('THE jump-scare SHALL trigger.', JUMP_SCARE);
    expect(trigger.occurs({ world: w, actor: actor(w, JUMP_SCARE), turn })).toBe(true);
  });

  it('S8.1: trigger does not occur for another prop, for another action, or when no line fired', () => {
    const fired = play('THE jump-scare SHALL trigger.', JUMP_SCARE);
    expect(trigger.occurs({ world: fired.w, actor: actor(fired.w, FOG_MACHINE), turn: fired.turn })).toBe(false);
    const quiet = play('THE jump-scare SHALL stay still.', JUMP_SCARE);
    expect(trigger.occurs({ world: quiet.w, actor: actor(quiet.w, JUMP_SCARE), turn: quiet.turn })).toBe(false);
    const none = play('WHEN the fog is on, THE jump-scare SHALL trigger.', JUMP_SCARE);
    expect(none.turn.fired).toBeNull();
    expect(trigger.occurs({ world: none.w, actor: actor(none.w, JUMP_SCARE), turn: none.turn })).toBe(false);
    const other = play('THE jump-scare SHALL trigger.', FOG_MACHINE);
    expect(trigger.occurs({ world: other.w, actor: actor(other.w, JUMP_SCARE), turn: other.turn })).toBe(false);
  });

  it('S8.1: be on holds for the fog machine while the fog is on and for the exit light while the lamp is on', () => {
    const { w, turn } = play('THE jump-scare SHALL stay still.', JUMP_SCARE);
    const at = (id: string): boolean => beOn.occurs({ world: w, actor: actor(w, id), turn });
    expect([at(FOG_MACHINE), at(EXIT_LIGHT), at(JUMP_SCARE), at(VISITOR)]).toEqual([false, true, false, false]);
    fog(w).state.on = true;
    lamp(w).state.on = false;
    expect([at(FOG_MACHINE), at(EXIT_LIGHT), at(JUMP_SCARE)]).toEqual([true, false, false]);
  });
});

describe('Scare Cue vocabulary: the kit grammar reads it', () => {
  it('S8.1: sentences with Scare Cue words parse, and a word of another app does not', () => {
    const { spec, errors } = loadSpec(
      [
        'WHEN a visitor is near, THE fog machine SHALL spray fog.',
        'IF the exit light is off, THEN THE fog machine SHALL stop the fog.',
        'WHEN the fog is on, THE exit light SHALL turn off.',
        'WHEN a visitor is adjacent, THE jump-scare SHALL stay still.',
        'THE jump-scare SHALL NOT trigger WHILE a visitor is adjacent.',
        'THE fog machine SHALL NOT be on WHILE the exit light is off.',
      ].join('\n'),
      registry,
    );
    expect(errors).toEqual([]);
    expect(Object.keys(spec.actors)).toEqual(['fog machine', 'exit light', 'jump-scare']);
    expect(spec.safety.map((s) => s.prohibited)).toEqual(['trigger', 'be_on']);
    expect(loadSpec('THE jump-scare SHALL move toward the girl.', registry).errors).toHaveLength(1);
  });
});
