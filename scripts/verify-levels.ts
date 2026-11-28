// Runs the solver on every level of both apps. Loaded by scripts/verify.mjs through Vite, which reads the
// TypeScript sources and the ?raw spec files exactly as the apps do. Every number in the report is a value
// the solver returned in this run. Nothing here is typed in from the prototype.
import { LEVELS } from '../apps/midnight-ward/src/levels';
import type { LevelDef } from '../apps/midnight-ward/src/levels';
import { emptyBoard, solveLevel } from '../apps/midnight-ward/src/solve';
import { CARDS, checkScareCue } from '../apps/scare-cue/src/level';
import type { CardInsert } from '../apps/scare-cue/src/level';

export interface Row {
  app: string;
  level: string;
  mode: string;
  result: string;
  detail: string;
  ms: number;
}

export interface Report {
  rows: Row[];
  /** Expectations that did not hold. Empty when verify passes. */
  failures: string[];
}

const fmt = (n: number): string => n.toLocaleString('en-US');

function timed<T>(run: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
}

/** One Scare Cue check: cards to insert and the verdict that is expected. */
export interface ScareCueCheck {
  level: string;
  inserts: CardInsert[];
  expect: 'safe' | 'unsafe';
}

export interface VerifyOptions {
  /** Midnight Ward levels to check. Default: every level of the app. */
  levels?: readonly LevelDef[];
  /** Scare Cue checks. Default: the default rules (must be unsafe) and both fixes at line 1 (must be safe). */
  scareCue?: ScareCueCheck[];
}

export function verify(options: VerifyOptions = {}): Report {
  const rows: Row[] = [];
  const failures: string[] = [];

  for (const level of options.levels ?? LEVELS) {
    const { value: found, ms } = timed(() => solveLevel(level));
    const empty = emptyBoard(level);
    rows.push({
      app: 'midnight-ward',
      level: level.name,
      mode: 'solutions',
      result: `${fmt(found.solutions)} of ${fmt(found.total)}`,
      detail: `empty board: ${empty}`,
      ms,
    });
    if (found.solutions === 0) failures.push(`${level.name} has no solution`);
    if (empty !== 'violated') failures.push(`${level.name}: the empty board ends ${empty}, it should lose`);
  }

  const fixes: CardInsert[] = CARDS.flatMap((card, index) => (card.role === 'fix' ? [{ card: index, at: 0 }] : []));
  const checks: ScareCueCheck[] = options.scareCue ?? [
    { level: 'Default rules', inserts: [], expect: 'unsafe' },
    { level: 'Both fixes at line 1', inserts: fixes, expect: 'safe' },
  ];
  for (const check of checks) {
    const { value: result, ms } = timed(() => checkScareCue(check.inserts));
    const detail =
      result.verdict === 'safe'
        ? `${fmt(result.paths)} paths, ${Math.round((100 * result.goalPaths) / result.paths)}% still scared, ${fmt(result.states)} states`
        : result.counterexamples.map((c) => `${c.property} at bell ${c.tick}`).join(', ');
    rows.push({ app: 'scare-cue', level: check.level, mode: 'counterexample', result: result.verdict, detail, ms });
    if (result.verdict !== check.expect) failures.push(`Scare Cue "${check.level}" is ${result.verdict}, it should be ${check.expect}`);
  }

  return { rows, failures };
}

export function renderTable(rows: Row[]): string {
  const head = ['app', 'level', 'mode', 'result', 'detail', 'time'];
  const body = rows.map((r) => [r.app, r.level, r.mode, r.result, r.detail, `${r.ms.toFixed(0)} ms`]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i]!.length)));
  const line = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ').trimEnd();
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}
