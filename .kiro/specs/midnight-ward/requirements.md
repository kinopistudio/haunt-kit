# Requirements Document: midnight-ward

## Introduction

This spec is the shipped game: a title screen, a level select (Prologue, Night I, Night IV) and the play screen, with a plan phase, a night phase that replays twelve bells, a win and a lose screen, a short coach, a 2.5D dollhouse view on a canvas, and synthesised sound. It builds on the `rule-engine`, `solver` and `spec-book-ui` specs. The rules, the levels and their solve counts are not changed here.

It does not cover Nights II and III, director mode, a public-spec linter, camera choreography, accounts, leaderboards, level sharing, a language switch, a backend or analytics.

Terms:

- **Plan**: what the player has chosen before a night: items on tiles, and cards in the specs of actors.
- **Tray**: the row of items and cards the player has not yet used.
- **Night**: one run of the level's world for 12 bells with the engine.
- **Replay**: showing a recorded night bell by bell, with a cursor the player can move.
- **Coach**: the short tutorial on the Prologue and Night I.
- **Scene**: the canvas view of the ward.
- **Fixed camera**: one pitch, one distance, one centre. They never change while the game runs.
- **Thread**: the ink line that lifts off the firing line of a spec and runs to its ghost.

Requirement ids (`M1.1`, `M1.2`, ...) are used as test-name prefixes, for example `M5.3: a won night marks lines that never fired as ash`. A few requirements describe what a person sees. Their tests check the logic that decides it (a model, a class name, a drawing call), and the task that closes the spec records the check made in a browser.

## Requirements

### Requirement 1: Build, hosting and boundaries

**User Story:** As a judge, I want a static site that works from any URL, so that I can open the game without setup.

#### Acceptance Criteria

- **M1.1** WHEN `pnpm --filter midnight-ward build` runs, THE build SHALL write a static site to `apps/midnight-ward/dist` with `base: './'`, so that every asset URL is relative.
- **M1.2** THE app SHALL import rule evaluation, recording, line statistics, failure explanation, solving and the spec book only from `haunt-kit`, and SHALL NOT import from `reference/`.
- **M1.3** THE app SHALL contain no audio or image files and no `fetch` or `XMLHttpRequest`. THE only network request SHALL be the Google Fonts stylesheet named in `game-feel.md`. ALL text SHALL be English.
- **M1.4** THE app SHALL read and write `localStorage` only through `src/storage.ts`, and a missing or failing `localStorage` SHALL NOT break the game.
- **M1.5** THE workspace SHALL have at least one test whose name starts with each requirement id in this file.

### Requirement 2: Screens and navigation

**User Story:** As a player, I want a title, a list of nights and a play screen, so that I always know where I am.

#### Acceptance Criteria

- **M2.1** THE title screen SHALL show the name `Midnight Ward`, the line `A ghost that obeys its spec.`, a `Begin` button that opens the level select, and a mute toggle.
- **M2.2** THE level select SHALL list the Prologue, Night I and Night IV, each with its name and the idea it teaches, and a ✓ mark on every level the player has cleared. No level SHALL be locked.
- **M2.3** THE app SHALL read the screen from the URL hash (`#/`, `#/nights`, `#/night/<id>`), SHALL show the title for any unknown hash, and SHALL react to the browser's back and forward buttons.
- **M2.4** WHEN a night is won, THE app SHALL store the level as cleared, and the level select SHALL show it as cleared after a reload.
- **M2.5** THE play screen SHALL have a way back to the level select and a mute toggle at all times.

### Requirement 3: Plan phase

**User Story:** As a player, I want to put items on the board and cards into specs with my finger or the mouse, so that I can set the trap before the bells ring.

#### Acceptance Criteria

