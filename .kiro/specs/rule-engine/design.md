# Design Document: rule-engine

## Overview

`packages/haunt-kit` is a pure TypeScript library. Apps hand it a **registry** (their words), a **spec text** (EARS sentences) and a **grid**. It returns a **world** that `tick` advances and a **trace** per tick. The kit has no knowledge of ghosts, girls, bells or fog.

```
 app vocab.ts ──register──▶ Registry ◀──── grammar (parse / print / loadSpec)
                               │                    │
                               ▼                    ▼
 grid rows + legend ──▶ world (createWorld) ◀── SpecSet {actors, events}
                               │
                               ▼
                    engine.tick(world, registry) ──▶ TickTrace
```

## Package layout

```
package.json  pnpm-workspace.yaml  tsconfig.base.json  scripts/verify.mjs
packages/haunt-kit/
  package.json            "exports": "./src/index.ts" (TypeScript source, no emit)
  src/index.ts            public entry; the only path apps may import
  src/grammar/            types.ts  parse.ts  print.ts  spec.ts  index.ts
  src/registry/           types.ts  registry.ts  index.ts
  src/world/              types.ts  grid.ts  move.ts  create.ts  index.ts
  src/engine/             tick.ts  index.ts
  src/trace/              types.ts  index.ts
  test/                   one file per module, plus boundaries and spec-coverage tests
packages/haunt-kit-mcp/   package.json + src/index.ts placeholder (no code yet)
apps/midnight-ward/
  index.html  vite.config.ts  src/main.ts
  src/vocab.ts            registry, legend, turn order, item helpers
  src/levels.ts           level rows and spec text for the Prologue, Night I, Night IV
  specs/*.md              character specs (EARS sentences)
  test/                   vocab, specs, puzzle and oracle tests, fixtures/
apps/scare-cue/           same shell; src/vocab.ts returns an empty registry for now
```

`solver/` is reserved in the purity rule (R1.7) but is created by the solver spec.

Module dependencies point one way: `grammar → registry`, `world → grammar, registry`, `engine → world, registry, trace`. Registry and world refer to each other only through `import type`.

`haunt-kit` is consumed as TypeScript source (`exports` points at `src/index.ts`). This keeps `pnpm test` working on a fresh clone with no prior build. `pnpm build` runs `tsc --noEmit` for the library.

## Grammar (`src/grammar`)

### Data types

```ts
type Keyword = '' | 'WHEN' | 'IF';          // '' = ubiquitous
interface Rule { kw: Keyword; cond: string; act: string; n?: number }
// cond is a condition id or 'always'. act is an action id. n is set iff the condition pattern has {n}.
// Invariant: kw === '' exactly when cond === 'always'.

interface ScheduledEvent { tick: number; actor: string; line: number; rule: Rule }  // line is 1-based
type Sentence =
  | { type: 'rule'; actor: string; rule: Rule }
  | { type: 'write'; event: ScheduledEvent };

interface ParseError { message: string; column: number }                            // column is 1-based
type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };

interface SpecSet { actors: Record<string, Rule[]>; events: ScheduledEvent[] }
interface SpecError extends ParseError { line: number; text: string }               // line is 1-based, in the file
```

### Sentence forms

```
rule     = ubiquitous | event | unwanted
ubiq     = "THE" actor "SHALL" action "."
event    = "WHEN" condition "," "THE" actor "SHALL" action "."
unwanted = "IF" condition "," "THEN" "THE" actor "SHALL" action "."
write    = "WHEN" schedule-condition "," "THE" actor "SHALL" "write" '"' rule '"' "at line" integer "."
actor    = lowercase word, optionally more words or hyphens: [a-z][a-z0-9-]*( [a-z0-9-]+)*
```

- Keywords `THE`, `WHEN`, `IF`, `THEN`, `SHALL` are uppercase. Phrase text is matched case-insensitively and with collapsed spaces. The printer always emits registered pattern text as registered.
- The first `, ` after the condition ends the condition. Registered patterns therefore may not contain commas, periods or double quotes (R2.4).
- `write` is a rewrite of the actor's own spec: the inner rule must name the same actor, must not itself be a `write`, and the line must be an integer ≥ 1 (R3.6). `WHEN always` is not a form: the ubiquitous rule is how `always` is written.
- A `write` sentence is not a line of the spec. The loader moves it into `SpecSet.events`.

### API

```ts
parseSentence(text: string, registry: Registry): ParseResult<Sentence>
printRule(actor: string, rule: Rule, registry: Registry): string
printEvent(event: ScheduledEvent, registry: Registry): string
loadSpec(text: string, registry: Registry): { spec: SpecSet; errors: SpecError[] }
```

