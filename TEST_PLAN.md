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

1. **Fixed step** — accumulator produces exactly N steps for a given elapsed time; clamps at 250 ms;
   never exceeds 5 steps/frame; discarded time is counted.
2. **Determinism** — two worlds with the same seed and the same scripted input produce byte-identical
   state snapshots after 3 000 steps.
3. **Pheromone** — node creation spacing, strength decay to expiry, reserve consumption/regeneration,
   route cap enforcement, nest-link and resource-link detection, erase behaviour.
4. **Worker acquisition** — a worker within range of a linked route enters `seeking`; follows toward the
   resource end; picks up; returns toward the nest end; delivers; resource totals move by exactly the
   carried amount.
5. **Resource accounting** — no duplication or loss across pickup → carry → death-in-transit → deliver.
6. **Colony** — upkeep drain, brood accumulation gated on food _and_ water, hatch at threshold,
   population capacity, starvation/desiccation death ordering, nest integrity damage.
7. **Upgrades** — claim cost, each of the three functions applies its documented effect exactly once.
8. **Suspicion** — every cause contributes its documented weight; tier thresholds fire once and in
   order; decay never reaches zero; the ledger attributes the largest cause correctly.
9. **Escalation** — each tier requests the documented response family; responses are not double-spawned.
10. **Win condition** — fires only when all five criteria hold at the end of Night 3.
11. **Eradication** — each of the three loss causes fires independently and reports itself.
12. **Restart** — `newRun()` produces a world deep-equal to a fresh one; no module-level mutable state
    survives (asserted by running the equality check after a full 3-night simulated run).
13. **Collision** — circle-vs-AABB push-out never places an entity inside a solid; sliding preserves
    tangential speed; a 3 000-step random walk never escapes the kitchen bounds.
14. **Spatial hash** — insertion/query correctness against a brute-force reference on random sets.
15. **Base path** — the built `index.html` contains no absolute `/assets/...` reference.

## Real-runtime gameplay states to capture

Each row is captured as a screenshot in `artifacts/evidence/shots/` plus a state assertion.

| #   | State                          | Assertion                                                       |
| --- | ------------------------------ | --------------------------------------------------------------- |
| 1   | initial load                   | canvas present, `__roach.ready`, 0 console errors               |
| 2   | onboarding                     | first prompt visible, names movement                            |
| 3   | first scout movement           | scout position changes from real key input                      |
| 4   | first pheromone route          | `routes[0].nodes.length > 0`, reserve consumed                  |
| 5   | first worker delivery          | food or water reserve increased, `deliver` event observed       |
| 6   | safe-vs-dangerous route choice | two routes with measurably different exposure integrals         |
| 7   | first nest upgrade             | an upgrade flag flips, nest visual state changes                |
| 8   | first human patrol             | patrol active, room light raised, telegraph decal visible       |
| 9   | trap / route denial            | trap present on a trafficked route, a worker is trapped         |
| 10  | high suspicion                 | tier ≥ 3, HUD shows cause + next response                       |
| 11  | peak population + effect load  | ≥ 60 roaches, hazards active, telemetry captured                |
| 12  | scout damage / loss            | scout dies, respawns from the colony, population decremented    |
| 13  | eradication failure            | outcome `lose` with a stated cause                              |
| 14  | victory                        | outcome `win` with all five criteria met                        |
| 15  | restart                        | new run playable within 2 s without reload                      |
| 16  | 5 consecutive restarts         | no entity/particle/voice/listener growth; identical fresh state |
| 17  | focus loss and return          | tab hidden 3 s does not advance the phase clock; audio suspends |
| 18  | nested-path production build   | full run works under `/bug-game/`, 0 failed requests            |

## Playtest scenarios

Driven through `__roach.input` (the real input layer) with deterministic seeds, plus headless
equivalents in `tests/unit/balance.test.ts` that run the same shapes in milliseconds. Each writes a
JSON record into `artifacts/evidence/` (`run-win.json`, `run-loss.json`, `run-reckless-mid.json`,
`route-risk.json`, `escalation.json`, `scout-loss.json`, `restarts.json`).

| Scenario                  | Shape                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| Cautious                  | routes hug cover only; expect low suspicion, slower growth           |
| Aggressive                | shortest open-floor routes; expect fast growth, tier 3+ by Night 2   |
| Deliberately poor         | long open-floor route across the room light; expect early escalation |
| Trap avoidance            | play until traps deploy, then re-route around them                   |
| Scout loss and recovery   | walk into a footfall, verify respawn and continued play              |
| Deliberate eradication    | maximise evidence; verify a clean, attributed loss                   |
| Successful complete run   | meet all win criteria and survive the final sweep                    |
| Five consecutive restarts | no reload, alternating win/lose entry points                         |

Measured per scenario: time to first movement, time to first delivery, time to first upgrade, run
length, worker losses, top suspicion causes, idle time (fraction of seconds with no player input and
no pending decision), failure attribution, restart time, and final colony state.

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
