# Independent technical verification — Baseboard Empire

Verifier did not implement this code. All results below are from commands run in throwaway clones of
this repository, or from reading the source. Nothing is taken from existing evidence files.

**Anchors.** Two clones were made because HEAD moved mid-verification.

- Clone A = `f901efa` (`docs: 계약 문서 8종을 재설계 기준으로 갱신…`)
- Clone B = `f2bc819` (`fix: 자원 소량 재생·마커 어휘 정리·영토 난이도 조정`) — current HEAD of `gameplay-redesign-v2`

Per instruction, `pnpm test:e2e` and `pnpm verify` were **not** run (port 4178 occupied). Every E2E
claim below is from reading the specs, not from executing them.

---

## 1. Clean install and pipeline

### Clone A — `f901efa` (all green)

| Command                        | Exit | Wall     | Result                                    |
| ------------------------------ | ---- | -------- | ----------------------------------------- |
| `pnpm install --frozen-lockfile` | 0  | 1.84 s   | 159 packages, lockfile up to date         |
| `pnpm format:check`            | 0    | 2.56 s   | "All matched files use Prettier code style!" |
| `pnpm lint`                    | 0    | 2.95 s   | no output                                 |
| `pnpm typecheck`               | 0    | 1.92 s   | no output                                 |
| `pnpm test`                    | 0    | 9.80 s   | 9 files, **122 tests passed**             |
| `pnpm build`                   | 0    | 2.50 s   | 42 modules, built in 246 ms               |
| `node scripts/check-subpath.mjs dist` | 0 | 0.06 s | "4 file(s) checked; build is subpath-safe." |

### Clone B — `f2bc819`, current HEAD (**RED**)

| Command          | Exit | Wall     | Result                                                                 |
| ---------------- | ---- | -------- | ---------------------------------------------------------------------- |
| `pnpm format:check` | **1** | 2.19 s | 5 files unformatted                                                    |
| `pnpm lint`      | **1** | 2.49 s | 1 error                                                                |
| `pnpm typecheck` | **2** | 1.87 s | 1 error                                                                |
| `pnpm test`      | 0    | 15.94 s | 12 files, 130 tests passed                                             |
| `pnpm build`     | **2** | 1.42 s | fails at the `tsc --noEmit` gate; never reaches vite                   |
| `check-subpath`  | **1** | —      | `dist does not exist` (build never produced it)                        |

Exact output:

```
[warn] scripts/tmp/runA/log.json
[warn] src/render/props.ts
[warn] tests/unit/zz1-first-minute.test.ts
[warn] tests/unit/zz2-density.test.ts
[warn] tests/unit/zz3-economy.test.ts
[warn] Code style issues found in 5 files.

tests/unit/zz2-density.test.ts
  5:10  error  'bankUntil' is defined but never used.  @typescript-eslint/no-unused-vars

tests/unit/zz2-density.test.ts(5,10): error TS6133: 'bankUntil' is declared but its value is never read.
```

`npx vite build` alone succeeds, so the failure is entirely the typecheck gate. `.prettierignore`
covers `dist artifacts node_modules playwright-report test-results pnpm-lock.yaml` — not
`scripts/tmp/`, which is why the committed 1517-line `scripts/tmp/runA/log.json` fails format.

**Consequence:** `.github/workflows/pages.yml` runs Format check → Lint → Typecheck → Unit → Build in
that order. Current HEAD fails at step 1 and would never deploy.

---

## 2. Bundle and asset budget — PASS with large margin

`f2bc819` build:

| File                       | Raw     | Gzip (-9)  |
| -------------------------- | ------- | ---------- |
| `dist/assets/index-*.js`   | 186,374 | **61,022** |
| `dist/assets/index-*.css`  | 10,794  | 3,243      |
| `dist/index.html`          | 1,504   | 791        |
| `dist/.nojekyll`           | 0       | —          |

GAME_CONTRACT.md:144 budget is ≤ 150 kB gzip JS. Actual **61.0 kB — 41 % of budget**. Total payload
198 kB raw across 4 files. `sourcemap: false` in `vite.config.ts:16` is the reason; this is honestly
documented in the config comment.

---

## 3. Deterministic simulation boundary — CLEAN

`grep -rnE '\b(window|document|Math\.random|Date|performance)\b' src/sim/` returns **6 matches, all
inside comments or identifiers** (`routines.ts:15,222` "decision window", `pheromone.ts:103` "Rolling
window", `types.ts:278` "telegraph window", `operations.ts:476` "closing window", `sim.ts:19` the
doc-comment asserting the property). **Zero violations.** All randomness routes through `world.rng`.

