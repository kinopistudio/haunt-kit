# Haunt Kit

**A ghost that obeys its spec. Write it wrong, it catches her.**

Haunt Kit is a skeleton for EARS-driven characters and props, entered in the **Skeleton Crew** category of Kiroween 2026. The rule engine, the exhaustive solver, the tests and the spec linter all read the same spec files. Two apps are built on it:

- `apps/midnight-ward`: a horror puzzle game that teaches you to spot shadowed and contradicting rules.
- `apps/scare-cue`: a safety checker for home haunters that replays the first unsafe visitor path as CCTV footage.

> Work in progress. Built with Kiro: see `.kiro/` for steering, specs and hooks.

## Quick start
Needs Node 20.11 or newer and pnpm 12.

```
pnpm install
pnpm build     # type-checks every package and builds both apps
pnpm test      # Vitest and fast-check, all packages
pnpm verify    # runs the solver on every level of both apps and prints a table (under a second)
```

## Play Midnight Ward
```
pnpm --filter midnight-ward dev        # local dev server
pnpm --filter midnight-ward build      # static site in apps/midnight-ward/dist, relative paths, host it under any URL
pnpm --filter midnight-ward preview    # serve the built site
```
Mouse, touch and keyboard work, down to a 375 px phone. `prefers-reduced-motion` turns off threads, ash and gliding. The sound toggle is on the title and play screens.

## Layout
- `packages/haunt-kit`: the skeleton (grammar, registry, world, engine, trace, solver) and the shared UI in `src/ui`: a spec book that shows each actor's rules as numbered EARS lines (lit, shadowed, gold, ash), a replay bar, and the recording, line statistics and plain-English failure explanation behind them. It knows no game words.
- `packages/haunt-kit-mcp`: placeholder for the MCP server.
- `apps/midnight-ward`: the game. Its vocabulary, levels and character specs (`specs/`), and a title screen, level select and play screen (plan, twelve bells with a replay bar, dawn or capture) on a 2.5D canvas, with sound made by Web Audio.
- `apps/scare-cue`: the tool. It adds only its own vocabulary (`src/vocab.ts`), its level and cards (`src/level.ts`) and its prop and safety specs (`specs/`).
- `.kiro/specs/rule-engine`, `.kiro/specs/solver`, `.kiro/specs/spec-book-ui`, `.kiro/specs/midnight-ward`: the specs this code was built from (requirements, design, tasks).

## Design reference
`reference/prototype/` holds a playable prototype made at the start of the submission period to settle the rules, levels and look. The build does not import it. Kiro implements the packages and apps from the specs in `.kiro/specs/`.

## License
MIT
