# Evidence package

Everything here is produced by the test suite, not written by hand. Regenerate the whole directory
with `pnpm verify`.

Screenshots are packed by `scripts/pack-evidence.mjs` (1280-wide, 256 colours) so the package stays
reviewable without committing 23 MB of raw 1600×900 captures. Raw captures are ~6× larger and carry
no extra reviewable detail.

## Layout

| Path | Produced by | What it shows |
| ---- | ----------- | ------------- |
| `shots/*.png` | every E2E spec | The captured gameplay states listed in `TEST_PLAN.md` |
| `startup.json` | `gameplay.spec.ts` 01 | Cold-load timing and the procedural asset build cost |
| `core-loop.json` | `gameplay.spec.ts` 03 | Scout → route → worker → delivery → growth, with pacing timestamps |
| `route-risk.json` | `gameplay.spec.ts` 04 | Measured exposure of a covered route vs an open-floor route to the same node |
| `escalation.json` | `threats.spec.ts` 06 | Suspicion, tier, deployed responses and the HUD's stated next response |
| `patrol.json` | `threats.spec.ts` 07 | Patrol and footfall counts during the scripted night-1 threat beat |
| `scout-loss.json` | `threats.spec.ts` 08 | Population before/after a scout death and its promotion cost |
| `run-win-night1.json`, `run-win-night2.json` | `fullrun.spec.ts` 09 | Colony state at each night boundary of the winning run |
| `run-win.json` | `fullrun.spec.ts` 09 | Final winning state, all five win criteria, and the peak-load perf window |
| `run-reckless-mid.json`, `run-loss.json` | `fullrun.spec.ts` 10 | The deliberate eradication run and its attributed cause |
| `restarts.json` | `restart.spec.ts` 11 | Five consecutive restarts: timing, entity/particle/voice counts |
| `focus-loss.json` | `restart.spec.ts` 12 | Game seconds advanced while the tab reported itself hidden |
| `perf/perf.json` | `perf.spec.ts` 14 | Reference environment, frame-time percentiles, counters, bundle size |
| `deployment.json` | `deploy.spec.ts` 16 | Every request made at runtime, absolute-path scan, dist contents |
| `deployment-live.json` | `scripts/verify-live.mjs` | The **deployed** Pages URL loaded, played to a delivery, and checked for stray requests |
| `seed-sweep.md`, `strategies.md` | headless probes promoted to `seeds.test.ts` / `strategies.test.ts` | Robustness across 44 seeds, and the three playtest strategies |
| `perf/perf-headed.json`, `perf/README.md` | `perf.spec.ts --headed` | The same build measured in a real browser window, and why that differs from headless |
| `asset-audit.json` | `deploy.spec.ts` 17 | Generated-asset audit and peak audio voice count |
| `e2e-results.json` | Playwright | Machine-readable pass/fail for the whole browser suite |
| `before-after/` | kept by hand from a failing run | The state that motivated a fix, retained so the fix can be compared |
| `critique/` | independent review passes | Visual, gameplay and technical critiques and their dispositions |

## How to read the perf numbers

`p50`/`p95`/`p99`/`worst` are **presented frame intervals** (deltas between `requestAnimationFrame`
timestamps) — what a player perceives as smoothness. `cpuP50`/`cpuP95`/`cpuP99`/`cpuWorst` are the
time spent inside the game's own frame callback (simulation + render CPU), which is the headroom
number. Both are recorded for each capture window; the budget in `GAME_CONTRACT.md` is written
against the interval.