Empirically confirmed: two identical 60 s runs from seed 777 with 90 workers produced bit-identical
worker positions (probe below). The Jacobi accumulate-then-apply relaxation in `workers.ts:502-552`
does preserve order-independence as its comment claims.

---

## 4. Restart correctness

`startRun()` (`src/main.ts:116-132`) resets: world, particles, clock, errors, `outcomeTime`,
`celebrateAcc`, renderer outcome, camera (via `snapTo`, which zeroes `shake` at `camera.ts:34`),
audio mix, overlays, `paused`, `bestSaved`, `lastTime`.

**Confirmed clean** (worth stating, since these were the plausible suspects):

- `grep -nE "^(let|var) |^const [a-z].*= *(\[\]|\{\}|new (Map|Set))" src/render/*.ts src/ui/*.ts src/audio/*.ts`
  returns **nothing**. There is no module-level mutable state in the presentation layer; everything
  lives on the singletons constructed in `main.ts`.
- Particle pool is fixed-capacity (`particles.ts:24` `PARTICLE_BUDGET = 900`) and `clear()` resets
  `active`, `count` and `cursor`. No leak.
- Camera shake is zeroed by `snapTo`. No leak.
- Audio ambience beds are created once (`startAmbience()` is only reachable through `start()`, which
  early-returns when `this.ctx` exists). No leak.

**What does leak:**

| # | Leak | Evidence | Severity | Confidence |
|---|------|----------|----------|------------|
| L1 | `Telemetry` is never reset. `Telemetry.reset()` exists at `core/telemetry.ts:170` and `grep -rn "\.reset()" src/` returns **only** `main.ts:120 clock.reset()`. Across a restart the 600-frame FPS ring, `results[]`, `counters` and any open capture window all survive. | `src/main.ts:116-132`; `src/core/telemetry.ts:170-179` | Medium | High |
| L2 | Renderer flash survives restart. `startRun()` calls `renderer.setOutcome(null, 0)` but nothing clears `this.flash` (`renderer.ts:60`). A `lose` flash is `addFlash(10,12,16, 0.6, 1.2)` (`main.ts:588`); decay is per-frame in `drawOverlays` (`renderer.ts:1477`), so a restart inside ~1–2 s carries a dark tint into the new run. | `src/render/renderer.ts:60,120-129,1475-1479` | Low | High |
| L3 | `victory()` schedules 5 `window.setTimeout` callbacks at 0/170/340/510/680 ms (`audio.ts:623-628`). Nothing cancels them. `Enter` restarts immediately on a win (`main.ts:209`), so up to 5 victory tones play over the fresh run. | `src/audio/audio.ts:620-630` | Low | High |
| L4 | `defeat()` calls `cancelScheduledValues` before ramping the buses down (`audio.ts:638,643`); `resetMix()` calls `setValueAtTime` **without** `cancelScheduledValues` (`audio.ts:654-655`). A restart inside the 40 ms ramp leaves music/sfx pinned at 0.02/0.05 for the whole next run. | `src/audio/audio.ts:632-658` | Low | Medium |
| L5 | `held` (the physical key set) is not re-applied on an overlay-button restart. Keyboard restarts are fine — `keyDown` falls through to `applyHeld()` at `main.ts:220` — but `overlays.restart → startRun()` (`main.ts:96`) does not, so a held key is ignored until the next key event. | `src/main.ts:96,116-132,220` | Low | High |
| L6 | `skitterAcc` (`main.ts:83`) and `erasePressAt` (`main.ts:137`) survive. Bounded and harmless; listed for completeness. | `src/main.ts:83,137` | Trivial | High |

L1 is the one that matters: REDESIGN_CONTRACT §9 and GAME_CONTRACT both assert "state leakage across
5 restarts = 0", and there is a leak with a purpose-built reset method that is never called.

---

## 5. Listeners, voices, particles — CLEAN

**Listeners.** `grep -rn addEventListener src/` yields 15 sites. Ten are at module scope in `main.ts`
(48, 51, 242, 253, 262, 263, 264, 265, 270, 293) — executed once at boot, never re-run. Five are in
`Overlays.bind()` (`overlays.ts:62-85`), which is called from `show()` **after**
`this.root.innerHTML = html` (`overlays.ts:54`). Replacing `innerHTML` discards the previous
elements and their listeners, so `bind()` attaches to fresh nodes rather than stacking. `hide()`
clears `innerHTML` entirely. No accumulation. `restart.spec.ts:97` claims to assert this but does not
(see D6).

