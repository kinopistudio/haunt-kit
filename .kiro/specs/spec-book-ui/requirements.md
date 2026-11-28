# Requirements Document: spec-book-ui

## Introduction

This spec adds to `packages/haunt-kit` everything a game or a tool needs to show a run of a spec to a person: a recording of a run, per-line statistics, a plain-English failure explanation, the "spec book" DOM component (each actor's rules as numbered EARS lines that light up, get shadowed, burn or turn gold), and a bell-by-bell replay control. It builds on the `rule-engine` and `solver` specs and changes none of their requirements.

It does not cover the board, sprites, sound or any word that belongs to one app. Midnight Ward (`.kiro/specs/midnight-ward`) uses the book first. Scare Cue reuses it later and adds its own CCTV layer on top.

Terms:

- **Recording**: the frames and traces of one run. `frames[0]` is the start world and `frames[k]` the world after tick `k`. `traces[k-1]` is the trace of tick `k`.
- **Cursor**: the number of ticks of a recording that have been replayed, from 0 to `traces.length`.
- **Line**: one rule in an actor's spec, identified by `Line.id`. Ids are never reused, so they stay valid when a rewrite shifts the indexes.
- **Mark**: how one line looks at a cursor: `idle`, `lit`, `false`, `skipped`, `shadowed`, `gold`, `ash` or `struck`.
- **Tally**: the number of ticks up to the cursor on which a line ran.
- **Finding**: one structured fact about a run that explains a failure or a dead line (`violation`, `rewrite`, `shadowed`, `never_true`). Each finding has one sentence.
- **Book view**: the plain data the component shows (actors, lines, marks, tallies, slots). The component keeps no rule logic of its own.

Requirement ids (`U1.1`, `U1.2`, ...) are used as test-name prefixes, for example `U5.3: a shadowed line is marked shadowed`.

## Requirements

### Requirement 1: Module boundaries

**User Story:** As an app author, I want a book that knows no game words, so that Midnight Ward and Scare Cue show the same component.

#### Acceptance Criteria

- **U1.1** THE UI code SHALL live in `packages/haunt-kit/src/ui`, SHALL be exported from the `haunt-kit` entry point, and SHALL import only from the `grammar`, `world` and `trace` modules.
- **U1.2** THE files in `src/ui`, `src/trace/stats.ts`, `src/trace/explain.ts` and `src/engine/record.ts` SHALL NOT contain the words `ghost`, `girl`, `wisp`, `shade`, `snuffer`, `candle`, `salt`, `bell`, `visitor`, `fog`, `jump`, `dawn` or `night`, in code or comments. Apps pass such words in as options.
- **U1.3** WHEN `haunt-kit` is imported where there is no DOM, THE import SHALL succeed and SHALL NOT read `document`, `window` or `navigator`. Only the functions that take an element or a document touch the DOM.
- **U1.4** THE files `src/trace/stats.ts`, `src/trace/explain.ts` and `src/engine/record.ts` SHALL NOT use `Math.random`, `Date` or DOM globals, and SHALL give equal results when run twice on equal inputs.
- **U1.5** THE workspace SHALL have at least one test whose name starts with each requirement id in this file.

### Requirement 2: Recording a run

**User Story:** As an app author, I want one call that runs a level and keeps every step, so that a replay can show any bell, forwards or backwards, without running the engine again.

#### Acceptance Criteria

- **U2.1** WHEN `recordRun(world, registry)` is called, THE function SHALL run a copy of the world until it is no longer running and return `{ frames, traces, status }`, where `frames[0]` equals the given world, `frames[k]` equals the world after tick `k`, `traces[k-1]` is the engine's trace of tick `k`, and `status` is the final status.
- **U2.2** THE function SHALL NOT change the world it is given, and no two frames SHALL share mutable state.
- **U2.3** IF the world is not `running`, THEN `frames` SHALL hold one frame, `traces` SHALL be empty, and `status` SHALL be the world's status.
- **U2.4** THE traces of a recording SHALL equal the traces `run` returns for a clone of the same world.

### Requirement 3: Line statistics

**User Story:** As a developer starting out with Kiro specs, I want to see which lines never ran and why, so that I learn to spot shadowed and dead requirements.

#### Acceptance Criteria

- **U3.1** WHEN `lineStats(recording)` is called, THE function SHALL return one entry for every line in the last frame, with its actor id, `id`, `origin`, `born` (0 for lines of the spec and for cards, the tick of the write for a rewrite), `fired`, `shadowed` and `idle` (the number of ticks it was checked and was false).
- **U3.2** THE `fired` count SHALL be the number of ticks on which the line was the first true line of its actor, and THE `shadowed` count SHALL be the number of ticks on which it was true while a line above it ran.
- **U3.3** THE entry SHALL carry `firstFired` (a tick or `null`) and `firstShadowed` (`null`, or the tick, the line's 0-based index at that tick, and the id and 0-based index of the line that ran), both read from the traces.
- **U3.4** WHEN a rewrite inserts a line above others, THE indexes in `firstShadowed` SHALL still be the indexes at the tick it names, not the final indexes.
- **U3.5** WHEN an actor's turn was scripted (a turn with no evaluations), THE turn SHALL NOT count for any line.

### Requirement 4: Failure explanation

**User Story:** As a player, I want a plain-English reason why I lost, built from the trace, so that I can fix the right line.

#### Acceptance Criteria

- **U4.1** WHEN `explain(recording, registry, options)` is called, THE function SHALL return `{ findings, sentences }`, with one sentence for each finding, in the same order, and SHALL NOT change its inputs.
- **U4.2** WHERE the recording ends `violated`, THE first finding SHALL be a `violation` with the tick, the property id, the message, the actors the property names, the actor whose turn broke it, and the line that ran on that turn (or `null`).
- **U4.3** FOR each scheduled write that happened, THE function SHALL add a `rewrite` finding with the tick, the actor, the line's index and its text, in tick order.
- **U4.4** FOR each line that never fired and was true at least once while a line above it ran, THE function SHALL add a `shadowed` finding for the first such tick, and its sentence SHALL read `Line <i> of <actor> never fired: line <j> was true first, so it shadowed it at <tick word> <t>.`, where `i` and `j` are 1-based and read at tick `t`.
- **U4.5** FOR each line that never fired, was never true, and has an origin listed in `options.neverTrueOrigins` (default: `card`), THE function SHALL add a `never_true` finding whose sentence names the condition of the line and says it was never true when checked.
- **U4.6** THE sentences SHALL name actors with `options.actorName` (default: the actor id), SHALL call a tick `options.tickWord` (default: `tick`), and SHALL mark a line whose origin has an entry in `options.originNote` with that note in brackets, for example `Line 2 of Wisp I (your card) never fired: ...`.
- **U4.7** EVERY number in a sentence SHALL be a value read from the recording. WHEN the recording ends `complete` and every line fired, THE findings SHALL be empty.
- **U4.8** THE findings SHALL be ordered: the violation, the rewrites by tick, the shadowed lines by actor order then line index, the never-true lines by actor order then line index.

### Requirement 5: Marks at a cursor

**User Story:** As an app author, I want the look of every line at any bell to be a pure function of the recording and a cursor, so that scrubbing back and forth is exact.

#### Acceptance Criteria

- **U5.1** WHEN `bookState(recording, cursor, options)` is called, THE function SHALL return a mark and a tally for every line in `frames[cursor]`.
- **U5.2** WHEN the cursor is 0, THE marks SHALL all be `idle`, THE tallies 0, and `fired` and `written` empty.
- **U5.3** WHEN the cursor is `c` from 1 on, THE line that ran on tick `c` SHALL be `lit`, a line that was true below it SHALL be `shadowed`, a line above it (or any line of an actor that had no true line) SHALL be `false`, and a line below it that was not true SHALL be `skipped`.
- **U5.4** THE result SHALL list in `fired` the lines that ran on tick `c` (actor, line id, 0-based index at that tick), and in `written` the lines that a scheduled write added on tick `c`.
- **U5.5** THE tally of a line SHALL be the number of ticks up to and including `c` on which it ran.
- **U5.6** WHERE `options.final` is true, the cursor equals the number of ticks and the recording ends `complete`, THE marks SHALL be `gold` for lines with a tally above 0 and `ash` for the others.
- **U5.7** WHERE `options.struck` lists line ids, THOSE lines SHALL have the mark `struck`, whatever their other mark.
- **U5.8** IF the cursor is not an integer from 0 to the number of ticks, THEN THE function SHALL throw a `RangeError`.

### Requirement 6: Replay state

**User Story:** As an app author, I want the play, pause, step and scrub logic to be a small pure state machine, so that it is tested without a browser.

#### Acceptance Criteria

- **U6.1** THE initial state SHALL have cursor 0, `playing` false and the given length.
- **U6.2** WHEN `play` is applied, THE state SHALL have `playing` true. WHEN the cursor is at the end, `play` SHALL first put the cursor at 0. WHEN the length is 0, `play` SHALL change nothing.
- **U6.3** WHEN `step` or `back` is applied, THE cursor SHALL move by one, stay between 0 and the length, and `playing` SHALL become false.
- **U6.4** WHEN `seek` is applied with a number, THE cursor SHALL become that number rounded and limited to 0 to the length, and `playing` SHALL become false.
- **U6.5** WHEN `advance` is applied while playing, THE cursor SHALL grow by one, and `playing` SHALL become false when it reaches the length. WHEN not playing, `advance` SHALL change nothing.
- **U6.6** WHEN `reset` is applied with a length, THE state SHALL have cursor 0, `playing` false and that length.

### Requirement 7: The spec book

**User Story:** As a developer starting out with Kiro specs, I want each actor's rules shown as numbered EARS lines with their state, so that I can read what ran and what did not.

#### Acceptance Criteria

- **U7.1** WHEN `bookModel(view)` is called, THE function SHALL return for each actor in order its title, its lines with 1-based numbers, text, origin, mark and tally, and its notes.
- **U7.2** EVERY mark except `idle` and `skipped` SHALL have a text glyph: `lit` ✓, `false` ✗, `shadowed` ◐, `gold` ✓, `ash` ✗, `struck` ✗, so that no state is shown by colour alone. Every line SHALL also have an accessible label that names its mark.
- **U7.3** WHERE `view.slots` is true, THE model SHALL put an insertion slot before every line and one after the last, so `n` lines have `n + 1` slots with 0-based positions 0 to `n`. OTHERWISE it SHALL have none.
- **U7.4** WHERE `view.removable` is true, THE model SHALL give every line with origin `card` a remove control. THE other lines SHALL have none.
- **U7.5** THE model SHALL show a tally of `×<n>` on a line when `n` is above 0, and nothing when it is 0.
- **U7.6** WHEN `SpecBook.update(view)` is called twice with the same actors and lines, THE component SHALL keep its line elements and only change their classes and text, so that running animations do not restart. WHEN the lines change, THE component SHALL rebuild them.
- **U7.7** WHEN a slot is chosen, THE component SHALL call `onSlot(actorId, position)`. WHEN a remove control is chosen, it SHALL call `onRemove(lineId)`. WHEN the pointer or focus enters or leaves an actor's page, it SHALL call `onActorFocus(actorId | null)`.
- **U7.8** THE component SHALL give `lineElement(lineId)` (the element of one line, or `null`), `slotAt(x, y)` (the slot under a point, or `null`) and `setHotSlot(slot | null)` (marks one slot as the drop target).
- **U7.9** WHERE a line's id is in `view.bleed` and `view.animate` is true, THE component SHALL add the bleed class to that line. THE actor's `tension` from 0 to 1 SHALL set the CSS variable `--hk-tension` on its page.
- **U7.10** THE component SHALL NOT parse, print or evaluate rules. The text of a line is given in the view.

### Requirement 8: The replay bar

**User Story:** As a player, I want to play, pause, step and scrub the night, so that I can look at one bell for as long as I need.

#### Acceptance Criteria

- **U8.1** WHEN `replayBarModel(state, options)` is called, THE function SHALL return the label of the play button (`Play`, `Pause` or `Replay` at the end), the position label (`<tick word> <cursor> of <length>`), the range value and maximum, and which of the start, back, step and end buttons are disabled.
- **U8.2** WHEN a button, the range input or one of the keys Space, ArrowLeft, ArrowRight, Home and End is used, THE bar SHALL apply the matching replay action and call `onChange(state, action)`.
- **U8.3** WHILE the state is playing, THE bar SHALL apply `advance` after `intervalMs(speed)`, and SHALL stop its timer when the state stops playing, when it is reset and when it is destroyed.
- **U8.4** THE bar SHALL offer a speed toggle between `×1` and `×2`, and the interval at `×2` SHALL be shorter than at `×1`.

### Requirement 9: Styles and motion

**User Story:** As a player who gets sick from motion, I want every animation of the book to switch off, so that I can read it calmly.

#### Acceptance Criteria

- **U9.1** THE book styles SHALL use the palette of `game-feel.md` exactly (ink `#0d0b0a`, parchment `#e8d9b5`, amber `#f2a541`, teal `#7fd1c7`) and SHALL use blood red `#8c1c13` only for the `struck` mark and for failure elements.
- **U9.2** THE styles SHALL contain a `prefers-reduced-motion: reduce` block that turns off every animation and transition of the book.
- **U9.3** WHEN `installSpecBookStyles(document)` is called more than once, THE function SHALL add one style element.
- **U9.4** THE buttons of the book and of the replay bar SHALL be at least 36 px tall and SHALL have a visible focus outline.
