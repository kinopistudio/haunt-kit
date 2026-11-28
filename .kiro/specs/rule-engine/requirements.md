# Requirements Document: rule-engine

## Introduction

This spec covers the base of Haunt Kit: the pnpm workspace, the EARS grammar, the vocabulary registry, the grid world, the tick engine and its trace, and the first vocabulary (Midnight Ward). It does not cover the solver, the MCP server, the spec book UI, rendering, sound, levels beyond what is needed to test the engine, or Scare Cue's vocabulary.

Terms:

- **Rule**: one EARS sentence, stored as `{ kw, cond, act, n }`.
- **Line**: a rule at a position in an actor's spec. Lines have stable ids.
- **Phrase pattern**: the text of a condition or action, such as `the girl is near` or `the clock strikes {n}`.
- **Vocabulary**: the conditions, actions and properties an app registers.
- **Turn**: one actor evaluating its lines and running at most one action.
- **Violation**: a registered property returning a failure after a turn.
- **Oracle**: `reference/prototype/midnight-ward-engine.js`, used only to produce recorded fixtures. No code is copied from it.

Requirement ids (`R1.1`, `R1.2`, ...) are used as test-name prefixes, for example `R5.2: first true line wins`.

## Requirements

### Requirement 1: Workspace

**User Story:** As a developer who clones the repo, I want one pnpm workspace with the kit, a placeholder MCP package and two apps, so that every later spec builds on a scaffold that installs, builds and tests.

#### Acceptance Criteria

- **R1.1** THE workspace SHALL contain the packages `haunt-kit` (packages/haunt-kit), `haunt-kit-mcp` (packages/haunt-kit-mcp), `midnight-ward` (apps/midnight-ward) and `scare-cue` (apps/scare-cue), each with its own `package.json`, listed in `pnpm-workspace.yaml`.
- **R1.2** WHEN `pnpm install` runs at the root, THE workspace SHALL link both apps to `haunt-kit` through a `workspace:*` dependency.
- **R1.3** WHEN `pnpm build` runs, THE workspace SHALL type-check every package with TypeScript strict mode and SHALL produce a static Vite build in `dist/` for each app.
- **R1.4** WHEN `pnpm test` runs, THE workspace SHALL run every Vitest suite in every package and SHALL exit non-zero if any test fails.
- **R1.5** WHEN `pnpm verify` runs, THE workspace SHALL exit with code 0, until the solver spec replaces the stub.
- **R1.6** THE apps SHALL import rule logic only through the `haunt-kit` package name, and SHALL NOT import from `reference/` or reach into another package by relative path.
- **R1.7** THE source directories `grammar`, `world`, `engine`, `solver` and `trace` in `haunt-kit` SHALL NOT use `Math.random`, `Date` or DOM globals.
- **R1.8** THE workspace SHALL have at least one test whose name starts with each requirement id in this file.

### Requirement 2: Registry

**User Story:** As an app author, I want to register my own conditions, actions and properties, so that the core never needs to know my game's words.

#### Acceptance Criteria

- **R2.1** WHEN an app registers a condition with an id, a phrase pattern and a test function, THE registry SHALL return it by id and by matching phrase text.
- **R2.2** WHEN an app registers an action with an id, a phrase pattern and a run function, THE registry SHALL return it by id and by matching phrase text.
- **R2.3** THE registry SHALL start with no conditions, no actions and no properties. The only built-in is the condition id `always`, which has no phrase.
- **R2.4** IF a registration reuses an id, reuses a phrase pattern, uses the reserved id `always`, or has a malformed pattern, THEN THE registry SHALL throw a `RegistryError` that names the offending id.
- **R2.5** WHERE a phrase pattern contains `{n}`, THE registry SHALL accept it for conditions only and SHALL accept at most one placeholder per pattern.
- **R2.6** WHEN a condition is registered with `schedule: true`, THE registry SHALL use it as the trigger of scheduled write sentences, and IF a second schedule condition is registered, THEN THE registry SHALL throw a `RegistryError`.
- **R2.7** WHEN an app registers a property with an id and a check function, THE registry SHALL return it by id.

