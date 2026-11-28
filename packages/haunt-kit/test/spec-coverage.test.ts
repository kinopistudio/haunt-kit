import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../../..');
const SPEC = '.kiro/specs/rule-engine';

/** Requirement ids written as **R1.1** in a requirements file. */
function requirementIds(markdown: string): string[] {
  return [...markdown.matchAll(/\*\*(R\d+\.\d+)\*\*/g)].map((m) => m[1]!);
}

/** Requirement ids that start a test name: it('R1.1: ...'), it(`R1.1: ...`), test("R1.1: ..."). */
function testIds(source: string): string[] {
  return [...source.matchAll(/\b(?:it|test)(?:\.\w+)*\(\s*[`'"](R\d+\.\d+):/g)].map((m) => m[1]!);
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

describe('spec coverage', () => {
  const required = requirementIds(readFileSync(join(root, SPEC, 'requirements.md'), 'utf8'));
  const found = new Map<string, string[]>();
  for (const file of allTestFiles) {
    for (const id of testIds(readFileSync(file, 'utf8'))) found.set(id, [...(found.get(id) ?? []), relative(root, file)]);
  }

  it('R1.8: every requirement id in requirements.md has at least one test whose name starts with it', () => {
    expect(required.length).toBeGreaterThan(0);
    const missing = required.filter((id) => !found.has(id));
    expect(missing, `requirements without a test: ${missing.join(', ')}`).toEqual([]);
  });

  it('R1.8: every id used in a test name exists in requirements.md', () => {
    const unknown = [...found.keys()].filter((id) => !required.includes(id));
    expect(unknown, `test names with an unknown requirement id: ${unknown.join(', ')}`).toEqual([]);
  });

  it('R1.8: requirement ids are unique', () => {
    expect(new Set(required).size).toBe(required.length);
  });

  it('R1.8: every requirement id is referenced by a task in tasks.md', () => {
    const tasks = readFileSync(join(root, SPEC, 'tasks.md'), 'utf8');
    const referenced = new Set([...tasks.matchAll(/_Requirements: ([^_]+)_/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim())));
    const unreferenced = required.filter((id) => !referenced.has(id));
    expect(unreferenced, `requirements no task covers: ${unreferenced.join(', ')}`).toEqual([]);
    const unknown = [...referenced].filter((id) => !required.includes(id));
    expect(unknown, `tasks refer to unknown ids: ${unknown.join(', ')}`).toEqual([]);
  });

  it('R1.8: the scanners read ids the way the test names write them', () => {
    expect(requirementIds('- **R1.1** WHEN x\n- **R12.34** WHEN y\nR9.9 plain')).toEqual(['R1.1', 'R12.34']);
    const src = ["it('R1.1: a', () => {})", 'it(`R2.2: ${x} b`, () => {})', 'test("R3.3: c", f)', "it.skip('R4.4: d', f)", "it('not R5.5: e', f)"];
    expect(testIds(src.join('\n'))).toEqual(['R1.1', 'R2.2', 'R3.3', 'R4.4']);
  });
});
