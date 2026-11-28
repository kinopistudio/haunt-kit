import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = join(import.meta.dirname, '..');
const root = join(app, '../..');

const sources = (dir: string): string[] =>
  readdirSync(join(app, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : /\.(ts|css)$/.test(e.name) ? [join(dir, e.name)] : []));
const files = sources('src').map((f) => [f, readFileSync(join(app, f), 'utf8')] as const);
const ts = files.filter(([f]) => f.endsWith('.ts'));
const html = readFileSync(join(app, 'index.html'), 'utf8');

/** Source text without comments, so that a scan reads code and strings only. */
const bare = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('build and boundaries', () => {
  it('M1.1: the build writes a static site to dist with a relative base, so every asset URL is relative', () => {
    const config = readFileSync(join(app, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/base: '\.\/'/);
    expect(config).toMatch(/outDir: 'dist'/);
    const scripts = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).scripts as Record<string, string>;
    expect(scripts.build).toBe('tsc --noEmit && vite build');
    const built = join(app, 'dist/index.html');
    if (existsSync(built)) {
      const out = readFileSync(built, 'utf8');
      for (const m of out.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const url = m[1]!;
        if (/^(?:https?:|data:)/.test(url)) continue;
        expect(url, url).toMatch(/^\.\/assets\//);
      }
      expect(out).toMatch(/<script type="module"[^>]* src="\.\/assets\/[^"]+\.js"/);
    }
  });

  it('M1.2: rule evaluation, recording, explanation, solving and the book come only from haunt-kit, and nothing is imported from reference/', () => {
    for (const [file, text] of ts) {
      for (const m of text.matchAll(/\bfrom\s+'([^']+)'/g)) {
        const spec = m[1]!;
        if (spec.startsWith('.')) {
          const target = relative(root, join(app, file, '..', spec));
          expect(target.startsWith('apps/midnight-ward/'), `${file} imports ${spec}`).toBe(true);
          continue;
        }
        expect(['haunt-kit'], `${file} imports ${spec}`).toContain(spec);
      }
      expect(text, file).not.toMatch(/reference\/|prototype/);
    }
  });

  it('M1.2: the app has no engine of its own: it never ticks a world or evaluates a condition', () => {
    for (const [file, text] of ts) {
      if (file.endsWith('vocab.ts')) continue; // the vocabulary is the app's to write
      expect(bare(text), file).not.toMatch(/\btick\(|\.test\(\{|registry\.condition\(|\.check\(/);
    }
  });

  it('M8.11: every world-to-screen conversion goes through the camera module', () => {
    const render = ts.filter(([f]) => f.startsWith('src/render/') && !f.endsWith('camera.ts'));
    expect(render.length).toBeGreaterThan(5);
    for (const [file, text] of render) {
      const code = bare(text);
      expect(code, file).not.toMatch(/\bfunction (?:project|unproject\w*|makeCamera)\b/);
      expect(code, file).not.toMatch(/cam\.(?:zoom|x0|y0|dist)\b/);
      expect(code, file).not.toMatch(/Math\.(?:sin|cos|tan)\(\s*(?!PITCH)[^)]*pitch/i);
    }
    const users = render.filter(([, text]) => /from '\.\/camera'/.test(text)).map(([f]) => f);
    expect(users).toEqual(expect.arrayContaining(['src/render/scene.ts', 'src/render/floor.ts', 'src/render/walls.ts', 'src/render/sprites.ts']));
    // The scene needs only these four functions to put anything on the screen, so a flat camera could replace them.
    const scene = bare(readFileSync(join(app, 'src/render/scene.ts'), 'utf8'));
    expect(scene).toMatch(/import \{ dollhouseAspect, makeCamera, project, tileAt \} from '\.\/camera'/);
  });

  it('M1.3: no audio or image files, no network calls, and the only address in the page is Google Fonts', () => {
    for (const [file, text] of files) {
      expect(bare(text), file).not.toMatch(/\.(?:mp3|wav|ogg|m4a|aac|flac|png|jpe?g|gif|webp|avif|ico)\b/i);
      expect(bare(text), file).not.toMatch(/\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|new WebSocket|new EventSource|new Audio\(|<audio|<img/);
      if (file.endsWith('.css')) expect(text, file).not.toMatch(/url\(\s*['"]?https?:/);
    }
    const hosts = new Set([...html.matchAll(/https?:\/\/([^/"'\s]+)/g)].map((m) => m[1]));
    expect([...hosts].filter((h) => h !== 'www.w3.org').sort()).toEqual(['fonts.googleapis.com', 'fonts.gstatic.com']);
    const media = readdirSync(app).filter((n) => /\.(?:mp3|wav|ogg|png|jpe?g|gif|webp)$/i.test(n));
    expect(media).toEqual([]);
    expect(existsSync(join(app, 'public'))).toBe(false);
    expect(readFileSync(join(app, 'src/audio.ts'), 'utf8')).toContain('Web Audio API');
  });

  it('M1.3: the text of the game is English', () => {
    for (const [file, text] of files) expect(text, file).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/);
    expect(html).not.toMatch(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/);
  });

  it('M1.4: localStorage is read and written only in storage.ts', () => {
    for (const [file, text] of ts) {
      if (file.endsWith('storage.ts')) continue;
      expect(bare(text), file).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    }
    expect(bare(readFileSync(join(app, 'src/storage.ts'), 'utf8'))).toContain('globalThis.localStorage');
  });

  it('M12.2: the source does not contain the solve counts of any level as literals', () => {
    for (const [file, text] of ts) {
      expect(bare(text), file).not.toMatch(/\b(?:2145|2,145|329|1482|741)\b|\b4\s*\/\s*29\b|\b12\s*\/\s*2145\b|\b7\s*\/\s*329\b/);
    }
  });

  it('M12.1: the numbers the screens show come from the recording, the statistics or the solver, not from text', () => {
    const wording = readFileSync(join(app, 'src/wording.ts'), 'utf8');
    expect(wording).toContain('solveLevel');
    expect(wording).toContain('burned');
    const play = readFileSync(join(app, 'src/screens/play.ts'), 'utf8');
    expect(play).toContain('bookState(');
    expect(play).toContain('run.bells');
  });
});

// ---- coverage: every requirement id of the spec has a test and a task ----

const SPEC = '.kiro/specs/midnight-ward';
const requirementIds = (markdown: string): string[] => [...markdown.matchAll(/\*\*(M\d+\.\d+)\*\*/g)].map((m) => m[1]!);
const testIds = (source: string): string[] => [...source.matchAll(/\b(?:it|test)(?:\.\w+)*\(\s*[`'"](M\d+\.\d+)(?:\s*\/\s*(M\d+\.\d+))?:/g)].flatMap((m) => [m[1]!, ...(m[2] ? [m[2]] : [])]);

function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'dist') return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return testFiles(full);
    return full.endsWith('.test.ts') ? [full] : [];
  });
}

describe('midnight-ward spec coverage', () => {
  const required = requirementIds(readFileSync(join(root, SPEC, 'requirements.md'), 'utf8'));
  const found = new Map<string, string[]>();
  for (const top of ['packages', 'apps']) {
    for (const pkg of readdirSync(join(root, top))) {
      for (const file of testFiles(join(root, top, pkg, 'test'))) {
        for (const id of testIds(readFileSync(file, 'utf8'))) found.set(id, [...(found.get(id) ?? []), relative(root, file)]);
      }
    }
  }

  it('M1.5: every requirement id in the midnight-ward requirements.md has at least one test whose name starts with it', () => {
    expect(required.length).toBeGreaterThan(60);
    const missing = required.filter((id) => !found.has(id));
    expect(missing, `requirements without a test: ${missing.join(', ')}`).toEqual([]);
  });

  it('M1.5: every M id used in a test name exists in requirements.md, and the ids are unique', () => {
    const unknown = [...found.keys()].filter((id) => !required.includes(id));
    expect(unknown, `test names with an unknown requirement id: ${unknown.join(', ')}`).toEqual([]);
    expect(new Set(required).size).toBe(required.length);
  });

  it('M1.5: every requirement id is referenced by a task in tasks.md, and every task refers to known ids', () => {
    const tasks = readFileSync(join(root, SPEC, 'tasks.md'), 'utf8');
    const referenced = new Set([...tasks.matchAll(/_Requirements: ([^_]+)_/g)].flatMap((m) => m[1]!.split(',').map((s) => s.trim())));
    expect(required.filter((id) => !referenced.has(id)), 'requirements no task covers').toEqual([]);
    expect([...referenced].filter((id) => !required.includes(id)), 'tasks refer to unknown ids').toEqual([]);
  });

  it('M1.5: every task of this spec and of spec-book-ui is ticked once the work is done', () => {
    for (const spec of ['midnight-ward', 'spec-book-ui']) {
      const tasks = readFileSync(join(root, '.kiro/specs', spec, 'tasks.md'), 'utf8');
      const open = [...tasks.matchAll(/^- \[ \] (\d+\.\d+) /gm)].map((m) => m[1]);
      // The last task of midnight-ward is ticked in the commit that finishes it, so it may be the only one open.
      expect(open.filter((id) => !(spec === 'midnight-ward' && id === '5.2')), `${spec}: open tasks`).toEqual([]);
    }
  });

  it('M1.5: the scanners read ids the way the test names write them', () => {
    expect(requirementIds('- **M1.1** WHEN x\n- **M12.34** WHEN y\nM9.9 plain')).toEqual(['M1.1', 'M12.34']);
    expect(testIds("it('M1.1: a', f)\nit(`M2.2: ${x}`, f)\ntest(\"M3.3: c\", f)\nit('M4.4 / M5.5: d', f)\nit('not M6.6: e', f)")).toEqual(['M1.1', 'M2.2', 'M3.3', 'M4.4', 'M5.5']);
  });
});
