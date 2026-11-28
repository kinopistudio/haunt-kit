# Design Document: midnight-ward

## Overview

The game is a thin shell around the kit. All rule logic (evaluating lines, recording a night, counting solutions, explaining a loss, marking lines) is in `haunt-kit`. The app adds the plan, the screens, the canvas scene, the sound and the words.

```
 LevelDef ──buildWorld(level, items, inserts)──▶ World ──recordRun──▶ Recording
     ▲                                                                   │
  Plan (items, cards per actor)                         ┌────────────────┼───────────────────┐
     ▲                                                  ▼                ▼                   ▼
  PlayScreen ◀── pointer / keys              bookState(cursor)    frames[cursor]      explain(...) ──▶ wording
     │                                                  ▼                ▼                   ▼
     ├──▶ SpecBook (kit)  ◀──── BookView ───────────────┘          Scene (canvas)       verdict text
     ├──▶ ReplayBar (kit) ──── cursor ───▶ everything above        FxLayer (threads, ash)
     └──▶ Sfx (Web Audio)
```

The state shown at any moment is a function of `(plan, recording, cursor)`. Nothing is stored in the DOM or in the canvas, so scrubbing, stepping and playing agree (M4.3, M4.7).

## Module layout

```
apps/midnight-ward/
  index.html            fonts, viewport, favicon as data URI, <div id="app">
  src/
    main.ts             boot, router, wiring
    styles.css          layout, tray, cards, screens, coach, verdict (the book styles come from the kit)
    content.ts          level info (concept, lesson), actor names, hint setups
    levels.ts vocab.ts solve.ts      existing
    plan.ts             Plan and its operations (pure)
    night.ts            runNight, outcome, struck line, burned lines (pure)
    wording.ts          the failure explanation and dawn text (pure)
    coach.ts            coachStep (pure)
    storage.ts          safe localStorage, progress, settings
    route.ts            parseRoute, hashFor (pure)
    audio.ts            Sfx (Web Audio)
    motion.ts           reducedMotion()
    screens/title.ts    screens/levels.ts    screens/play.ts
    render/theme.ts     colours and fonts as constants
    render/camera.ts    projection, fit, unprojection (pure)
    render/floor.ts     the top-down floor texture
    render/walls.ts     wall heights and faces
    render/sprites.ts   girl, wisp, items, shadows, chips
    render/scene.ts     Scene: tweens, layers, draw order, hit test
    render/fx.ts        FxLayer: threads and ash on a viewport-sized canvas
  test/                 existing tests plus one file per module above
```

`apps/*` may add vocabulary, levels, rendering and sound. They may not evaluate rules or search. So `wording.ts` only chooses words for what `explain` found, and `night.ts` only calls `recordRun`, `lineStats` and `bookState`.

## Plan (M3)

```ts
interface Plan {
  items: { type: PlacedItem; x: number; y: number }[];
  /** Per actor id, the lines of its spec in order: the level's own lines and the cards put between them. */
  lists: Record<string, ({ t: 'base'; i: number } | { t: 'card'; c: number })[]>;
}
```

`freshPlan(level)` reads the actor ids and line counts from `buildWorld(level)`. The operations are pure and return a new plan: `placeItem`, `takeItem`, `moveItem`, `insertCard`, `removeCard`, `remaining`, `usedCards`, `isFreeTile`, `clear`. A tile is free when it is in the level's `free` list (plain floor) and no placed item is on it. The solver defines the same choices with its own arrangement order, so `toInserts(plan)` lists each actor's cards in ascending line position. Inserting in that order gives each card the position it has in the list, and the world matches `boardChoices.build` for the equal choice (M3.11, tested by running both).

## Running a night (M4, M5)

```ts
interface NightRun {
  recording: Recording; registry: Registry;
  outcome: 'won' | 'lost';
  struck: number[];            // line ids to strike on a loss
  stats: Map<number, LineStat>;
}
function runNight(level: LevelDef, plan: Plan): NightRun
```

`runNight` builds the world with `buildWorld`, calls `recordRun`, and decides the outcome from `recording.status`. On a loss the struck line is the line the girl ran on the last tick (her first line when none ran). On a win, `burned` is the number of lines with `fired === 0`.

