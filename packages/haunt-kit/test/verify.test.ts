import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../../apps/midnight-ward/src/levels';
import type { LevelDef } from '../../../apps/midnight-ward/src/levels';
import { emptyBoard, solveLevel } from '../../../apps/midnight-ward/src/solve';
import { checkScareCue } from '../../../apps/scare-cue/src/level';
import { verify } from '../../../scripts/verify-levels';

const root = resolve(import.meta.dirname, '../../..');

function runVerify(): { code: number | null; out: string; err: string; ms: number } {
  const start = performance.now();
  const r = spawnSync(process.execPath, [join(root, 'scripts/verify.mjs')], { encoding: 'utf8', cwd: root });
  return { code: r.status, out: r.stdout, err: r.stderr, ms: performance.now() - start };
}

describe('pnpm verify', () => {
  const run = runVerify();

  it('S10.1: prints one table row per check: three Midnight Ward levels and two Scare Cue checks, with the time of each', () => {
    const lines = run.out.split('\n');
    expect(lines[0]).toMatch(/^app\s+level\s+mode\s+result\s+detail\s+time$/);
    const rows = lines.filter((l) => /^(midnight-ward|scare-cue)\s/.test(l));
    expect(rows.map((r) => r.split(/\s{2,}/).slice(0, 3))).toEqual([
      ['midnight-ward', 'Prologue', 'solutions'],
      ['midnight-ward', 'Night I', 'solutions'],
      ['midnight-ward', 'Night IV', 'solutions'],
      ['scare-cue', 'Default rules', 'counterexample'],
      ['scare-cue', 'Both fixes at line 1', 'counterexample'],
    ]);
    for (const row of rows) expect(row).toMatch(/\d+ ms$/);
    expect(run.out).toMatch(/verify: ok, 5 checks in \d+\.\d\d s/);
  });

  it('S10.1: the rows cover every level of the Midnight Ward app', () => {
    expect(LEVELS.map((l) => l.name).every((name) => run.out.includes(name))).toBe(true);
  });

  it('S10.2: exits with code 0 when every expectation holds', () => {
    expect(run.err).toBe('');
    expect(run.code).toBe(0);
  });

  it('S10.2: reports an unsolvable level and a winning empty board as failures', () => {
    const impossible: LevelDef = { ...LEVELS[0]!, name: 'Impossible', items: [], cards: [] };
    const report = verify({ levels: [impossible] });
    expect(report.failures).toEqual(['Impossible has no solution']);
    const toothless: LevelDef = { ...LEVELS[0]!, name: 'Toothless', specText: 'THE girl SHALL stay still.\nTHE wisp SHALL stay still.' };
    expect(verify({ levels: [toothless] }).failures).toEqual(['Toothless: the empty board ends complete, it should lose']);
  });

  it('S10.2: reports a Scare Cue check whose verdict is not the expected one', () => {
    const report = verify({ levels: [], scareCue: [{ level: 'Broken', inserts: [], expect: 'safe' }] });
    expect(report.failures).toEqual(['Scare Cue "Broken" is unsafe, it should be safe']);
  });

  it('S10.3: finishes in under 3 seconds, including start-up', () => {
    expect(run.ms).toBeLessThan(3000);
    const seconds = Number(/checks in (\d+\.\d\d) s/.exec(run.out)![1]);
    expect(seconds).toBeLessThan(3);
  });

  it('S10.4: the numbers in the table are the numbers the solver returns', () => {
    const fmt = (n: number): string => n.toLocaleString('en-US');
    for (const level of LEVELS) {
      const { solutions, total } = solveLevel(level);
      const row = run.out.split('\n').find((l) => l.startsWith('midnight-ward') && l.includes(level.name))!;
      expect(row, level.name).toContain(`${fmt(solutions)} of ${fmt(total)}`);
      expect(row, level.name).toContain(`empty board: ${emptyBoard(level)}`);
    }
    const unsafe = checkScareCue();
    if (unsafe.verdict !== 'unsafe') throw new Error('expected unsafe');
    expect(run.out).toContain(unsafe.counterexamples.map((c) => `${c.property} at bell ${c.tick}`).join(', '));
  });

  it('S10.4: the safe row shows the path count, the scared share and the states of a real run', () => {
    const fixes = checkScareCue([{ card: 0, at: 0 }, { card: 1, at: 0 }]);
    expect(fixes.verdict).toBe('safe');
    const pct = Math.round((100 * fixes.goalPaths) / fixes.paths);
    expect(run.out).toContain(`${fixes.paths.toLocaleString('en-US')} paths, ${pct}% still scared, ${fixes.states.toLocaleString('en-US')} states`);
  });

  it('S10.4: the verify scripts do not contain the oracle numbers', () => {
    const text = ['scripts/verify.mjs', 'scripts/verify-levels.ts'].map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
    for (const n of ['4008562', '4,008,562', '2145', '2,145', '329', '741', '1482', '1,482', '92']) {
      expect(text, n).not.toMatch(new RegExp(`(?<![\\w.])${n}(?![\\w.])`));
    }
  });
});
