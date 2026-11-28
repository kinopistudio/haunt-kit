# Implementation Plan: midnight-ward

Run the tests and the build after each task, fix failures, tick the box, and commit with `spec(task N.N): <short description>`. Do not push. Do not copy code from `reference/prototype`; reimplement from `requirements.md` and `design.md`. The tasks of `.kiro/specs/spec-book-ui` come first, because this game uses its book, replay bar, recording and explanation. Do not change a level's rules, `targetSolveRate` or the solve counts. `apps/*` contain no rule evaluation or search.

- [x] 1.1 Plan model
  - `src/plan.ts` and `src/content.ts` (level info, actor display names): `freshPlan`, `placeItem`, `takeItem`, `moveItem`, `insertCard`, `removeCard`, `clear`, `remaining`, `usedCards`, `isFreeTile`, `toPlacement`, `toInserts`.
  - Tests: placing, refusing walls, actors, the bed and occupied tiles, taking items back, inserting and removing cards with the lines shifting, one card in one spec at most, clearing, and a property test that any operation sequence keeps the plan valid. A plan equals the solver's choice: run both and compare status and traces.
  - _Requirements: M3.1, M3.2, M3.3, M3.4, M3.8, M3.10, M3.11_

- [x] 1.2 Running a night
  - `src/night.ts`: `runNight` (build, `recordRun`, outcome, struck line, stats, burned count).
  - Tests: an empty board loses on all three levels; the first solution of each level wins; the status equals the solver's; the struck line is the girl's line on the last tick; `burned` equals the number of lines with `fired` 0.
  - _Requirements: M4.1, M5.1, M5.3_

- [x] 1.3 Failure explanation and dawn text
  - `src/wording.ts`: the loss text from `explain`, the dawn text, caps and ordering, the unused-card sentence. Solve counts come from `solveLevel`.
  - Tests with literal sentences on real recordings: the shadowed card (`Line 2 of Wisp I (your card) never fired: line 1 was true first, so it shadowed it at bell 4.` with the bell read from the recording), the never-true card, Night IV's rewrite, the girl walking into a ghost (a small fixture), the cap of four, and every number re-derived from the recording.
  - _Requirements: M5.4, M6.1, M6.2, M6.3, M6.4, M6.5, M6.6, M6.7, M12.1_

- [x] 1.4 Route, storage and progress
  - `src/route.ts`, `src/storage.ts`: hash parsing, safe `localStorage` with a memory fallback, cleared levels, coach seen, muted.
  - Tests with a fake storage that works, throws, and is missing.
  - _Requirements: M1.4, M2.3, M2.4, M7.6_

- [x] 1.5 Coach logic
  - `src/coach.ts` and the hints in `src/content.ts`: `coachStep` for the Prologue and Night I, none for the other levels.
  - Tests: the step for every plan state, the shadow warning with the remove target, retry after a loss, next after a win, and that each hint wins when run.
  - _Requirements: M7.1, M7.2, M7.3, M7.4, M7.5_

- [x] 2.1 Camera
  - `src/render/camera.ts`, `src/render/theme.ts`: projection, `fit`, `unprojectFloor`, `tileAt`, the fixed pitch and distance.
  - Tests: tile centres round-trip at several map sizes and canvas sizes (property test), points outside give `null`, the dollhouse fits canvases from 320 px wide, the pitch is a constant, no function takes a pitch from outside.
  - _Requirements: M8.1, M8.6, M8.7, M8.11_

- [x] 2.2 Floor, walls and sprites
  - `src/render/floor.ts`, `walls.ts`, `sprites.ts`: the floor texture and the strip projection, wall heights and faces, upright sprites with contact shadows, the depth sort.
  - Tests with a fake 2D context: strips of growing size, back wall taller than side taller than front, a shadow ellipse before each sprite, wall and sprite order by depth.
  - _Requirements: M8.2, M8.3, M8.4, M8.5_

