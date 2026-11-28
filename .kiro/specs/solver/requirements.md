# Requirements Document: solver

## Introduction

This spec adds the exhaustive solver to `packages/haunt-kit`, the `SHALL NOT` safety rules it needs, Scare Cue's vocabulary and level, and the `pnpm verify` command that runs the solver on every level of both apps. It builds on the `rule-engine` spec and does not change what that spec's requirements say. It does not cover the spec book UI, the MCP server, rendering or sound, or Nights II and III as product levels (their test-only fixtures are used as extra checks).

Terms:

- **Choice**: one thing a player may do before a night starts. For a board it is a placement of items on free tiles plus the positions where cards are inserted into specs.
- **Choice generator**: an object that lists every choice and builds a world for each one.
- **Property**: a registered check that must hold after every turn. It is named by its id.
- **Solution**: a choice whose world runs to the horizon with the property holding after every turn (`complete`).
- **Wanderer**: an actor with no rules whose move each tick is any step the solver may pick, such as a visitor.
- **State**: everything in a world that can change the future: tick, actor positions and lines, item positions and state.
- **Path**: one sequence of wanderer moves, one move per tick, from tick 0 to the horizon.
- **Counterexample**: a path, with its full trace, on which a property fails.
- **Goal**: a predicate over a tick that the caller supplies. A path reaches the goal when the predicate holds on at least one of its ticks.
- **Safety rule**: an EARS sentence `THE <actor> SHALL NOT <phrase> WHILE <condition>.` that becomes a property.
- **Prohibition**: a phrase an app registers for use after `SHALL NOT`, such as `trigger` or `be on`.
- **Oracle**: the numbers in `reference/prototype/`, copied into the tests as plain literals. The prototype code is never imported or copied.

Requirement ids (`S1.1`, `S1.2`, ...) are used as test-name prefixes, for example `S4.3: the shortest counterexample comes first`.

## Requirements

### Requirement 1: Solver module

**User Story:** As an app author, I want a solver that knows no game words, so that Midnight Ward and Scare Cue run on the same search code.

#### Acceptance Criteria

- **S1.1** THE solver SHALL live in `packages/haunt-kit/src/solver`, SHALL be exported from the `haunt-kit` entry point, and SHALL import only from the `grammar`, `registry`, `world`, `engine` and `trace` modules.
- **S1.2** THE files in `src/solver` SHALL NOT contain any of the words `ghost`, `girl`, `wisp`, `shade`, `snuffer`, `candle`, `salt`, `bell`, `visitor`, `fog`, `jump` or `light`, in code or comments.
- **S1.3** THE files in `src/solver` SHALL NOT use `Math.random`, `Date` or DOM globals, and the solver SHALL give equal results when run twice on equal inputs.
- **S1.4** IF an input is invalid (a property id that is not registered, a wanderer that is not an actor of the world, a world that is not `running`, or a count above `Number.MAX_SAFE_INTEGER`), THEN THE solver SHALL throw a `SolverError` that names the problem.
- **S1.5** THE solver SHALL NOT change any world, registry or choice it is given.
- **S1.6** THE workspace SHALL have at least one test whose name starts with each requirement id in this file.

### Requirement 2: Find solutions

**User Story:** As a level author, I want to count how many choices win a night, so that I know whether a level is solvable and how hard it is.

#### Acceptance Criteria

- **S2.1** WHEN `findSolutions` is given a choice generator, a registry and a property id, THE solver SHALL build a world for every choice in generator order, set the world's checked properties to that one property, run it to the end, and count the choice as a solution when the world ends `complete`.
- **S2.2** THE result SHALL be `{ solutions, total, firstSolution }`: the number of solutions, the number of choices, and the first solution in generator order.
- **S2.3** IF the generator has no choices, THEN THE result SHALL be `{ solutions: 0, total: 0, firstSolution: null }`, and IF no choice is a solution, THEN `firstSolution` SHALL be `null`.
- **S2.4** IF the property id is not registered, THEN THE solver SHALL throw a `SolverError` before it builds any world.

### Requirement 3: Board choices

**User Story:** As a level author, I want a generic choice generator for "put these items on free tiles and insert these cards into specs", so that every night uses the same enumeration.

#### Acceptance Criteria

- **S3.1** WHEN a board generator is given a list of item tokens and a list of free tiles, THE generator SHALL list every way to put each token on its own tile, and SHALL count tokens of the same type as interchangeable, so that two salt tokens on tiles A and B are one choice, not two.
- **S3.2** WHEN a board generator is given a list of cards, THE generator SHALL list for each card either "unused" or one actor and one 0-based insert index from 0 up to the number of lines the actor has plus the number of earlier cards already inserted into it, in card order.
- **S3.3** THE generator SHALL list every combination of one placement and one card arrangement exactly once, with placements in the outer loop and card arrangements in the inner loop, in a fixed order.
- **S3.4** WHEN the generator builds a world for a choice, THE world SHALL be a clone of the base world with the items added and the cards inserted in card order with origin `card`, SHALL share no mutable state with the base world or with any other built world, and SHALL leave the base world unchanged.