**Voices.** `MAX_VOICES = 24`, enforced in `takeVoice()` (`audio.ts:110-114`); every voice sets
`onended = this.release`, and short-circuit evaluation means `takeVoice()` cannot be charged for a
voice that is never created (`audio.ts:134`, `audio.ts:173`). A suspended context defers `onended`,
so voices saturate at 24 and recover on resume — self-limiting, not a leak.

**New ambience layers.** Fridge hum (3 saws + 1 LFO), room tone, chitter, hiss, water, roomTone are
all created exactly once in `startAmbience()` (`audio.ts:196-297`) and thereafter only have their
`gain.value` interpolated in `updateBeds()` (`audio.ts:307-351`). **No per-frame node creation.**
They are deliberately outside the voice cap, which is correct for persistent beds but means
`telemetry.counters.voices` under-reports the live node count by ~9.

**Cooldown map.** `this.cooldowns` is keyed by ~15 string literals; bounded, and cleared in
`resetMix()`.

---

## 6. Performance hot paths — measured, not guessed

I benchmarked the simulation directly (probe file written inside the throwaway clone only, never in
the repo), 90 alive workers, 2 linked routes, on this host:

```
[PROBE] alive=90 pop=90 routes=2 nodes=40 :: 0.2379 ms/step over 3600 steps
[PROBE] panic (all 90 panicking):            0.2130 ms/step over 1800 steps
[PROBE] deterministic across identical runs: true
```

**0.24 ms per fixed step at WORKER_CAP=90.** One step per rendered frame at 60 Hz is 1.4 % of the
16.7 ms frame, and 3 % of the 8 ms CPU budget the perf spec enforces. **There is no O(n²) hazard in
the simulation.** The spatial hash (`core/spatial.ts`) is allocation-free — buckets are truncated
with `b.length = 0`, never reallocated — and cell 96 vs `WORKER_SEPARATION` 17 / `WORKER_CLEARANCE`
22 means queries touch at most 2×2 cells. `heat.ts` is 108 cells scanned linearly. `territory.ts`
`updateTerritory` is workers×8 zones + routes×(nodes/3)×8, trivial.

Allocation hazards that are real but quantitatively minor, given the above:

- `workers.ts:420` and `workers.ts:515` — a fresh closure per alive worker per step, twice, and both
  capture mutated locals (`sx/sy`, `cx/cy`) so the environment record is heap-allocated. ~10,800
  closures/s at cap. Nursery garbage; measured cost is already inside the 0.24 ms.
- `workers.ts:336` — `world.nests.find(...)` per panicking worker per step. The panic probe measured
  *cheaper* than normal play, so this is not a hazard. Flagged only because it reads like one.

**The render path is where the unbounded work actually is**, and two passes have no viewport culling
at all:

| # | Hazard | Evidence | Severity | Confidence |
|---|--------|----------|----------|------------|
| P1 | `drawSprays(world, t)` takes **no bounds argument** and culls nothing. Each spray draws 22 puffs, each allocating a `createRadialGradient` (`renderer.ts:925`). Two concurrent sprays are permitted (`director.ts:287`) → 44 gradient objects **per frame**, ~2,600/s, drawn even when the cloud is off screen. | `src/render/renderer.ts:912-930` | Medium | High |
| P2 | `drawNests(world, t)` also takes no bounds and culls nothing (`renderer.ts:531`). 6 authored nests × (16-segment torn path + glow blit + up to 9 egg/cache ellipses + integrity arc + sheen). Also inflates `drawCalls` telemetry with off-screen work. | `src/render/renderer.ts:531-665` | Low | High |
| P3 | `drawResources` re-derives up to `8 + 22 = 30` crumbs per food node **every frame** from `valueNoise2D`, each crumb costing 2–3 path fills + 4 noise calls — up to ~90 canvas ops per visible food node per frame. Deterministic from `(k, i)`, so it is bakeable to an offscreen canvas exactly like `props.ts` already does. This is the largest avoidable cost in the frame. | `src/render/renderer.ts:472-503` | Medium | High |
| P4 | `drawPheromone` allocates the `passes` tuple-array literal per route per frame (`renderer.ts:705-709`); `composeLighting` allocates one gradient per light (6), per patrol cone (×2 each), per claimed nest and per spray, per frame, unculled. | `renderer.ts:705`, `renderer.ts:1274-1340` | Low | High |
| P5 | `renderer.ts:899` `world.hazards.find(...)` inside the per-worker adhesive-strand loop. Bounded by trapped-worker count. | `src/render/renderer.ts:896-909` | Trivial | High |

