# Design Document: solver

## Overview

The solver answers two questions with the same engine the game runs:

1. **Find solutions.** For every choice a player can make before a night (item placements and card insertions), does the night end `complete`? Count them.
2. **Find a counterexample.** For every way a visitor can move, does a safety rule ever fail? Return the shortest failing trace, or count the paths and call the level safe.

```
 choice generator ──build(choice)──▶ World ──run──▶ status              findSolutions
   (boardChoices)                                                        { solutions, total, firstSolution }

 start World + wanderer ──layer by layer──▶ Map<stateKey, {paths, goalPaths, parent}>   findCounterexample
        tick(clone, registry, { scripted: { visitor: to } })                { verdict, shortest, counterexamples, paths, goalPaths, states }
```

The solver imports the engine and calls `tick`. It has no rule evaluation of its own and no game words. The apps add vocabulary, levels and glue (`solve.ts` in Midnight Ward, `level.ts` in Scare Cue).

## Changes to existing modules

These are small, and each has a requirement in `requirements.md`.

### Registry: prohibitions (S6.4)

```ts
interface TurnContext extends EvalContext { turn: TurnTrace }       // actor = the actor the rule is about
interface ProhibitionDef {
  id: string;                         // same id format as actions
  pattern: string;                    // lowercase words, no {n}: 'trigger', 'be on'
  /** True when the prohibited thing happened on `turn`. Must not mutate the world. */
  occurs(ctx: TurnContext): boolean;
}
Registry.addProhibition(def): this;  prohibition(id);  matchProhibition(text);  prohibitions();
PropertyDef.check(world: World, turn?: TurnTrace): PropertyFailure | null     // second argument is new and optional
```

Property ids may now start with a capital letter (`/^[A-Za-z][A-Za-z0-9_]*$/`) so that safety rules are called `S1` and `S2`. Condition, action and prohibition ids keep the lowercase format.

### Grammar: safety rules (S6.1 to S6.3, S6.5)

```ts
interface SafetyRule { actor: string; prohibited: string; cond: string; n?: number }   // prohibited = prohibition id
type Sentence = ... | { type: 'safety'; rule: SafetyRule };
interface SpecSet { actors; events; safety: SafetyRule[] }                              // safety is new
```

New sentence form, parsed before the three rule forms:

```
safety = "THE" actor "SHALL" "NOT" prohibition "WHILE" condition "."
```

- `WHILE` is the EARS keyword for a state, so it is written in capitals like the others. The condition is any registered condition except `always`.
- Without `WHILE`, a sentence with `SHALL NOT` gets the error `a safety rule reads: THE <actor> SHALL NOT <prohibition> WHILE <condition>.` with the column of `NOT`.
- `printSafety(rule, registry)` prints `THE <actor> SHALL NOT <pattern> WHILE <condition text>.`
- `loadSpec` pushes safety rules to `spec.safety` and adds no entry to `spec.actors`. `createWorld` throws `WorldError` when a safety rule names a kind that is not on the grid.

### Engine and world (S5.1 to S5.5)

```ts
interface TickOptions { scripted?: Readonly<Record<string, Pos>> }   // actor id -> tile to move to
tick(world, registry, options?: TickOptions): TickTrace | null
firedRule(world: World, turn: TurnTrace): Rule | null                // the rule of turn.firedId, looked up in the actor's lines
openSteps(world: World, from: Pos): Pos[]                            // [from, east, west, south, north], blocked tiles left out
```

A scripted actor does not evaluate lines. Its turn entry is `{ evals: [], fired: null, firedId: null, shadowed: [], shadowedIds: [], from, to }`. The tile is not checked: the caller (the solver) only passes tiles from `openSteps` or from its own `moves`. The properties are checked after the scripted turn like after any turn, and the engine passes the turn trace to `check`. `run` takes no options.

### Safety properties (S6.7)

`engine/safety.ts`:

```ts
registerSafety(registry: Registry, rules: readonly SafetyRule[]): string[]   // returns ['S1', 'S2', ...]
```

Each rule becomes a `PropertyDef` with `id = 'S' + (index + 1)`. Its `check(world, turn)`:

1. If `turn` is missing, return `null`.
2. For each actor of the rule's kind, in turn order: build `{ world, actor, turn }`. When `prohibition.occurs(ctx)` and `condition.test(ctx, n)` are both true, collect the actor id.
3. Return `{ message: printSafety(rule), actors }` when any were collected, else `null`.

The condition is evaluated for the subject actor, so `a visitor is adjacent` means "adjacent to this prop". The check runs after every turn, not only the turn of the subject. A prohibition decides what "happened" means: `trigger` looks at the turn (did this actor just fire the action?), `be on` looks at the state (is the fog on?).

## Solver (`src/solver`)

