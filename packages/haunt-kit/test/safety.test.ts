import { describe, expect, it } from 'vitest';
import { RegistryError, loadSpec, printSafety, registerSafety, tick } from '../src/index';
import type { SafetyRule, TickTrace, World } from '../src/index';
import { createToyRegistry, toyWorld } from './fixtures/toy-vocab';

function must(t: TickTrace | null): TickTrace {
  if (t === null) throw new Error('expected a trace');
  return t;
}

/** A toy registry with the safety rules of `text` registered, and the world built on `rows` with them. */
function setup(rows: string[], text: string, options: { turnOrder?: string[] } = {}) {
  const registry = createToyRegistry();
  const { spec, errors } = loadSpec(text, registry);
  expect(errors).toEqual([]);
  const ids = registerSafety(registry, spec.safety);
  const world: World = toyWorld(rows, text, registry, { spec, ...options });
  return { registry, world, ids, rules: spec.safety };
}

describe('registerSafety', () => {
  it('S6.7: registers one property per rule, named S1, S2, ... in order, and returns the ids', () => {
    const { registry, ids, rules, world } = setup(
      ['#######', '#S.T.s#', '#######'],
      'THE seeker SHALL NOT be on WHILE the target is near.\nTHE seeker SHALL NOT flip the switch WHILE the switch is on.\nTHE seeker SHALL do nothing.',
    );
    expect(ids).toEqual(['S1', 'S2']);
    expect(registry.properties().map((p) => p.id)).toEqual(['S1', 'S2']);
    expect(registry.property('S1')!.description).toBe(printSafety(rules[0]!, registry));
    expect(world.properties).toEqual(['S1', 'S2']);
    expect(registerSafety(createToyRegistry(), [])).toEqual([]);
  });

  it('S6.7: a state prohibition fails when the state holds and the condition holds for the actor', () => {
    const { registry, world, rules } = setup(['#######', '#S.T.s#', '#######'], 'THE seeker SHALL NOT be on WHILE the target is near.\nTHE seeker SHALL flip the switch.');
    const t = must(tick(world, registry));
    expect(t.violation).toEqual({ property: 'S1', message: printSafety(rules[0]!, registry), actors: ['seeker'] });
    expect(t.status).toBe('violated');
  });

  it('S6.7: the message of a failure is the printed rule', () => {
    const { registry, world } = setup(['#######', '#S.T.s#', '#######'], 'THE seeker SHALL NOT be on WHILE the target is near.\nTHE seeker SHALL flip the switch.');
    expect(must(tick(world, registry)).violation!.message).toBe('THE seeker SHALL NOT be on WHILE the target is near.');
  });

  it('S6.7: no failure while the condition does not hold', () => {
    const { registry, world } = setup(['#########', '#S..T..s#', '#########'], 'THE seeker SHALL NOT be on WHILE the target is near.\nTHE seeker SHALL flip the switch.');
    const t = must(tick(world, registry));
    expect(t.violation).toBeNull();
    expect(world.items[0]!.state.on).toBe(true);
  });

  it('S6.7: an action prohibition fails only on the turn in which the actor fired that action', () => {
    const text = 'THE seeker SHALL NOT flip the switch WHILE the switch is on.\nTHE seeker SHALL flip the switch.\nTHE watcher SHALL do nothing.';
    const { registry, world } = setup(['#########', '#S.W.T.s#', '#########'], text, { turnOrder: ['watcher', 'seeker'] });
    // The watcher goes first and does nothing: the switch is off, so nothing fires.
    // The seeker then flips the switch on, which is the prohibited action while the switch is on.
    const t = must(tick(world, registry));
    expect(t.violation).toMatchObject({ property: 'S1', actors: ['seeker'] });
    expect(t.turns.map((x) => x.actor)).toEqual(['watcher', 'seeker']);
  });

  it('S6.7: an action prohibition does not fail after the turn of another actor, even when the condition holds', () => {
    // The switch is already on, so the seeker's flip would fail; the seeker does nothing and the watcher flips.
    const text = 'THE seeker SHALL NOT flip the switch WHILE the switch is on.\nTHE seeker SHALL do nothing.\nTHE watcher SHALL flip the switch.';
    const { registry, world } = setup(['#######', '#S.Ws.#', '#######'], text);
    world.items[0]!.state.on = true;
    for (let i = 0; i < 3; i++) expect(must(tick(world, registry)).violation).toBeNull();
  });

  it('S6.7: the condition is evaluated for the actor of the rule, not for other actors', () => {
    const text = 'THE watcher SHALL NOT be on WHILE the target is near.\nTHE seeker SHALL flip the switch.';
    // The watcher is far from the target, so the rule holds even though the seeker's flip turns the switch on.
    const rows = ['###########', '#W.....Ts.#', '#S........#', '###########'];
    const { registry, world } = setup(rows, text, { turnOrder: ['seeker'] });
    const t = must(tick(world, registry));
    expect(t.violation).toBeNull();
    expect(world.items[0]!.state.on).toBe(true);
    // Here the watcher is next to the target.
    const near = setup(['###########', '#.....WTs.#', '#S........#', '###########'], text, { turnOrder: ['seeker'] });
    expect(must(tick(near.world, near.registry)).violation).toMatchObject({ property: 'S1', actors: ['watcher'] });
  });

  it('S6.7: a state prohibition is checked after every turn, and the failure stops the tick', () => {
    const text = 'THE watcher SHALL NOT be on WHILE the target is near.\nTHE seeker SHALL flip the switch.\nTHE watcher SHALL do nothing.';
    const { registry, world } = setup(['###########', '#S.WT.s...#', '###########'], text);
    const t = must(tick(world, registry));
    expect(t.turns.map((x) => x.actor)).toEqual(['seeker']);
    expect(t.violation).toMatchObject({ property: 'S1', actors: ['watcher'] });
  });

  it('S6.7: when several actors of the kind break the rule, all are listed in turn order', () => {
    const text = 'THE watcher SHALL NOT be on WHILE the target is near.\nTHE seeker SHALL flip the switch.';
    const { registry, world } = setup(['###########', '#S.WTW.s..#', '###########'], text);
    expect(must(tick(world, registry)).violation!.actors).toEqual(['watcher', 'watcher-2']);
  });

  it('S6.7: a property called without a turn does not fail', () => {
    const { registry, world } = setup(['#######', '#S.T.s#', '#######'], 'THE seeker SHALL NOT be on WHILE the target is near.');
    world.items[0]!.state.on = true;
    expect(registry.property('S1')!.check(world)).toBeNull();
  });

  it('S6.7: a rule that does not fit the registry throws a RegistryError that names the id, and registers nothing', () => {
    const registry = createToyRegistry();
    const bad: SafetyRule[] = [{ actor: 'seeker', prohibited: 'be_on', cond: 'near' }, { actor: 'seeker', prohibited: 'nope', cond: 'near' }];
    expect(() => registerSafety(registry, bad)).toThrow(RegistryError);
    expect(() => registerSafety(registry, bad)).toThrow(/S2/);
    expect(registry.properties()).toEqual([]);
  });

  it('S6.7: registering the same ids twice throws a RegistryError', () => {
    const registry = createToyRegistry();
    const rules: SafetyRule[] = [{ actor: 'seeker', prohibited: 'be_on', cond: 'near' }];
    registerSafety(registry, rules);
    expect(() => registerSafety(registry, rules)).toThrow(/S1/);
  });
});