- [ ] 2.3 Scene
  - `src/render/scene.ts` and `src/motion.ts`: layers, tweens, darkness, glow, chips and numerals, `setFrame`, `hit`, resize and device pixel ratio, reduced motion.
  - Tests with a fake canvas: the glide lasts at most 620 ms and 260 ms at ×2, zero under reduced motion, darkness is lower while planning than during a night, chips show the line number, numerals appear only when a kind repeats, the camera does not change between frames, `hit` finds an item before the tile behind it.
  - _Requirements: M8.8, M8.9, M8.10, M9.5_

- [ ] 2.4 Ink threads and ash
  - `src/render/fx.ts`: `FxLayer` with `thread` and `ash`, durations, fade, stop when idle, nothing under reduced motion.
  - Tests with a fake canvas and a fake clock.
  - _Requirements: M9.1, M9.3_

- [ ] 3.1 Sound
  - `src/audio.ts`: `Sfx` with toll, scratch, click, sting, chime, hum, `unlock`, `setMuted`. No audio files.
  - Tests with a fake `AudioContext`: nothing is scheduled while muted or before `unlock`, no throw when Web Audio is missing, the dawn chime and the toll schedule oscillators, and the setting is kept through `Progress`.
  - _Requirements: M10.1, M10.2, M10.3_

- [ ] 4.1 App shell, title and level select
  - `index.html` (fonts, viewport, favicon), `src/styles.css`, `src/main.ts`, `src/screens/title.ts`, `src/screens/levels.ts`. Palette and type from `game-feel.md`.
  - Tests in `happy-dom`: the title has the name, tagline, Begin and mute toggle; the level select lists three levels with concepts and ✓ for cleared ones, none locked; routing mounts and destroys screens; the stylesheet uses the palette and fonts.
  - _Requirements: M2.1, M2.2, M2.3, M2.5, M11.5_

- [ ] 4.2 Play screen: plan phase
  - `src/screens/play.ts` (plan half): the layout, tray, tap placement, drag and drop for items and cards, slots in the book, remove controls, range diamonds, clear board, keyboard cursor, the live region.
  - Tests in `happy-dom` with a stub scene: select and place, refuse a wall, take back, drag to a tile and cancel, select a card and choose a slot, drag over a slot, remove a card, clear, keyboard placement, the announcements.
  - _Requirements: M3.5, M3.6, M3.7, M3.9, M3.12_

- [ ] 4.3 Play screen: night, replay and outcome
  - The ring button, the replay bar, the clock, bell sounds, threads, the rewrite bleed, the lose and win sequences, `Try again`, `Back to planning`, `Go to <next>`, cleared levels saved, the outcome only at the last bell.
  - Tests in `happy-dom`: ring and read the book at several bells, scrub equals step, shadowed lines show ◐, a lost night strikes the girl's line and shows the explanation, retry keeps the plan, a won night marks ash and gold and saves the level, the outcome hides when the cursor moves back.
  - _Requirements: M4.2, M4.3, M4.4, M4.5, M4.6, M4.7, M5.2, M5.5, M5.6, M9.2, M9.4, M2.4_

- [ ] 4.4 Coach in the play screen
  - The coach panel, the pulse on its target, the glowing tile, `Hide tutorial` and `Show tutorial`, remembered in storage.
  - Tests in `happy-dom`: the first visit shows the coach, the target element has the pulse class, hiding stores it, a later visit has no coach, clearing the level stores it, Night IV has none.
  - _Requirements: M7.1, M7.2, M7.6_

- [ ] 5.1 Small screens and accessibility
  - The 375 px layout, the sticky dock, touch targets, focus styles, `lang`, reduced motion. Tests on the stylesheet text and the DOM (breakpoint rules, 36 px and 44 px targets, focus-visible, the live region).
  - _Requirements: M11.1, M11.2, M11.3, M11.4_

- [ ] 5.2 Build, scans, browser check and README
  - Scans: relative base, imports only from `haunt-kit`, no `reference/` import, no `fetch` or media files, `localStorage` only in `storage.ts`, no solve counts as literals. A coverage test for the `M` ids. `pnpm build` and `pnpm test` pass. Run `pnpm --filter midnight-ward preview` and check in a browser at 1280 px and 375 px that every screen loads without console errors. Update the README.
  - _Requirements: M1.1, M1.2, M1.3, M1.5, M12.2_