- **M3.1** THE tray SHALL show every item type of the level with the number left, and every card of the level as its EARS sentence.
- **M3.2** WHEN the player selects an item and then taps a free floor tile, THE app SHALL place the item there, reduce the number left, and clear the selection when none are left.
- **M3.3** IF the tile is a wall, holds an actor or an item, or is the bed, THEN THE app SHALL NOT place the item.
- **M3.4** WHEN the player taps a placed item, THE app SHALL take it back into the tray and select that item type.
- **M3.5** WHEN the player drags an item from the tray, or a placed item with a mouse, onto a free tile, THE app SHALL place it there. WHEN the drop is not on a free tile, THE item SHALL return to where it came from.
- **M3.6** WHEN the player selects a card, THE spec book SHALL show insertion slots in every actor's spec, and WHEN the player chooses a slot, THE app SHALL put the card there, and the lines at and below it SHALL move down by one.
- **M3.7** WHEN the player drags a card over a slot, THE slot SHALL be marked as the drop target, and WHEN the card is dropped on it, THE app SHALL insert the card. WHEN it is dropped elsewhere, THE card SHALL stay in the tray.
- **M3.8** THE inserted card SHALL appear as a card line with a remove control, and WHEN the control is used, THE card SHALL return to the tray. EACH card SHALL be in at most one spec, and a used card SHALL look used in the tray.
- **M3.9** THE spec book SHALL show every spec as it will be run, with the cards in place, while the player plans. THE scene SHALL show a dotted range diamond around a bell that is placed or selected, as far as the condition `the bell is near` reaches.
- **M3.10** WHEN the player chooses `Clear board`, THE app SHALL return every item and card to the tray.
- **M3.11** THE plan SHALL build the same world the solver builds for the same choice: running a plan and running the equal solver choice SHALL end in the same status with equal traces.
- **M3.12** THE player SHALL be able to plan with the keyboard alone: arrow keys move a tile cursor on the board, Enter or Space places the selected item or picks up the item on that tile, and the tray buttons and the slots are tab stops.

### Requirement 4: Night phase

**User Story:** As a player, I want to watch the twelve bells and stop on any one, so that I can see which line each ghost obeyed.

#### Acceptance Criteria

- **M4.1** WHEN the player chooses `Ring midnight`, THE app SHALL record the night with `recordRun` on the world built from the plan, and the result SHALL be the same status the solver gives for that plan.
- **M4.2** THE app SHALL then replay the recording from bell 0 with the replay bar (play, pause, step, step back, scrub, speed), and the replay SHALL start playing by itself.
- **M4.3** AT each cursor THE spec book SHALL show the marks of `bookState`, and THE scene SHALL show `frames[cursor]`, so that what is shown is a function of the recording and the cursor only.
- **M4.4** THE clock above the scene SHALL show twelve pips with the first `cursor` of them lit, and a label: `Planning`, `Bell <n> of 12`, `Caught at bell <n>` or `Dawn`.
- **M4.5** WHILE a night is shown, THE plan SHALL be locked. WHEN the player chooses `Back to planning`, THE plan SHALL be as it was, and the replay SHALL be gone.
- **M4.6** WHEN a scheduled write happens at the cursor, THE new line SHALL appear in the spec of its actor at its position, written in red ink that bleeds through, with the ink scratch sound.
- **M4.7** WHEN the player moves the cursor with the scrubber, THE state shown SHALL be exactly what stepping to that bell would show.

### Requirement 5: Winning and losing

**User Story:** As a player, I want a clear ending, so that I know what happened and what to do next.

#### Acceptance Criteria

- **M5.1** WHEN a ghost reaches the girl, THE night SHALL end at that bell, and when the replay reaches it, THE app SHALL strike through the girl's line in red, tint the scene red, play the capture sting, and show the headline `She is gone.` with the explanation of Requirement 6.
- **M5.2** WHEN the player chooses `Try again`, THE app SHALL go back to planning with the plan as it was.
- **M5.3** WHEN the twelfth bell passes with the girl safe and the replay reaches it, THE app SHALL show the dawn: lines with a tally of 0 burn to ash, lines that ran turn gold, the scene brightens, and the dawn chime plays. THE headline SHALL read `Dawn. She is still asleep.`
- **M5.4** THE dawn text SHALL give the number of lines that never fired, and `<n> of <m> possible setups survive this night` with `n` and `m` from `solveLevel` run in the same session.
- **M5.5** WHEN the night was won, THE app SHALL offer `Go to <next night>`, or `Back to the nights` after the last level.
- **M5.6** THE outcome SHALL appear only when the cursor is at the last bell of the recording, SHALL go away when the cursor moves back, and SHALL be announced to screen readers.

