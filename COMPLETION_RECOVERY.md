# COMPLETION_RECOVERY

Takeover of an incomplete whole-home infestation build. The previous session's final report,
`GAUNTLET_STATE.md`, critic reports and evidence are treated here as an **unverified handoff**;
everything below was re-checked against the actual build on this branch.

**Inherited commit** `88c060f` on `experiment/whole-home-infestation-3d`, archived as
`archive/whole-home-gauntlet-incomplete`. Work continues on
`experiment/whole-home-infestation-3d-completion`. `main` remains `c5ce2d8`, untouched.

---

## 1. Verified working (re-run, not taken on trust)

| System | Evidence |
| --- | --- |
| Build and static gates | `typecheck` / `lint` / `format:check` clean; `pnpm test` 79/79 in <1 s; `vite build` 953 ms, 806 kB (222 kB gzip) |
| Real-browser boot | 187 props, ~2 000 meshes; **0 console errors, 0 failed requests, 0 external requests, 0 missing prop builders** |
| Restart | five consecutive restarts produce byte-identical opening state |
| Nested subpath | `/bug-game/` serves clean, same zero-error result |
| Performance (real Chrome, Apple M1, Metal, GPU timer queries, active play) | presented **p50 16.70 / p95 17.50 / p99 18.50 ms**, worst 18.80; CPU 4.60/5.40; GPU 4.02/7.10; **0 frames over 33 ms**; 297 draw calls |
| Audio | wired to simulation cues, panned from world positions; `started: true` in browser |
| Region gating | sealed navigation graph has **no edge** into unopened regions — proven by `house.test.ts`, not by a flag check |
| Korean UI | 242-key catalog, all 157 code-referenced keys present; NanumSquareNeo vendored, relative URLs, no tofu at four viewports |

## 2. Unresolved blockers — confirmed by reproduction

| # | Reported | Reproduced? | Actual finding |
| --- | --- | --- | --- |
| 1 | Run is ~9.7 min, not 25–35 | **YES** | shadow won 9.7 min; brood never finished |
| 2 | Breeding build cannot complete | **YES — and root cause now found** | see §3 |
| 3 | Rooms unreadable without HUD labels | **YES** | only the kitchen has ever been seen; four regions never rendered to a human |
| 4 | Critics FAIL, blockers open | **PARTLY OBSOLETE** | of 14 blockers, 10 were closed with re-measurements last session; the remaining live ones are room identity, run length, and the brood build |
| 5 | No proof of a full kitchen→bedroom run | **NO — this is obsolete** | shadow seed 4242 reaches all four main regions, 12 footholds, survives an extermination sweep, and wins. What is missing is a run of the right *length*, not a run that connects |

## 3. Root cause of the breeding-build failure — verified, not guessed

The previous session guessed three times (brood moisture cost, a bot re-router, a starvation grace
period). All three failed; one produced **byte-identical output**, proving it never executed.

Instrumenting the moisture ledger every 30 s settled it:

```
t=90   moist 136.5   moisture routes 1, workers on them 5    food routes 3, workers 7
t=120  moist 176.1   moisture routes 1, workers on them 0    food routes 3, workers 6
t=300  moist  58.1   moisture routes 1, workers on them 1    food routes 7, workers 8
t=480  moist   5.4   moisture routes 0                       food routes 8, workers 9
```

Moisture was never scarce and the source never ran dry (`driedUp: 0`). **The colony died of thirst
standing next to full water**, with zero threats and every region at alert 0.

Two compounding defects in `assignRoutes`, both in labour allocation, neither in the economy:

1. **Assignment was permanent.** Only workers with `state === 'idle'` were ever considered, and a
   worker cycles outbound→collecting→inbound→delivering→outbound forever. Labour was frozen at
   whatever the network looked like when each body hatched. No play could move it.
2. **The load metric was length-normalised, which inverts its own intent.**
   `assigned / max(1, length / 400mm)` makes a *short* route full at one worker while a long route
   accepts eight. The nearest, cheapest, highest-throughput water source in the flat was starved of
   labour **by construction**.

Fix: workers re-choose the moment they finish a delivery — standing in the nest, which is exactly
where a real one senses which trail is strongest — and routes are scored by **need**
(`scarcity × strength / crowding`), not distance.

Measured after, same seed: the allocation now swings responsively — moisture 1.1 at t=270 pulls 20
workers onto water routes and recovers to 35.8 by t=330. Population **14 → 30**, capacity **30 → 49**.

## 4. Obsolete claims from the handoff

- *"No independent criticism"* — five critics ran; reports in
  `artifacts/evidence/whole-home-reboot-final/critics/REPORTS.md`.
- *"No performance evidence"* — measured on real hardware, all budgets pass.
- *"No audio"* — wired and verified in-browser.
- *"Occlusion never executes a raycast"* — not reproducible: `registered 98 / candidates 13 /
  tests 15`, `fading: 1` in 26 of 26 blocked frames.
- *"Existing evidence does not prove a connected run"* — it does prove connection; it does not prove
  duration.
- *"The brood build starves because moisture supply is insufficient"* — false. Supply was never the
  constraint.

## 5. Exact reproduction paths

```bash
pnpm install && pnpm build && pnpm preview      # http://127.0.0.1:4273/
node scripts/capture.mjs                        # browser evidence + runtime-report.json
node scripts/perf.mjs                           # REAL Chrome, GPU timers (not headless)
node scripts/serve-nested.mjs 4178 /bug-game/ dist
pnpm test                                       # fast suite, 79 tests
pnpm test:slow                                  # full-run balance, minutes
```

Deterministic seeds: brood `20260805`, shadow `4242`, scavenging `31337`.

## 6. Highest-impact next action

Done: the labour-allocation fix above, which unblocks the breeding build.

Next: **run length.** The connected run exists and now supports a growing colony; it is ~10 min
against a 25–35 min target. Per the brief this must come from additional meaningful regional
operations — not multiplied prices, slowed workers, or waiting. The measured shape to fix is that
the first four gates all fall inside ~2 minutes while the bedroom phase carries the rest.

Then: room identity. Four of five regions have never been rendered to a human reviewer.
