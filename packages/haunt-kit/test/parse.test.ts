import { describe, expect, it } from 'vitest';
import { parseSentence } from '../src/index';
import type { ParseResult, Sentence } from '../src/index';
import { createToyRegistry } from './fixtures/toy-vocab';

const registry = createToyRegistry();
const parse = (text: string): ParseResult<Sentence> => parseSentence(text, registry);

function ruleOf(text: string) {
  const r = parse(text);
  if (!r.ok) throw new Error(`expected ${text} to parse: ${r.error.message}`);
  if (r.value.type !== 'rule') throw new Error('expected a rule');
  return r.value;
}

function errorOf(text: string) {
  const r = parse(text);
  if (r.ok) throw new Error(`expected ${text} to fail`);
  return r.error;
}

describe('parseSentence: rule forms', () => {
  it('R3.1: THE x SHALL y parses as a ubiquitous rule', () => {
    expect(ruleOf('THE seeker SHALL step toward the target.')).toEqual({
      type: 'rule',
      actor: 'seeker',
      rule: { kw: '', cond: 'always', act: 'approach' },
    });
  });

  it('R3.1: the actor may be several words', () => {
    expect(ruleOf('THE night watch SHALL do nothing.').actor).toBe('night watch');
    expect(ruleOf('THE ghost-2 SHALL do nothing.').actor).toBe('ghost-2');
  });

  it('R3.2: WHEN c, THE x SHALL y parses as an event rule', () => {
    expect(ruleOf('WHEN the target is near, THE seeker SHALL step away from the target.')).toEqual({
      type: 'rule',
      actor: 'seeker',
      rule: { kw: 'WHEN', cond: 'near', act: 'retreat' },
    });
  });

  it('R3.3: IF c, THEN THE x SHALL y parses as an unwanted-behaviour rule', () => {
    expect(ruleOf('IF the switch is on, THEN THE seeker SHALL flip the switch.')).toEqual({
      type: 'rule',
      actor: 'seeker',
      rule: { kw: 'IF', cond: 'switch_on', act: 'flip' },
    });
  });

  it('R3.4: the integer in {n} is stored as n', () => {
    expect(ruleOf('WHEN the clock is past 7, THE seeker SHALL do nothing.').rule).toEqual({
      kw: 'WHEN',
      cond: 'late',
      act: 'rest',
      n: 7,
    });
    expect(ruleOf('IF the clock is past 0, THEN THE seeker SHALL do nothing.').rule.n).toBe(0);
  });

  it('R3.4: rules without {n} have no n key', () => {
    expect('n' in ruleOf('WHEN the target is far, THE seeker SHALL do nothing.').rule).toBe(false);
  });

  it('R3.1: phrase text is case-insensitive and spacing is flexible; surrounding whitespace is ignored', () => {
    expect(ruleOf('  WHEN The  Target is NEAR, THE seeker SHALL step away from the target.  ').rule.cond).toBe('near');
  });
});

describe('parseSentence: errors', () => {
  it('R3.6: a sentence without a final period is an error at the end', () => {
    const e = errorOf('THE seeker SHALL do nothing');
    expect(e.message).toContain('period');
    expect(e.column).toBe('THE seeker SHALL do nothing'.length + 1);
  });

  it('R3.6: an unknown condition is an error with the column of the phrase', () => {
    const e = errorOf('WHEN the moon is up, THE seeker SHALL do nothing.');
    expect(e.message).toContain('unknown condition "the moon is up"');
    expect(e.column).toBe(6);
  });

  it('R3.6: an unknown action is an error with the column of the phrase', () => {
    const e = errorOf('THE seeker SHALL dance.');
    expect(e.message).toContain('unknown action "dance"');
    expect(e.column).toBe(18);
  });

  it('R3.6: IF form columns count the THEN', () => {
    const e = errorOf('IF the target is near, THEN THE seeker SHALL dance.');
    expect(e.column).toBe(46);
  });

  it('R3.6: "always" is not a phrase, and the error says how to write it', () => {
    const e = errorOf('WHEN always, THE seeker SHALL do nothing.');
    expect(e.message).toContain('ubiquitous');
    expect(e.column).toBe(6);
  });

  it('R3.6: a lowercase keyword is an error that names it', () => {
    expect(errorOf('When the target is near, THE seeker SHALL do nothing.')).toMatchObject({ column: 1 });
    expect(errorOf('When the target is near, THE seeker SHALL do nothing.').message).toContain('capitals');
    const shall = errorOf('THE seeker shall do nothing.');
    expect(shall.message).toContain('"shall"');
    expect(shall.column).toBe(12);
    expect(errorOf('IF the target is near, then THE seeker SHALL do nothing.').message).toContain('"then"');
    expect(errorOf('the seeker SHALL do nothing.').column).toBe(1);
  });

  it('R3.6: text that is not one of the forms is an error', () => {
    expect(errorOf('THE seeker should do nothing.').message).toContain('expected one of');
    expect(errorOf('WHEN the target is near THE seeker SHALL do nothing.').message).toContain('expected one of');
    expect(errorOf('IF the target is near, THE seeker SHALL do nothing.').message).toContain('expected one of');
    expect(errorOf('Hello there.').message).toContain('starts with');
    expect(errorOf('   ').message).toContain('empty');
  });

  it('R3.6: an invalid actor name is an error at the actor', () => {
    const e = errorOf('THE Big Seeker SHALL do nothing.');
    expect(e.message).toContain('not an actor name');
    expect(e.column).toBe(5);
  });

  it('R3.6: parseSentence returns errors and does not throw', () => {
    for (const text of ['', '.', 'THE', 'THE SHALL .', 'WHEN , THE SHALL x.', '"', 'IF , THEN THE a SHALL b.']) {
      expect(() => parse(text)).not.toThrow();
      expect(parse(text).ok).toBe(false);
    }
  });
});