```
src/solver/
  types.ts           ChoiceGenerator, Wanderer, results, SolverError
  key.ts             stateKey(world)
  solutions.ts       findSolutions
  board.ts           boardChoices
  counterexample.ts  findCounterexample
  index.ts
```

### Find solutions (S2.1 to S2.4)

```ts
interface ChoiceGenerator<C> {
  choices(): Iterable<C>;           // lazy, in a fixed order
  build(choice: C): World;          // a fresh world that shares nothing with other worlds
}
type PropertyId = string;           // the "Property": the id of a registered PropertyDef
interface SolutionSummary<C> { solutions: number; total: number; firstSolution: C | null }
findSolutions<C>(generator: ChoiceGenerator<C>, registry: Registry, property: PropertyId): SolutionSummary<C>
```

For each choice: `world = build(choice)`, `world.properties = [property]`, `run(world, registry)`, count it when `world.status === 'complete'`. The property is a registered id, so the engine checks it with the same code as the game. Memory is constant: choices are streamed.

### Board choices (S3.1 to S3.4)

```ts
interface ItemToken { type: string; make(pos: Pos): ItemInit }
interface BoardOptions {
  base: World;                      // never mutated; cloned for every build
  tiles: Pos[];                     // free tiles, in reading order
  items: ItemToken[];               // tokens to place; all of them are placed
  cards: Rule[];                    // each card is unused or inserted once
  actors?: string[];                // actor ids that may receive cards; default every actor of base
}
interface BoardChoice { tiles: number[]; cards: (null | { actor: string; at: number })[] }
boardChoices(options: BoardOptions): ChoiceGenerator<BoardChoice>
```

Placements: tokens are placed in order. Token k tries tile indexes from `start` upward, skipping tiles already used. `start` is `previous index + 1` when the previous token has the same type (so same-type tokens are an unordered set), otherwise 0. With two salt tokens and 39 tiles this gives C(39, 2) = 741 placements.

Card arrangements: card `i` is unused or goes to `(actor, at)` with `0 <= at <= lines(actor) + earlier cards in actor`. `at` is the index at the moment the card is inserted, because cards are inserted in card order. Night I has two cards, three actors with one line each: 7 options for the first card, and 55 arrangements in all. Night I has 39 free tiles and one bell: 39 × 55 = 2145.

`build(choice)` clones `base`, appends `items[k].make(tiles[choice.tiles[k]])` to the world's items (a world-level helper, `addItem`, validates like `createWorld`), then calls `insertLine(..., 'card')` for each used card in card order.

### Find a counterexample (S4.1 to S4.8)

```ts
interface Wanderer { actor: string; moves?: (world: World) => Pos[] }     // default: openSteps of the actor's tile
interface CounterexampleProblem {
  world: World;                     // the start world, tick 0, running; not mutated
  registry: Registry;
  wanderer: Wanderer;
  properties?: string[];            // default: world.properties
  goal?: (world: World, trace: TickTrace) => boolean;   // evaluated after each tick that did not fail
}
interface Counterexample { property: string; tick: number; moves: Pos[]; trace: TickTrace[] }
type CounterexampleResult =
  | { verdict: 'safe'; paths: number; goalPaths: number; states: number }
  | { verdict: 'unsafe'; shortest: Counterexample; counterexamples: Counterexample[]; paths: number; goalPaths: number; states: number }
findCounterexample(problem: CounterexampleProblem): CounterexampleResult
```

`counterexamples` has one entry per failed property, ordered by tick and then by discovery. `states` is the number of (tick, state) entries that were expanded.

**Algorithm.** A layer is a `Map<string, Entry>` for one tick, where `Entry = { world, paths, goalPaths, parent, move }`.

```
layer0 = { stateKey(start): { world: start clone, paths: 1, goalPaths: 0, parent: null } }
for depth = 1 .. horizon - start.tick:
  next = new Map()
  for entry in layer (insertion order):
    states++
    for to in moves(entry.world):                          // fixed move order
      w = cloneWorld(entry.world)
      trace = tick(w, registry, { scripted: { [wanderer.actor]: to } })
      if trace.violation:
        if no counterexample yet for violation.property: record { tick: w.tick, path: entry's path + to }
        continue                                           // not extended, not counted
      hit = goal?.(w, trace) ?? false
      key = stateKey(w)
      e = next.get(key) ?? new entry { world: w, paths: 0, goalPaths: 0, parent: entry, move: to }
      e.paths += entry.paths
      e.goalPaths += hit ? entry.paths : entry.goalPaths   // a path that has hit the goal stays hit
      next.set(key, e)
  layer = next
paths = sum of entry.paths in the last layer;  goalPaths = sum of entry.goalPaths
```

