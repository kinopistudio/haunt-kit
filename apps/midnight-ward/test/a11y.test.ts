import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARK_GLYPH, SPEC_BOOK_CSS } from 'haunt-kit';
import type { LineMark } from 'haunt-kit';

const root = join(import.meta.dirname, '..');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const sources = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
const code = sources('src').map((f) => [f, readFileSync(join(root, f), 'utf8')] as const);

/** The text of the rules inside `@media <query> { ... }`. */
function media(query: string): string {
  const start = css.indexOf(`@media ${query}`);
  expect(start, query).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  throw new Error('unclosed media block');
}

describe('accessibility and small screens', () => {
  it('M11.1: every state that has a colour also has a text mark, and the outcome is text', () => {
    const coloured: LineMark[] = ['lit', 'false', 'shadowed', 'gold', 'ash', 'struck'];
    for (const mark of coloured) expect(MARK_GLYPH[mark], mark).not.toBe('');
    expect(new Set(coloured.map((m) => MARK_GLYPH[m]))).toEqual(new Set(['\u2713', '\u2717', '\u25D0']));
    expect(SPEC_BOOK_CSS).toContain('hk-sr');
    // The level select says Cleared in words next to the gold, and the clock says Dawn or Caught in words.
    const levels = readFileSync(join(root, 'src/screens/levels.ts'), 'utf8');
    expect(levels).toContain('\\u2713 Cleared');
    const play = readFileSync(join(root, 'src/screens/play.ts'), 'utf8');
    expect(play).toContain("'Dawn'");
    expect(play).toContain('Caught at bell');
  });

  it('M11.2: input uses pointer events, with no separate mouse or touch handlers', () => {
    for (const [file, text] of code) {
      expect(text, file).not.toMatch(/['"](?:touchstart|touchmove|touchend|mousedown|mouseup)['"]/);
    }
    const drag = readFileSync(join(root, 'src/screens/drag.ts'), 'utf8');
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) expect(drag).toContain(type);
  });

  it('M11.2: buttons are at least 36 px tall, and 44 px on a coarse pointer', () => {
    expect(css).toMatch(/\.btn \{[^}]*min-height: 36px/);
    expect(css).toMatch(/\.coach \.skip \{[^}]*min-height: 36px/);
    const coarse = media('(pointer: coarse)');
    expect(coarse).toMatch(/\.btn, \.tool, \.card \{ min-height: 44px; \}/);
    expect(coarse).toContain('.hk-replay button { min-height: 44px; min-width: 44px; }');
    expect(coarse).toContain('.hk-slot { min-height: 44px; }');
    expect(css).toMatch(/\.tool \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.card \{[^}]*min-height: 44px/);
  });

  it('M11.2: the tray items are not scrolled by a touch drag, and the board still scrolls the page', () => {
    expect(css).toMatch(/\.tool \{[^}]*touch-action: none/);
    expect(css).toMatch(/\.card \{[^}]*touch-action: none/);
    expect(css).toMatch(/\.canvas-box canvas \{[^}]*touch-action: manipulation/);
  });

  it('M11.3: at 860 px and below the stage is one column, and the controls stay at the bottom of the screen', () => {
    expect(media('(max-width: 860px)')).toContain('.stage { grid-template-columns: minmax(0, 1fr);');
    expect(css).toMatch(/\.dock \{[^}]*position: sticky;[^}]*bottom: 0/);
    expect(css).toMatch(/\.dock \{[^}]*safe-area-inset-bottom/);
  });

  it('M11.3: at 420 px and below nothing forces the page wider than the screen', () => {
    expect(css).toMatch(/body \{[^}]*overflow-x: hidden/);
    const phone = media('(max-width: 420px)');
    expect(phone).toContain('.folios { grid-template-columns: minmax(0, 1fr); }');
    expect(css).toMatch(/\.canvas-box canvas \{[^}]*max-width: 100%/);
    expect(css).toMatch(/\.stage \{[^}]*minmax\(0, 3fr\)/);
    expect(html).toContain('width=device-width, initial-scale=1');
    // Long rule text breaks inside its line instead of widening the page.
    expect(SPEC_BOOK_CSS).toContain('overflow-wrap: anywhere');
  });

  it('M11.4: keyboard focus is visible on every kind of control', () => {
    expect(css).toMatch(/button:focus-visible, a:focus-visible, canvas:focus-visible[^{]*\{[^}]*outline: 2px solid var\(--amber\)/);
    expect(SPEC_BOOK_CSS).toMatch(/button:focus-visible[^{]*\{[^}]*outline: 2px solid/);
    expect(css).not.toMatch(/outline: none/);
  });

  it('M11.4: the page is English, and the live regions are polite', () => {
    expect(html).toContain('<html lang="en">');
    const play = readFileSync(join(root, 'src/screens/play.ts'), 'utf8');
    expect(play.match(/aria-live', 'polite'/g)!.length).toBeGreaterThanOrEqual(3);
    expect(play).toContain("live.id = 'live'");
  });

  it('M9.5: the stylesheet turns off its own animations and transitions for reduced motion', () => {
    const calm = media('(prefers-reduced-motion: reduce)');
    for (const part of ['.pulse { animation: none; }', '.dawn-card', '.folio, .btn, .pip { transition: none; }']) expect(calm).toContain(part);
  });
});