---

## 7. Test quality

### What is genuinely strong

- `tests/unit/play.ts` is a **player-legal** harness. Every action goes through `world.input`,
  `interactPressed`, `chooseAdaptation` or `chooseFunction` — the exact seams `main.ts` binds to
  W/A/S/D, E, and 1/2/3. The comment at `play.ts:255-257` explicitly refuses to reach into the route
  array because "a test player that reached into the route array would be doing something no player
  can do." That discipline is real and visible throughout.
- `expectClean()` (`driver.ts`) asserts zero page errors, zero console errors and zero failed
  requests, and is called in **every** E2E spec. This is the strongest gate in the suite.
- `perf.spec.ts:195-200` asserts `cpuP99` **and** `cpuWorst` ≤ 8 ms unconditionally. Host-independent
  and genuinely falsifiable — the best assertion in the file.
- `loop.test.ts:38-41` explicitly documents replacing a near-vacuous predecessor with "the store goes
  up on the frame a delivery lands." `workers.test.ts:183` adds `expect(worstRatio, 'nothing was ever
  measured').toBeGreaterThan(0)` as an anti-vacuity guard. Both are the right instinct.
- `deploy.spec.ts:53-62,84-87` asserts at the network layer that no request leaves the origin.

### Defects

| # | Symptom | Evidence | Severity | Confidence |
|---|---------|----------|----------|------------|
| D1 | **Three diagnostic dump scripts are committed as tests.** `zz1-first-minute.test.ts` (72 lines, **1** `expect`, 5 `console.log` dumps), `zz3-economy.test.ts` (97 lines, **1** `expect`, 3 dumps), `zz2-density.test.ts` (159 lines, 2 `expect`). They match `*.test.ts`, so they run in `pnpm test` and in CI, spraying dumps into the log and inflating the pass count. Two more (`zz4-source`, `zz5-capped`) are untracked in the working tree. These are also the direct cause of the format/lint/typecheck failures in §1. | `tests/unit/zz{1,2,3}-*.test.ts`, committed in `f2bc819` | **Blocker** | High |
| D2 | **No test ever wins the game by playing.** The only `expect(status).toBe('won')` is `sim.test.ts:442`, reached by writing the win condition directly: `for (let i = 0; i < ZONES_TO_WIN; i++) world.zones[i].hold = 1` (`sim.test.ts:439`). `operations.test.ts:204` does the same with `z.hold = 0.95`. `strategies.test.ts:97` accepts `['playing','won']`. In E2E, `fullrun.spec.ts:202` only *breaks the loop* on `won`; its assertions stop at `operation >= 3` and `operationsCompleted >= 2` (`fullrun.spec.ts:183-184`). The territory hold rate could be unreachable in practice and the entire suite would stay green. The `sim.test.ts` test is honest about being a constructed moment — the gap is that nothing covers *earning* it. | `tests/unit/sim.test.ts:431-444`; `tests/e2e/fullrun.spec.ts:183-202` | **High** | High |
| D3 | **The perf gate is not enforced in CI.** `pages.yml:63` runs only `gameplay.spec.ts deploy.spec.ts restart.spec.ts` — 3 of 7 specs. `perf.spec.ts`, `fullrun.spec.ts` and `threats.spec.ts` never run on CI. | `.github/workflows/pages.yml:60-64` | **High** | High |
| D4 | Even when run, the absolute frame budget is conditional: `const hostCanPresentFast = baseline!.p50 <= BUDGET.p50` gates the p50/p95/p99 assertions (`perf.spec.ts:187,222-226`), and `over100` is relaxed from 0 to 1 on a slow host (`perf.spec.ts:217-219`). The reasoning is documented and defensible, and the CPU budget covers the gap — but the contract line "p50 ≤ 16.7 ms, p95 ≤ 20 ms, p99 ≤ 33 ms in peak play" is not what the automated suite proves on a headless host. | `tests/e2e/perf.spec.ts:187,217-226` | Medium | High |
| D5 | **`restart.spec.ts`'s three "nothing may creep" assertions cannot fail.** `expect(Math.max(...voices)).toBeLessThanOrEqual(24)` (line 93) restates `MAX_VOICES`, enforced unconditionally by `takeVoice()`. `expect(Math.max(...particles)).toBeLessThanOrEqual(900)` (line 94) restates `PARTICLE_BUDGET`, the fixed pool size — `acquire()` cannot exceed it. Neither can detect a leak of any kind. | `tests/e2e/restart.spec.ts:93-94` vs `audio.ts:20,110`; `particles.ts:24,69-80` | Medium | High |
| D6 | `restart.spec.ts` collects `drawCalls` into `samples` (line 79) and **never asserts on it** — precisely the sin the comment at line 96 claims to have just fixed for listeners. The `listeners` field itself (line 80-83) counts `Object.keys(globalThis).length`, which measures globals, not listeners; the spec header (line 23) nonetheless claims listener coverage. Telemetry leakage (L1) is invisible to this spec. | `tests/e2e/restart.spec.ts:73-97` | Medium | High |
| D7 | `deploy.spec.ts:126` `expect(peakVoices).toBeLessThanOrEqual(24)` — same hard-cap tautology as D5. The companion `expect(peakVoices).toBeGreaterThan(0)` on line 125 *is* real and falsifiable. | `tests/e2e/deploy.spec.ts:125-126` | Low | High |
| D8 | Vacuous assertions: `household.test.ts:136` `expect(knownCellCount(exposed)).toBeGreaterThanOrEqual(0)` (a count is always ≥ 0); `workers.test.ts:182` `expect(recovered).toBeGreaterThanOrEqual(0)`; `workers.test.ts:184` `expect(STUCK_GRACE).toBeGreaterThan(0)` (a constant). All are trailing lines in tests whose primary assertions are strong, so they cause no false green — but they are noise that reads as coverage. | as cited | Low | High |
| D9 | `operations.test.ts:405` sets `world.colony.population = 90` then calls `idle(world, 5)`. `updateWorkers` overwrites `world.colony.population = alive` every step (`workers.ts:554`), so the grant evaporates on the first step. The test still passes because the load-bearing setup is `milestonesUsed = MILESTONE_POPULATION.length` on line 404 — but the population line advertises a precondition the test does not actually hold. | `tests/unit/operations.test.ts:401-410` vs `src/sim/workers.ts:554` | Low | High |

