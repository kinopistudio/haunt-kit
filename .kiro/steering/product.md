---
inclusion: always
---
# Product: Haunt Kit

Haunt Kit is an entry for Kiroween 2026 (Skeleton Crew category): one reusable skeleton and two apps built on it.

**One line:** A ghost that obeys its spec. Write it wrong, it catches her.

## What it is
- `packages/haunt-kit` is the skeleton. Characters and props are driven by EARS rules. The rule engine, the exhaustive solver, the tests and the spec linter all read the same spec files.
- `apps/midnight-ward` is a horror puzzle game: a prologue and four nights that teach rule order (shadowing), boundaries, side effects, and contradiction plus self-rewrite.
- `apps/scare-cue` is a tool for home haunters. A single level checks every visitor path against safety rules and replays the first counterexample as CCTV footage.

## Audience
Developers starting out with Kiro specs. They cannot yet spot contradicting or shadowed requirements in a long AI-written `requirements.md`. The game teaches them to see these problems, and `lint_spec` finds them in their own specs.

## Judging (all five weighted equally)
Potential Impact, Technological Implementation, Design (a finished, polished product, not a proof of concept), Innovation, Presentation (the demo video).

Judges may only watch the video, so **anything that does not appear in the video counts for little**. Prioritise in this order:
1. Night I and Night IV of Midnight Ward, polished to 100%.
2. The Kiro loop: a spec edit triggers a hook, the agent uses the MCP server, and the level is repaired.
3. Everything else only needs to work and be shown for a few seconds.

## Non-goals
No accounts, leaderboards, level sharing, language switch, backend, or analytics. The UI is in English only.

## Honesty rules
- Every number shown (solve counts, coverage, playtest results) must come from a real run. Never invent one.
- The `reference/prototype` folder is a design reference written before the build. Do not copy its code into `packages/` or `apps/`. Reimplement from the specs.
