import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../../..');
const SPEC = '.kiro/specs/solver';

/** Requirement ids written as **S1.1** in a requirements file. */
function requirementIds(markdown: string): string[] {
  return [...markdown.matchAll(/\*\*(S\d+\.\d+)\*\*/g)].map((m) => m[1]!);
}

/** Requirement ids that start a test name: it('S1.1: ...'), it(`S1.1: ...`), test("S1.1: ..."). */
function testIds(source: string): string[] {
  return [...source.matchAll(/\b(?:it|test)(?:\.\w+)*\(\s*[`'"](S\d+\.\d+):/g)].map((m) => m[1]!);
}

function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'dist') return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return testFiles(full);
    return full.endsWith('.test.ts') ? [full] : [];
  });
}

const allTestFiles = ['packages', 'apps'].flatMap((top) =>
  readdirSync(join(root, top)).flatMap((pkg) => testFiles(join(root, top, pkg, 'test'))),
);

describe('solver spec coverage', () => {
  const required = requirementIds(readFileSync(join(root, SPEC, 'requirements.md'), 'utf8'));
  const found = new Map<string, string[]>();
  for (const file of allTestFiles) {
    for (const id of testIds(readFileSync(file, 'utf8'))) found.set(id, [...(found.get(id) ?? []), relative(root, file)]);
  }

  it('S1.6: every requirement id in the solver requirements.md has at least one test whose name starts with it', () => {
    expect(required.length).toBeGreaterThan(40);
    const missing = required.filter((id) => !found.has(id));
    expect(missing, `requirements without a test: ${missing.join(', ')}`).toEqual([]);
  });

  it('S1.6: every S id used in a test name exists in the solver requirements.md', () => {
    const unknown = [...found.keys()].filter((id) => !required.includes(id));
    expect(unknown, `test names with an unknown requirement id: ${unknown.join(', ')}`).toEqual([]);
  });

  it('S1.6: requirement ids are unique', () => {
    expect(new Set(required).size).toBe(required.length);
  });

  it('S1.6: every requirement id is referenced by a task in tasks.md, and every task refers to known ids', () => {
    const tasks = readFileSync(join(root, SPEC, 'tasks.md'), 'utf8');
    const referenced = new Set([...tasks.matchAll(/_Requirements: ([^_]+)_/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim())));
    const unreferenced = required.filter((id) => !referenced.has(id));
    expect(unreferenced, `requirements no task covers: ${unreferenced.join(', ')}`).toEqual([]);
    const unknown = [...referenced].filter((id) => !required.includes(id));
    expect(unknown, `tasks refer to unknown ids: ${unknown.join(', ')}`).toEqual([]);
  });

  it('S1.6: the scanners read ids the way the test names write them', () => {
    expect(requirementIds('- **S1.1** WHEN x\n- **S12.34** WHEN y\nS9.9 plain\n**R1.1** other')).toEqual(['S1.1', 'S12.34']);
    const src = ["it('S1.1: a', () => {})", 'it(`S2.2: ${x} b`, () => {})', 'test("S3.3: c", f)', "it.skip('S4.4: d', f)", "it('R5.5: e', f)"];
    expect(testIds(src.join('\n'))).toEqual(['S1.1', 'S2.2', 'S3.3', 'S4.4']);
  });
});