### Resource grants: mostly legitimate

`grep` found ~40 direct writes to `colony.food/water/population/operation` in the unit tests. I read
each cluster. The overwhelming majority are honest fixtures that establish a *precondition* and then
assert an *emergent* consequence — `balance.test.ts:210-211` sets a lopsided larder and then measures
whether labour redeploys and whether `LABOUR_SHARE_CAP` holds (lines 226-234, 250-258);
`expansion.test.ts:23-25` grants reserves because the subject is reachability, and then asserts the
*deltas* `food === foodBefore - spec.costFood`; `operations.test.ts` `buy()` documents the same at
lines 415-420. None of these are self-fulfilling. D2 and D9 are the exceptions.

---

## 8. Nested-path / deployment config — CORRECT and asserted at three layers

1. `vite.config.ts:7` `base: './'` — no repo name baked in; works from root, subpath, or `file:`.
2. `scripts/check-subpath.mjs` scans **every emitted file** for root-absolute `src`/`href`, CSS
   `url()`/`@import`, JS `fetch()`/`import()`/`new URL()`, and asserts `dist/.nojekyll` exists.
   Verified passing on a real build: "4 file(s) checked; build is subpath-safe."
3. `playwright.config.ts` serves the **production build** from `/bug-game/` on 4178, so every spec is
   implicitly a subpath test. `reuseExistingServer: false` plus `npx vite build` inside the
   `webServer.command` closes the stale-dist hole, which the config comment documents.

One gap: **`pnpm verify` does not run `check-subpath`.** `package.json:22` chains
`format:check → lint → typecheck → test → build → test:e2e → evidence:pack → evidence:report`. The
subpath assertion exists only as a CI step (`pages.yml:57-58`). A local `pnpm verify` is therefore
weaker than CI. Severity Low, confidence High.

---

## 9. REDESIGN_CONTRACT §9 — TECHNICAL gates, verdict

