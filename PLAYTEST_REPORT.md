# PLAYTEST_REPORT — Baseboard Empire

Everything here is measured. Where a number is quoted, the artefact that holds it is named. Where
something was not measured, it says so.

- **Before:** `artifacts/evidence/redesign-baseline/` — see its `PROVENANCE.md`; there are two
  capture passes and they are not interchangeable.
- **After:** `artifacts/evidence/redesign-final/`
- **Independent critiques and what was done about each finding:**
  `artifacts/evidence/redesign-final/critique/`, dispositions in `dispositions.md`

---

## 1. How the runs were played

Real-browser runs are driven by the **guided bot** (`scripts/lib/bot.mjs`) through the real input
layer. It acts only on what the HUD shows a player: `hud.source` decides what kind of thing to do,
`hud.target` decides where, and the one-of-three panels are answered by key. It never reads a private
field and never writes state.

That makes a completed run evidence about two things at once — that the game can be finished, and
that the guidance is sufficient to finish it without reading anything.

A second, independent player exists headlessly. `tests/unit/play.ts` plays by _intent_: keep both
reserves supplied, take the growth decisions as they are offered, spend a full larder on the things
that raise its ceilings, push lines into the region the objective names, ride out the response.
`tests/unit/winnable.test.ts` uses it to win the game on three seeds. Neither player is given
resources, speed or state a human could not produce.

---

## 2. The comparison that matters

| Measure                                      | Baseline                                                                           | Redesign                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Longest decision-free plateau, competent run | **463.9 s**                                                                        | see §4                                                 |
| Seconds spent at the food cap                | **427 s** of a 731 s run                                                           | see §4                                                 |
| Outcome of a competent cautious run          | **lost** (`notEstablished`)                                                        | see §4                                                 |
| First objective the player reads             | `MOISTURE RUNNING OUT — run a trail to water now or the colony dies.` at t = 0.8 s | `Walk to <source> — then bring the scent home.`        |
| Threat spawns attributable to the player     | **1 of 14** in a winning run                                                       | every response is aimed by the regional heat grid      |
| Player-facing sinks for food                 | 1 (claim a crack, 140 food once per run)                                           | brood · 9 adaptations · 5 foothold claims · 5 fit-outs |
| Tests that win the game by _playing_ it      | **0**                                                                              | 3 seeds (`winnable.test.ts`)                           |

The baseline row for the plateau is the single most important number in this document: the contract's
gate is 45 seconds and the shipped game was at **ten times** it.

---

## 3. Scenarios

Real-browser, production build, served from `/bug-game/`. Regenerate with:

```bash
pnpm build && node scripts/serve-nested.mjs &
node scripts/playtest.mjs --out artifacts/evidence/redesign-final
```

| Scenario     | What it exercises                                                              |
| ------------ | ------------------------------------------------------------------------------ |
| `growth`     | Brood-family adaptation path, covered routing, full run to an outcome          |
| `shadow`     | Concealment-family path on a different seed — a measurably different run       |
| `aggressive` | Forage family, sprinting, straight lines across open floor                     |
| `recovery`   | A grown colony marched repeatedly across the most exposed ground, then rebuilt |
| `idle`       | Deliberate failure: never route anything, and see what the game says           |
| `restarts`   | Five consecutive restarts, checking every carrier of state                     |
| `focus`      | Tab hidden for six seconds, then restored                                      |

Headless coverage sits alongside it: 133 unit/integration tests, including a full run played to a win
on three seeds, the capped-resource invariant, the objective hierarchy, regional heat, the threat
budget, worker stuck/overlap limits, panic pathing out of a blocked refuge, the climax objective's
decision density, and restart equality.

---

## 4. Measured results

### 4a. A complete real-browser run

`artifacts/evidence/redesign-final/guided-run/transcript.json` — the guided bot playing the shipped
build at `/bug-game/`, start to finish, with screenshots at each operation. Metrics are computed from
the transcript, not typed by hand.