`loadSpec` handles a Markdown-like file line by line:

1. Strip leading whitespace and one list marker (`-`, `*`, `1.`, `1)`).
2. If the rest starts with `THE`, `WHEN` or `IF` (any case) and contains `SHALL` (any case), it is a sentence. Parse it; on failure push a `SpecError` with the file line number (R3.9).
3. Otherwise ignore the line.

`parseSentence` never throws. Printing throws `Error` only for a rule that references an unregistered id (a programmer error, not user input).

## Registry (`src/registry`)

```ts
interface EvalContext { world: World; actor: Actor }

interface ConditionDef {
  id: string;                       // /^[a-z][a-z0-9_]*$/, not 'always'
  pattern: string;                  // 'the girl is near' or 'the clock strikes {n}'
  schedule?: boolean;               // the trigger of write sentences; at most one
  test(ctx: EvalContext, n: number): boolean;   // must not mutate the world. n is 0 if the pattern has no {n}.
}
interface ActionDef {
  id: string;
  pattern: string;                  // no {n}
  run(ctx: EvalContext): void;      // may mutate the world through world helpers
}
interface PropertyFailure { message: string; actors: string[] }
interface PropertyDef {
  id: string;
  description: string;
  check(world: World): PropertyFailure | null;
}

class Registry {
  addCondition(def: ConditionDef): this;
  addAction(def: ActionDef): this;
  addProperty(def: PropertyDef): this;
  condition(id: string): ConditionDef | undefined;
  action(id: string): ActionDef | undefined;
  property(id: string): PropertyDef | undefined;
  matchCondition(text: string): { def: ConditionDef; n?: number } | undefined;
  matchAction(text: string): ActionDef | undefined;
  readonly scheduleCondition: ConditionDef | undefined;
  conditions(): readonly ConditionDef[];  actions(): readonly ActionDef[];  properties(): readonly PropertyDef[];
}
class RegistryError extends Error {}
```

A pattern is lowercase words separated by single spaces, with at most one `{n}` word, and without `,` `.` `"`. `{n}` is turned into the regular expression `(\d+)` for matching and into the decimal number for printing. Conditions and properties are pure functions of the world. Registration order is kept and is the order of `properties()`.

## World (`src/world`)

```ts
interface Pos { x: number; y: number }
interface GridMap { w: number; h: number; walls: ReadonlySet<number> }      // key = y * w + x

type LineOrigin = 'spec' | 'card' | 'rewrite';
interface Line { id: number; rule: Rule; origin: LineOrigin }               // id is unique per world, never reused
interface Actor { id: string; kind: string; pos: Pos; lines: Line[] }
interface Item { type: string; pos: Pos; solid: boolean; state: Record<string, boolean | number> }

type WorldStatus = 'running' | 'complete' | 'violated';
interface World {
  map: GridMap;
  markers: Record<string, Pos[]>;
  actors: Actor[];                  // array order is turn order
  items: Item[];
  events: ScheduledEvent[];
  properties: string[];             // property ids checked after every turn
  tick: number;                     // 0 before the first tick
  horizon: number;                  // status becomes 'complete' when tick reaches it
  status: WorldStatus;
  nextLineId: number;
}
```

The world is plain data (no functions, no registry reference). `tick` mutates it in place. `cloneWorld` copies everything mutable; `map.walls` is shared because it is never mutated.

### Grid parsing

```ts
interface CellDef { wall?: boolean; actor?: string; item?: Omit<ItemInit, 'pos'>; marker?: string }
type Legend = Record<string, CellDef>
interface ItemInit { type: string; pos: Pos; solid?: boolean; state?: Record<string, boolean | number> }
interface ParsedGrid {
  map: GridMap;
  starts: { kind: string; pos: Pos }[];     // reading order
  items: ItemInit[];                        // reading order
  markers: Record<string, Pos[]>;
  free: Pos[];                              // plain floor tiles: no wall, actor, item or marker
}
parseGrid(rows: string[], legend: Legend): ParsedGrid
```

`#` (wall) and `.` (plain floor) are built-in legend entries and can be overridden. A cell may combine fields: the Midnight Ward `B` is `{ actor: 'girl', marker: 'bed' }`. `parseGrid` throws `GridError` (R4.2).

### Distance and movement

