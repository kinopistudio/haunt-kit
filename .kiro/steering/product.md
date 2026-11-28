---
inclusion: always
---
# Product: Haunt Kit

Haunt Kit is an entry for Kiroween 2026 (Skeleton Crew category): one reusable skeleton and two apps built on it.

**One line:** A ghost that obeys its spec. Write it wrong, it catches her.

## What it is
- `packages/haunt-kit` is the skeleton. Characters and props are driven by EARS rules. The rule engine, the exhaustive solver and the tests all read the same spec files.
- `apps/midnight-ward` is a horror puzzle game: a prologue, Night I (rule order and shadowing) and Night IV (contradiction plus self-rewrite).
- `apps/scare-cue` is a tool for home haunters. The user composes prop rules, one level checks every visitor path against safety rules, replays the first counterexample as CCTV footage, and prints a plain-text safety report.

## Audience
Developers starting out with Kiro specs. They cannot yet spot contradicting or shadowed requirements in a long AI-written `requirements.md`. The game teaches them to see these problems, and the kit flags rules that never fire or are shadowed.

## Judging (all five weighted equally)
Potential Impact, Technological Implementation, Design (a finished, polished product, not a proof of concept), Innovation, Presentation (the demo video).

Judges may only watch the video, so **anything that does not appear in the video counts for little**. Prioritise in this order:
1. Night I and Night IV of Midnight Ward, polished to 100%.
2. Proof that it is a kit: Scare Cue runs on the same `packages/haunt-kit`, with only its own vocabulary file.
3. The Kiro loop: a spec edit triggers a hook, the agent uses the MCP server, and the level is repaired.
4. Everything else only needs to work and be shown for a few seconds.

## Non-goals
No accounts, leaderboards, level sharing, language switch, backend, or analytics. The UI is in English only.
Out of scope for this submission: Nights II and III, director mode, a public-spec linter, camera choreography.

## Honesty rules
- Every number shown (solve counts, coverage, playtest results) must come from a real run. Never invent one.
- The `reference/prototype` folder is a design reference written before the build. Do not copy its code into `packages/` or `apps/`. Reimplement from the specs.
