import { describe, expect, it } from 'vitest';
import { loadSpec } from '../src/index';
import { createToyRegistry } from './fixtures/toy-vocab';

const registry = createToyRegistry();

describe('loadSpec', () => {
  it('R3.8: collects rules by actor, in file order', () => {
    const { spec, errors } = loadSpec(
      [
        'THE seeker SHALL step toward the target.',
        'THE watcher SHALL do nothing.',
        'WHEN the target is near, THE seeker SHALL step away from the target.',
        'IF the switch is on, THEN THE watcher SHALL flip the switch.',
      ].join('\n'),
      registry,
    );
    expect(errors).toEqual([]);
    expect(Object.keys(spec.actors)).toEqual(['seeker', 'watcher']);
    expect(spec.actors.seeker).toEqual([
      { kw: '', cond: 'always', act: 'approach' },
      { kw: 'WHEN', cond: 'near', act: 'retreat' },
    ]);
    expect(spec.actors.watcher).toEqual([
      { kw: '', cond: 'always', act: 'rest' },
      { kw: 'IF', cond: 'switch_on', act: 'flip' },
    ]);
    expect(spec.events).toEqual([]);
  });

  it('R3.8: ignores blank lines, headings, prose, fences and Markdown noise', () => {
    const text = [
      '# Seeker spec',
      '',
      'Rules are read top to bottom.',
      'A seeker walks. It does not run.',
      '```',
      'THE seeker SHALL do nothing.',
      '```',
      '> a quote',
      '---',
      '| table | row |',
    ].join('\n');
    const { spec, errors } = loadSpec(text, registry);
    expect(errors).toEqual([]);
    expect(spec.actors).toEqual({ seeker: [{ kw: '', cond: 'always', act: 'rest' }] });
  });

  it('R3.8: strips list markers and indentation', () => {
    const text = [
      '- THE seeker SHALL do nothing.',
      '* WHEN the target is far, THE seeker SHALL step toward the target.',
      '1. IF the switch is on, THEN THE seeker SHALL flip the switch.',
      '  12) THE seeker SHALL do nothing.',
      '\tTHE seeker SHALL do nothing.',
    ].join('\n');
    const { spec, errors } = loadSpec(text, registry);
    expect(errors).toEqual([]);
    expect(spec.actors.seeker).toHaveLength(5);
  });

  it('R3.8: moves write sentences into events and keeps them out of the lines', () => {
    const text = [
      'THE seeker SHALL step toward the target.',
      'WHEN the clock strikes 6, THE seeker SHALL write "WHEN the target is near, THE seeker SHALL step away from the target." at line 1.',
      'WHEN the clock strikes 9, THE seeker SHALL write "THE seeker SHALL do nothing." at line 3.',
    ].join('\n');
    const { spec, errors } = loadSpec(text, registry);
    expect(errors).toEqual([]);
    expect(spec.actors.seeker).toHaveLength(1);
    expect(spec.events.map((e) => [e.tick, e.line, e.actor])).toEqual([
      [6, 1, 'seeker'],
      [9, 3, 'seeker'],
    ]);
  });

  it('R3.8: an actor that only has write sentences still appears', () => {
    const { spec } = loadSpec('WHEN the clock strikes 2, THE ghost SHALL write "THE ghost SHALL do nothing." at line 1.', registry);
    expect(spec.actors).toEqual({ ghost: [] });
  });

  it('R3.8: reports each invalid sentence with its file line number and a file column', () => {
    const text = [
      '# Spec',
      'THE seeker SHALL do nothing.',
      '',
      'THE seeker SHALL dance.',
      '- WHEN the moon is up, THE seeker SHALL do nothing.',
      'THE seeker SHALL do nothing.',
    ].join('\n');
    const { spec, errors } = loadSpec(text, registry);
    expect(spec.actors.seeker).toHaveLength(2);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ line: 4, column: 18, text: 'THE seeker SHALL dance.' });
    expect(errors[0]!.message).toContain('unknown action');
    expect(errors[1]).toMatchObject({ line: 5, column: 8 });
    expect(errors[1]!.message).toContain('unknown condition');
    expect(text.split('\n')[4]!.slice(errors[1]!.column - 1)).toMatch(/^the moon is up/);
  });

  it('R3.8: handles Windows line endings', () => {
    const { spec, errors } = loadSpec('THE seeker SHALL do nothing.\r\nTHE seeker SHALL flip the switch.\r\n', registry);
    expect(errors).toEqual([]);
    expect(spec.actors.seeker).toHaveLength(2);
  });

  it('R3.8: an empty file gives an empty spec', () => {
    expect(loadSpec('', registry)).toEqual({ spec: { actors: {}, events: [], safety: [] }, errors: [] });
  });

  it('R3.9: a sentence with a lowercase keyword is reported, not ignored', () => {
    const { spec, errors } = loadSpec('When the target is near, THE seeker SHALL do nothing.\nTHE seeker shall do nothing.\nthe seeker SHALL do nothing.', registry);
    expect(spec.actors).toEqual({});
    expect(errors.map((e) => e.line)).toEqual([1, 2, 3]);
    for (const e of errors) expect(e.message).toContain('capitals');
  });

  it('R3.9: a line that starts like a sentence and has SHALL but is broken is reported', () => {
    const { errors } = loadSpec('THE seeker SHALL do nothing\nIF the target is near THE seeker SHALL do nothing.', registry);
    expect(errors.map((e) => e.line)).toEqual([1, 2]);
  });

  it('R3.9: prose that starts with a keyword but has no SHALL is ignored', () => {
    const { spec, errors } = loadSpec('The seeker is a small ghost.\nIf you read this, it works.\nWhen in doubt, ask.', registry);
    expect(errors).toEqual([]);
    expect(spec.actors).toEqual({});
  });
});

