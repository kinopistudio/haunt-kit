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

## Layout
- `packages/haunt-kit`: the skeleton (grammar, registry, world, engine, trace, solver).
- `packages/haunt-kit-mcp`: placeholder for the MCP server.
- `apps/midnight-ward`: the game's vocabulary, levels and character specs (`specs/`).
- `apps/scare-cue`: the tool. It adds only its own vocabulary (`src/vocab.ts`), its level and cards (`src/level.ts`) and its prop and safety specs (`specs/`).
- `.kiro/specs/rule-engine`, `.kiro/specs/solver`: the specs this code was built from (requirements, design, tasks).

## Design reference
`reference/prototype/` holds a playable prototype made at the start of the submission period to settle the rules, levels and look. The build does not import it. Kiro implements the packages and apps from the specs in `.kiro/specs/`.

## License
MIT
