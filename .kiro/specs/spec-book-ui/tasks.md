# Implementation Plan: spec-book-ui

Run the tests and the build after each task, fix failures, tick the box, and commit with `spec(task N.N): <short description>`. Do not push. Do not copy code from `reference/prototype`; reimplement from `requirements.md` and `design.md`. Keep game words out of `packages/haunt-kit`.

- [x] 1.1 Recording
  - `Recording` in `trace/types.ts`, `recordRun` in `engine/record.ts`, exports. Add `happy-dom` as a dev dependency for the DOM tests that follow.
  - Tests: frames and traces line up, the input world is untouched, frames share no state, a non-running world, equality with `run` on a clone.
  - _Requirements: U2.1, U2.2, U2.3, U2.4_

- [x] 1.2 Line statistics
  - `trace/stats.ts` with `lineStats` and `LineStat`.
  - Tests on small worlds: a fired line, a shadowed line, an idle line, a rewrite that shifts indexes, a scripted turn.
  - _Requirements: U3.1, U3.2, U3.3, U3.4, U3.5_

- [x] 1.3 Failure explanation
  - `trace/explain.ts` with `explain`, `Finding`, `ExplainOptions`, the four sentence templates and the ordering.
  - Tests: each finding kind, the exact sentence forms, names and tick word from options, origin notes, empty findings for a clean run, inputs untouched, numbers re-derived from the recording.
  - _Requirements: U4.1, U4.2, U4.3, U4.4, U4.5, U4.6, U4.7, U4.8_

- [x] 2.1 Marks at a cursor
  - `ui/marks.ts` with `LineMark` and `bookState`.
  - Tests: cursor 0, `lit`/`false`/`shadowed`/`skipped`, `fired` and `written` lists, tallies, `final`, `struck`, the `RangeError`. Property test: the tally never decreases as the cursor grows.
  - _Requirements: U5.1, U5.2, U5.3, U5.4, U5.5, U5.6, U5.7, U5.8_

- [x] 2.2 Replay state
  - `ui/replay.ts` with `replayReduce`. Property test: any action sequence keeps `0 <= cursor <= length`.
  - _Requirements: U6.1, U6.2, U6.3, U6.4, U6.5, U6.6_

- [ ] 3.1 Book model and styles
  - `ui/model.ts` (`BookView`, `bookModel`, glyphs, labels) and `ui/styles.ts` (`SPEC_BOOK_CSS`, `installSpecBookStyles`).
  - Tests: rows, numbers, glyph for every mark, slots `n + 1`, remove controls, tally text, palette and the reduced-motion block in the CSS, idempotent install.
  - _Requirements: U7.1, U7.2, U7.3, U7.4, U7.5, U9.1, U9.2, U9.3, U9.4_

- [ ] 3.2 Spec book component
  - `ui/book.ts` with `SpecBook`: build, patch without rebuild, events, `lineElement`, `slotAt`, `setHotSlot`, bleed and tension. Tests in `happy-dom`.
  - _Requirements: U7.6, U7.7, U7.8, U7.9, U7.10_

- [ ] 3.3 Replay bar
  - `ui/replay-bar.ts` with `replayBarModel` and `ReplayBar`: buttons, range, keys, speed, timer. Tests in `happy-dom` with fake timers.
  - _Requirements: U8.1, U8.2, U8.3, U8.4_

- [ ] 4.1 Boundaries, exports and coverage
  - `ui/index.ts` and the entry point exports. Scans for U1.1 to U1.4 (imports, game words, no DOM at import, no randomness or clock). A coverage test for the `U` ids like `solver-coverage.test.ts`. A short section in the README.
  - _Requirements: U1.1, U1.2, U1.3, U1.4, U1.5_