describe('loadSpec: safety rules', () => {
  const text = [
    '# Safety',
    '',
    '- THE seeker SHALL NOT be on WHILE the target is near.',
    'THE seeker SHALL do nothing.',
    '2. THE watcher SHALL NOT be on WHILE the clock is past 4.',
  ].join('\n');

  it('S6.5: safety rules are collected in file order in spec.safety', () => {
    const { spec, errors } = loadSpec(text, registry);
    expect(errors).toEqual([]);
    expect(spec.safety).toEqual([
      { actor: 'seeker', prohibited: 'be_on', cond: 'near' },
      { actor: 'watcher', prohibited: 'be_on', cond: 'late', n: 4 },
    ]);
  });

  it('S6.5: safety rules are not added to spec.actors', () => {
    const { spec } = loadSpec('THE watcher SHALL NOT be on WHILE the target is near.', registry);
    expect(spec.actors).toEqual({});
    expect(spec.events).toEqual([]);
    expect(Object.keys(loadSpec(text, registry).spec.actors)).toEqual(['seeker']);
  });

  it('S6.5: an invalid safety sentence is reported with its file line and column, and the valid ones still load', () => {
    const { spec, errors } = loadSpec(
      ['THE seeker SHALL NOT be on WHILE the target is near.', '', '  - THE seeker SHALL NOT dance WHILE the target is near.', 'THE seeker SHALL NOT be on.'].join('\n'),
      registry,
    );
    expect(spec.safety).toHaveLength(1);
    expect(errors.map((e) => [e.line, e.message.split(' ')[0]])).toEqual([[3, 'unknown'], [4, 'a']]);
    expect(errors[0]!.column).toBe('  - THE seeker SHALL NOT dance'.indexOf('dance') + 1);
    expect(errors[0]!.text).toBe('- THE seeker SHALL NOT dance WHILE the target is near.');
  });

  it('S6.5: a lowercase safety sentence is reported, not ignored', () => {
    const { errors } = loadSpec('the seeker shall not be on while the target is near.', registry);
    expect(errors.map((e) => e.line)).toEqual([1]);
  });

  it('S6.5: an empty file has an empty safety list', () => {
    expect(loadSpec('', registry).spec.safety).toEqual([]);
  });
});
