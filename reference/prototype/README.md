# Design reference (not part of the build)

These files are a playable prototype made before the hackathon build, to settle the rules, levels and look.
They are **not** imported by `packages/` or `apps/`. The real code is written by Kiro from the specs in `.kiro/specs/`.

Use them as an oracle:
- `midnight-ward-engine.js` + `midnight-ward-levels.js`: rule semantics and level data. Expected solver results with the same rules:
  Prologue 4/29, Night I 12/2145, Night II 4/741, Night III 15/1482, Night IV 7/329. On every night, an empty board loses.
- `scare-cue-engine.js`: the Scare Cue level. With no cards, S2 fails at bell 2 and S1 at bell 5. With both fix cards at line 1, all 4,008,562 visitor paths are safe and 92% still get a scare.
- `midnight-ward.html`, `scare-cue.html`: open in a browser to see the intended feel.
