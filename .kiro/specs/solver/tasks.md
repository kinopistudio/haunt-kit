# Implementation Plan: solver

Run the tests after each task, fix failures, tick the box, and commit with `spec(task N.N): <short description>`. Do not push. Do not copy code from `reference/prototype`; use it only to check results. If an oracle number does not match, find the difference in semantics until it does. Do not change the expected numbers.

- [ ] 1.1 Registry: prohibitions and capitalised property ids
  - `ProhibitionDef`, `TurnContext`, `Registry.addProhibition`, `prohibition`, `matchProhibition`, `prohibitions`. `PropertyDef.check` takes an optional second argument `turn`. Property ids may start with a capital letter.
  - Extend `test/fixtures/toy-vocab.ts` with a prohibition.
  - _Requirements: S6.4_

- [x] 1.2 Grammar: parse and print safety rules
  - `SafetyRule`, the `safety` sentence type, `parseSentence` for `THE <actor> SHALL NOT <prohibition> WHILE <condition>.` with the error cases, `printSafety`, and a validity check.
  - Property tests: print then parse returns an equal rule; arbitrary text never makes the parser throw.
  - _Requirements: S6.1, S6.2, S6.3_

- [x] 1.3 Loader and world: safety rules in `SpecSet`
  - `SpecSet.safety`, collected by `loadSpec` in file order with file line numbers in errors. `createWorld` throws `WorldError` for a safety rule whose kind is not on the grid. Update the existing tests that build a `SpecSet`.
  - _Requirements: S6.5, S6.6_

- [x] 2.1 Engine: scripted moves, the turn for properties, `firedRule`, `openSteps`
  - `tick(world, registry, { scripted })`, `check(world, turn)`, `firedRule`, `openSteps`. Add `addItem` to the world module and let `createWorld` use it.
  - Tests that a call without options behaves as before (the rule-engine suite stays green).
  - _Requirements: S5.1, S5.2, S5.3, S5.4, S5.5_

- [x] 2.2 Safety properties
  - `registerSafety(registry, rules)` in `src/engine/safety.ts`. Tests with the toy vocabulary: a turn-based prohibition, a state-based prohibition, the condition evaluated for the subject actor, message and actors, ids `S1`, `S2`.
  - _Requirements: S6.7_

- [x] 3.1 Solver skeleton and `findSolutions`
  - `src/solver` with `SolverError`, `ChoiceGenerator`, `stateKey`, `findSolutions`, exports in `haunt-kit`. Source scans for game words and forbidden globals.
  - _Requirements: S1.1, S1.2, S1.3, S1.4, S1.5, S2.1, S2.2, S2.3, S2.4_

- [x] 3.2 Board choices
  - `boardChoices` with placements (same-type tokens as a set), card arrangements, enumeration order, and `build`. Tests against closed formulas and for isolation between built worlds.
  - _Requirements: S3.1, S3.2, S3.3, S3.4_

- [x] 3.3 `findCounterexample`
  - The layered search with memoization, path and goal-path counts by DP, shortest counterexample per property, replayed trace, default and custom moves, `SolverError` cases.
  - Property test against brute-force enumeration on small worlds. A test that transitions stay far below the path count.
  - _Requirements: S1.4, S1.5, S4.1, S4.2, S4.3, S4.4, S4.5, S4.6, S4.7, S4.8_

- [x] 4.1 Midnight Ward: items and cards on levels, and the oracle by search
  - Add `items` and `cards` to `LevelDef` for the three levels and the two test-only nights. `src/solve.ts` glue. `test/solve.test.ts` asserts 4/29, 12/2145, 7/329, 4/741, 15/1482, the empty boards, and that the first solution wins.
  - _Requirements: S7.1, S7.2, S7.3, S7.4, S7.5_

- [x] 5.1 Scare Cue vocabulary
  - `apps/scare-cue/src/vocab.ts`: four conditions, six actions, two prohibitions. Add a Vitest script to the app. Tests for each word on small worlds.
  - _Requirements: S8.1_

- [x] 5.2 Scare Cue specs, level and cards
  - `specs/props.md`, `specs/safety.md`, `src/level.ts` (map, legend, turn order, horizon, cards as sentences, `buildScareCue`, `checkScareCue`). Tests for spec loading, level shape and cards.
  - _Requirements: S8.2, S8.3, S8.4_

- [x] 5.3 Scare Cue engine semantics
  - A test that scripts the visitor's moves by hand and checks the turn order, that `S1` and `S2` are checked after every prop's turn, and that the first failure stops the tick.
  - _Requirements: S8.5_

- [x] 6.1 Scare Cue oracle
  - `test/oracle.test.ts` with the literals: default rules fail `S2` at 2 and `S1` at 5; both fixes at line 1 are safe with 4,008,562 paths and 92% scared; fixes at line 2 and decoy only fail; the states expanded stay below 5,000; the counterexample trace shape.
  - _Requirements: S9.1, S9.2, S9.3, S9.4, S9.5_

- [ ] 7.1 `pnpm verify`
  - `scripts/verify.mjs` and `scripts/verify-levels.ts`: the Vite middleware loader, the table, the expectations, exit codes, the total time. `packages/haunt-kit/test/verify.test.ts` runs it and checks the exit code, the time and the numbers.
  - _Requirements: S10.1, S10.2, S10.3, S10.4_

- [ ] 8.1 Requirement coverage, README and final check
  - A test that reads this `requirements.md` and fails when an id has no test name starting with it, or a task refers to an unknown id.
  - Update `README.md` (the verify line and the layout). Run `pnpm build`, `pnpm test` and `pnpm verify`, and record the verify table and the test count in the commit message body.
  - _Requirements: S1.6_
