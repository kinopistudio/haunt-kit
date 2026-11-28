import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const readJson = (p: string): any => JSON.parse(read(p));

const PACKAGES = [
  { name: 'haunt-kit', dir: 'packages/haunt-kit' },
  { name: 'haunt-kit-mcp', dir: 'packages/haunt-kit-mcp' },
  { name: 'midnight-ward', dir: 'apps/midnight-ward' },
  { name: 'scare-cue', dir: 'apps/scare-cue' },
];
const APPS = PACKAGES.filter((p) => p.dir.startsWith('apps/'));

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN = /\bMath\.random\b|\bDate\b|\bdocument\b|\bwindow\b|\bnavigator\b|\blocalStorage\b|\bperformance\.now\b/;
function findForbidden(src: string): string | null {
  const m = FORBIDDEN.exec(stripComments(src));
  return m ? m[0] : null;
}

function importSpecifiers(src: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of stripComments(src).matchAll(re)) out.push((m[1] ?? m[2])!);
  return out;
}

describe('workspace', () => {
  it('R1.1: the four packages exist at their paths with their names', () => {
    for (const p of PACKAGES) {
      expect(readJson(`${p.dir}/package.json`).name).toBe(p.name);
    }
    const ws = read('pnpm-workspace.yaml');
    expect(ws).toMatch(/-\s*packages\/\*/);
    expect(ws).toMatch(/-\s*apps\/\*/);
  });

  it('R1.2: both apps depend on haunt-kit through workspace:*, and pnpm links it', () => {
    for (const app of APPS) {
      expect(readJson(`${app.dir}/package.json`).dependencies['haunt-kit']).toBe('workspace:*');
      const link = join(root, app.dir, 'node_modules/haunt-kit');
      expect(existsSync(link), `${app.dir} is not linked; run pnpm install`).toBe(true);
      expect(realpathSync(link)).toBe(realpathSync(join(root, 'packages/haunt-kit')));
    }
  });

  it('R1.3: strict mode is on and every package builds (apps with a Vite build)', () => {
    expect(readJson('tsconfig.base.json').compilerOptions.strict).toBe(true);
    for (const p of PACKAGES) {
      expect(readJson(`${p.dir}/tsconfig.json`).extends).toBe('../../tsconfig.base.json');
      expect(readJson(`${p.dir}/package.json`).scripts.build).toContain('tsc --noEmit');
    }
    for (const app of APPS) {
      expect(readJson(`${app.dir}/package.json`).scripts.build).toContain('vite build');
      expect(read(`${app.dir}/vite.config.ts`)).toContain("outDir: 'dist'");
    }
  });

  it('R1.4: the root test script runs the test script of every package, and test packages use vitest run', () => {
    const scripts = readJson('package.json').scripts;
    expect(scripts.test).toBe('pnpm -r --if-present test');
    expect(scripts.build).toBe('pnpm -r --if-present build');
    for (const dir of ['packages/haunt-kit', 'apps/midnight-ward']) {
      expect(readJson(`${dir}/package.json`).scripts.test).toMatch(/^vitest run/);
    }
  });

  it('R1.5: pnpm verify exits with code 0', () => {
    expect(readJson('package.json').scripts.verify).toBe('node scripts/verify.mjs');
    const r = spawnSync(process.execPath, [join(root, 'scripts/verify.mjs')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('R1.6: apps import rule logic only through the package name haunt-kit', () => {
    let checked = 0;
    for (const app of APPS) {
      const appDir = join(root, app.dir);
      for (const file of walk(appDir, ['.ts'])) {
        for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
          checked++;
          const where = `${relative(root, file)} imports ${spec}`;
          expect(spec, where).not.toMatch(/reference\/|packages\//);
          expect(spec, where).not.toMatch(/^haunt-kit\/./); // no deep imports
          if (spec.startsWith('.')) {
            const target = resolve(dirname(file), spec);
            expect(target.startsWith(appDir + sep), where).toBe(true);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('R1.7: the engine source directories avoid Math.random, Date and DOM globals', () => {
    const base = join(root, 'packages/haunt-kit/src');
    const files = ['grammar', 'world', 'engine', 'solver', 'trace'].flatMap((d) => walk(join(base, d), ['.ts']));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(findForbidden(readFileSync(f, 'utf8')), relative(root, f)).toBeNull();
    }
  });

  it('R1.7: the scanner flags forbidden code and ignores comments', () => {
    expect(findForbidden('const x = Math.random();')).toBe('Math.random');
    expect(findForbidden('const t = new Date();')).toBe('Date');
    expect(findForbidden('document.body')).toBe('document');
    expect(findForbidden('// Math.random is not allowed\nconst a = 1;')).toBeNull();
    expect(findForbidden('/* Date */ const a = 1;')).toBeNull();
  });
});