```ts
distance(a: Pos, b: Pos): number                         // |dx| + |dy|
isBlocked(world: World, p: Pos): boolean                 // outside, wall, or solid item
stepToward(world: World, actor: Actor, target: Pos): boolean
stepAway(world: World, actor: Actor, from: Pos): boolean
```

`stepToward` computes `dx, dy` to the target. If both are 0 it returns false. The major axis is x when `|dx| >= |dy|` and y otherwise. It tries the major-axis step (sign of the difference, skipped if that difference is 0), then the minor-axis step, and moves on the first unblocked one. `stepAway` negates `dx, dy` first. Both return whether the actor moved.

### Creation

```ts
interface WorldConfig {
  grid: ParsedGrid;
  spec: SpecSet;
  registry: Registry;
  horizon: number;
  turnOrder?: string[];             // kinds that move first, in this order
  items?: ItemInit[];               // extra items placed on top of the grid items
  properties?: string[];            // default: every registered property
}
createWorld(config: WorldConfig): World          // throws WorldError
insertLine(world: World, actorId: string, index: number, rule: Rule, origin: LineOrigin): Line
cloneWorld(world: World): World
```

`createWorld` sorts the starts (turnOrder kinds first, stable; the rest in reading order), assigns ids (`wisp`, `wisp-2`), copies each kind's rules as lines with origin `spec`, and validates every rule and event against the registry (known ids, `n` present exactly when the pattern has `{n}`, known property ids, every spec kind present on the grid). `insertLine` uses a 0-based index; the 1-based line of a sentence maps to `line - 1`.

## Engine (`src/engine`)

```ts
tick(world: World, registry: Registry): TickTrace | null
run(world: World, registry: Registry): TickTrace[]       // ticks until status !== 'running'
```

Algorithm of `tick`:

1. If `world.status !== 'running'`, return `null`.
2. `world.tick += 1`.
3. For each event in `world.events` with `event.tick === world.tick`, in order: for each actor of `event.actor` kind, `insertLine(..., event.line - 1, event.rule, 'rewrite')` (clamped), and add an `EventTrace`.
4. For each actor in array order:
   1. Evaluate lines top to bottom until one is true; `evals` holds the booleans evaluated, `fired` the index of the true line or `null`.
   2. If a line fired, evaluate the lines below it without running them; the true ones are `shadowed`. This happens before the action runs.
   3. Run the fired line's action. Record `from` and `to`.
   4. For each id in `world.properties`, call `check`. On the first failure set `status = 'violated'`, set the violation, and stop the tick. The violating turn is the last entry of `turns`.
5. If the status is still `running` and `world.tick >= world.horizon`, set it to `complete`.
6. Return the trace.

The engine never reads the clock, a random source or the DOM. The same world and registry always give the same trace.

## Trace (`src/trace`)

```ts
interface EventTrace { actor: string; kind: string; index: number; lineId: number }   // index is 0-based
interface TurnTrace {
  actor: string;                       // actor id
  kind: string;
  evals: boolean[];                    // lines evaluated top to bottom, up to and including the fired line (all lines if none fired)
  fired: number | null;                // 0-based index of the fired line at the time of the turn
  firedId: number | null;              // Line.id of the fired line
  shadowed: number[];                  // 0-based indexes of lower lines that were also true
  shadowedIds: number[];
  from: Pos;
  to: Pos;
}
interface ViolationTrace { property: string; message: string; actors: string[] }
interface TickTrace {
  tick: number;
  events: EventTrace[];
  turns: TurnTrace[];
  violation: ViolationTrace | null;
  status: WorldStatus;
}
```

Indexes shift when a line is inserted during a night, so consumers that need identity use the line ids. The trace is plain JSON. It carries no text; the UI looks up the line text through the world. The solver and the MCP server read this same format.

## Midnight Ward vocabulary (`apps/midnight-ward/src/vocab.ts`)

Ids follow the prototype so fixtures map one to one.

| condition id | phrase | holds when |
|---|---|---|
| `girl_near` | the girl is near | distance to the girl ≤ 3 |
| `bell_near` | the bell is near | a bell within 2 |
| `candle_near` | a lit candle is near | a lit candle within 2 |
| `dark` | it is dark | no lit candle within 2 |
| `salt_adjacent` | salt is adjacent | salt within 1 |
| `ghost_near` | a ghost is near | another ghost within 2 |
| `tick_is` (schedule) | the clock strikes {n} | `world.tick === n` |
| `tick_after` | the clock has struck {n} | `world.tick >= n` |

