# Design Document: spec-book-ui

## Overview

A run of a spec has two audiences: the engine, which needs a trace, and a person, who needs to see which line ran, which line lost, and which line never had a chance. This spec gives the kit the layer between the two.

```
 World ──recordRun──▶ Recording { frames[0..N], traces[1..N], status }
                         │
        ┌────────────────┼──────────────────────────┐
        ▼                ▼                          ▼
   lineStats        explain(recording,          bookState(recording, cursor, opts)
   per line id      registry, opts)             marks + tallies + fired + written
        │           findings + sentences                │
        └──────────▶ (also used by MCP explain_failure) ▼
                                          bookModel(view) ──▶ SpecBook (DOM)
   ReplayState (pure) ◀── replayReduce ◀── ReplayBar (DOM, timer)
```

Everything left of the DOM boxes is a pure function of a recording. The DOM components only turn a model into elements and report events. Scare Cue reuses all of it and passes its own words and its own CCTV styles.

## Module layout

```
packages/haunt-kit/src/
  trace/types.ts      + Recording
  trace/stats.ts      lineStats, LineStat
  trace/explain.ts    explain, Finding, ExplainOptions
  engine/record.ts    recordRun
  ui/marks.ts         LineMark, bookState
  ui/replay.ts        ReplayState, ReplayAction, replayReduce
  ui/model.ts         BookView, bookModel, glyphFor, labelFor
  ui/book.ts          SpecBook (DOM)
  ui/replay-bar.ts    replayBarModel, ReplayBar (DOM)
  ui/styles.ts        SPEC_BOOK_CSS, installSpecBookStyles
  ui/index.ts
```

Dependencies point one way: `ui` imports types from `grammar`, `world` and `trace`. `trace/explain.ts` imports `printRule` from `grammar` and the `Registry` type. `engine/record.ts` imports `tick` and `cloneWorld`. Nothing in `src/ui` touches `document` at import time.

## Recording (U2)

```ts
interface Recording { frames: World[]; traces: TickTrace[]; status: WorldStatus }
function recordRun(world: World, registry: Registry): Recording
```

`recordRun` clones the world once, keeps `cloneWorld(world)` as `frames[0]`, then loops `tick` on the working copy and pushes `cloneWorld` after each tick. A level has about 12 ticks and a handful of actors, so the copies cost nothing, and any frame can be read without replaying the engine. `traces` are the engine's own objects.

## Line statistics (U3)

`lineStats(recording)` walks `traces` once. For tick `t` and each turn:

- Skip a turn whose `evals` is empty while its actor has lines: it was scripted (the engine gives one `evals` entry per line, or stops at the first true one).
- The lines of the actor at that tick are `frames[t]`'s lines for it. The line at index `fired` ran. Each index in `shadowed` was true under it. Every other line was checked and false.
- The first time a line is shadowed, store `{ tick, index, byId: turn.firedId, byIndex: turn.fired }`. The index is the one in the turn, so a later insert does not move it (U3.4).
- `born` is 0, or the tick of the `EventTrace` that carries the line id.

The result is a `Map<number, LineStat>` keyed by line id, in actor order then line order of the last frame.

```ts
interface LineStat {
  actor: string; id: number; origin: LineOrigin; born: number;
  fired: number; shadowed: number; idle: number;
  firstFired: number | null;
  firstShadowed: { tick: number; index: number; byId: number; byIndex: number } | null;
}
```

## Failure explanation (U4)

`explain` reads `lineStats`, the traces and the registry, and returns structured findings plus one sentence each. The structure is what the MCP tool `explain_failure` will return; the sentence is what a player reads.

```ts
interface LineRef { id: number; index: number; text: string; origin: LineOrigin }
type Finding =
  | { kind: 'violation'; tick: number; property: string; message: string; actors: string[]; turnActor: string; line: LineRef | null }
  | { kind: 'rewrite'; tick: number; actor: string; line: LineRef }
  | { kind: 'shadowed'; actor: string; line: LineRef; tick: number; by: LineRef }
  | { kind: 'never_true'; actor: string; line: LineRef; condition: string };

interface ExplainOptions {
  actorName?: (actorId: string) => string;          // default: the id
  tickWord?: string;                                // default 'tick'
  originNote?: Partial<Record<LineOrigin, string>>; // default {}
  neverTrueOrigins?: LineOrigin[];                  // default ['card']
}
```

