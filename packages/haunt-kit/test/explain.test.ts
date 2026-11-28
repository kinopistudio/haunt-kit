import { describe, expect, it } from 'vitest';
import { cloneWorld, explain, insertLine, loadSpec, recordRun } from '../src/index';
import type { Recording, Rule } from '../src/index';
import { contactProperty, createToyRegistry, toyWorld } from './fixtures/toy-vocab';

const registry = createToyRegistry().addProperty(contactProperty);
const rows = ['#########', '#S.....T#', '#########'];

function rule(text: string): Rule {
  const spec = loadSpec(text, registry).spec;
  return Object.values(spec.actors)[0]![0]!;
}

function record(spec: string, opts: { cards?: { at: number; text: string }[]; properties?: string[]; rows?: string[]; horizon?: number } = {}): Recording {
  const w = toyWorld(opts.rows ?? rows, spec, registry, { properties: opts.properties ?? [], horizon: opts.horizon ?? 12 });
  for (const card of opts.cards ?? []) insertLine(w, 'seeker', card.at, rule(card.text), 'card');
  return recordRun(w, registry);
}

const STEP = 'THE seeker SHALL step toward the target.';

describe('explain', () => {
  it('U4.1: returns one sentence for each finding, in the same order', () => {
    const rec = record(STEP, {
      properties: ['no_contact'],
      cards: [
        { at: 1, text: 'WHEN the target is near, THE seeker SHALL do nothing.' },
        { at: 0, text: 'WHEN the switch is on, THE seeker SHALL do nothing.' },
      ],
    });
    const result = explain(rec, registry);
    expect(result.findings.length).toBeGreaterThan(2);
    expect(result.sentences).toHaveLength(result.findings.length);
  });

  it('U4.1: does not change the recording or the registry', () => {
    const rec = record(STEP, { properties: ['no_contact'], cards: [{ at: 1, text: 'THE seeker SHALL do nothing.' }] });
    const copy = structuredClone(rec);
    const conditions = registry.conditions().map((c) => c.id);
    explain(rec, registry, { actorName: (id) => id.toUpperCase() });
    expect(rec).toEqual(copy);
    expect(registry.conditions().map((c) => c.id)).toEqual(conditions);
  });

  it('U4.2: a violated run starts with the violation, the actor that broke it and the line that ran', () => {
    const rec = record(STEP, { properties: ['no_contact'] });
    expect(rec.status).toBe('violated');
    const { findings, sentences } = explain(rec, registry, { tickWord: 'bell', actorName: (id) => `The ${id}` });
    expect(findings[0]).toEqual({
      kind: 'violation',
      tick: 6,
      property: 'no_contact',
      message: 'seeker reached the target',
      actors: ['seeker'],
      turnActor: 'seeker',
      line: { id: 1, index: 0, text: STEP, origin: 'spec' },
    });
    expect(sentences[0]).toBe(`Bell 6: seeker reached the target. The seeker was running line 1: \u201c${STEP}\u201d`);
  });

  it('U4.2: a violation by a turn where no line ran has a null line and a shorter sentence', () => {
    // The seeker has no lines and already stands on the target, so the property fails on its first turn.
    const w = toyWorld(['######', '#S..T#', '######'], STEP, registry, { properties: ['no_contact'] });
    w.actors[0]!.lines = [];
    w.actors[0]!.pos = { ...w.actors.find((a) => a.kind === 'target')!.pos };
    const rec = recordRun(w, registry);
    expect(rec.status).toBe('violated');
    const result = explain(rec, registry);
    expect(result.findings[0]).toMatchObject({ kind: 'violation', tick: 1, line: null });
    expect(result.sentences[0]).toBe('Tick 1: seeker reached the target.');
  });

  it('U4.3: each scheduled write is a rewrite finding with the tick, the actor, the index and the text', () => {
    const spec = [
      'THE seeker SHALL do nothing.',
      'WHEN the clock strikes 3, THE seeker SHALL write "THE seeker SHALL step away from the target." at line 1.',
      'WHEN the clock strikes 5, THE seeker SHALL write "THE seeker SHALL step toward the target." at line 3.',
    ].join('\n');
    const rec = record(spec, { horizon: 6 });
    const { findings, sentences } = explain(rec, registry, { tickWord: 'bell' });
    const rewrites = findings.filter((f) => f.kind === 'rewrite');
    expect(rewrites.map((f) => [f.tick, f.actor, f.line.index, f.line.text])).toEqual([
      [3, 'seeker', 0, 'THE seeker SHALL step away from the target.'],
      [5, 'seeker', 2, 'THE seeker SHALL step toward the target.'],
    ]);
    expect(sentences[0]).toBe(
      'At bell 3, seeker wrote itself a new line 1: \u201cTHE seeker SHALL step away from the target.\u201d The lines under it moved down by one.',
    );
    // At bell 5 the lines are: rewrite, spec, and the new one lands at line 3, the last: nothing moved.
    expect(sentences[1]).toBe('At bell 5, seeker wrote itself a new line 3: \u201cTHE seeker SHALL step toward the target.\u201d');
  });

  it('U4.4: a line that never fired and was true under a line above it reads exactly like the example', () => {
    const rec = record(STEP, { cards: [{ at: 1, text: 'WHEN the target is far, THE seeker SHALL do nothing.' }], horizon: 6 });
    const { findings, sentences } = explain(rec, registry, { tickWord: 'bell', actorName: () => 'Wisp I', originNote: { card: 'your card' } });
    expect(sentences).toEqual(['Line 2 of Wisp I (your card) never fired: line 1 was true first, so it shadowed it at bell 1.']);
    expect(findings[0]).toMatchObject({ kind: 'shadowed', actor: 'seeker', tick: 1, line: { index: 1, origin: 'card' }, by: { index: 0, text: STEP } });
  });

  it('U4.4: the tick and the indexes are the ones at the tick of the shadowing, even after a rewrite shifts lines', () => {
    const spec = [STEP, 'WHEN the clock strikes 4, THE seeker SHALL write "WHEN the switch is on, THE seeker SHALL do nothing." at line 1.'].join('\n');
    const rec = record(spec, { cards: [{ at: 1, text: 'THE seeker SHALL do nothing.' }], horizon: 6 });
    const { sentences } = explain(rec, registry, { tickWord: 'bell' });
    // The card sat at line 2 and was shadowed at bell 1. The write at bell 4 moves it to line 3, but the first shadowing was at bell 1.
    expect(sentences).toContain('Line 2 of seeker never fired: line 1 was true first, so it shadowed it at bell 1.');
  });

  it('U4.4: a line that fires on some ticks and is shadowed on others is not reported', () => {
    const rec = record('WHEN the target is far, THE seeker SHALL step toward the target.\nTHE seeker SHALL do nothing.');
    expect(explain(rec, registry).findings).toEqual([]);
  });

  it('U4.5: a card that was never true is a never_true finding with the condition text', () => {
    const rec = record(STEP, { cards: [{ at: 0, text: 'WHEN the clock is past 20, THE seeker SHALL do nothing.' }], horizon: 6 });
    const { findings, sentences } = explain(rec, registry, { tickWord: 'bell', originNote: { card: 'your card' } });
    expect(findings).toEqual([
      { kind: 'never_true', actor: 'seeker', line: { id: expect.any(Number), index: 0, text: 'WHEN the clock is past 20, THE seeker SHALL do nothing.', origin: 'card' }, condition: 'the clock is past 20' },
    ]);
    expect(sentences).toEqual(['Line 1 of seeker (your card) never fired: \u201cthe clock is past 20\u201d was never true when it was checked.']);
  });

  it('U4.5: lines of the spec are only reported as never true when their origin is listed', () => {
    const spec = [STEP, 'WHEN the switch is on, THE seeker SHALL do nothing.'].join('\n');
    const rec = record(spec, { horizon: 6 });
    expect(explain(rec, registry).findings).toEqual([]);
    const listed = explain(rec, registry, { neverTrueOrigins: ['card', 'spec'] }).findings;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: 'never_true', condition: 'the switch is on' });
  });

  it('U4.6: names, tick word and origin notes come from the options; the defaults are the ids and "tick"', () => {
    const rec = record(STEP, { cards: [{ at: 1, text: 'THE seeker SHALL do nothing.' }], horizon: 4 });
    expect(explain(rec, registry).sentences).toEqual(['Line 2 of seeker never fired: line 1 was true first, so it shadowed it at tick 1.']);
    expect(explain(rec, registry, { actorName: () => 'Wisp II', tickWord: 'bell', originNote: { card: 'your card', rewrite: 'written' } }).sentences).toEqual([
      'Line 2 of Wisp II (your card) never fired: line 1 was true first, so it shadowed it at bell 1.',
    ]);
  });

  it('U4.7: a clean run has no findings', () => {
    const rec = record(STEP, { horizon: 4 });
    expect(rec.status).toBe('complete');
    expect(explain(rec, registry)).toEqual({ findings: [], sentences: [] });
  });

  it('U4.7: every number in a sentence is a tick or a 1-based line number from the recording', () => {
    const spec = [STEP, 'WHEN the clock strikes 4, THE seeker SHALL write "WHEN the target is far, THE seeker SHALL do nothing." at line 1.'].join('\n');
    const rec = record(spec, { properties: ['no_contact'], cards: [{ at: 1, text: 'THE seeker SHALL do nothing.' }, { at: 0, text: 'WHEN the clock is past 30, THE seeker SHALL do nothing.' }] });
    const { findings, sentences } = explain(rec, registry, { tickWord: 'bell' });
    const allowed = new Set<number>();
    for (const t of rec.traces) allowed.add(t.tick);
    for (const frame of rec.frames) for (const a of frame.actors) a.lines.forEach((_, i) => allowed.add(i + 1));
    // Numbers that belong to rule text (the 4 in "strikes 4", the 30 in "past 30") are inside quotes or condition names.
    for (const sentence of sentences) {
      const outside = sentence.replace(/\u201c[^\u201d]*\u201d/g, '');
      for (const m of outside.matchAll(/\b\d+\b/g)) expect(allowed.has(Number(m[0])), `${m[0]} in "${sentence}"`).toBe(true);
    }
    expect(findings.length).toBe(sentences.length);
  });

  it('U4.8: findings are ordered violation, rewrites, shadowed lines, never-true lines', () => {
    const spec = [STEP, 'WHEN the clock strikes 2, THE seeker SHALL write "THE seeker SHALL step toward the target." at line 3.'].join('\n');
    const rec = record(spec, {
      properties: ['no_contact'],
      cards: [
        { at: 0, text: 'WHEN the clock is past 30, THE seeker SHALL do nothing.' },
        { at: 2, text: 'THE seeker SHALL do nothing.' },
      ],
    });
    const kinds = explain(rec, registry).findings.map((f) => f.kind);
    expect(kinds[0]).toBe('violation');
    const rank = { violation: 0, rewrite: 1, shadowed: 2, never_true: 3 } as const;
    expect([...kinds].sort((a, b) => rank[a] - rank[b])).toEqual(kinds);
    expect(new Set(kinds)).toEqual(new Set(['violation', 'rewrite', 'shadowed', 'never_true']));
  });

  it('U4.8: shadowed lines come by actor order, then line order', () => {
    const rec = record('THE seeker SHALL do nothing.', {
      cards: [{ at: 1, text: 'THE seeker SHALL step toward the target.' }, { at: 2, text: 'THE seeker SHALL step away from the target.' }],
      horizon: 3,
    });
    const shadowed = explain(rec, registry).findings.filter((f) => f.kind === 'shadowed');
    expect(shadowed.map((f) => f.line.index)).toEqual([1, 2]);
  });

  it('U4.1: explaining a clone of the world gives the same text twice', () => {
    const w = toyWorld(rows, STEP, registry, { properties: ['no_contact'] });
    const a = explain(recordRun(w, registry), registry);
    const b = explain(recordRun(cloneWorld(w), registry), registry);
    expect(a).toEqual(b);
  });
});
