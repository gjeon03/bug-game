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

---

# Session 2 — measured findings

Everything below was produced by instrumentation on a fixed seed, not by reading code and forming an
opinion. Where a change was reverted, the numbers that justified reverting it are kept.

## 6. Breeding build: fixed and confirmed

`assignRoutes` allocated workers permanently (only `state === 'idle'` was ever reconsidered) and
measured route load normalised by length, so a short route read as full at one worker. The colony
died of thirst beside full water sources — `driedUp: 0`, zero threats, every region at alert 0.

Need-based `routeAppeal` plus releasing workers on delivery. Seed 20260805, brood:
**`status=won end=6.4min`, peak population 53, 452 deliveries, 16 lost.** Allocation now responds —
moisture 1.1 at t=270 → 20 workers assigned → 35.8 by t=330.

## 7. `findPath` was 99.3 % of simulation CPU

Wrapping each subsystem of `stepRun`: `updateWorkers` 99.2 % of the step, and inside it `findPath`
99.3 % of wall time — **20,624 calls at 8.619 ms each**. Not a call-frequency problem (0.82/step); a
single search cost 8.6 ms. The frontier was fully re-sorted on every expansion and then `shift()`ed.

Binary heap. Same seed, **identical call count 20,624** — the search is unchanged, only the cost of
selecting the minimum:

| | before | after |
| --- | --- | --- |
| `findPath` per call | 8.619 ms | **2.471 ms** |
| whole sim step | 7.106 ms | **2.071 ms** |
| 420 s run, wall | 179 s | **52 s** |

The old code carried a comment predicting exactly this: *"Simplicity wins until it does not."*

## 8. `region.traffic` is not a measure — and the fix is parked

Traffic gained a flat `0.05/s` per worker and shed a flat `0.12/s`, clamped at 14. Over a 45-minute
run **every unlocked region reported `traffic 14.0, busy 1.00` at every single sample**: three
workers out-earn the decay, so it pins at the cap immediately. It is a boolean spelled as a float,
and every term downstream reads a constant.

Balancing gain against proportional decay makes equilibrium traffic equal the worker count. That is
strictly more correct — and it changes balance, because the game was tuned around the constant. It
is **reverted**, with the reason recorded rather than the change quietly kept.

## 9. Household escalation is real, unreachable, and blocked on a design decision

Evidence decay is divided by colony population (`3 + population * 0.35`). Dividing by population
means **a bigger colony makes every room calmer** — the inverse of the game's premise. Measured
consequence: 53 workers and 452 deliveries never pushed any region above **alert 1**, so `move`,
`trap`, `vacuum` and `spray` — four of seven authored responses — are content no player has seen.

Switching to an absolute reference does exactly what the analysis predicts: kitchen reaches evidence
0.65 and **alert 3**. It also breaks the game — no gate past the third opens and the objective
reports `blocker.food` continuously from t=120 to the end of a 45-minute run.

The cause is structural, which is why this is parked rather than nudged. Breeding in `updateColony`
is **automatic and unconditional**: every surplus is spent on a worker as soon as it exists, so the
colony can never bank a gate cost unless income exceeds upkeep plus brood. A harsher household
pushes income under that line permanently. **Escalation and progression compete for one surplus and
the player has no lever over either.** Landing it requires giving the player a way to choose growth
over expansion — a brood hold, or a separate reserve for gate work. That is a design decision to be
measured, not guessed.

## 10. Correction: the black wedge was my own instrument

`bedroom-wide.png` was 28.0 % pure `srgb(0,0,0)` and `bathroom-wide.png` 47.7 %. I treated it as a
lighting defect. It was not: `rooms.mjs` shot at 4200–5200 mm while the camera is clamped to
`CAM_NEAR_MM` 900 – `CAM_FAR_MM` 3200. Those frames sit **outside the room's walls**, photographing
unlit exteriors against the void from a vantage point no player can reach.

Recorded because it is the failure mode this whole process exists to prevent — a defect invented by
the measuring instrument, which I nearly spent an hour "fixing".

**A constraint this exposes:** at 35 mm scale inside a 3.2 m room, *no* legal camera position sees a
whole room. There is no establishing shot in this game. The "identify each room without HUD labels"
gate therefore has to be judged from characteristic detail at floor level, or it certifies something
the build cannot deliver. Captures are now taken at 1900 mm (default) and 3200 mm (max zoom-out).

## 11. Still open

- **Run length** is the headline gate and is **not met**: 6.4 min against a 25–35 min target. §9 is
  the blocking decision.
- `run.test.ts` (`pnpm test:slow`) asserts `minutes > 10` and therefore **already failed on the
  inherited build** — a 6.4-minute victory cannot satisfy it. It is not a regression from this
  session's changes, and it is not passing either.
- `bathroom-wide` remains **47.7 % black at the legal 3200 mm**, unlike the other four rooms. That
  one is a real defect and is unexplained.
- Showcase captures are over-exposed (hallway mean luminance 0.98 ≈ white); the `showcase` flag
  forcing every routine light on is the likely cause.
- Assignment churn: ~49 `findPath` calls per second for 39 workers is still more re-planning than
  the design needs, even though each call is now cheap.
- No 25–35 minute human-played victory exists. No independent critic pass has been re-run.

## 12. The brood hold exists, and it moved the blocker one link down the chain

§9 said the missing piece was a way for the player to choose growth over expansion. That now exists:
`colony.broodHold`, toggled with **H**, surfaced in the HUD and the help sheet, with Korean strings
in the catalog. The bot uses the same public toggle — it holds brood whenever the objective reports
`blocker.food` or `blocker.moisture`, which is what a human reading that panel would do.

It works, in the sense that it does exactly what §9 predicted. With the absolute evidence reference
**and** the hold available, the brood build stops stalling at three gates and **opens all five**.

It still does not win. Seed 20260805, full 50-minute cap:

| | value |
| --- | --- |
| status | `playing` — cap reached, never resolved |
| gates opened | 5 of 5 |
| peak population | 74 |
| deliveries | 1,457 |
| **extermination sweeps** | **19** |
| workers lost | 116 |
| longest plateau | 12.6 s (inside the 45 s gate) |

**The next defect is in `updateFinal`, not in the evidence model.** A sweep has a 110 s cooldown,
severity escalating `SWEEP_ESCALATION` 0.18 per sweep, and *no terminal condition*. Nineteen sweeps
in one run is the same metronome failure recorded earlier at 125 sweeps, just slower — past roughly
ten minutes the endgame destroys footholds faster than the colony can retake them, so the
four-region victory check in `evaluateRun` can never be simultaneously true.

**The finale has to resolve — win or lose — before harder escalation is worth landing.** Ordering
matters here: a longer run that cannot close is worse than a short one that can, so the
population-scaled denominator stays and the four unreachable response tiers stay unreachable until
the endgame terminates.

Sequence for whoever picks this up:

1. Give `updateFinal` a terminal condition — a bounded campaign (N waves, then the household gives
   up or the colony is destroyed), not an unbounded timer.
2. Re-land the absolute evidence reference from §9. The brood hold already removes its stall.
3. Only then tune length toward 25–35 minutes.

The lever is committed and inert under current tuning: with the population-scaled household,
`blocker.food` is rare, so the hold rarely engages and the shipped balance is unchanged.
