---
inclusion: fileMatch
fileMatchPattern: "apps/*/specs/**"
---
# Ghost grammar (character and prop specs)

Character and prop specs are game content. Each rule is one EARS sentence, and the parser in `packages/haunt-kit/src/grammar` must accept every rule in these files.

## Allowed forms
- Ubiquitous: `THE <actor> SHALL <action>.`
- Event: `WHEN <condition>, THE <actor> SHALL <action>.`
- Unwanted: `IF <condition>, THEN THE <actor> SHALL <action>.`
- Scheduled rewrite (Night IV only): `WHEN the clock strikes <n>, THE <actor> SHALL write "<rule>" at line <k>.`

## Semantics
- Rules are read top to bottom, and the **first true rule wins**. Order is meaning.
- A rule below an always-true rule can never fire (it is shadowed). That is the core puzzle, not a bug.
- `near` means within 3 steps for the girl and within 2 for bells and candles; `adjacent` means within 1. Distances are Manhattan.
- A night lasts 12 bells.

## Midnight Ward vocabulary
- Conditions: always, the girl is near, the bell is near, a lit candle is near, it is dark, salt is adjacent, a ghost is near, the clock strikes n, the clock has struck n.
- Actions: move toward/away from the girl, stay still, move toward/away from the candle, snuff the candle, walk toward the window, walk back to bed.

## Scare Cue vocabulary
- Conditions: a visitor is near, a visitor is adjacent, the fog is on, the exit light is off.
- Actions: trigger, stay still, spray fog, stop the fog, turn off, stay on.
- Safety rules use `SHALL NOT` and live in `apps/scare-cue/specs/safety.md`.

When you edit a level or a character spec, the verify-and-repair hook runs. A repair may only change the level layout (walls, start positions, item counts). It must never change `targetSolveRate` or a character's rules.
