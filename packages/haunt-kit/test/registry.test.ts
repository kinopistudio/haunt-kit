import { describe, expect, it } from 'vitest';
import { Registry, RegistryError } from '../src/index';
import type { ActionDef, ConditionDef } from '../src/index';

const cond = (id: string, pattern: string, extra: Partial<ConditionDef> = {}): ConditionDef => ({
  id,
  pattern,
  test: () => true,
  ...extra,
});
const act = (id: string, pattern: string): ActionDef => ({ id, pattern, run: () => {} });

function throwsRegistryError(fn: () => unknown, id: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(RegistryError);
  expect((caught as RegistryError).id).toBe(id);
  expect((caught as RegistryError).message).toContain(id);
}

describe('registry', () => {
  it('R2.1: a registered condition is found by id and by phrase', () => {
    const r = new Registry().addCondition(cond('near', 'the target is near')).addCondition(cond('late', 'the clock is past {n}'));
    expect(r.condition('near')?.pattern).toBe('the target is near');
    expect(r.matchCondition('the target is near')?.def.id).toBe('near');
    expect(r.matchCondition('  The   TARGET is near ')?.def.id).toBe('near');
    expect(r.matchCondition('the target is far')).toBeUndefined();
    expect(r.condition('missing')).toBeUndefined();
  });

  it('R2.1: a phrase with {n} captures the integer', () => {
    const r = new Registry().addCondition(cond('late', 'the clock is past {n}'));
    expect(r.matchCondition('the clock is past 12')).toEqual({ def: r.condition('late'), n: 12 });
    expect(r.matchCondition('the clock is past twelve')).toBeUndefined();
    expect(r.matchCondition('the clock is past')).toBeUndefined();
  });

  it('R2.2: a registered action is found by id and by phrase', () => {
    const r = new Registry().addAction(act('hop', 'hop once')).addAction(act('rest', 'rest'));
    expect(r.action('hop')?.pattern).toBe('hop once');
    expect(r.matchAction('Hop  once')?.id).toBe('hop');
    expect(r.matchAction('hop twice')).toBeUndefined();
    expect(r.action('missing')).toBeUndefined();
  });

  it('R2.3: a new registry has no vocabulary', () => {
    const r = new Registry();
    expect(r.conditions()).toEqual([]);
    expect(r.actions()).toEqual([]);
    expect(r.properties()).toEqual([]);
    expect(r.scheduleCondition).toBeUndefined();
    expect(r.matchCondition('always')).toBeUndefined();
  });

  it('R2.3: lists keep registration order', () => {
    const r = new Registry().addCondition(cond('b', 'beta')).addCondition(cond('a', 'alpha'));
    expect(r.conditions().map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('R2.4: a repeated id is rejected, for conditions, actions and properties', () => {
    const r = new Registry().addCondition(cond('near', 'the target is near')).addAction(act('hop', 'hop'));
    r.addProperty({ id: 'safe', description: 'x', check: () => null });
    throwsRegistryError(() => r.addCondition(cond('near', 'something else')), 'near');
    throwsRegistryError(() => r.addAction(act('hop', 'hop again')), 'hop');
    throwsRegistryError(() => r.addProperty({ id: 'safe', description: 'y', check: () => null }), 'safe');
  });

  it('R2.4: a repeated pattern is rejected, even with different spacing or case', () => {
    const r = new Registry().addCondition(cond('near', 'the target is near')).addAction(act('hop', 'hop'));
    throwsRegistryError(() => r.addCondition(cond('close', 'the target is near')), 'close');
    throwsRegistryError(() => r.addAction(act('jump', 'hop')), 'jump');
  });

  it('R2.4: the reserved id always is rejected', () => {
    throwsRegistryError(() => new Registry().addCondition(cond('always', 'at all times')), 'always');
  });

  it('R2.4: malformed ids and patterns are rejected', () => {
    const bad = ['', 'Upper Case', 'the target, near', 'say "hi"', 'stop.', ' leading', 'double  space', 'braces {x}', 'curly {n'];
    for (const p of bad) throwsRegistryError(() => new Registry().addCondition(cond('x', p)), 'x');
    for (const id of ['', '1abc', 'Has-Dash', 'with space']) {
      throwsRegistryError(() => new Registry().addCondition(cond(id, 'a phrase')), id);
      throwsRegistryError(() => new Registry().addAction(act(id, 'a phrase')), id);
    }
  });

  it('R2.5: {n} is accepted in a condition, once', () => {
    expect(() => new Registry().addCondition(cond('late', 'past {n}'))).not.toThrow();
    throwsRegistryError(() => new Registry().addCondition(cond('range', 'between {n} and {n}')), 'range');
  });

  it('R2.5: {n} is rejected in an action', () => {
    throwsRegistryError(() => new Registry().addAction(act('wait', 'wait {n} ticks')), 'wait');
  });

  it('R2.6: the schedule condition is the one registered with schedule: true', () => {
    const r = new Registry().addCondition(cond('near', 'near')).addCondition(cond('strikes', 'the clock strikes {n}', { schedule: true }));
    expect(r.scheduleCondition?.id).toBe('strikes');
  });

  it('R2.6: a second schedule condition is rejected', () => {
    const r = new Registry().addCondition(cond('strikes', 'the clock strikes {n}', { schedule: true }));
    throwsRegistryError(() => r.addCondition(cond('rings', 'the bell rings {n}', { schedule: true })), 'rings');
    expect(r.condition('rings')).toBeUndefined();
  });

  it('R2.6: a schedule condition needs {n}', () => {
    throwsRegistryError(() => new Registry().addCondition(cond('now', 'it is now', { schedule: true })), 'now');
  });

  it('R2.7: a registered property is found by id', () => {
    const r = new Registry().addProperty({ id: 'safe', description: 'nothing bad happens', check: () => null });
    expect(r.property('safe')?.description).toBe('nothing bad happens');
    expect(r.properties().map((p) => p.id)).toEqual(['safe']);
    expect(r.property('other')).toBeUndefined();
  });

  it('R2.7: a malformed property id is rejected', () => {
    throwsRegistryError(() => new Registry().addProperty({ id: 'Bad Id', description: '', check: () => null }), 'Bad Id');
  });
});