### Requirement 3: Grammar

**User Story:** As a spec author, I want to write rules as EARS sentences that the kit parses and prints back unchanged, so that one text drives the game, the solver and the tests.

#### Acceptance Criteria

- **R3.1** WHEN given `THE <actor> SHALL <action>.`, THE parser SHALL return the actor and a rule with `kw` `''` and `cond` `always`.
- **R3.2** WHEN given `WHEN <condition>, THE <actor> SHALL <action>.`, THE parser SHALL return a rule with `kw` `WHEN`.
- **R3.3** WHEN given `IF <condition>, THEN THE <actor> SHALL <action>.`, THE parser SHALL return a rule with `kw` `IF`.
- **R3.4** WHERE a condition pattern has `{n}`, THE parser SHALL store the integer found in that position as `n`.
- **R3.5** WHEN given `WHEN <schedule condition>, THE <actor> SHALL write "<rule>" at line <k>.`, THE parser SHALL return a scheduled event with the tick, the actor, the 1-based line `k` and the parsed inner rule.
- **R3.6** IF a sentence is not one of the four forms, uses a phrase that is not registered, uses a lowercase keyword, writes a rule for another actor, nests a write sentence, or gives a line below 1, THEN THE parser SHALL return an error with a message and a 1-based column, and SHALL NOT throw.
- **R3.7** THE printer SHALL print every valid rule and scheduled event in one canonical form, such that parsing the printed text returns an equal rule or event.
- **R3.8** WHEN spec text is loaded, THE loader SHALL collect rules by actor in file order, SHALL move write sentences into the event list, SHALL ignore lines that are not sentences (blank lines, headings, prose, list markers), and SHALL report each failed sentence with its 1-based file line number.
- **R3.9** IF a line starts with `THE`, `WHEN` or `IF` in any letter case and contains `SHALL` in any letter case, THEN THE loader SHALL treat it as a sentence and report it when it is invalid, instead of ignoring it.

### Requirement 4: World

**User Story:** As an engine author, I want a grid world with deterministic distance and movement, so that a rule always means the same thing.

#### Acceptance Criteria

- **R4.1** WHEN rows of text and a legend are parsed, THE world module SHALL return the width, the height, the wall set, the actor starts, the item inits, the named markers and the free tiles in reading order.
- **R4.2** IF rows differ in length or a character is not in the legend, THEN THE world module SHALL throw a `GridError` with the row and column.
- **R4.3** THE world module SHALL measure distance as Manhattan distance.
- **R4.4** WHEN an actor steps toward a target, THE world module SHALL try the axis with the larger absolute difference first (horizontal on a tie), then the other axis, and otherwise leave the actor where it is.
- **R4.5** WHEN an actor steps away from a target, THE world module SHALL apply R4.4 to the mirrored direction.
- **R4.6** THE world module SHALL treat tiles outside the map, wall tiles and tiles with a solid item as blocked, and SHALL NOT treat other actors as blocking.
- **R4.7** WHEN a world is created, THE world module SHALL order actors with the kinds in `turnOrder` first, then the rest in reading order, and SHALL give ids `kind`, `kind-2`, `kind-3` in that order.
- **R4.8** IF a spec names a kind that has no actor on the grid, a rule uses an id that is not registered, or a rule's `n` does not match its pattern, THEN THE world module SHALL throw a `WorldError` that names the problem.
- **R4.9** WHEN a world is cloned, THE clone SHALL share no mutable state with the original.
- **R4.10** WHEN a line is inserted into an actor's spec at an index, THE world module SHALL shift the lines at and below that index down by one, clamp an index past the end, and give the new line a fresh id that never changes.