The cursor lives in the kit's `ReplayBar`. When it moves, `PlayScreen.show(cursor, how)` computes `bookState(recording, cursor, { final, struck })`, and passes `frames[cursor]` and `traces[cursor - 1]` to the scene. `how` is `forward` (the cursor moved by +1 while the replay was playing or stepped), or `jump` (anything else). Only `forward` plays sounds, threads, tweens and the dawn or capture sequence. A `jump` snaps, so a scrub is instant and silent. The outcome panel shows when the cursor is at the end, with the end effects only on `forward`.

## Explanation wording (M6)

`explain` is called with `actorName` (`Wisp I`, `Wisp II`, `The girl`), `tickWord: 'bell'`, `originNote: { card: 'your card' }`. `wording.ts` then builds:

```
She is gone.
Bell 7. Wisp II reached the girl while running line 1: “THE wisp SHALL move toward the girl.”
Line 2 of Wisp I (your card) never fired: line 1 was true first, so it shadowed it at bell 4.
At bell 6, Wisp I wrote itself a new line 1: “WHEN the girl is near, THE wisp SHALL move toward the girl.” The lines under it moved down by one.
A card is still in your hand.
```

The first sentence is built from the `violation` finding: the turn actor is a ghost (`reached the girl while running`) or the girl (`walked into <ghost> while following`). The rest are the kit's sentences. Cards come first (findings whose line has origin `card`), then the other findings, at most four, and `N more lines never fired` when there are more. The unused-card sentence comes last and only when `cards.length` is above the number placed.

Dawn text: `<k> line(s) never fired all night and burned away. A rule that can never run is a bug in any spec.` (or `Every line fired at least once tonight.`) and `<n> of <m> possible setups survive this night. Yours is one of them.` with `n` and `m` from `solveLevel(level)`. The solve runs once per level per session after the first win (a few milliseconds for the Prologue, under a second for Night I) and is cached.

## Camera and projection (M8)

One pinhole camera with a fixed pitch. World axes are x to the east, y to the south, z up, in tile units. The camera looks at the floor point `(cx, cy, 0)` from a distance `D`, tilted by `pitch` from the horizon (π/2 is straight down).

```
v = y - cy;  depth = D - v·cos(pitch) - z·sin(pitch)
u = (x - cx) / depth;   w = (z·cos(pitch) - v·sin(pitch)) / depth
screen X = X0 + K·u;    screen Y = Y0 - K·w;    pixels per tile at that depth = K / depth
```

`fit(map, canvasW, canvasH)` projects the eight corners of the dollhouse (floor corners, back wall top, front wall top), takes their bounding box, and picks `K`, `X0`, `Y0` so that the box fills 96% of the canvas. It runs when the size changes, never per frame. The pitch is `1.05` rad, the distance `1.7 × max(w, h)`. Both are constants, so the camera never moves (M8.1).

`unprojectFloor(X, Y)` inverts the formula for `z = 0`: with `w = (Y0 - Y) / K`, `v = w·D / (w·cos(pitch) - sin(pitch))`, `depth = D - v·cos(pitch)`, `x = cx + (X - X0)/K · depth`, `y = cy + v`. A point above the horizon of the floor (the denominator is not negative) gives `null`. `tileAt` floors the result and returns `null` outside the map (M8.6).

## Scene layers (M8)

Each frame, `Scene.draw(now)` does this, back to front:

1. **Floor texture.** An offscreen canvas of `w × h` tiles at 96 px per tile. A cached base layer (planks, the bed, the faded moon patch under the back-wall window) is copied in; then range diamonds, the coach tile, the keyboard cursor and the drop preview are drawn on it, then the darkness mask. The mask is a second offscreen canvas filled with `rgba(4,3,2,darkness)` and punched with radial `destination-out` holes at the girl, each ghost, the lit candles and the moon patch.
2. **Strips.** The texture is cut into 16 strips per tile row. Each strip is drawn into the quad between its projected top and bottom edges, at the width of its depth (`drawImage` with a destination rectangle).
3. **Depth-sorted list.** Wall blocks, the bed's headboard, items and characters are put in a list with the depth key of their feet (`y + 0.6` for sprites, the wall's front edge for walls), sorted ascending and drawn in that order. A wall block draws its south face, the east or west face that faces the camera, and its top. The back wall (row 0) is 1.25 tiles high, the side and inner walls 0.55, the front wall 0.22. The back wall has wallpaper stripes, a skirting board and a window with a cold glow.
4. **Sprites.** Each sprite function draws in tile units with its feet at the origin. `upright()` projects the tile, draws an ellipse as the contact shadow (width from the scale at that depth, height from `sin(pitch)`), then translates and scales the context and calls the sprite. The girl is flat in the texture while she lies in bed. The wisp has a glow, a wavy hem, eyes and a bob. The numeral badge and the `L2` chip are drawn by the same function in screen-aligned units.
5. **Screen light.** Additive candle bloom, a gold wash at dawn, a vignette, and the red tint on capture.

