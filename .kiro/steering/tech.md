---
inclusion: always
---
# Tech

- **Language:** TypeScript, strict mode, ES2022 modules.
- **Monorepo:** pnpm workspaces. The packages are `packages/haunt-kit`, `packages/haunt-kit-mcp`, `apps/midnight-ward` and `apps/scare-cue`.
- **Apps:** Vite plus Canvas 2D for rendering, and the Web Audio API for all sound (synthesised, no audio files). No UI framework. Plain DOM for the spec book.
- **Tests:** Vitest plus fast-check for property-based tests. Each EARS requirement in a spec gets at least one test whose name starts with its requirement id, for example `R1.3: first true rule wins`.
- **MCP server:** Node, using `@modelcontextprotocol/sdk`, over stdio. Its tools call into `packages/haunt-kit` and never reimplement engine logic.
- **Hosting:** static builds on GitHub Pages or Vercel. No backend.

## Engine rules (do not break these)
- The engine is pure and deterministic: no `Math.random`, no `Date`, and no DOM in `packages/haunt-kit/src/{grammar,world,engine,solver,trace}`.
- Each tick: scheduled events first, then each actor in a fixed order evaluates its rules top to bottom and runs only the **first true** rule. Properties are checked after every actor's turn.
- Distances are Manhattan. Movement is greedy: try the major axis, then the minor axis, otherwise stay.
- The skeleton knows nothing about ghosts, girls or fog. Apps register their conditions and actions through the registry.

## Performance budget
`pnpm verify` must check every level of both apps in under 3 seconds on a laptop. The solver searches the state space with memoization; it never enumerates visitor paths one by one (Scare Cue has over 4 million).