Sentence templates (the words in angle brackets come from the findings):

| kind | sentence |
|---|---|
| `violation` | `<Tick> <t>: <message>` followed by ` <Actor> was running line <n>: “<text>”` when a line ran. Apps may replace this one with their own words. |
| `rewrite` | `At <tick> <t>, <actor> wrote itself a new line <n>: “<text>”. The lines under it moved down by one.` |
| `shadowed` | `Line <i> of <actor> [(<note>)] never fired: line <j> was true first, so it shadowed it at <tick> <t>.` |
| `never_true` | `Line <i> of <actor> [(<note>)] never fired: “<condition>” was never true when it was checked.` |

`shadowed` is chosen when the line has `fired === 0` and `shadowed > 0`. `never_true` when `fired === 0`, `shadowed === 0`, the origin is in `neverTrueOrigins`, and the line was checked at least once (`idle > 0`). A line that was only born on the last tick of a failed run and was never checked is not reported.

`LineRef.index` is the index at the tick that the finding names (the tick of the shadowing, the tick of the write, or the last tick for `never_true`), so the numbers in a sentence agree with the page the player was looking at.

`condition` is the phrase of the rule's condition from the registry (`the bell is near`, `the clock has struck 6`), found with `registry.condition(rule.cond).pattern` and the rule's `n`. The text of a line is `printRule(actor.kind, rule, registry)`.

## Marks at a cursor (U5)

```ts
type LineMark = 'idle' | 'lit' | 'false' | 'skipped' | 'shadowed' | 'gold' | 'ash' | 'struck';
interface BookState {
  marks: Map<number, LineMark>;
  tally: Map<number, number>;
  fired: { actor: string; lineId: number; index: number }[];
  written: { actor: string; lineId: number; index: number }[];
}
function bookState(r: Recording, cursor: number, o?: { final?: boolean; struck?: number[] }): BookState
```

For cursor 0, every line of `frames[0]` is `idle`. For cursor `c`, the turn trace of each actor on tick `c` decides the mark of each line of `frames[c]`:

```
index <  fired            → false       (checked, not true)
index == fired            → lit
index >  fired, shadowed  → shadowed    (true, lost)
index >  fired, other     → skipped
fired == null             → false for every line
no turn for this actor    → idle         (a violation stopped the tick before its turn)
```

The tally adds one for every tick up to `c` whose turn has `firedId` equal to the line id. `final` replaces `lit`/`false`/`shadowed`/`skipped`/`idle` with `gold` (tally above 0) or `ash`, but only when the cursor is the last tick and the recording is `complete`. `struck` is applied last.

## Replay state (U6)

```ts
interface ReplayState { cursor: number; length: number; playing: boolean }
type ReplayAction = { type: 'play' | 'pause' | 'step' | 'back' | 'advance' | 'start' | 'end' }
                  | { type: 'seek'; to: number } | { type: 'reset'; length: number };
function replayReduce(s: ReplayState, a: ReplayAction): ReplayState
```

`replayReduce` never mutates. `advance` is what the timer sends; it is a no-op unless `playing`. `step` while at the end stays at the end. `start` and `end` are `seek` to 0 and to the length.

## The book model and the DOM (U7)

```ts
interface BookView {
  actors: { id: string; title: string; badge?: string; tension?: number;
            lines: { id: number; text: string; origin: LineOrigin }[];
            notes?: { text: string; tone?: 'rewrite' | 'hint' }[] }[];
  marks?: ReadonlyMap<number, LineMark>;
  tally?: ReadonlyMap<number, number>;
  bleed?: ReadonlySet<number>;
  slots?: boolean; removable?: boolean; animate?: boolean;
}
```