### Requirement 6: The failure explanation

**User Story:** As a developer starting out with Kiro specs, I want the reason I lost in plain English, so that I learn to see shadowed and dead lines.

#### Acceptance Criteria

- **M6.1** THE first sentence SHALL name the bell, the ghost that reached the girl, and the line it ran, for example `Bell 7. Wisp II reached the girl while running line 1: “THE wisp SHALL move toward the girl.”` WHEN the girl walked into the ghost, the sentence SHALL say so and name the girl's line.
- **M6.2** FOR a card that never fired because a line above it was true first, THE text SHALL read `Line 2 of Wisp I (your card) never fired: line 1 was true first, so it shadowed it at bell 4.`
- **M6.3** FOR a card whose condition was never true, THE text SHALL say that the condition was never true when checked, and name the condition.
- **M6.4** WHEN a scheduled write happened before the end, THE text SHALL say at which bell which actor wrote which line, and that the lines under it moved down.
- **M6.5** WHEN a card is still in the tray, THE text SHALL say so.
- **M6.6** THE text SHALL show at most four sentences after the first, cards before other lines, and SHALL say how many more there are.
- **M6.7** EVERY number in the text SHALL be a value that the recording gives.

### Requirement 7: The coach

**User Story:** As a first-time player, I want a short guide that points at my next action, so that I place my first piece without reading a manual.

#### Acceptance Criteria

- **M7.1** THE Prologue and Night I SHALL have a coach. THE other levels SHALL NOT.
- **M7.2** AT every moment of the plan phase, THE coach SHALL give one short instruction and point at the control or tile of the next action: the item in the tray, the glowing tile, the card, the slot, the `Ring midnight` button. THE target SHALL be a function of the plan and the selection only.
- **M7.3** THE placements and card positions the coach points at SHALL be a winning setup: running them SHALL end `complete`.
- **M7.4** WHEN the player puts a card where a line above it is always true, THE coach SHALL explain that the card is shadowed and point at its remove control.
- **M7.5** AFTER a lost night, THE coach SHALL point at `Try again`. AFTER a won night, it SHALL point at the next level.
- **M7.6** WHEN a coached level is cleared, or the player chooses `Hide tutorial`, THE app SHALL remember it in `localStorage`, and SHALL NOT show that level's coach again, until the player chooses `Show tutorial`.

### Requirement 8: The ward on the canvas

**User Story:** As a judge, I want a dollhouse that reads at a glance, so that the video shows the rules and not the camera.

#### Acceptance Criteria

- **M8.1** THE camera SHALL be fixed: one pitch, one distance and one centre per level, set once. THE scene SHALL NOT move, zoom or shake the camera for any event.
- **M8.2** THE floor SHALL be drawn top-down to an offscreen texture (tiles, bed, range diamonds, darkness with light holes, candle light) and then drawn to the canvas in horizontal strips, each strip at the scale of its depth.
- **M8.3** THE walls SHALL be a tall back wall, medium side and inner walls and a low front wall: the height of the back wall SHALL be greater than that of a side wall, and that greater than the front wall's.
- **M8.4** CHARACTERS and items SHALL be drawn upright, with their feet on their tile and a contact shadow on the floor.
- **M8.5** THE scene SHALL draw walls, items and characters in order of depth, back to front.
- **M8.6** THE function `tileAt` SHALL be the inverse of the floor projection: for every floor tile, the projected centre SHALL give that tile back, and a point outside the floor SHALL give `null`. A point on an item or character SHALL give that thing's tile.
- **M8.7** THE whole dollhouse SHALL fit the canvas at any width from 320 px up, with the canvas no taller than 78% of the window, and the drawing SHALL be scaled for the device pixel ratio up to 2.
- **M8.8** THE scene SHALL be darker while a night is shown than while the player plans, SHALL give the girl and each ghost a glow, and SHALL brighten at dawn.
- **M8.9** WHEN the cursor moves forward by one bell, THE characters SHALL glide from their old tile to their new one in at most 620 ms (260 ms at speed ×2).
- **M8.10** EACH ghost SHALL show a chip with the number of the line it ran at the cursor (`L2`), and WHEN a level has several ghosts of one kind, each SHALL also show a numeral (I, II) that matches the title of its page in the spec book.
- **M8.11** THE scene SHALL be drawn with Canvas 2D only, and every world-to-screen conversion SHALL go through the camera module, so that the view could be swapped for a plain top-down one by replacing that module.