### Requirement 4: Find a counterexample

**User Story:** As a prop designer, I want the checker to try every possible visitor and show me the shortest one that breaks a safety rule, so that I can fix the specs without trusting a lucky test run.

#### Acceptance Criteria

- **S4.1** WHEN `findCounterexample` runs, THE solver SHALL search layer by layer over (tick, state), merge paths that reach the same state at the same tick into one entry, and expand each entry once, so that the number of simulated transitions is at most the number of ticks times the number of states per tick times the number of moves, whatever the number of paths.
- **S4.2** THE solver SHALL compute the number of paths by adding up counts per state, and SHALL NOT enumerate paths one by one. WHERE a world is small enough to enumerate, THE count SHALL equal the count from enumerating every path with the engine.
- **S4.3** WHEN a property fails on some path, THE solver SHALL return for each failed property the counterexample with the lowest tick, and `shortest` SHALL be the one with the lowest tick overall. WHEN two have the same tick, THE solver SHALL pick the one found first in move order.
- **S4.4** THE `trace` of a counterexample SHALL be the engine's trace of replaying its `moves` from the start world, and SHALL end with a tick whose violation names that property at the counterexample's tick.
- **S4.5** WHEN a transition makes a property fail, THE solver SHALL NOT extend that path, and SHALL NOT count it in `paths`.
- **S4.6** WHERE a goal predicate is given, THE solver SHALL count in `goalPaths` the paths that did not fail and for which the predicate held on at least one tick. WHERE no predicate is given, `goalPaths` SHALL be 0.
- **S4.7** THE verdict SHALL be `safe` exactly when no path makes any checked property fail, and the result SHALL carry `paths`, `goalPaths` and the number of `states` expanded. WHEN the verdict is `unsafe`, `paths` SHALL be the number of paths that reach the horizon without a failure.
- **S4.8** THE wanderer SHALL by default move to its own tile or to any of the four neighbouring tiles that are not blocked, and the caller MAY supply a different list of moves.

### Requirement 5: Engine and world support for the solver

**User Story:** As a solver author, I want the engine to run a tick in which one actor's move is chosen from outside, so that the search uses the same rules as the game.

#### Acceptance Criteria

- **S5.1** WHEN `tick` is given scripted moves for an actor id, THE engine SHALL, on that actor's turn, move the actor to the given tile and SHALL NOT evaluate its lines, and the turn trace SHALL have `evals` empty, `fired` `null` and `from` and `to` set.
- **S5.2** THE scripted turn SHALL happen at the actor's place in the turn order, and the properties SHALL be checked after it like after any other turn.
- **S5.3** WHEN the engine checks a property after a turn, THE engine SHALL pass the trace of that turn as the second argument, and `firedRule(world, turn)` SHALL return the rule of the line that fired, or `null`.
- **S5.4** THE world module SHALL list the tiles an actor may step to as its own tile followed by the east, west, south and north neighbours, in that order, leaving out blocked tiles.
- **S5.5** WHEN `tick` is called without scripted moves, THE engine SHALL behave exactly as before.

### Requirement 6: Safety rules

**User Story:** As a spec author, I want to write safety rules as EARS sentences with `SHALL NOT`, so that the safety requirements and the checker read the same text.

#### Acceptance Criteria

- **S6.1** WHEN given `THE <actor> SHALL NOT <prohibition> WHILE <condition>.`, THE parser SHALL return a safety rule with the actor, the prohibition id, the condition id and `n` when the condition has `{n}`.
- **S6.2** IF a safety sentence has an unregistered prohibition or condition, has no `WHILE` part, uses `always` as the condition, uses a lowercase keyword, or is a write sentence with `NOT`, THEN THE parser SHALL return an error with a message and a 1-based column, and SHALL NOT throw.
- **S6.3** THE printer SHALL print every valid safety rule in one canonical form, such that parsing the printed text returns an equal rule.
- **S6.4** WHEN an app registers a prohibition with an id, a phrase pattern and an `occurs` function, THE registry SHALL return it by id and by matching phrase text, and IF the id or the pattern is reused or malformed, or the pattern has `{n}`, THEN THE registry SHALL throw a `RegistryError`. THE registry SHALL accept property ids that start with a capital letter, such as `S1`.
- **S6.5** WHEN spec text is loaded, THE loader SHALL collect safety rules in file order in `spec.safety`, SHALL NOT add them to `spec.actors`, and SHALL report an invalid safety sentence with its 1-based file line number.
- **S6.6** IF a safety rule names an actor kind that has no actor on the grid, THEN `createWorld` SHALL throw a `WorldError` that names the kind.
- **S6.7** WHEN `registerSafety` is given a list of safety rules, THE function SHALL register one property per rule, named `S1`, `S2`, ... in order, and return the ids. THE property SHALL fail after a turn when, for an actor of the rule's kind, the prohibition occurs on that turn and the condition holds, evaluated for that actor. THE failure message SHALL be the printed rule and `actors` SHALL list the actor ids.

