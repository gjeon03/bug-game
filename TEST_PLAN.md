> **STALE — describes the superseded single-kitchen build (branch `main` / commit `df9db36`), not this one.** This document has NOT been rewritten for the whole-home rebuild and parts of it are now wrong. The current, accurate state is `GAUNTLET_STATE.md` (live state, verified measurements, ranked open defects), `CANCELLED_GOAL_HANDOFF_AUDIT.md` (what was inherited and what became of it), and `LOCAL_REVIEW.md` (how to run it). Rewriting this file is outstanding work.

# TEST_PLAN — Baseboard Empire

## Layers

| Layer              | Tool                                | Scope                                                           |
| ------------------ | ----------------------------------- | --------------------------------------------------------------- |
| Static             | prettier, eslint, tsc               | formatting, lint rules, strict type checking                    |
| Unit / integration | Vitest (node env)                   | the entire `sim/` + `core/` surface, DOM-free and deterministic |
| Real-runtime       | Playwright (chromium)               | actual interactive play against the built game                  |
| Deployment         | Playwright + a nested static server | production `dist/` served under `/bug-game/`                    |

One command runs everything: `pnpm verify`.

## Unit / integration coverage (highest-risk logic)

The suite is written against `REDESIGN_CONTRACT.md`. Where the old suite locked in the three-night
structure, the win thresholds or literal map coordinates, it was rewritten — a test that freezes a
design the evidence says is broken is a liability, not a safety net.

| Area                     | What is asserted                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Determinism              | 3 000 steps from one seed reproduce exactly, including `rng.snapshot()`. Kept verbatim.                                                                                      |
| Restart equality         | A cold world snapshotted **before** a run is played is identical to a fresh one after it. (The old version compared two worlds both built afterwards, so it could not fail.) |
| Collision                | Resolution out of every face of every entry in `SOLIDS`, derived symbolically from the map data                                                                              |
| Pheromone                | Node spacing, reserve spend/regen, link detection in both lay directions, decay, traffic reinforcement, erase, route cap                                                     |
| **Operations**           | Each operation advances only when its gates are satisfied, never on a clock; a waiting gate yields to an actionable one                                                      |
| **Objective hierarchy**  | `resolveHud` always returns an objective; `hud.source` names the rule that produced it; blockers name the real reason                                                        |
| **Capped-resource rule** | With food or moisture at cap, `cappedAdvice()` is non-null — a capped resource can never be a dead state                                                                     |
| **Adaptations**          | Costs are charged, `world.traits` changes behaviour, taking one closes the milestone, the whole tree is not purchasable                                                      |
| **Footholds**            | Claim then fit-out are separate spends; capacity and storage derive from what is built                                                                                       |
| **Territory**            | Hold rises only with a live route _and_ bodies present; suppression reverses it; the win needs three at once                                                                 |
| **Regional heat**        | Evidence deposits into the cell it happened in; `hottestCell` follows the player's traffic; heat never falls below its peak fraction                                         |
| **Threat director**      | Budget and cooldown limits; no family twice in a row; tier promotion cannot advance twice inside `TIER_HOLD`                                                                 |
| **Trap siting**          | A route with workers on it outscores an unused one — traps follow bodies, not geometry                                                                                       |
| **Cleaning sweep**       | Trail node life falls along the swept path; workers are displaced, not killed                                                                                                |
| **Routines**             | Generation, exploitation counting, and cleanup: no worker is left targeting a removed resource, and no dead route is left occupying a slot                                   |
| **Worker quality**       | After a played run: no `stuckTime > 2 s`, no solid penetration, no sustained 3-body overlap, `carrying` iff `carryAmount > 0`                                                |
| Colony                   | Hatching spends both reserves, will not breed into starvation, respects capacity and the worker pool                                                                         |
| Outcome                  | Win requires three held regions **and** surviving the response; each loss cause is reachable and distinct                                                                    |

## Real-runtime gameplay states to capture

Cold load · first meaningful input · first delivery · first hatch · first adaptation offer · an
adaptation taken · a foothold claimed · a foothold fitted out · each of the three household routines
(incoming, active, aftermath) · a cleaning sweep erasing a trail · a trap placed on the player's own
line · a re-route around it · worker congestion at a source · a region reaching hold · the
extermination response · victory · each loss cause · restart · nested-path build · the deployed build.

## Playtest scenarios

Driven in a real browser through the real input layer. The **guided bot**
(`scripts/lib/bot.mjs`) plays using only what the HUD shows the player — `hud.source`, `hud.target`
and the choice panels — so a completed run is also evidence that the guidance is sufficient to play
the game without the README.

1. First-time player path, no documentation
2. Cautious wall-hugging routing
3. Aggressive open-floor routing with sprint
4. Growth-focused adaptation path (brood)
5. Concealment-focused adaptation path (shadow)
6. Heavy-casualty recovery
7. Worker-congestion stress
8. Trap-driven rerouting
9. Cleaning-driven route loss
10. Final extermination survival
11. Deliberate failure
12. Complete victory
13. Five consecutive restarts
14. Focus loss and restoration
15. Nested-path production build
16. Deployed GitHub Pages build

Recorded per run: time to first input, first objective understood, first delivery, first growth
choice; meaningful decisions per minute; longest decision-free plateau; seconds spent at capped
resources; worker stuck and overlap events; frame-time tails; console errors.

## Performance capture

`tests/e2e/perf.spec.ts` runs a scripted **active-play** capture (not menus, not the first frame):

- Window A "ordinary active play": Night 1–2, ~90 s.
- Window B "peak": Night 3 with ≥ 60 roaches, patrol + traps + spray simultaneously, ~60 s.

Recorded to `artifacts/evidence/perf/`: p50/p95/p99/worst frame time, long-frame counts (> 50 ms,

> 100 ms), roach count, hazard count, particle count, audio voice count, draw-call count, startup
> timing breakdown, `performance.memory` trend where available, and production bundle/asset sizes.

## Regression gate

After any verified fix: re-run the identical scripted path with the identical seed, diff the before/
after evidence, then re-run the full `pnpm verify`.