### Requirement 9: Signature effects

**User Story:** As a judge, I want to see the spec act on the ghost, so that the idea is clear without a word of explanation.

#### Acceptance Criteria

- **M9.1** AT each bell, FOR every actor that ran a line, THE app SHALL draw an ink thread from the element of that line in the spec book to the actor's sprite, lasting between 380 ms and 700 ms, and fading out.
- **M9.2** A line that was true but lost to a line above it SHALL turn mouldy green and show ◐.
- **M9.3** AT dawn, THE lines with a tally of 0 SHALL burn to ash with ash particles rising from them, and the lines that ran SHALL turn gold, one after the other.
- **M9.4** WHEN the girl is caught, THE girl's line SHALL be struck through in red, as the final mark.
- **M9.5** WHERE the player's setting is `prefers-reduced-motion: reduce`, THE thread, the ash, the glide of characters, the bobbing of ghosts and the flicker of lights SHALL be off, and the final states (gold, ash, struck) SHALL be shown at once.

### Requirement 10: Sound

**User Story:** As a judge watching the video, I want the night to sound like a night, so that the bells carry the tension.

#### Acceptance Criteria

- **M10.1** THE app SHALL make every sound with the Web Audio API: a bell toll at each bell, an ink scratch when a thread or a card is written, a click when an item is placed, a capture sting, and a dawn chime. It SHALL load no audio file and SHALL NOT play any existing melody.
- **M10.2** THE title screen and the play screen SHALL have a mute toggle. THE setting SHALL be kept in `localStorage`, and WHEN muted THE app SHALL NOT schedule any sound.
- **M10.3** THE app SHALL create or resume the audio context only after a click, tap or key press. IF the browser has no Web Audio, THEN THE sound functions SHALL do nothing and SHALL NOT throw.

### Requirement 11: Accessibility, touch and small screens

**User Story:** As a player on a phone, I want the same game on a 375 px screen, so that I can play it anywhere.

#### Acceptance Criteria

- **M11.1** EVERY state that is shown by colour SHALL also have a text mark (✓ ✗ ◐), and the outcome SHALL be text.
- **M11.2** THE game SHALL work with mouse, touch and keyboard: it SHALL use pointer events, and its buttons SHALL be at least 36 px tall (44 px on a coarse pointer).
- **M11.3** AT a width of 375 px THE page SHALL not scroll sideways, the stage SHALL be one column, and the main controls (`Ring midnight`, the replay bar) SHALL stay reachable at the bottom of the screen.
- **M11.4** THE app SHALL give visible keyboard focus, SHALL announce placements, insertions and outcomes in a polite live region, and SHALL set `lang="en"`.
- **M11.5** THE palette and fonts SHALL be those of `game-feel.md`: ink `#0d0b0a`, parchment `#e8d9b5`, amber `#f2a541`, teal `#7fd1c7`, blood red `#8c1c13` only for failure; IM Fell English for rules and headings, IBM Plex Mono for numbers, line numbers and labels.

### Requirement 12: Honest numbers

**User Story:** As a judge, I want every number on the screen to be real, so that I can trust the demo.

#### Acceptance Criteria

- **M12.1** EVERY number the game shows (bell numbers, line numbers, tallies, burned lines, solve counts) SHALL come from the recording or from `solveLevel` in the same session.
- **M12.2** THE source of the app SHALL NOT contain the solve counts of any level as literals (`2145`, `329`, `1482`, `741`, or a pair such as `4/29`).