`Scene.setFrame({ world, trace, phase, animate })` sets the target positions; each character's drawn position is a tween from its previous drawn position over `tickMs` (620, 260 at ×2, 0 under reduced motion). Darkness eases toward `0.22` while planning, `0.72` during a night, `0.08` at dawn. Ambient motion (bob, flicker, breathing) is multiplied by `motionScale`, which is 0 under reduced motion; then the scene only redraws when something changed.

`Scene.hit(clientX, clientY)` first tests the upright sprites (items, characters) with their screen rectangles, then falls back to `tileAt`.

Everything that converts world to screen is `camera.ts`. A plain top-down camera would replace `project`, `unprojectFloor` and `fit`, and the strips would collapse to one draw per row (M8.11).

## FX layer (M9)

`FxLayer` owns a full-viewport `canvas` with `pointer-events: none`. `thread(from, to, color)` stores a quadratic curve with a wobble; each frame it draws the curve up to progress `t`, with a bead at the head, and fades it out. Duration is 700 ms at ×1 and 380 ms at ×2. `ash(rect)` emits about 26 particles from a line's rectangle; each moves up and sideways with drag, shrinks and fades. Both do nothing under reduced motion. The layer stops its animation frame loop when it has nothing to draw.

## Sound (M10)

`Sfx` creates the `AudioContext` on the first `unlock()` called from a pointer or key event. `muted` is checked in every method before anything is scheduled.

- **Toll:** five sine partials at ratios 1, 2.01, 2.76, 5.4, 8.9 of 196 Hz, an exponential decay of about 3 s. The twelfth bell is a little louder.
- **Scratch:** two short bursts of band-passed noise, with a falling envelope.
- **Click:** a 60 ms burst of noise around 1.8 kHz.
- **Sting:** a sine that falls from 90 Hz to 30 Hz, and two detuned triangles at 233 and 247 Hz (a minor second).
- **Chime:** five sine notes with a bell envelope on a pentatonic scale, rising, each 140 ms apart.
- **Hum:** a quiet low drone while the sound is on, lower during dawn. It stops when muted.

All frequencies are literals in `audio.ts`. There are no audio files and no tune.

## Coach (M7)

```ts
type CoachTarget =
  | { kind: 'tool'; type: string } | { kind: 'tile'; x: number; y: number }
  | { kind: 'card'; index: number } | { kind: 'slot'; actor: string; at: number }
  | { kind: 'remove'; actor: string; at: number } | { kind: 'ring' } | { kind: 'retry' } | { kind: 'next' };
interface CoachStep { id: string; tag: string; text: string; target: CoachTarget | null }
function coachStep(level: LevelDef, input: CoachInput): CoachStep | null
```

`CoachInput` is `{ phase: 'plan' | 'night' | 'won' | 'lost'; plan; selection; lastLossShadowed: boolean }`. A level's hint (`content.ts`) is one winning setup: `{ items: [{ type, x, y }], cards: [{ card, actor, at }] }`. The coach walks it in order and returns the first step whose condition is not yet met:

```
Prologue : take the salt → tap the glowing tile in the gap → ring
Night I  : take the bell → tap the glowing tile → take card → slot (wisp, line 1) → take card → slot (wisp-2, line 1) → ring
```

When a card sits below line 1 of a spec whose line 1 is always true (found by reading the plan, not by running it), the step becomes the shadow warning with the `remove` target. After a loss the step points at `retry`; after a win at `next`. A test runs each hint through `runNight` and expects a win (M7.3).

`PlayScreen` turns the target into a CSS selector (`[data-tool=salt]`, `[data-card="0"]`, `.hk-slot[data-actor=wisp][data-at="0"]`, `#ring`) and adds the pulse class, and passes `tile` targets to the scene.