| action id | phrase | effect |
|---|---|---|
| `toward_girl`, `away_girl` | move toward / away from the girl | `stepToward` / `stepAway` the girl |
| `stay` | stay still | none |
| `toward_candle`, `away_candle` | move toward / away from the candle | step relative to the nearest lit candle (first in item order on ties); none if no candle is lit |
| `snuff` | snuff the candle | set `lit` to false on the nearest lit candle within 2 |
| `toward_window`, `toward_bed` | walk toward the window / walk back to bed | `stepToward` the first `window` / `bed` marker |

Property `girl_safe`: fails when any actor whose kind is not `girl` shares the girl's tile. The message is `<ghost id> caught the girl.` and `actors` lists the ghost ids on the tile, in turn order. Ghost kinds are `wisp`, `shade`, `snuffer`.

Legend: `B` is `{ actor: 'girl', marker: 'bed' }`, `W` is `{ marker: 'window' }`, `w`, `s`, `n` are wisp, shade and snuffer, `c` is a lit candle. Turn order is `['girl']`. Horizon is 12. Items: `bell`, `salt` (solid) and `candle` (`lit: true`) are created through `makeItem(type, x, y)`.

Deviation from the prototype: the prototype's `a ghost is near` counts the evaluating ghost, so it is always true for a ghost. This vocabulary counts only the other ghosts (R6.9). No prototype level uses the condition, so the oracle fixtures do not depend on it.

## Levels used by this spec

Levels ship as `{ id, name, rows, specText }` in `apps/midnight-ward/src/levels.ts` for the Prologue, Night I and Night IV, and their character specs sit in `apps/midnight-ward/specs/`. Night II and Night III are out of scope for the product, but the oracle comparison covers them through test-only fixtures in `apps/midnight-ward/test/fixtures/`, because they exercise `the clock has struck`, `a lit candle is near`, `snuff the candle` and the candle movement actions.

## Error handling

| Situation | Behaviour |
|---|---|
| Bad sentence text | `parseSentence` returns `{ ok: false, error }`; `loadSpec` collects `SpecError`s |
| Bad registration | `RegistryError` |
| Bad grid | `GridError` |
| Bad world config | `WorldError` |
| `tick` on a finished world | returns `null` |
| Unknown id met by the engine (a hand-built world) | throws `Error` naming the id |

## Testing strategy

Vitest plus fast-check. The name of every test starts with a requirement id, like `R3.7: round trip`. Test files are `*.test.ts` in each package's `test/` folder.

- **Registry, grammar, world, engine** (`packages/haunt-kit/test`): use a small neutral fixture vocabulary in `test/fixtures/toy-vocab.ts` (a `target`, `step` and `mark` vocabulary with no game words), so the core is tested without the Midnight Ward words.
- **Property tests (fast-check):**
  - R3.7: arbitrary rules from the toy registry print and parse back equal; arbitrary events do the same.
  - R3.6: arbitrary printable text never makes `parseSentence` throw.
  - R4.3, R4.4: distance is symmetric, non-negative and satisfies the triangle inequality; a step moves exactly one tile or none, never increases the distance toward a target on an open grid, and never lands on a blocked tile.
  - R4.7, R4.10: turn order and line insertion for arbitrary kind lists and indexes.
  - R5.2, R5.5: for arbitrary line lists with known truth values, the fired line is the first true one and the shadowed list is the later true ones.
  - R5.10: running a clone and the original gives equal traces.
  - R5.11: traces survive a JSON round trip.
- **Example tests:** one per remaining criterion, including every error case.
- **Structure tests** (R1.x, in `packages/haunt-kit/test/`): read `package.json` and `pnpm-workspace.yaml`, scan sources for forbidden globals and imports, run `scripts/verify.mjs`, and check that every id in `requirements.md` has a test (R1.8).
- **Oracle tests** (`apps/midnight-ward/test/oracle.test.ts`): the tests never import `reference/prototype`. A one-off script ran the prototype engine over the five levels on an empty board and on seeded random placements and inserted lines, and recorded per tick and per turn the fired index, the shadowed indexes and the actor position, plus the final status and the capturing ghost. The result is `test/fixtures/oracle.json`. It names the prototype commit it came from. The test replays each scenario through the kit and compares every recorded field. Fixture counts shown anywhere come from this file.
- **Build checks:** the final task runs `pnpm install`, `pnpm build` and `pnpm test` from a clean `node_modules`.

## Out of scope

The solver and its counts (4/29, 12/2145 and so on), `SHALL NOT` safety rules, the spec book UI, the MCP tools, rendering and sound, cards as a game mechanic, and the Scare Cue vocabulary.
