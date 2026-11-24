---
inclusion: always
---
# Structure

```
.kiro/steering/   product, tech, structure, game-feel, ghost-grammar
.kiro/specs/      one folder per feature spec (rule-engine, solver, spec-lint, mcp-server, midnight-ward, scare-cue, director-mode)
.kiro/hooks/      verify-and-repair, engine-tests, trace-coverage, devlog
packages/haunt-kit/        the skeleton: grammar, world, engine, registry, solver, lint, trace, ui (spec book component)
packages/haunt-kit-mcp/    MCP server: simulate, solve_level, explain_failure, lint_spec
apps/midnight-ward/        game; character specs live in apps/midnight-ward/specs/
apps/scare-cue/            tool; prop specs live in apps/scare-cue/specs/
reference/prototype/       design reference only, do not import
docs/devlog.md             written by the devlog hook
video/                     shot list, voiceover script, subtitles
```

## Boundaries
- `apps/*` import from `haunt-kit`. They must not contain their own rule evaluation, search or linting.
- An app may only add vocabulary (conditions and actions), levels, rendering and sound.
- Everything shared by both apps belongs in `packages/haunt-kit`.

## Commits
- Work done from a spec task: `spec(task 2.3): short description`.
- Work done by chatting with Kiro: `vibe: short description`.
- Keep commits small. The README counts both kinds, so the prefixes must be exact.