Why it is correct: two paths that reach the same state at the same tick have the same future, because the engine is deterministic and the state key covers everything the engine reads. So their counts can be added and one entry can stand for both. `goalPaths` keeps "has this path hit the goal yet" as a count per state, so the key needs no extra flag. A property that fails on a path at tick t is first seen at the first layer where any path fails it, so the first record per property is a shortest one. Ties go to the entry and move that come first in map and move order.

**State key.** `stateKey(world)` joins, in a fixed order: status; for each actor, id, tile and line ids; for each item, type, tile, solid flag and state entries sorted by name. Line ids are part of it because scheduled rewrites add lines; they are the same on every path at one tick, so they never split a state. The tick is not in the key because each layer has one tick.

**Counterexample trace.** Entries keep a parent pointer and the move that was first used to reach them. On a violation the solver walks the parent chain to get `moves`, then replays them from the start world with `tick` to produce `trace` (the engine's own trace, the same as the CCTV replay will use). The replay must fail the same property at the same tick, otherwise the solver throws an `Error` (an internal check).

**Counts.** Counts are JavaScript numbers. The solver throws `SolverError` if one exceeds `Number.MAX_SAFE_INTEGER`. Scare Cue has 4,008,562 paths, far below that.

**Cost.** Scare Cue has 23 visitor tiles and 4 prop states, so at most about 92 states per layer, 5 moves each, 12 layers: roughly 5,500 simulated ticks for 4,008,562 paths.

## Midnight Ward glue (`apps/midnight-ward`)

`LevelDef` gains two fields: `items: PlacedItem[]` (the tokens to place, for example `['salt']`) and `cards: Rule[]`. Values come from the prototype's level data:

| level | items | cards |
|---|---|---|
| Prologue | `salt` | none |
| Night I | `bell` | `IF the bell is near, THEN ... stay still` twice |
| Night IV | `bell` | `IF the bell is near, THEN ... move away from the girl` once |
| Night II (test only) | `salt`, `salt` | none |
| Night III (test only) | `candle`, `salt` | none |

`src/solve.ts` is glue only: `levelChoices(level)` calls `boardChoices` with `base: buildWorld(level)`, `tiles: parseGrid(level.rows, LEGEND).free`, the tokens from `makeItem` and the level's cards. `solveLevel(level)` calls `findSolutions(levelChoices(level), registry, 'girl_safe')`. `emptyBoard(level)` runs `buildWorld(level)` with nothing added and returns its status. The test compares the counts with literals.

## Scare Cue (`apps/scare-cue`)

### Vocabulary (`src/vocab.ts`, S8.1)

| kind | id | phrase | meaning |
|---|---|---|---|
| condition | `visitor_near` | a visitor is near | nearest visitor within 2 of the prop |
| condition | `visitor_adjacent` | a visitor is adjacent | within 1 |
| condition | `fog_on` | the fog is on | the fog item has `on: true` |
| condition | `light_off` | the exit light is off | the exit-light item has `on: false` |
| action | `trigger` | trigger | no change to the world. The visitor is scared when the prop fires it with a visitor within 2 (the goal). |
| action | `stay` | stay still | none |
| action | `spray` | spray fog | `fog.on = true` |
| action | `stop` | stop the fog | `fog.on = false` |
| action | `turn_off` | turn off | `exit-light.on = false` |
| action | `stay_on` | stay on | `exit-light.on = true` |
| prohibition | `trigger` | trigger | the actor's fired rule on this turn has the action `trigger` |
| prohibition | `be_on` | be on | the fog item is on |

Distances are Manhattan, measured from the prop actor's tile to the nearest `visitor` actor.

### Specs

`specs/props.md` holds the default prop rules (the same as the prototype):

```
THE jump-scare:   WHEN a visitor is near, THE jump-scare SHALL trigger.
THE fog machine:  WHEN a visitor is near, THE fog machine SHALL spray fog.
                  THE fog machine SHALL stop the fog.
THE exit light:   WHEN the fog is on, THE exit light SHALL turn off.
                  THE exit light SHALL stay on.
```

`specs/safety.md` holds the two safety rules, which become `S1` and `S2`:

```
THE fog machine SHALL NOT be on WHILE the exit light is off.
THE jump-scare SHALL NOT trigger WHILE a visitor is adjacent.
```

The prototype wrote `THE fog SHALL NOT ...` and `THE jump-scare SHALL NOT ...` as display text. The kit needs an actor kind for each rule, so S1 names the fog machine.

### Level (`src/level.ts`, S8.3, S8.4)

```
#########        V visitor   J jump-scare (closed tile)   F fog machine (closed tile)   E exit light (open tile, marker exit)
#V..J...#        Legend: V { actor: 'visitor' }
#.......#                J { actor: 'jump-scare', item: prop, solid }
#.#####.#                F { actor: 'fog machine', item: fog { on: false }, solid }
#.......#                E { actor: 'exit light', marker: 'exit', item: exit-light { on: true } }
####F#E##
#########
```

Actor kinds with a space (`fog machine`, `exit light`) are valid actor names in the grammar. Turn order is `['visitor', 'jump-scare', 'fog machine', 'exit light']` and the horizon is 12. The visitor has no rules and is scripted by the solver.

Cards are EARS sentences parsed by the kit (the actor comes from the sentence):

| card | sentence | role |
|---|---|---|
| fix for the exit light | `IF the fog is on, THEN THE exit light SHALL stay on.` | fixes S1 |
| fix for the jump-scare | `IF a visitor is adjacent, THEN THE jump-scare SHALL stay still.` | fixes S2 |
| decoy for the fog machine | `IF the exit light is off, THEN THE fog machine SHALL stop the fog.` | does not help: the fog machine acts before the exit light |

`buildScareCue(inserts: { card: number; at: number }[])` clones the base world and inserts cards in the given order. `checkScareCue(inserts)` calls `findCounterexample` with the wanderer `visitor`, the goal "the jump-scare fired `trigger` with a visitor within 2", and returns the result. The prototype keeps the same rule: a scare counts when the trigger fires within 2.

## `pnpm verify` (S10.1 to S10.4)

`scripts/verify.mjs` starts a Vite server in middleware mode with no config file (about 0.1 s), loads one TypeScript module with `ssrLoadModule` and calls it. The module is `scripts/verify-levels.ts`, which imports both apps' level modules through their workspace paths, runs the checks, and returns rows. Vite handles TypeScript and the `?raw` imports of the spec files, so the script reads the same files the apps do. The script prints the table, exits 0 or 1, and prints the total time. It contains no expected counts: it reports what the solver returned and checks only the expectations of S10.2.

```
app             level                      mode             result                         paths / total          time
midnight-ward   Prologue                   solutions        4 solutions                    29 choices             ...
midnight-ward   Night I                    solutions        12 solutions                   2145 choices           ...
midnight-ward   Night IV                   solutions        7 solutions                    329 choices            ...
scare-cue       default rules              counterexample   unsafe: S2 at bell 2, S1 at 5  ...
scare-cue       both fixes at line 1       counterexample   safe, 92% still scared         4008562 paths          ...
```

The exact columns are decided when the script is written; every value in them comes from the solver result in that run.

## Error handling

| Situation | Behaviour |
|---|---|
| Property id not registered, wanderer not in world, world not running, count too large | `SolverError` naming the problem |
| Bad safety sentence | `parseSentence` returns an error; `loadSpec` collects a `SpecError` with the line number |
| Safety rule for a kind not on the grid | `WorldError` |
| Prohibition registration problems | `RegistryError` |
| Scripted actor id not in the world | `Error` naming the id (programmer error) |
| Verify expectation fails | message on stderr, exit code 1 |

## Testing strategy

Test names start with the requirement id. Vitest plus fast-check.

- **Kit tests** (`packages/haunt-kit/test`): use the toy vocabulary (`test/fixtures/toy-vocab.ts`), extended with a prohibition and a safety property. No game words.
  - S4.2: for random small worlds (a wanderer on a small open grid, 3 to 5 ticks, a random target tile that fails the property), `paths` equals the count from enumerating every move sequence with the engine, and the shortest tick equals the brute-force shortest tick. `goalPaths` is compared the same way.
  - S4.1: a world with a large path count is solved with a transition counter bound far below the number of paths.
  - S6.3: arbitrary safety rules print and parse back equal. S6.2: arbitrary text never makes the parser throw.
  - S3.1 to S3.3: counts against closed formulas (binomials, the card arrangement count) for small boards.
  - S1.2, S1.3: source scans of `src/solver`.
- **Midnight Ward tests** (`apps/midnight-ward/test/solve.test.ts`): literals 4/29, 12/2145 and 7/329, and 4/741 and 15/1482 for the test-only nights. Empty boards lose. The first solution wins when replayed.
- **Scare Cue tests** (`apps/scare-cue/test`): vocabulary, spec loading, level shape, and the oracle table (S9.1 to S9.5) as literals.
- **Verify test** (`packages/haunt-kit/test/verify.test.ts`): spawns `node scripts/verify.mjs`, checks exit code 0, the time under 3 seconds, and that the numbers in the table equal the numbers from direct solver calls.
- **Coverage test**: reads this `requirements.md` and fails when an id has no test whose name starts with it, and when a task does not refer to an id.

## Out of scope

The MCP tools (`solve_level`, `explain_failure`), the spec book UI, CCTV rendering, the printed safety report, `targetSolveRate`, hooks, and Nights II and III as product levels.
