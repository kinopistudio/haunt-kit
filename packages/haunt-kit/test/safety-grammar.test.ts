import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseSentence, printSafety, validateSafety } from '../src/index';
import type { SafetyRule } from '../src/index';
import { safetyArbFor } from './fixtures/arbitraries';
import { createToyRegistry } from './fixtures/toy-vocab';

const registry = createToyRegistry();

function parseSafety(text: string): SafetyRule {
  const result = parseSentence(text, registry);
  if (!result.ok || result.value.type !== 'safety') throw new Error(`expected a safety rule: ${JSON.stringify(result)}`);
  return result.value.rule;
}

function errorOf(text: string): { message: string; column: number } {
  const result = parseSentence(text, registry);
  if (result.ok) throw new Error(`expected an error for: ${text}`);
  return result.error;
}

describe('safety rules: parse', () => {
  it('S6.1: THE <actor> SHALL NOT <prohibition> WHILE <condition>. gives actor, prohibition and condition', () => {
    expect(parseSafety('THE seeker SHALL NOT be on WHILE the target is near.')).toEqual({
      actor: 'seeker',
      prohibited: 'be_on',
      cond: 'near',
    });
  });

  it('S6.1: a condition with {n} stores n, and extra spaces and phrase case are allowed', () => {
    expect(parseSafety('  THE  watcher  SHALL  NOT  Be   ON  WHILE  the clock is past 007 . ')).toEqual({
      actor: 'watcher',
      prohibited: 'be_on',
      cond: 'late',
      n: 7,
    });
  });

  it('S6.1: an actor name may have several words and hyphens', () => {
    expect(parseSafety('THE jump-scare machine SHALL NOT be on WHILE the switch is on.').actor).toBe('jump-scare machine');
  });

  it('S6.1: a safety sentence is not parsed as a rule, and the three rule forms still parse', () => {
    expect(parseSentence('THE seeker SHALL do nothing.', registry)).toMatchObject({ ok: true, value: { type: 'rule' } });
    expect(parseSentence('THE seeker SHALL NOT be on WHILE the switch is on.', registry)).toMatchObject({ ok: true, value: { type: 'safety' } });
  });

  it('S6.2: an unknown prohibition is an error at the phrase', () => {
    const text = 'THE seeker SHALL NOT dance WHILE the target is near.';
    expect(errorOf(text)).toEqual({ message: 'unknown prohibition "dance"', column: text.indexOf('dance') + 1 });
  });

  it('S6.2: an unknown condition is an error at the phrase', () => {
    const text = 'THE seeker SHALL NOT be on WHILE the moon is out.';
    expect(errorOf(text)).toEqual({ message: 'unknown condition "the moon is out"', column: text.indexOf('the moon') + 1 });
  });

  it('S6.2: "always" is not a condition of a safety rule', () => {
    const text = 'THE seeker SHALL NOT be on WHILE always.';
    const error = errorOf(text);
    expect(error.message).toMatch(/unknown condition "always".*needs a condition/);
    expect(error.column).toBe(text.indexOf('always') + 1);
  });

  it('S6.2: a safety sentence without WHILE is an error at NOT that shows the form', () => {
    const text = 'THE seeker SHALL NOT be on.';
    const error = errorOf(text);
    expect(error.message).toBe('a safety rule reads: THE <actor> SHALL NOT <prohibition> WHILE <condition>.');
    expect(error.column).toBe(text.indexOf('NOT') + 1);
  });

  it('S6.2: SHALL NOT in a WHEN, IF or write sentence is an error', () => {
    for (const text of [
      'WHEN the target is near, THE seeker SHALL NOT be on.',
      'IF the target is near, THEN THE seeker SHALL NOT be on.',
      'WHEN the clock strikes 3, THE seeker SHALL NOT write "THE seeker SHALL do nothing." at line 1.',
    ]) {
      const error = errorOf(text);
      expect(error.message, text).toMatch(/^a safety rule reads/);
      expect(error.column, text).toBe(text.indexOf('NOT') + 1);
    }
  });

  it('S6.2: a lowercase keyword is an error that names it', () => {
    expect(errorOf('THE seeker shall NOT be on WHILE the target is near.')).toEqual({
      message: 'the keyword "shall" must be written in capitals: SHALL',
      column: 12,
    });
    expect(errorOf('THE seeker SHALL NOT be on while the target is near.').message).toBe('the keyword "while" must be written in capitals: WHILE');
    expect(errorOf('THE seeker SHALL not be on WHILE the target is near.').message).toBe('the keyword "not" must be written in capitals: NOT');
  });

  it('S6.2: an invalid actor name is an error at the actor', () => {
    expect(errorOf('THE Seeker SHALL NOT be on WHILE the target is near.')).toMatchObject({ column: 5 });
  });

  it('S6.2: parseSentence returns errors for any text and does not throw', () => {
    const tokens = ['THE', 'SHALL', 'NOT', 'WHILE', 'WHEN', 'IF', 'THEN', 'seeker', 'be', 'on', 'the', 'target', 'is', 'near', 'write', '"', '3', ',', '.', 'shall', 'while'];
    const textArb = fc.array(fc.constantFrom(...tokens), { maxLength: 14 }).map((t) => t.join(' ').replace(/ ([,.])/g, '$1'));
    fc.assert(
      fc.property(fc.oneof(textArb, fc.string()), (text) => {
        const result = parseSentence(text, registry);
        expect(typeof result.ok).toBe('boolean');
        if (!result.ok) {
          expect(result.error.column).toBeGreaterThanOrEqual(1);
          expect(result.error.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 1000 },
    );
  });
});

describe('safety rules: print', () => {
  it('S6.3: prints the canonical form', () => {
    expect(printSafety({ actor: 'seeker', prohibited: 'be_on', cond: 'near' }, registry)).toBe(
      'THE seeker SHALL NOT be on WHILE the target is near.',
    );
    expect(printSafety({ actor: 'seeker', prohibited: 'be_on', cond: 'late', n: 9 }, registry)).toBe(
      'THE seeker SHALL NOT be on WHILE the clock is past 9.',
    );
  });

  it('S6.3: round trip: parse(print(rule)) equals the rule', () => {
    fc.assert(
      fc.property(safetyArbFor(registry), (rule) => {
        expect(parseSentence(printSafety(rule, registry), registry)).toEqual({ ok: true, value: { type: 'safety', rule } });
      }),
      { numRuns: 500 },
    );
  });

  it('S6.3: a rule that does not fit the registry does not validate and does not print', () => {
    const bad: SafetyRule[] = [
      { actor: 'a', prohibited: 'nope', cond: 'near' },
      { actor: 'a', prohibited: 'be_on', cond: 'nope' },
      { actor: 'a', prohibited: 'be_on', cond: 'always' },
      { actor: 'a', prohibited: 'be_on', cond: 'late' },
      { actor: 'a', prohibited: 'be_on', cond: 'near', n: 1 },
    ];
    for (const rule of bad) {
      expect(validateSafety(rule, registry), JSON.stringify(rule)).not.toBeNull();
      expect(() => printSafety(rule, registry)).toThrow(/cannot print safety rule/);
    }
    expect(validateSafety({ actor: 'a', prohibited: 'be_on', cond: 'late', n: 2 }, registry)).toBeNull();
  });
});
