// The look of the spec book and the replay bar. A string, not a .css file, so that importing the kit
// in Node needs no CSS loader. Every colour is a CSS variable with the palette value as its default,
// so an app can restyle the book (for example with a CCTV layer) without touching the components.

const v = (name: string, value: string): string => `var(--hk-${name}, ${value})`;

const INK = v('ink', '#0d0b0a');
const PARCH = v('parch', '#e8d9b5');
const PARCH_DIM = v('parch-dim', '#b7a782');
const PARCH_INK = v('parch-ink', '#2a2118');
const AMBER = v('amber', '#f2a541');
const TEAL = v('teal', '#7fd1c7');
const BLOOD = v('blood', '#8c1c13');
const MOULD = v('mould', '#6f7f45');
const GOLD = v('gold', '#e8b85a');
const FONT_RULE = v('font-rule', '"IM Fell English", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif');
const FONT_MONO = v('font-mono', '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace');

export const SPEC_BOOK_STYLE_ID = 'hk-book-styles';

export const SPEC_BOOK_CSS = `
.hk-book { display: grid; gap: 14px; min-width: 0; font-family: ${FONT_RULE}; }
.hk-spec {
  position: relative; background: ${PARCH}; color: ${PARCH_INK}; padding: 14px 16px 12px; border-radius: 2px;
  box-shadow: 0 1px 0 #6b5a3e, 0 8px 24px rgba(0, 0, 0, .45); --hk-tension: 0;
  background-image: radial-gradient(120% 80% at 20% 0%, rgba(255, 255, 255, .18), transparent 60%), radial-gradient(90% 70% at 100% 100%, rgba(120, 80, 30, .22), transparent 70%);
  transition: box-shadow .3s;
}
.hk-spec.hk-focus { box-shadow: 0 1px 0 #6b5a3e, 0 0 0 2px ${TEAL}, 0 8px 24px rgba(0, 0, 0, .45); }
.hk-spec::after {
  content: ""; position: absolute; right: 0; bottom: 0; pointer-events: none;
  width: calc(4px + var(--hk-tension) * 34px); height: calc(4px + var(--hk-tension) * 34px);
  background: linear-gradient(135deg, ${PARCH_DIM} 0 48%, #4a3a28 50%, ${INK} 52%); transition: width .5s, height .5s;
}
.hk-head { margin: 0 0 6px; display: flex; gap: 8px; align-items: baseline; font-family: ${FONT_MONO}; font-weight: 500; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #6d5636; }
.hk-title { font-family: ${FONT_RULE}; font-weight: 400; font-size: 20px; letter-spacing: 0; text-transform: none; color: ${PARCH_INK}; }
.hk-badge { margin-left: auto; }
.hk-lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.hk-line {
  position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto 16px auto; gap: 6px; align-items: start;
  padding: 4px; border-radius: 2px; font-size: 16px; line-height: 1.32; transition: background .3s, color .3s, opacity .4s;
}
.hk-ln { font-family: ${FONT_MONO}; font-size: 11px; color: #7d6742; padding-top: 3px; text-align: right; }
.hk-txt { position: relative; overflow-wrap: anywhere; }
.hk-tally { font-family: ${FONT_MONO}; font-size: 11px; color: #7d6742; padding-top: 3px; }
.hk-glyph { font-family: ${FONT_MONO}; font-size: 12px; padding-top: 2px; text-align: center; }
.hk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.hk-rm { border: 0; background: none; color: #6b3a1a; cursor: pointer; font: inherit; font-size: 16px; min-width: 36px; min-height: 36px; margin: -8px -4px -8px 0; }
.hk-origin-card { background: rgba(242, 165, 65, .18); box-shadow: inset 2px 0 0 #b07020; }
.hk-origin-rewrite { background: rgba(140, 28, 19, .1); box-shadow: inset 2px 0 0 ${BLOOD}; }
.hk-mark-lit { background: rgba(13, 11, 10, .9); color: ${AMBER}; box-shadow: none; }
.hk-mark-lit .hk-ln, .hk-mark-lit .hk-tally { color: ${AMBER}; }
.hk-mark-false { opacity: .55; }
.hk-mark-false .hk-txt { text-decoration: line-through; text-decoration-color: rgba(42, 33, 24, .35); }
.hk-mark-skipped, .hk-mark-idle.hk-ever { opacity: .5; }
.hk-mark-shadowed { color: #4a5530; background: rgba(111, 127, 69, .26); box-shadow: inset 2px 0 0 ${MOULD}; }
.hk-mark-gold { color: #6e4a06; background: rgba(232, 184, 90, .38); box-shadow: inset 2px 0 0 ${GOLD}; }
.hk-mark-ash { color: #6b6256; opacity: .35; }
.hk-mark-ash .hk-txt { text-decoration: line-through; text-decoration-color: rgba(42, 33, 24, .25); }
.hk-mark-struck { color: ${BLOOD}; }
.hk-mark-struck .hk-glyph { color: ${BLOOD}; font-weight: 500; }
.hk-mark-struck .hk-txt::after {
  content: ""; position: absolute; left: -2px; right: -2px; top: 52%; height: 2px; background: ${BLOOD};
  transform-origin: left; transform: scaleX(1);
}
.hk-animate .hk-mark-struck .hk-txt::after { animation: hk-strike .8s ease-out; }
.hk-animate .hk-mark-ash { animation: hk-burn 1.6s ease-in both; animation-delay: var(--hk-delay, 0s); }
.hk-animate .hk-mark-gold { animation: hk-gild .9s ease-out both; animation-delay: var(--hk-delay, 0s); }
.hk-bleed .hk-txt { display: inline-block; animation: hk-bleed 1.4s ease-out; }
@keyframes hk-strike { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes hk-burn {
  0% { color: ${PARCH_INK}; opacity: 1; }
  30% { color: ${AMBER}; text-shadow: 0 0 8px ${AMBER}; opacity: 1; }
  100% { color: #6b6256; text-shadow: none; opacity: .35; }
}
@keyframes hk-gild { from { filter: brightness(1.7); } to { filter: none; } }
@keyframes hk-bleed {
  0% { transform: scaleX(-1); filter: blur(3px); opacity: 0; color: ${BLOOD}; }
  55% { transform: scaleX(-1); filter: blur(1px); opacity: .8; }
  100% { transform: scaleX(1); filter: none; opacity: 1; }
}
.hk-slot-row { display: block; }
.hk-slot {
  display: block; width: 100%; min-height: 36px; border: 1px dashed #a0703a; background: rgba(242, 165, 65, .12); color: #7a4a10;
  font-family: ${FONT_MONO}; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; padding: 4px; cursor: pointer; border-radius: 2px;
}
.hk-slot:hover, .hk-slot.hk-hot { background: rgba(242, 165, 65, .42); border-style: solid; }
.hk-notes { list-style: none; margin: 8px 0 0; padding: 6px 0 0; border-top: 1px solid rgba(42, 33, 24, .2); display: grid; gap: 4px; }
.hk-notes:empty { display: none; }
.hk-note { font-size: 14px; font-style: italic; color: #5c4a2e; }
.hk-note-rewrite { color: ${BLOOD}; }
.hk-note-hint { font-family: ${FONT_MONO}; font-style: normal; font-size: 11px; color: #7d6544; }

.hk-replay { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: ${PARCH}; font-family: ${FONT_MONO}; }
.hk-replay button {
  font: inherit; font-size: 14px; color: ${PARCH}; background: #171310; border: 1px solid #3a3027; border-radius: 3px;
  min-width: 36px; min-height: 36px; padding: 4px 10px; cursor: pointer;
}
.hk-replay button:disabled { opacity: .4; cursor: default; }
.hk-replay .hk-play { background: ${AMBER}; border-color: ${AMBER}; color: ${INK}; font-weight: 500; min-width: 84px; }
.hk-replay .hk-speed[aria-pressed="true"] { border-color: ${AMBER}; color: ${AMBER}; }
.hk-scrub { flex: 1 1 140px; min-width: 100px; min-height: 36px; accent-color: ${AMBER}; margin: 0; }
.hk-position { font-size: 12px; color: ${PARCH_DIM}; min-width: 7.5em; }
.hk-book button:focus-visible, .hk-replay button:focus-visible, .hk-replay input:focus-visible { outline: 2px solid ${AMBER}; outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .hk-spec, .hk-spec::after, .hk-line { transition: none; }
  .hk-animate .hk-mark-ash, .hk-animate .hk-mark-gold, .hk-animate .hk-mark-struck .hk-txt::after, .hk-bleed .hk-txt { animation: none; }
}
`;

/** Adds the book styles to `doc.head` once. Calling it again changes nothing. */
export function installSpecBookStyles(doc: Document): void {
  if (doc.getElementById(SPEC_BOOK_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = SPEC_BOOK_STYLE_ID;
  style.textContent = SPEC_BOOK_CSS;
  doc.head.appendChild(style);
}
