import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALWAYS, Registry, parseSentence, printEvent, printRule, validateRule } from '../src/index';
import type { Rule } from '../src/index';
import { createToyRegistry } from './fixtures/toy-vocab';

const registry = createToyRegistry();

const actorArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}( [a-z0-9-]{1,6}){0,2}$/);

const ruleArb: fc.Arbitrary<Rule> = fc
  .record({
    kw: fc.constantFrom('WHEN', 'IF'),
    cond: fc.constantFrom(...registry.conditions().map((c) => c.id)),
    act: fc.constantFrom(...registry.actions().map((a) => a.id)),
    n: fc.integer({ min: 0, max: 999_999_999 }),
  })
  .chain(({ kw, cond, act, n }) =>
    fc.constantFrom<Rule>(
      { kw: '', cond: ALWAYS, act },
      registry.conditionHasParam(cond) ? { kw, cond, act, n } : { kw, cond, act },
    ),
  );

describe('printRule', () => {
  it('R3.7: prints each form in canonical text', () => {
    expect(printRule('seeker', { kw: '', cond: ALWAYS, act: 'approach' }, registry)).toBe('THE seeker SHALL step toward the target.');
    expect(printRule('seeker', { kw: 'WHEN', cond: 'near', act: 'retreat' }, registry)).toBe(
      'WHEN the target is near, THE seeker SHALL step away from the target.',
    );
    expect(printRule('seeker', { kw: 'IF', cond: 'late', act: 'rest', n: 9 }, registry)).toBe(
      'IF the clock is past 9, THEN THE seeker SHALL do nothing.',
    );
  });

  it('R3.7: messy input prints back in canonical form', () => {
    const ok = parseSentence('WHEN  The Clock IS past 03,  THE seeker SHALL  Do Nothing.', registry);
    expect(ok.ok).toBe(true);
    if (ok.ok && ok.value.type === 'rule') {
      expect(printRule(ok.value.actor, ok.value.rule, registry)).toBe('WHEN the clock is past 3, THE seeker SHALL do nothing.');
    }
  });

  it('R3.7: round trip: parse(print(rule)) equals the rule', () => {
    fc.assert(
      fc.property(actorArb, ruleArb, (actor, rule) => {
        const text = printRule(actor, rule, registry);
        const back = parseSentence(text, registry);
        expect(back).toEqual({ ok: true, value: { type: 'rule', actor, rule } });
      }),
      { numRuns: 500 },
    );
  });

  it('R3.7: printing is stable: print(parse(print(rule))) equals print(rule)', () => {
    fc.assert(
      fc.property(actorArb, ruleArb, (actor, rule) => {
        const once = printRule(actor, rule, registry);
        const parsed = parseSentence(once, registry);
        if (!parsed.ok || parsed.value.type !== 'rule') throw new Error('expected a rule');
        expect(printRule(parsed.value.actor, parsed.value.rule, registry)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it('R3.7: any text that parses prints and parses back to the same rule', () => {
    const tokens = [
      'THE', 'WHEN', 'IF', 'THEN', 'SHALL', 'seeker', 'the', 'target', 'is', 'near', 'far', 'switch', 'on', 'clock', 'past',
      'step', 'toward', 'away', 'from', 'do', 'nothing', 'flip', '12', ',', '.',
    ];
    // Glue words from the vocabulary with sentence keywords so that a good share of samples are valid.
    const textArb = fc.array(fc.constantFrom(...tokens), { maxLength: 14 }).map((t) => t.join(' ').replace(/ ([,.])/g, '$1'));
    const sentenceArb = fc.oneof(
      textArb,
      fc.tuple(actorArb, ruleArb).map(([a, r]) => printRule(a, r, registry)),
    );
    let parsedCount = 0;
    fc.assert(
      fc.property(sentenceArb, (text) => {
        const first = parseSentence(text, registry);
        if (!first.ok || first.value.type !== 'rule') return;
        parsedCount++;
        const again = parseSentence(printRule(first.value.actor, first.value.rule, registry), registry);
        expect(again).toEqual(first);
      }),
      { numRuns: 500 },
    );
    expect(parsedCount).toBeGreaterThan(0);
  });

  it('R3.6: parseSentence never throws, whatever the text', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (text) => {
        expect(() => parseSentence(text, registry)).not.toThrow();
      }),
      { numRuns: 1000 },
    );
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('THE', 'WHEN', 'IF', 'THEN', 'SHALL', 'write', '"', 'at', 'line', ',', '.', ' ', 'the target is near', '3'), {
          maxLength: 20,
        }),
        (parts) => {
          expect(() => parseSentence(parts.join(' '), registry)).not.toThrow();
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('R3.7: printing a rule that does not fit the registry throws', () => {
    expect(() => printRule('x', { kw: 'WHEN', cond: 'nope', act: 'rest' }, registry)).toThrow(/not registered/);
    expect(() => printRule('x', { kw: '', cond: 'near', act: 'rest' }, registry)).toThrow(/ubiquitous/);
    expect(() => printRule('x', { kw: 'WHEN', cond: ALWAYS, act: 'rest' }, registry)).toThrow(/ubiquitous/);
    expect(() => printRule('x', { kw: 'WHEN', cond: 'late', act: 'rest' }, registry)).toThrow(/needs n/);
    expect(() => printRule('x', { kw: 'WHEN', cond: 'near', act: 'rest', n: 1 }, registry)).toThrow(/takes no n/);
    expect(() => printRule('x', { kw: 'WHEN', cond: 'late', act: 'rest', n: -1 }, registry)).toThrow(/needs n/);
    expect(() => printRule('x', { kw: 'WHEN', cond: 'near', act: 'dance' }, registry)).toThrow(/not registered/);
  });

  it('R3.7: validateRule accepts what the parser produces', () => {
    expect(validateRule({ kw: 'IF', cond: 'late', act: 'rest', n: 4 }, registry)).toBeNull();
  });
});

describe('printEvent', () => {
  const eventArb = fc.record({
    tick: fc.integer({ min: 0, max: 999_999_999 }),
    actor: actorArb,
    line: fc.integer({ min: 1, max: 999_999_999 }),
    rule: ruleArb,
  });

  it('R3.7: prints a scheduled write in canonical text', () => {
    expect(printEvent({ tick: 6, actor: 'seeker', line: 1, rule: { kw: 'WHEN', cond: 'near', act: 'approach' } }, registry)).toBe(
      'WHEN the clock strikes 6, THE seeker SHALL write "WHEN the target is near, THE seeker SHALL step toward the target." at line 1.',
    );
  });

  it('R3.7: round trip: parse(printEvent(event)) equals the event', () => {
    fc.assert(
      fc.property(eventArb, (event) => {
        const back = parseSentence(printEvent(event, registry), registry);
        expect(back).toEqual({ ok: true, value: { type: 'write', event } });
      }),
      { numRuns: 500 },
    );
  });

  it('R3.7: printing an event that does not fit throws', () => {
    const rule: Rule = { kw: '', cond: ALWAYS, act: 'rest' };
    expect(() => printEvent({ tick: 1, actor: 'a', line: 0, rule }, registry)).toThrow(/line 0/);
    expect(() => printEvent({ tick: -1, actor: 'a', line: 1, rule }, registry)).toThrow(/tick -1/);
    expect(() => printEvent({ tick: 1, actor: 'a', line: 1, rule: { ...rule, act: 'x' } }, registry)).toThrow(/not registered/);
    expect(() => printEvent({ tick: 1, actor: 'a', line: 1, rule }, new Registry())).toThrow(/schedule condition/);
  });
});