| Gate | Verdict | Basis |
|------|---------|-------|
| "Clean install; format, lint, typecheck, unit, integration, production build, browser E2E all pass" | **CONTRADICTED at HEAD** | `f2bc819` fails format:check (exit 1), lint (exit 1), typecheck (exit 2) and build (exit 2). Held at `f901efa`. E2E not run per instruction. |
| "Works at `/bug-game/`" | **SUPPORTED** | `base:'./'`; `check-subpath` passes; Playwright serves dist from `/bug-game/`; `deploy.spec.ts:33,43-44` asserts URL and reload. |
| "Zero essential runtime network requests" | **SUPPORTED** | `deploy.spec.ts:53-62,84-85` asserts at the network layer and via `assetAudit().externalRequests`. Build is 4 self-contained files. |
| "No missing assets" | **SUPPORTED** | `watch()`/`expectClean()` fail on any `requestfailed` or ≥400 response, in every spec. |
| "No unexplained console errors" | **SUPPORTED** | `expectClean()` asserts `consoleErrors` and `pageErrors` are empty, in every spec. |
| "p50 ≤ 16.7 / p95 ≤ 20 / p99 ≤ 33 ms in peak play" | **MISSING** | Conditional on `hostCanPresentFast` (D4); `perf.spec.ts` is not in the CI spec list (D3). Not run here. The unconditional `cpuP99 ≤ 8 ms` is a good proxy but is not this gate. |
| "< 1 % of peak frames > 50 ms" | **PARTIAL** | Asserted unconditionally (`perf.spec.ts:209`) but never executed in CI. |
| "No unexplained frame > 100 ms after load" | **PARTIAL** | Relaxed to ≤ 1 on a slow host (`perf.spec.ts:217-219`), with an investigation documented in the comment. |
| "Zero unbounded entity growth" | **SUPPORTED** | `workers` is a fixed `new Array(WORKER_CAP)` pool (`world.ts:327`); `corpses` capped at 40 (`workers.ts:60`); `errors` capped at 100 (`main.ts:42-46`); `MAX_ROUTES=6`, `MAX_HAZARDS=12`. |
| "Zero unbounded particle growth" | **SUPPORTED** | Fixed 900-slot pool, priority eviction. |
| "Zero unbounded voice growth" | **SUPPORTED** | `MAX_VOICES=24` with `onended` release; ambience nodes created once. Note the *asserting test* is tautological (D5) — the property holds, the test does not prove it. |
| "Zero unbounded listener growth" | **SUPPORTED by code reading, NOT by test** | All 15 sites are boot-once or attached to freshly-replaced DOM. `restart.spec.ts:97` measures globals, not listeners (D6). |
| "Zero restart-state leakage" | **CONTRADICTED** | L1 (telemetry never reset; `Telemetry.reset()` is dead code), L2 (renderer flash), L3 (victory timeouts), L4 (defeat duck), L5 (held keys). Simulation state resets correctly and thoroughly — `restart.spec.ts:52-71` proves that with 18 real assertions — but presentation state does not. |
| "Restart to playable ≤ 2 s" (GAME_CONTRACT) | **PARTIAL** | `restart.spec.ts:71` asserts `< 4000 ms`, twice the stated 2 s budget. |

---

## 10. Additional defect found by probe

| Symptom | Evidence | Severity | Confidence |
|---------|----------|----------|------------|
| **`HARVEST_SLOTS` is not enforced.** The `queue → harvest` transition increments `res.busy` (`workers.ts:266`); the `outbound → harvest` transition at `workers.ts:228-231` does **not**. Two workers arriving in the same tick both read the same stale `busy` and both start feeding. Nothing evicts them afterwards. Measured over 240 s with a full 90-worker pool: `HARVEST_SLOTS=4 bonus=0 maxSimultaneous=5 overSubscribed=[["sinkDrip",5],["dishCrumbs",5]]` — a 25 % over-run of the intended feed rate on every source tested. | `src/sim/workers.ts:228-238` vs `:263-267`; probe output above | Low | High |

---

## Summary

The engineering underneath is genuinely solid: a clean deterministic sim boundary, no module-level
mutable presentation state, allocation-free spatial hashing, fixed-capacity pools everywhere, a
0.24 ms/step simulation at full colony cap, a 61 kB gzip bundle against a 150 kB budget, and
base-path handling that is correct and asserted three independent ways. The `f901efa` pipeline is
green end to end.

Three things block a claim of "all technical gates met":

1. **Current HEAD `f2bc819` is red** — format, lint, typecheck and build all fail, and CI would stop
   at the first step. The cause is three diagnostic dump scripts committed as `*.test.ts` plus an
   unformatted `props.ts` and a committed 1517-line `log.json`.
2. **No test wins the game by playing it.** The win is only ever asserted after writing
   `zones[i].hold = 1`, and CI runs 3 of 7 E2E specs.
3. **Restart leaks presentation state**, including a `Telemetry.reset()` that was written for exactly
   this purpose and is called from nowhere — against a contract line that says leakage is zero.
