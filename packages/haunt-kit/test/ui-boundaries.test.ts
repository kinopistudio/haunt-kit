import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as kit from '../src/index';
import { createToyRegistry, toyWorld } from './fixtures/toy-vocab';

const src = join(import.meta.dirname, '../src');
const uiFiles = readdirSync(join(src, 'ui')).filter((f) => f.endsWith('.ts')).map((f) => join(src, 'ui', f));
const pureFiles = ['trace/stats.ts', 'trace/explain.ts', 'engine/record.ts'].map((f) => join(src, f));

/** The module an import goes to: `../world/types` is `world`, `./model` (inside `src/ui`) is `ui`. */
function importedModules(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => {
    const spec = m[1]!;
    if (!spec.startsWith('.')) return spec;
    const parts = relative(src, join(file, '..', spec)).split('/');
    return parts[0]!;
  });
}

describe('ui boundaries', () => {
  it('U1.1: the UI lives in src/ui, is exported from the entry point, and imports only grammar, world and trace', () => {
    expect(existsSync(join(src, 'ui/index.ts'))).toBe(true);
    for (const name of ['SpecBook', 'ReplayBar', 'bookModel', 'bookState', 'replayReduce', 'replayBarModel', 'installSpecBookStyles', 'SPEC_BOOK_CSS', 'recordRun', 'lineStats', 'explain']) {
      expect((kit as Record<string, unknown>)[name], name).toBeDefined();
    }
    for (const file of uiFiles) {
      for (const module of importedModules(file)) expect(['ui', 'grammar', 'world', 'trace'], `${relative(src, file)} imports ${module}`).toContain(module);
    }
  });

  it('U1.2: the UI, statistics, explanation and recording files contain no game words, in code or comments', () => {
    const words = /\b(?:ghosts?|girls?|wisps?|shades?|snuffers?|candles?|salt|bells?|visitors?|fog|jump|dawn|nights?)\b/i;
    for (const file of [...uiFiles, ...pureFiles]) {
      const text = readFileSync(file, 'utf8');
      expect(words.exec(text)?.[0] ?? null, relative(src, file)).toBeNull();
    }
  });

  it('U1.3: importing the kit without a DOM works, and no UI file reads window, navigator or storage', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    expect(typeof kit.SpecBook).toBe('function');
    for (const file of uiFiles) {
      const text = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, relative(src, file)).not.toMatch(/\b(?:window|navigator|localStorage|sessionStorage|globalThis\.document)\b/);
      // `document` is only ever a parameter or `ownerDocument`, never a global read.
      expect(text, relative(src, file)).not.toMatch(/(?<![.\w])document\./);
    }
  });

  it('U1.3: the style installer and the components take their document from the element or the argument', () => {
    expect(() => kit.installSpecBookStyles(undefined as unknown as Document)).toThrow();
    expect(kit.SPEC_BOOK_CSS.length).toBeGreaterThan(500);
  });

  it('U1.4: the statistics, explanation and recording files use no randomness, clock or DOM global', () => {
    for (const file of pureFiles) {
      const text = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, relative(src, file)).not.toMatch(/Math\.random|\bDate\b|\bperformance\b|\bwindow\b|\bdocument\b|\bnavigator\b|setTimeout|setInterval/);
    }
  });

  it('U1.4: recording, statistics and explanation give equal results when run twice on equal inputs', () => {
    const registry = createToyRegistry();
    const make = () => toyWorld(['#########', '#S.....T#', '#########'], 'THE seeker SHALL do nothing.\nTHE seeker SHALL step toward the target.', registry);
    const a = kit.recordRun(make(), registry);
    const b = kit.recordRun(make(), registry);
    expect(a).toEqual(b);
    expect([...kit.lineStats(a)]).toEqual([...kit.lineStats(b)]);
    expect(kit.explain(a, registry)).toEqual(kit.explain(b, registry));
    expect(kit.bookState(a, 5)).toEqual(kit.bookState(b, 5));
  });
});

// ---- coverage: every requirement id of the spec has a test and a task ----

const root = join(import.meta.dirname, '../../..');
const SPEC = '.kiro/specs/spec-book-ui';

const requirementIds = (markdown: string): string[] => [...markdown.matchAll(/\*\*(U\d+\.\d+)\*\*/g)].map((m) => m[1]!);
const testIds = (source: string): string[] => [...source.matchAll(/\b(?:it|test)(?:\.\w+)*\(\s*[`'"](U\d+\.\d+):/g)].map((m) => m[1]!);

function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'dist') return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return testFiles(full);
    return full.endsWith('.test.ts') ? [full] : [];
  });
}

describe('spec-book-ui spec coverage', () => {
  const required = requirementIds(readFileSync(join(root, SPEC, 'requirements.md'), 'utf8'));
  const found = new Map<string, string[]>();
  for (const top of ['packages', 'apps']) {
    for (const pkg of readdirSync(join(root, top))) {
      for (const file of testFiles(join(root, top, pkg, 'test'))) {
        for (const id of testIds(readFileSync(file, 'utf8'))) found.set(id, [...(found.get(id) ?? []), relative(root, file)]);
      }
    }
  }

  it('U1.5: every requirement id in the spec-book-ui requirements.md has at least one test whose name starts with it', () => {
    expect(required.length).toBeGreaterThan(40);
    const missing = required.filter((id) => !found.has(id));
    expect(missing, `requirements without a test: ${missing.join(', ')}`).toEqual([]);
  });

  it('U1.5: every U id used in a test name exists in requirements.md, and the ids are unique', () => {
    const unknown = [...found.keys()].filter((id) => !required.includes(id));
    expect(unknown, `test names with an unknown requirement id: ${unknown.join(', ')}`).toEqual([]);
    expect(new Set(required).size).toBe(required.length);
  });

  it('U1.5: every requirement id is referenced by a task in tasks.md, and every task refers to known ids', () => {
    const tasks = readFileSync(join(root, SPEC, 'tasks.md'), 'utf8');
    const referenced = new Set([...tasks.matchAll(/_Requirements: ([^_]+)_/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim())));
    expect(required.filter((id) => !referenced.has(id)), 'requirements no task covers').toEqual([]);
    expect([...referenced].filter((id) => !required.includes(id)), 'tasks refer to unknown ids').toEqual([]);
  });

  it('U1.5: the scanners read ids the way the test names write them', () => {
    expect(requirementIds('- **U1.1** WHEN x\n- **U12.34** WHEN y\nU9.9 plain')).toEqual(['U1.1', 'U12.34']);
    expect(testIds("it('U1.1: a', f)\nit(`U2.2: ${x}`, f)\ntest(\"U3.3: c\", f)\nit('not U5.5: e', f)")).toEqual(['U1.1', 'U2.2', 'U3.3']);
  });
});