### Requirement 7: Midnight Ward solved by search

**User Story:** As a developer starting out with Kiro specs, I want the game's solve counts to come from a real search, so that every number the game shows is true.

#### Acceptance Criteria

- **S7.1** WHEN the solver searches the choices of a level, THE counts SHALL be solutions/total of 4/29 for the Prologue, 12/2145 for Night I and 7/329 for Night IV.
- **S7.2** WHEN a level is run with no items placed and no cards inserted, THE night SHALL end `violated`, for the Prologue, Night I and Night IV.
- **S7.3** WHERE the test-only Night II and Night III fixtures are searched, THE counts SHALL be 4/741 and 15/1482.
- **S7.4** WHEN the first solution of a level is built and run, THE night SHALL end `complete`.
- **S7.5** THE search SHALL read the level's rows, item list and card list and the registered vocabulary, and SHALL NOT read `oracle.json`. THE expected counts SHALL be literals in the test.

### Requirement 8: Scare Cue vocabulary and level

**User Story:** As a home haunter, I want Scare Cue to run on the same kit with only its own vocabulary file, so that the rules I write mean what the game rules mean.

#### Acceptance Criteria

- **S8.1** THE Scare Cue vocabulary in `apps/scare-cue/src/vocab.ts` SHALL register the conditions `a visitor is near` (within 2), `a visitor is adjacent` (within 1), `the fog is on` and `the exit light is off`, the actions `trigger`, `stay still`, `spray fog`, `stop the fog`, `turn off` and `stay on`, and the prohibitions `trigger` and `be on`, with Manhattan distance from the prop to the nearest visitor.
- **S8.2** THE spec files `apps/scare-cue/specs/props.md` and `apps/scare-cue/specs/safety.md` SHALL load with no errors under that vocabulary, and `safety.md` SHALL give two safety rules, `S1` (the fog machine SHALL NOT be on WHILE the exit light is off) and `S2` (the jump-scare SHALL NOT trigger WHILE a visitor is adjacent).
- **S8.3** THE level in `apps/scare-cue/src/level.ts` SHALL have a 9 by 7 map with the visitor start at (1, 1), the jump-scare, fog machine and exit light on their tiles, a horizon of 12 ticks, the turn order visitor, jump-scare, fog machine, exit light, the fog off and the exit light on at the start, and tiles with the jump-scare and the fog machine closed to the visitor.
- **S8.4** THE level SHALL offer three cards written as EARS sentences: a fix for the exit light, a fix for the jump-scare and a decoy for the fog machine, and SHALL build a world with any of them inserted at any line of its prop.
- **S8.5** WHEN the visitor's moves are scripted, THE engine SHALL run the props in the order jump-scare, fog machine, exit light after the visitor, and SHALL check `S1` and `S2` after every prop's turn, so that the first failure of a tick stops the tick.

### Requirement 9: Scare Cue solved by search

**User Story:** As a home haunter, I want the checker to say which safety rule fails first, when, and whether my fix really covers every visitor, so that I can trust the printed safety report.

#### Acceptance Criteria

- **S9.1** WHEN the default prop rules are checked, THE verdict SHALL be `unsafe`, the counterexample for `S2` SHALL be at tick 2, the counterexample for `S1` SHALL be at tick 5, and `shortest` SHALL be the `S2` one.
- **S9.2** WHEN the exit-light fix and the jump-scare fix are both inserted at line 1, THE verdict SHALL be `safe`, `paths` SHALL be 4,008,562, and `goalPaths` as a share of `paths`, rounded to a whole percent, SHALL be 92.
- **S9.3** WHEN the two fixes are inserted at line 2, or only the decoy is inserted, THE verdict SHALL be `unsafe`.
- **S9.4** WHEN the safe check runs, THE number of states expanded SHALL be below 5,000 and the number of paths SHALL be above 4,000,000, which shows that paths are counted and not walked.
- **S9.5** THE `trace` of a Scare Cue counterexample SHALL have one tick entry per bell up to the failure, each with a turn for the visitor followed by the turns of the props, and SHALL end with the violation of the failed rule.

### Requirement 10: Verify command

**User Story:** As a developer, I want one command that checks every level of both apps and prints what it found, so that a spec edit can be checked in seconds.

#### Acceptance Criteria

- **S10.1** WHEN `pnpm verify` runs, THE command SHALL run the solver on the Prologue, Night I and Night IV and on Scare Cue with its default rules and with both fixes, and SHALL print one table row per check with the app, the level, the mode, the result and the time.
- **S10.2** THE command SHALL exit with code 0 WHEN every Midnight Ward level has at least one solution and loses on an empty board, and Scare Cue is `unsafe` with its default rules and `safe` with both fixes. OTHERWISE THE command SHALL print the failed expectation and exit with code 1.
- **S10.3** THE command SHALL finish in under 3 seconds on a laptop, including start-up.
- **S10.4** EVERY number in the table SHALL be a value returned by the solver in that run. THE command SHALL NOT contain the oracle numbers.
