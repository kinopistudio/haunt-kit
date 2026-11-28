# Implementation Plan: rule-engine

Run the tests after each task, fix failures, tick the box, and commit with `spec(task N.N): <short description>`. Do not copy code from `reference/prototype`; use it only to produce the oracle fixtures in task 6.3.

- [x] 1.1 Root workspace files
  - `package.json` (private, scripts `test`, `build`, `verify`), `pnpm-workspace.yaml`, `tsconfig.base.json` (strict, ES2022 modules), `scripts/verify.mjs` stub that prints a note and exits 0.
  - `pnpm test` and `pnpm build` run the matching script in every workspace package that has one.
  - _Requirements: R1.1, R1.3, R1.4, R1.5_

- [x] 1.2 `haunt-kit` package skeleton
  - `packages/haunt-kit` with `package.json` (`exports` to `src/index.ts`), `tsconfig.json`, Vitest and fast-check, an empty `src/index.ts`, and the module folders `grammar`, `registry`, `world`, `engine`, `trace`.
  - `build` is `tsc --noEmit`, `test` is `vitest run`.
  - _Requirements: R1.1, R1.3, R1.4_

- [x] 1.3 `haunt-kit-mcp` placeholder package
  - `package.json`, `tsconfig.json` and an `src/index.ts` that exports nothing. It depends on `haunt-kit`. It has no test script.
  - _Requirements: R1.1, R1.3_

- [x] 1.4 Two empty Vite apps
  - `apps/midnight-ward` and `apps/scare-cue`: `index.html`, `src/main.ts`, `vite.config.ts`, `tsconfig.json`, a `workspace:*` dependency on `haunt-kit`, build script `tsc --noEmit && vite build`.
  - Midnight Ward gets a Vitest test script. `src/vocab.ts` is added in task 6.1.
  - _Requirements: R1.1, R1.2, R1.3_

- [x] 1.5 Structure tests
  - In `packages/haunt-kit/test/structure.test.ts`: package names and workspace file (R1.1), `workspace:*` links (R1.2), strict mode and the Vite build scripts (R1.3), root test script (R1.4), `scripts/verify.mjs` exit code (R1.5), app import boundaries (R1.6), forbidden globals in the engine directories (R1.7).
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7_

- [x] 2.1 Registry
  - `world/types.ts` and `grammar/types.ts` (types only), `registry/types.ts`, `registry/registry.ts`, `RegistryError`, pattern validation and matching.
  - Tests for registration, lookup, phrase matching, duplicates, reserved id, malformed patterns, `{n}` rules, the schedule condition and properties.
  - `apps/scare-cue/src/vocab.ts` returns an empty `Registry` and `main.ts` calls it, which shows the app builds on the kit.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.7_

- [x] 3.1 Parse rule sentences
  - `parseSentence` for the three rule forms, with `n` capture, case rules, and error results with columns.
  - `test/fixtures/toy-vocab.ts`: a neutral registry used by the core tests.
  - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.6_

- [x] 3.2 Print rules and round trip
  - `printRule`; property test that printing then parsing returns an equal rule; property test that `parseSentence` never throws.
  - _Requirements: R3.6, R3.7_

- [x] 3.3 Scheduled write sentences
  - Parse and print `write` sentences, with the restrictions (own actor, no nesting, line ≥ 1, a schedule condition must exist).
  - _Requirements: R3.5, R3.6, R3.7_

- [x] 3.4 Spec loader
  - `loadSpec` with list markers, headings and prose ignored, grouping by actor, events split out, file line numbers in errors, and case-insensitive sentence detection.
  - _Requirements: R3.8, R3.9_

- [x] 4.1 Grid parsing
  - `parseGrid` with the default legend, combined cells, free tiles, `GridError`.
  - _Requirements: R4.1, R4.2_

- [x] 4.2 Distance and movement
  - `distance`, `isBlocked`, `stepToward`, `stepAway`, with property tests.
  - _Requirements: R4.3, R4.4, R4.5, R4.6_

- [x] 4.3 World creation
  - `createWorld` (turn order, ids, validation, `WorldError`), `insertLine`, `cloneWorld`.
  - _Requirements: R4.7, R4.8, R4.9, R4.10_

- [x] 5.1 Trace types and the turn loop
  - `trace/types.ts`; `tick` with top-to-bottom evaluation, first true line wins, no-true-line case, shared state between actors of one tick, shadowed lines.
  - _Requirements: R5.2, R5.3, R5.4, R5.5, R5.11_

- [x] 5.2 Scheduled events
  - Clock advance, events applied before turns, insertion at a clamped line for every actor of the kind, event trace.
  - _Requirements: R5.1, R5.6_

- [x] 5.3 Properties and status
  - Property checks after every turn, violation stops the tick, horizon gives `complete`, `tick` on a finished world returns `null`, `run`.
  - _Requirements: R5.7, R5.8, R5.9_

- [x] 5.4 Determinism and trace format
  - Property tests: identical traces from a clone, JSON round trip, random line lists keep R5.2 and R5.5.
  - _Requirements: R5.2, R5.5, R5.10, R5.11_

- [x] 6.1 Midnight Ward vocabulary
  - `apps/midnight-ward/src/vocab.ts`: registry, legend, turn order, horizon, `makeItem`. Unit tests for each condition and action, the property, and the `a ghost is near` rule.
  - _Requirements: R6.1, R6.2, R6.3, R6.9_

- [x] 6.2 Levels and character specs
  - `apps/midnight-ward/specs/{prologue,night-1,night-4}.md`, `src/levels.ts`, and a `buildWorld(level, placement, inserts)` helper. Test that every spec file loads with no errors.
  - _Requirements: R6.6_

- [x] 6.3 Oracle fixtures and replay
  - A temporary script runs the prototype engine on the five levels (Night II and III as test fixtures) and writes `test/fixtures/oracle.json` with its source commit. The script is deleted afterwards. The test replays every scenario through the kit and compares it. A second test checks that an empty board is violated on all five levels.
  - _Requirements: R6.4, R6.5_

- [x] 6.4 Puzzle behaviour tests
  - Night IV: the rewrite at the sixth bell. Night I: a bell line below the always-true line is shadowed and never fires, and the same line above it fires.
  - _Requirements: R6.7, R6.8_

- [x] 7.1 Requirement coverage test
  - A test that reads this spec's `requirements.md` and fails when an id has no test name starting with it.
  - _Requirements: R1.8_

- [x] 7.2 README quick start and final check
  - Add the commands to `README.md`. Remove `node_modules`, run `pnpm install`, `pnpm build` and `pnpm test`, and record the test count in the commit message body.
  - _Requirements: R1.2, R1.3, R1.4_
