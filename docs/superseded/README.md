# docs/superseded — history, not instructions

Every document in this directory describes a build that no longer exists. Most describe **Baseboard
Empire**, the Canvas2D single-kitchen game that shipped from `main` at `df9db36`. They are kept
because they record why decisions were made and what was measured at the time.

## The rule

**Never rewrite these files. Never cite them as current. "This file is out of date" is not a task.**

Eight of them used to sit in the repository root, each carrying a banner that said _"STALE — the
current, accurate state is `GAUNTLET_STATE.md`… Rewriting this file is outstanding work."_ That
banner was wrong twice over: `GAUNTLET_STATE.md` was itself superseded by the kitchen-only scope
change of 2026-08-07, and the standing instruction to rewrite eight documents generated permanent
phantom work that was never worth doing.

The current state of the work is `.claude/gauntlet-state.md`. Nothing else.

## What is here

| File                              | Describes                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `GAUNTLET_STATE.md`               | The whole-home 5-region build, superseded by the kitchen-only scope (2026-08-07) |
| `GAME_CONTRACT.md`                | Baseboard Empire's design contract, plus the 3D reboot amendment                 |
| `REDESIGN_CONTRACT.md`            | The Phase-0 redesign authority, with its measured problem list                   |
| `ARCHITECTURE.md`                 | The Canvas2D layer map                                                           |
| `ART_BIBLE.md`                    | The Canvas2D art direction and its value ladder                                  |
| `TEST_PLAN.md`                    | The Canvas2D test layering                                                       |
| `PLAYTEST_REPORT.md`              | Measurements taken against the Canvas2D build                                    |
| `DEPLOYMENT.md`                   | How the Canvas2D build was published to Pages                                    |
| `PULL_REQUEST.md`                 | The review summary for the quality-reboot PR                                     |
| `CANCELLED_GOAL_HANDOFF_AUDIT.md` | What a cancelled `/goal` left behind, re-checked against code on 2026-08-05      |

## One thing in here is still load-bearing

`ART_BIBLE.md` records a value ladder. It was **demoted from a governing constraint to guidance** at
`f462e05` after two attempts to satisfy its ordering produced two measured regressions — darkening
`cabinetDoor` put 61.5 % of the playable region below L\* 20, and lifting `floorVinyl` overshot to a
mean the project had already swept and rejected. The real constraint is the measured luminance band,
and it lives in `.claude/gauntlet-state.md`. **Do not chase the ladder ordering by moving albedos.**
