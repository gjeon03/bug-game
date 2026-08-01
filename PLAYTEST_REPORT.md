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

Headless coverage sits alongside it: 131 unit/integration tests, including a full run played to a win
on three seeds, the capped-resource invariant, the objective hierarchy, regional heat, the threat
budget, worker stuck/overlap limits and restart equality.

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

| Command                                                | Result                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm format:check`                                    | pass                                                                                   |
| `pnpm lint`                                            | pass                                                                                   |
| `pnpm typecheck`                                       | pass                                                                                   |
| `pnpm test`                                            | **131 passed** in ~11 s                                                                |
| `pnpm build`                                           | pass — `dist/assets/index-*.js` 191.9 kB raw, **63.0 kB gzip** (budget 150 kB)         |
| `node scripts/check-subpath.mjs dist`                  | `4 file(s) checked; build is subpath-safe.`                                            |
| `pnpm exec playwright test tests/e2e/gameplay.spec.ts` | **5 passed** (1.3 min)                                                                 |
| `pnpm exec playwright test tests/e2e/deploy.spec.ts`   | **3 passed** — nested subpath, zero requests leaving the origin, no placeholder assets |

### 4d. What was not completed in this pass

Stated plainly rather than implied.

- **The seven-scenario `playtest.mjs` package did not finish.** Its per-run screenshots and the
  guided-run transcript above are real and come from the shipped build, but `playtest.json` is not a
  complete seven-scenario record. Two causes were found and fixed along the way — an in-page steering
  loop that could hang when the browser throttled `requestAnimationFrame` (now watchdogged in both
  `tests/e2e/driver.ts` and `scripts/lib/bot.mjs`), and an O(n²) overlap scan running at 10 Hz inside
  the page (now 2 Hz) — but the full package was not re-run to completion afterwards.
- **`perf.spec.ts`, `threats.spec.ts`, `restart.spec.ts` and `fullrun.spec.ts` were not observed
  green locally.** They are long by design (a full playthrough runs in real time) and every local
  attempt was made on a machine that was also running other captures. They run in CI on every push,
  and the deploy job is gated on them.
- **Frame-time tails were therefore not captured for this build.** No p50/p95/p99 figure is claimed.

---

## 5. Known issues

Recorded rather than hidden. Each is either a critic finding that was not fixed, or a limit on what
the evidence proves.

1. **No outer time limit on a run.** A colony that never reaches three held regions keeps playing
   instead of being resolved. Every measured competent run ends, and household patience makes
   stalling expensive, but there is no hard stop. (Gameplay critic D4, partially fixed: the ending is
   now reachable and was measured on three seeds; the unbounded case remains.)
2. **No persistent per-zone hold readout.** The objective names the region it is pointing at and its
   percentage, and the end card shows the top four, but there is no always-on panel. (D17.)
3. **Two of six light sources have no drawn emitter** — `dishwasherLamp` and `binGlow` sit just
   outside their fixtures. (Visual critic #14.)
4. **Antennae are budgeted off past 30 on-screen roaches**, which is inside the range a late colony
   reaches. (Visual critic #15.)
5. **The absolute frame budget is asserted conditionally on a fast host.** A headless CI box cannot
   prove a desktop frame budget, so the suite falls back to a CPU-time budget there. This is a stated
   limit, not a claim. (Technical verifier D4.)
6. **Several restart and deploy assertions restate a hard cap and cannot fail.** Noise rather than
   false green — the load-bearing assertions in those specs are real. (Technical verifier D5–D9.)
7. **Audio was verified by code inspection and by the voice-pool counters, not by listening.** No
   automated check hears the mix.