### Requirement 5: Engine

**User Story:** As a game author, I want a tick to run one deterministic round and report which line fired and which lines were shadowed, so that the UI and the tests show the same facts.

#### Acceptance Criteria

- **R5.1** WHEN a tick starts, THE engine SHALL advance the clock by one, then apply the scheduled events due at that tick in declaration order, before any actor takes a turn.
- **R5.2** WHEN an actor takes its turn, THE engine SHALL evaluate its lines top to bottom and run the action of the first true line only.
- **R5.3** IF no line is true, THEN THE engine SHALL leave the actor where it is and SHALL record `fired` as `null`.
- **R5.4** THE engine SHALL evaluate each actor's conditions against the world as the earlier actors of the same tick left it.
- **R5.5** WHEN a line fires, THE engine SHALL record each lower line whose condition is also true, evaluated before the action runs, and SHALL NOT run those lines.
- **R5.6** WHEN a scheduled write is applied, THE engine SHALL insert the rule at the 1-based line (clamped to the end) in the spec of every actor of that kind, with origin `rewrite`.
- **R5.7** WHEN a property fails after an actor's turn, THE engine SHALL stop the tick, set the status to `violated`, record the property id, message and actors in the trace, and SHALL NOT let the remaining actors take a turn.
- **R5.8** WHEN the clock reaches the horizon and no property has failed, THE engine SHALL set the status to `complete`.
- **R5.9** WHEN `tick` is called on a world whose status is not `running`, THE engine SHALL return `null` and SHALL leave the world unchanged.
- **R5.10** THE engine SHALL be deterministic: the same world and registry SHALL produce identical traces on every run.
- **R5.11** THE trace of each tick SHALL contain the tick number, the applied events, one entry per turn taken (actor id, kind, evals, fired index and line id, shadowed indexes and line ids, from, to), the violation or `null`, and the status, and SHALL survive a `JSON.stringify` round trip unchanged.

### Requirement 6: Midnight Ward vocabulary

**User Story:** As a developer starting out with Kiro specs, I want Night I and Night IV to run on the kit with the words from the ghost grammar, so that the game's results can be trusted.

#### Acceptance Criteria

- **R6.1** THE Midnight Ward vocabulary SHALL register the conditions `the girl is near` (within 3), `the bell is near` (2), `a lit candle is near` (2), `it is dark` (no lit candle within 2), `salt is adjacent` (1), `a ghost is near` (2), `the clock strikes {n}` and `the clock has struck {n}`, using Manhattan distance.
- **R6.2** THE Midnight Ward vocabulary SHALL register the actions `move toward the girl`, `move away from the girl`, `stay still`, `move toward the candle`, `move away from the candle`, `snuff the candle`, `walk toward the window` and `walk back to bed`.
- **R6.3** THE Midnight Ward vocabulary SHALL register a property that fails when a ghost stands on the girl's tile, and the failure SHALL name the ghost.
- **R6.4** WHEN a level is run with the same item placement and inserted lines as a recorded prototype run, THE engine SHALL reproduce the prototype's fired line and shadowed lines of every turn, the position of every actor after every turn, and the final status.
- **R6.5** WHEN each of the five prototype levels is run on an empty board, THE night SHALL end `violated`.
- **R6.6** THE spec files in `apps/midnight-ward/specs` SHALL load with no errors under the Midnight Ward vocabulary.
- **R6.7** WHEN Night IV reaches the sixth bell, THE wisp SHALL receive the written rule as its first line, and the trace of that tick SHALL list the event.
- **R6.8** WHEN a bell line is inserted below an always-true line of a Night I wisp, THE engine SHALL report it as shadowed and SHALL NOT run it, and WHEN the same line is inserted above, THE engine SHALL run it whenever its condition holds.
- **R6.9** WHERE a ghost evaluates `a ghost is near`, THE condition SHALL count only the other ghosts, not the evaluating ghost.