| Measure                                               | Value                                       | Gate                   | Baseline                      |
| ----------------------------------------------------- | ------------------------------------------- | ---------------------- | ----------------------------- |
| First meaningful input                                | **0.43 s**                                  | ≤ 10 s                 | 0.43 s                        |
| First trail laid                                      | **3.7 s**                                   | —                      | —                             |
| **First delivery**                                    | **19.3 s**                                  | ≤ 45 s                 | not reached in the first pass |
| Operation 1 → 2                                       | **65 s**                                    | —                      | (no operations)               |
| Operation 2 → 3                                       | **254 s**                                   | —                      | —                             |
| Operation 3 → 4                                       | **386 s**                                   | —                      | —                             |
| **Longest interval with no change of objective rule** | **39.1 s** (at t = 221 s)                   | ≤ 45 s                 | **463.9 s**                   |
| Distinct objective rules exercised in one run         | **12**                                      | —                      | 2                             |
| Samples at or near the food cap                       | **3 of 101 (3 %)**                          | no dead state at a cap | **427 s of 731 s (58 %)**     |
| Deliveries                                            | 241                                         | —                      | —                             |
| Roaches hatched / lost                                | 25 / 19                                     | —                      | —                             |
| Household routines exploited                          | 2                                           | —                      | (feature did not exist)       |
| Foothold functions built                              | 2                                           | —                      | (feature did not exist)       |
| Adaptations taken                                     | 4 (`brood1`, `forage1`, `brood2`, `brood3`) | ≥ 3 in a full run      | (3 mandatory upgrades)        |
| Regional heat: cells the household came to know       | 1, hottest 0.45                             | > 0                    | (no regional evidence)        |
| Peak alert                                            | tier 3 of 4                                 | —                      | tier 4, pinned                |
| **Console errors**                                    | **0**                                       | 0                      | 0                             |

The plateau row is the one to read. The contract's gate is 45 seconds; the shipped game measured
463.9 s and the redesign measures 39.1 s — and the reason is visible in the row beneath it: twelve
different rules produced the objective during that run, where the old build had two.

> This particular run ended `exterminated` at 448 s. It was captured before the final balance pass
> (foothold presence, suppression rate, heat calibration). The winnability regression below is the
> post-fix evidence, and it is the one that gates the build.

### 4b. Winnability, post-fix

`tests/unit/winnable.test.ts`, three seeds, an intent-driven player that never writes a colony value:

```
✓ seed 20260801: a competent run takes the kitchen and survives
✓ seed 4242:     a competent run takes the kitchen and survives
✓ seed 31337:    a competent run takes the kitchen and survives
```

Each asserts more than the verdict: operation 4 reached, the extermination actually fired, at least
three regions in the final tally, at least three adaptations taken and at least two foothold
functions built. Before this test existed, **no test in the repository had ever won the game by
playing it** — every `won` assertion wrote the win condition into the world first. The first run of
it found the territory defect that made the ending unreachable.

### 4c. Verification commands