## Storage (M1.4, M2.4, M7.6, M10.2)

`storage.ts` wraps `localStorage` in try/catch, with an in-memory fallback. Keys: `mw.cleared` (JSON array of level ids), `mw.coach` (JSON array of level ids whose coach is done), `mw.muted` (`"1"` or absent). `Progress` has `isCleared`, `markCleared`, `coachDone`, `markCoachDone`, `resetCoach`, `muted`, `setMuted`. It takes a `Storage`-like object, so tests pass a fake.

## Screens and layout (M2, M11)

`route.ts` maps the hash to `{ screen: 'title' } | { screen: 'nights' } | { screen: 'night', id }`. `main.ts` listens to `hashchange`, tears down the old screen (`destroy()` stops loops and listeners) and mounts the new one. Unknown ids go to the title.

Play screen DOM:

```
header.bar        [← Nights]  Night I · Rule order                [Hint ?] [Sound]
p.lesson          the idea of the night
div.coach         step tag, one instruction, [Hide tutorial]
div.stage
  section.room    clock (pips + label) / canvas / tray / verdict
  section.book    SpecBook
div.dock          Ring midnight | Clear board       (plan)
                  ReplayBar | Back to planning      (night)
div#live          visually hidden, aria-live="polite"
```

At 861 px and wider, `.stage` has two columns (3fr room, 2fr book). Below it, one column: clock, canvas, tray, book, verdict; the dock is `position: sticky; bottom: 0` with a solid ink background and the safe-area inset, so the primary controls stay reachable at 375 px. The canvas height comes from the fit aspect, at most 78% of the window height.

Pointer handling uses one `Drag` helper: `pointerdown` on a tool or card remembers the start; after 6 px of movement it creates a floating copy, sets the selection (so slots open and range diamonds show), and each `pointermove` updates the drop target (`scene.hit` for items, `book.slotAt` for cards). `pointerup` drops or cancels. A press that does not move is a normal click. Tool and card buttons have `touch-action: none` so a touch drag does not scroll; the canvas has `touch-action: manipulation`, and a mouse can drag placed items from it, while touch uses tap to pick up and tap to put down.

## Errors and edge cases

- `buildWorld` throws if a spec has parse errors. The play screen is only mounted for levels that `verify` has accepted, but it still catches the error and shows a plain message with the line numbers instead of a blank page.
- `localStorage` or `AudioContext` missing: the game plays, without memory or sound.
- A resize while a night is shown redraws at the new size and keeps the cursor.
- Ringing with nothing placed is allowed. It loses, and the explanation says why.
- A window with a width below 320 px still works; the canvas scales down.

## Testing

- Pure modules (`plan`, `night`, `wording`, `coach`, `route`, `storage`, `camera`) get example tests, and fast-check where it fits: for every plan operation sequence the plan stays valid, `tileAt(project(tile)) = tile` for every floor tile at any canvas size.
- `wording` is tested on real recordings: Night I with a card under the always-true line, Night I with a bell and no cards, Night IV with a rewrite, a win. The expected sentences are literals; the numbers are checked against the recording.
- Drawing is tested through a fake `CanvasRenderingContext2D` that records calls: the floor is drawn as strips of increasing size, walls come before the sprites behind them in the draw order, each sprite is preceded by an ellipse, no camera parameter changes between two frames.
- `PlayScreen` is tested in `happy-dom` with a stub scene and a stub `Sfx`: select an item, tap a tile, select a card, choose a slot, ring, step to the end, read the verdict, try again, plan intact.
- Source scans: no `fetch`, no audio or image file names, no `reference/` imports, no solve counts as literals, `localStorage` only in `storage.ts`.
- By hand, in a browser, at 1280 px and at 375 px: the title, the level select, the Prologue coach to a win, Night I with a mistake and a retry, Night IV to the dawn, the mute toggle, the console. This is recorded in the final task.

## What is simplified

- The shade and snuffer ghosts (Nights II and III) have no sprites of their own. The wisp sprite is used for every ghost kind. Those levels are not part of the game.
- There is no window on the board. The vocabulary's `walk toward the window` has no level in this game.
- The level select lists three levels. The numerals (I, IV) are the game's own.
