// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SPEC_BOOK_CSS, SPEC_BOOK_STYLE_ID, installSpecBookStyles } from '../src/index';

describe('spec book styles', () => {
  it('U9.1: uses the palette of game-feel.md exactly', () => {
    for (const hex of ['#0d0b0a', '#e8d9b5', '#f2a541', '#7fd1c7', '#8c1c13']) expect(SPEC_BOOK_CSS).toContain(hex);
  });

  it('U9.1: blood red appears only in rules for the struck mark, rewritten lines and failure notes', () => {
    const blocks = SPEC_BOOK_CSS.split('}').filter((block) => block.includes('#8c1c13'));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) expect(block, block).toMatch(/struck|rewrite|bleed/);
  });

  it('U9.1: every colour is a variable with the palette value as its default, so an app can restyle the book', () => {
    expect(SPEC_BOOK_CSS).toContain('var(--hk-amber, #f2a541)');
    expect(SPEC_BOOK_CSS).toContain('var(--hk-parch, #e8d9b5)');
  });

  it('U9.2: a prefers-reduced-motion block turns off every animation and transition of the book', () => {
    const start = SPEC_BOOK_CSS.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(start).toBeGreaterThan(-1);
    const block = SPEC_BOOK_CSS.slice(start);
    // Every selector that starts an animation outside the block is named inside it.
    const animated = [...SPEC_BOOK_CSS.slice(0, start).matchAll(/([^{}]+)\{[^}]*\banimation:/g)].map((m) => m[1]!.trim());
    expect(animated.length).toBeGreaterThan(2);
    for (const selector of animated) for (const part of selector.split(',')) expect(block, part.trim()).toContain(part.trim());
    const transitioned = [...SPEC_BOOK_CSS.slice(0, start).matchAll(/([^{}]+)\{[^}]*\btransition:/g)].map((m) => m[1]!.trim());
    for (const selector of transitioned) for (const part of selector.split(',')) expect(block, part.trim()).toContain(part.trim());
    expect(block).toContain('transition: none');
    expect(block).toContain('animation: none');
  });

  it('U9.3: installing twice adds one style element with the book styles', () => {
    installSpecBookStyles(document);
    installSpecBookStyles(document);
    const found = document.querySelectorAll(`style#${SPEC_BOOK_STYLE_ID}`);
    expect(found).toHaveLength(1);
    expect(found[0]!.textContent).toBe(SPEC_BOOK_CSS);
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
  });

  it('U9.4: buttons are at least 36 px tall and have a visible focus outline', () => {
    expect(SPEC_BOOK_CSS).toMatch(/\.hk-slot \{[^}]*min-height: 36px/);
    expect(SPEC_BOOK_CSS).toMatch(/\.hk-rm \{[^}]*min-height: 36px/);
    expect(SPEC_BOOK_CSS).toMatch(/\.hk-replay button \{[^}]*min-height: 36px/);
    expect(SPEC_BOOK_CSS).toMatch(/\.hk-scrub \{[^}]*min-height: 36px/);
    expect(SPEC_BOOK_CSS).toMatch(/button:focus-visible[^{]*\{[^}]*outline: 2px solid/);
  });
});
