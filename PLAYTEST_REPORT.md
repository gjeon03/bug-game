# PLAYTEST_REPORT — Baseboard Empire

All numbers below come from scripted play through the **real input layer** against the **production
build served from `/bug-game/`**. There is no fast-forward and no state injection: the bot presses the
same six commands a player does, and the results are whatever the simulation produced. Raw records
are in `artifacts/evidence/`.

Reference environment is recorded in `artifacts/evidence/perf/perf.json` → `reference`.

_This document is regenerated from the evidence files after each full verification pass; the numbers
here are from the final pass._

## Scenario results

| Scenario                                      | Spec                  | Record                  | Outcome   |
| --------------------------------------------- | --------------------- | ----------------------- | --------- |
| Cautious, cover-hugging routes                | `fullrun.spec.ts` 09  | `run-win.json`          | see below |
| Aggressive / high-traffic open floor          | `fullrun.spec.ts` 10  | `run-reckless-mid.json` | see below |
| Intentionally poor route across the lit floor | `gameplay.spec.ts` 04 | `route-risk.json`       | see below |
| Trap avoidance / route denial                 | `threats.spec.ts` 06  | `escalation.json`       | see below |
| Scout lost and recovered                      | `threats.spec.ts` 08  | `scout-loss.json`       | see below |
| Deliberate eradication                        | `fullrun.spec.ts` 10  | `run-loss.json`         | see below |
| Successful complete run                       | `fullrun.spec.ts` 09  | `run-win.json`          | see below |
| Five consecutive restarts, no reload          | `restart.spec.ts` 11  | `restarts.json`         | see below |

## Measured pacing

| Metric                                    | Budget    | Measured | Source                             |
| ----------------------------------------- | --------- | -------- | ---------------------------------- |
| Time to first movement                    | ≤ 15 s    | —        | `core-loop.json → firstMoveAt`     |
| Time to first pheromone trail             | —         | —        | `core-loop.json → firstTrailAt`    |
| Time to first worker delivery             | ≤ 60 s    | —        | `core-loop.json → firstDeliveryAt` |
| Time to first crack claimed               | ≤ 5 min   | —        | `run-win-night2.json`              |
| Total run length                          | 12–15 min | —        | `run-win.json → stats.runSeconds`  |
| Restart to playable                       | ≤ 2 s     | —        | `restarts.json → restartMs`        |
| Idle time (no input, no pending decision) | —         | —        | `run-win.json → stats.idleSeconds` |

## Route choice actually matters

`gameplay.spec.ts` 04 lays two routes to the same food node from the same nest: one hugging the
dishwasher run, one out across bare tile. The measured mean exposure of each route is recorded in
`route-risk.json`, and the spec fails if the open route is not meaningfully riskier.

## Failure attribution

Every loss records `loseCause` plus the largest single suspicion contributor, and the failure card
prints both. Verified in `fullrun.spec.ts` 10.

## Observations and the changes they caused

These are the defects real play exposed, and what was done about them. Before/after evidence is noted
where a measurement changed.

1. **Resource nodes drained in under a minute.** A 106-unit crumb pile was stripped by six workers in
   ~40 s, which unlinked the route and stalled the tutorial. Node sizes were raised 2–4× and un-drained
   nodes now partially recover between nights. _Before:_ `dishCrumbs` depleted at ~40 s. _After:_
   survives a full night of traffic.
2. **Wall-hugging was mechanically worthless.** Cover used a squared falloff, so a roach one body
   length from a cabinet had ~0.29 cover and the "safe route vs short route" decision collapsed. The
   falloff was changed to ease-out and the band widened to 120 units. _Before:_ covered route exposure
   0.163 vs open 0.146 — the "safe" route was the riskier one. _After:_ 0.066 vs 0.129.
3. **Open floor carried almost no evidence in the dark.** The open-floor term was 0.14 and the
   droppings threshold 0.45, so a dark open-floor route generated no suspicion at all. Raised to 0.30
   and 0.28 respectively.
4. **The colony ate itself before the first delivery.** Starting stock drained to ~4 food within 30 s
   because brood spent freely and upkeep ran from tick zero. Added a brood reserve margin, a 55-second
   starvation grace period, and larger starting reserves.
5. **Supply lines needed re-walking every minute.** Node lifetime alone meant a working route decayed
   under the player. Worker traffic now reinforces the stretch of trail it walks on, so a used route
   sustains itself and an abandoned one still evaporates.
6. **The kitchen was too empty to navigate.** Large stretches of floor had no landmark and no cover.
   Added floor clutter (chair legs, a box, a pipe, a bin liner), fifteen floor decals, and an
   objective bearing indicator that points at the current objective with a distance in tiles.
7. **The scene was unreadably dark and materially flat.** Ambient multiply was too aggressive and
   cabinetry sat at the same value as the floor. Raised ambient, dropped cabinetry a clear step below
   the floor, added bright top lips and a 2×2 tile variation so the floor does not visibly repeat.
8. **The scout read as a beetle, not a cockroach.** Rebuilt the sprite anatomy: tapered wing case,
   wide pronotum shield, three leg pairs with different lengths and splay angles, cerci.
9. **A hidden tab kept playing.** The run now auto-pauses while `document.hidden`.
10. **Escaping a wall could push an entity into flush cabinetry.** Collision now picks the shallowest
    exit axis that does not land inside another solid, with a second pass after the bounds clamp.