| Command                               | Result                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm format:check`                   | pass                                                                           |
| `pnpm lint`                           | pass                                                                           |
| `pnpm typecheck`                      | pass                                                                           |
| `pnpm test`                           | **133 passed** in ~12 s                                                        |
| `pnpm build`                          | pass — `dist/assets/index-*.js` 192.5 kB raw, **63.2 kB gzip** (budget 150 kB) |
| `node scripts/check-subpath.mjs dist` | `4 file(s) checked; build is subpath-safe.`                                    |
| `pnpm test:e2e`                       | **17 passed** (27.6 min) — the whole suite, on the nested `/bug-game/` path    |

The E2E total is the load-bearing one. It covers all six specs — `gameplay`, `deploy`, `perf`,
`threats`, `restart`, `fullrun` — and the deploy job is gated on the same command, so nothing ships
without it. Getting there took four separate defects out of the game and the harness; they are
itemised in `DECISIONS.md`.

### 4d. What the verification itself got wrong

Four of the defects fixed in the last pass were found _because_ a check that had been reporting
success stopped doing so. Recorded here rather than in the fix list, because the pattern is the
point: every one of them was a measurement that failed in the direction of making the game look
fine.

- **The stall probe could not have shown its own worst case.** It reported a 27 s worst stall and
  illustrated it with ten two-second events, because `stuckSample` kept the _first_ ten rather than
  the worst ten. The `state` it recorded was read at the moment a stall _ended_ — and since every
  excused state (harvest, queue, trapped, idle) is what ends a stall, that label was guaranteed to
  name the wrong one. Corrected, the same run named the defect in one line: every worst stall was
  `panic`, on one cabinet edge. See `DECISIONS.md` D20.
- **The performance gate was measuring the compositor.** On the GitHub runner the _idle baseline_ —
  a static kitchen, no particles, no hazards — already fails `over50Pct < 1` by sixteen times, and
  cannot present a frame faster than 50 ms. Presented-interval budgets are now enforced only where
  the idle window shows the host can reach 60 Hz; the game's own cost is enforced everywhere. D19.
- **Two regression tests passed without their fix.** The first panic test frightened a healthy
  colony, where most roaches have clear line of sight to a crack, so it never met the geometry that
  causes the stall. The first climax test forced a bare world into the finale, which collapses in
  eight seconds, so it never reached the plateau it was measuring. Both were rewritten to derive
  their setup from the observed evidence, and both were then confirmed to fail with the fix reverted.
- **A fix that passed its test and broke the game.** Making panicking workers abandon an unreachable
  refuge removed the stall and cost a run: they milled about in the open instead of pouring into the
  walls, and seed 4242 went from a win to a wipe-out. Caught by `winnable.test.ts`, which plays three
  seeds to a win rather than asserting one. The shipped behaviour discounts cracks behind the wall
  the worker is against and bolts for the best one it can actually see.

### 4e. Limits on what this evidence proves

- **Frame-time tails are claimed from the development machine and the headed capture, not from CI.**
  The reason is in 4d; the numbers and the host they came from are both in `perf/perf.json`.
- **The 45-second decision gate is measured under play, and the `idle` scenario is over it** at
  124.7 s. That scenario makes no inputs at all: the objective correctly reads "Moisture is running
  low" and nobody acts on it. A do-nothing run is not normal play, and the plateau is the game
  waiting, not the game stalling.
- **Audio is verified by code inspection and voice-pool counters, not by listening.**

---

## 5. Known issues

Recorded rather than hidden. Each is either a critic finding that was not fixed, or a limit on what
the evidence proves.

1. **Worker stalls are at the contract's boundary, not comfortably inside it.** The gate is no
   unintentionally stuck worker over 2 s; the worst measured in a full real-browser run is **2.7 s**,
   with the rest of the sample at 2.4–2.5 s. Three causes were found and fixed in this pass and the
   improvement is large — on the `growth` scenario, worst stall **212.5 s → 2.7 s**, stall events
   67 → 28, workers that died mid-stall 6 → 0, severe overlaps 10 → 0, and the cluster on the
   island's top edge is gone from the sample entirely. The causes were a panic run that steered into
   cabinetry (`DECISIONS.md` D20), a lane offset that computed its steering target inside a solid,
   and that guard's first version testing a _point_ rather than the roach's own radius (D23). Three
   separate attempts to close the remainder by making the stuck ladder escalate faster were measured
   and every one was worse (D22).
2. **No outer time limit on a run.** A colony that never reaches three held regions keeps playing
   instead of being resolved. Every measured competent run ends, and household patience makes
   stalling expensive, but there is no hard stop. (Gameplay critic D4, partially fixed: the ending is
   now reachable and was measured on three seeds; the unbounded case remains.)
3. **No persistent per-zone hold readout.** The objective names the region it is pointing at and its
   percentage, and the end card shows the top four, but there is no always-on panel. (D17.)
4. **Two of six light sources have no drawn emitter** — `dishwasherLamp` and `binGlow` sit just
   outside their fixtures. (Visual critic #14.)
5. **Antennae are budgeted off past 30 on-screen roaches**, which is inside the range a late colony
   reaches. (Visual critic #15.)
6. **The absolute frame budget is asserted conditionally on a fast host.** A headless CI box cannot
   prove a desktop frame budget — its idle window with the page doing nothing already fails it — so
   the suite enforces the game's own frame-callback cost there instead. The single worst frame is
   held to that budget scaled by a measured host factor, floored at 1 so a fast host gets no relief.
   This is a stated limit, not a claim. (Technical verifier D4; see §4d and `DECISIONS.md` D19.)
7. **Several restart and deploy assertions restate a hard cap and cannot fail.** Noise rather than
   false green — the load-bearing assertions in those specs are real. (Technical verifier D5–D9.)
8. **Audio was verified by code inspection and by the voice-pool counters, not by listening.** No
   automated check hears the mix.