`bookModel(view)` is pure. It returns for each actor a list of rows. A row is a slot (`{ kind: 'slot', actor, at, label }`) or a line (`{ kind: 'line', id, number, text, origin, mark, glyph, label, tally, removable, bleed, classes }`). Tests read the model.

`SpecBook` builds this DOM, which uses the prefix `hk-` for every class:

```html
<section class="hk-book">
  <article class="hk-spec" data-actor="wisp" style="--hk-tension:0">
    <h3 class="hk-head"><span class="hk-title">Wisp I</span><span class="hk-badge">…</span></h3>
    <ol class="hk-lines">
      <li class="hk-slot-row"><button class="hk-slot" data-actor="wisp" data-at="0">Insert at line 1</button></li>
      <li class="hk-line hk-origin-card hk-mark-lit" data-line="14" data-actor="wisp" data-idx="0">
        <span class="hk-ln">1</span><span class="hk-txt">…</span>
        <span class="hk-tally">×3</span><span class="hk-glyph" aria-hidden="true">✓</span><span class="hk-sr">ran</span>
        <button class="hk-rm" data-line="14" aria-label="Remove card">×</button>
      </li>
    </ol>
    <ul class="hk-notes">…</ul>
  </article>
</section>
```

`update(view)` computes a structure key from the actors, line ids and the `slots` and `removable` flags. When the key is unchanged, it patches classes, glyphs, tallies and text on the existing elements. Otherwise it rebuilds the lists. This keeps a burning line burning while the next update comes in (U7.6). `slotAt(x, y)` uses `document.elementFromPoint` through the element's owner document and reads `data-actor` and `data-at`.

## Replay bar (U8)

`replayBarModel(state, { tickWord })` gives `{ playLabel, position, value, max, canStart, canBack, canStep, canEnd }`. `ReplayBar` renders five buttons, a range input and a speed toggle, listens for the keys of U8.2 on its root, and runs one `setTimeout` at a time while `playing`. The delay is `options.intervalMs(speed)`, with defaults 620 ms and 260 ms. The bar owns its state. The app listens through `onChange(state, action)`, and may call `bar.dispatch(action)` and `bar.reset(length)`.

## Styles (U9)

`SPEC_BOOK_CSS` is a string, so that a Node import never needs a CSS loader. `installSpecBookStyles(doc)` adds one `<style id="hk-book-styles">` to `doc.head`. Colours are CSS variables with the palette values as defaults (`--hk-ink`, `--hk-parch`, `--hk-amber`, `--hk-teal`, `--hk-blood`, `--hk-mould`, `--hk-gold`), so Scare Cue can restyle the book for its CCTV layer without touching the component. A single `@media (prefers-reduced-motion: reduce)` block removes every animation and transition.

State styles, from `game-feel.md`:

| mark | look |
|---|---|
| `lit` | dark band, amber text, ✓ |
| `false` | faded, ✗ |
| `shadowed` | mouldy green band and text, ◐ |
| `skipped`, `idle` | dimmed, no glyph |
| `gold` | gold band, ✓ |
| `ash` | burn animation, then faded to ash, ✗ |
| `struck` | blood-red line through the text, ✗ |
| origin `card` | amber edge |
| origin `rewrite` | blood-red edge, red ink bleeding through when new |

## Testing

- Pure units (recording, stats, explain, marks, replay, model) get example tests and fast-check properties (for example: a cursor in range never throws, the tally is non-decreasing in the cursor, `explain` is stable under a second call).
- Fixtures are the toy vocabulary of the kit tests plus small worlds that make a shadowed line, a never-true card and a rewrite.
- The DOM components are tested in `happy-dom`: structure, classes, events, timers (with fake timers). No test looks at pixels.
- Source scans check U1.2 to U1.4.
- A coverage test checks that each `U` id has a test and a task, like the earlier specs.

## Out of scope

The CCTV layer of Scare Cue, the MCP tools, drag and drop (the app wires pointer events to `slotAt` and `setHotSlot`), and any word that belongs to one game.
