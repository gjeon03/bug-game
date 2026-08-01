# 07 — Technical & deployment audit (read-only baseline)

Branch `gameplay-redesign-v2` @ `3242189`. All findings are from source reading plus the four
verification commands run locally on 2026-08-01.

**Provenance — read this before chasing a line number.**

- `src/main.ts` and `src/testapi.ts` were modified-but-uncommitted when I read them; the diff is
  additive only (a `workers()` diagnostic seam on `TestApi`), and my citations follow the working
  tree. `scripts/playtest.mjs` is a new **untracked** file.
- **`src/sim/` was rewritten by another agent while this audit was in progress** (`constants.ts`
  +28, `types.ts` +14, `workers.ts` +239, `world.ts` +22 after I had read them). Every `src/sim/*`
  citation below is pinned to **`HEAD` = `3242189`** and was re-verified line-by-line against
  `git show HEAD:<file>` after the change — use `git show` to check them, not the working tree.
  Findings D10, D14 and §3's sim table may already be stale against that agent's edits; nothing
  else in this report touches `src/sim/`.
- All `src/render/`, `src/audio/`, `src/ui/`, `src/core/`, `tests/` and config citations are
  unchanged in the working tree and match both it and `HEAD`.

---

## 9. Command results (exact)

| Command | Result | Detail |
| --- | --- | --- |
| `pnpm typecheck` | **PASS** | `tsc --noEmit`, exit 0, no output |
| `pnpm lint` | **PASS** | `eslint .`, exit 0, no output |
| `pnpm test` | **PASS** | 7 files, **73 tests**, 13.71 s (`seeds` 13.29 s, `strategies` 3.53 s, `balance` 3.29 s dominate) |
| `pnpm format:check` | **FAIL** | `[warn] scripts/playtest.mjs` — exit 1 |
| E2E (last recorded run) | PASS | `artifacts/evidence/e2e-results.json`: 17 expected, 0 unexpected, 0 flaky, 1 799 s |

`format:check` is the **first** gate in `.github/workflows/pages.yml:36`. The offending file is
untracked, so CI is green *today*; committing `scripts/playtest.mjs` unformatted fails the deploy
pipeline before it builds. Diff is whitespace-only (3 hunks, prettier line-width).

---

## OBSERVABLE DEFECTS

| # | Symptom | Evidence | Severity | Confidence |
| --- | --- | --- | --- | --- |
| D1 | `sim.test.ts` "a new world after a full run is identical to a cold one" is a tautology: `fresh` and `cold` are both constructed *after* `played` was played, so they are equal by construction. The stated guarantee — "no module-level mutable state may survive a completed run" — is structurally untestable by this test. | `tests/unit/sim.test.ts:453-468` | **High** | Certain |
| D2 | Committing the already-present `scripts/playtest.mjs` fails `pnpm format:check`, the first CI step, blocking deploy. | `scripts/playtest.mjs`; `.github/workflows/pages.yml:36` | **High** | Certain |
| D3 | Restart from the pause overlay leaves the `AudioContext` suspended. `setPaused(true)` calls `audio.suspend()`; the Restart button calls `startRun()`, which calls `resetMix()` but never `resume()`. Silence until the next keydown/pointerdown re-enters `ensureAudio()`. | `src/main.ts:113-129` vs `:141-153`, `:136-139` | Medium | High |
| D4 | Returning to the tab **during an interlude** never resumes audio: `visibilitychange` guards on `!overlays.visible`, and the interlude sets `overlays.kind='interlude'`. Nothing calls `audio.resume()` when the interlude ends at `:526`. | `src/main.ts:242-254`, `:525-526` | Medium | High |
| D5 | `startRun()` does not call `applyHeld()`. Restart via the overlay button or `__roach.newRun()` leaves `world.input` all-false while `held` still contains the physically-held key — the scout is unresponsive until the key is released and re-pressed. (The `KeyR`/`Enter` paths are saved by `applyHeld()` at `:192`.) | `src/main.ts:113-129`, `:133`, `:203-212` | Medium | High |
| D6 | `victory()` schedules 5 un-cancellable `window.setTimeout` voices over 850 ms. Restarting inside that window plays the victory sting over the new run. | `src/audio/audio.ts:437-447` | Low | Certain |
| D7 | `defeat()` schedules `linearRampToValueAtTime` on music/sfx buses; `resetMix()` restores with `setValueAtTime` and **no** `cancelScheduledValues`. A restart inside the 40 ms ramp leaves both buses ducked. | `src/audio/audio.ts:449-465`, `:468-475` | Low | Medium |
| D8 | `renderer.flash` is not cleared by `startRun()`. The defeat flash (`a=0.6, decay=1.2`) keeps decaying into the first frames of the new run. | `src/main.ts:113-129`; `src/render/renderer.ts:59`, `:1404-1409` | Low | Certain |
| D9 | `Telemetry` is never reset on restart: `recentFps()` history and an unclosed `beginWindow` survive; `this.results` grows unbounded. | `src/main.ts:113-129`; `src/core/telemetry.ts:121-159` | Low | High |
| D10 | `world.pheromoneNodeCount` is documented as feeding "the renderer's LOD decisions" but the renderer never reads it. There is **no** pheromone LOD; every live node is one `drawImage`. | `src/sim/world.ts:162` vs. no reader in `src/render/` | Low (doc/perf) | Certain |
| D11 | e2e `07` asserts "the room light must actually be on" by re-reading `counts.patrols > 0` — a value already awaited two lines earlier. The assertion cannot fail and does not test room light. | `tests/e2e/threats.spec.ts:83-89` | Medium (false confidence) | Certain |
| D12 | e2e `11` captures a `listeners` field (`Object.keys(globalThis).length`) into `restarts.json` and never asserts on it. Listener leakage across restarts is recorded, not checked. | `tests/e2e/restart.spec.ts:88-91`, `:100-108` | Low | Certain |
| D13 | `loop.test.ts` closes with `expect(food).toBeGreaterThan(foodBefore - 8.1)` — passes with food *falling*. It does not assert income arrived. | `tests/unit/loop.test.ts:37` | Low | Certain |
| D14 | `SpatialHash` is documented allocation-free, but its only hot caller allocates a fresh closure per live worker per step (~5 400/s at `WORKER_CAP=90`, 60 Hz). | `src/core/spatial.ts:5`, `:47`; `src/sim/workers.ts:345-355` | Low | Certain |
| D15 | `scripts/check-subpath.mjs` scans `.html/.css/.js` only. `.json`, `.webmanifest`, `.svg` and `.map` files in `dist/` are silently unchecked. Not exploitable today (dist is 3 files), fragile if the redesign adds a manifest or data file. | `scripts/check-subpath.mjs:19-30` | Low | Certain |

---

## 1. Deterministic simulation boundaries

**Clean.** `grep -rn "Math.random|window\.|document\.|performance\.now|Date\.now|localStorage|requestAnimationFrame|navigator\." src/sim/ src/core/` returns only:

- doc-comment mentions in `src/sim/sim.ts:19`, `src/core/rng.ts:4`, `src/sim/types.ts:166`;
- real `window.localStorage` in `src/core/storage.ts:16-42` — **not** reachable from `sim/`.

Import boundary is enforced by construction: `src/sim/*.ts` imports nothing from `render/`, `ui/` or
`audio/`, and only `core/math.ts`, `core/rng.ts`, `core/spatial.ts` from `core/`. The 17 `Math.random`
call sites in `src/main.ts` are all presentation (particle bursts, the celebration ring, `pickSeed`);
the 3 in `audio.ts` are playback-rate jitter. None crosses into the sim.

**`createWorld(seed)` fully resets state.** `src/sim/world.ts:244-452` allocates a brand-new `World`
literal every call — new `Rng`, new `SpatialHash`, freshly `.map()`-ed copies of `NESTS`/`RESOURCES`
(so the authored tables are never mutated), `beatFired: []`, `corpses/routes/hazards/patrols/sprays/
footfalls` all empty. There is **no module-level mutable state anywhere in `src/sim/`** — the only
module-level mutables in the whole codebase are `src/core/storage.ts:9-10` (a `localStorage`
availability cache and an in-memory fallback map), which is settings persistence and is intentional.

Determinism is genuinely proven by `sim.test.ts:430-451` (3 000 steps, two worlds, identical inputs,
including `rng.snapshot()` equality). That test is the strongest asset in the suite. **D1** means the
*restart*-specific claim is not proven at the unit level; `tests/e2e/restart.spec.ts:38-108` covers it
behaviourally instead.

---

## 2. TEST QUALITY — disposition table

Verdicts: **KEEP** = asserts player-facing behaviour that should survive a redesign. **REWRITE** =
the intent is right but the test is welded to the current map, the three-night structure, or a
literal constant. **DELETE** = asserts nothing, or asserts an implementation detail.

### tests/unit

| File:line | What it asserts | Verdict | Why |
| --- | --- | --- | --- |
| `core.test.ts:7-46` (5) | Fixed clock: step counts, no drift, spiral-of-death cap, `flush()` | **KEEP** | Pure primitive. Redesign-independent. |
| `core.test.ts:48-85` (4) | Rng reproducibility, divergence, ranges, snapshot round-trip | **KEEP** | Same. |
| `core.test.ts:87-123` (2) | SpatialHash vs. brute force; clear-and-reuse | **KEEP** | Same. |
| `core.test.ts:125-150` (4) | `clamp/smoothstep/angleDelta/rotateToward/damp` | **KEEP** | Same. |
| `sim.test.ts:42-66` (2) | Collision resolves out of every face of every `SOLIDS` entry | **KEEP** | Iterates `SOLIDS` symbolically — survives a map change. |
| `sim.test.ts:68-84` | 3 000-step random walk stays in-bounds and out of furniture | **KEEP** | Best collision test in the suite. |
| `sim.test.ts:86-93` | `coverAt(560,1700)>0.9`, `coverAt(620,1700)>0.4`, `coverAt(2200,1950)===0` | **REWRITE** | Three literal map coordinates. Derive the probes from `SOLIDS` like `:42-59` already does. |
| `sim.test.ts:33-39` (helper `layRouteToCrumbs`) | — | **REWRITE** | Hardcodes `(600,2010)`, `(600,1760)`, `'dishCrumbs'`. **8 downstream tests break together** on any map change. Make it take a nest/resource pair. |
| `sim.test.ts:97-115` | Node spacing ≥ `NODE_SPACING`, reserve spent then regenerates | **KEEP** | Symbolic constants; mechanism-level. |
| `sim.test.ts:117-137` | `nestEnd`/`resEnd` detected in either lay direction | **KEEP** | Core routing contract. |
| `sim.test.ts:139-147` | Unused route expires after `NODE_LIFE` | **KEEP** | Symbolic. |
| `sim.test.ts:149-158` | Traffic sustains a route past `NODE_LIFE` | **KEEP** | The self-sustaining-trail thesis. |
| `sim.test.ts:160-171` | Erasing dissolves nearby nodes | **KEEP** | |
| `sim.test.ts:173-182` | Never exceeds `MAX_ROUTES` | **KEEP** | Uses the constant, not a literal. |
| `sim.test.ts:184-192` | No link outside `LINK_RADIUS` | **KEEP** | |
| `sim.test.ts:194-200` | Recall clears every route assignment | **KEEP** | |
| `sim.test.ts:204-225` | Units conserved node → carry → store | **KEEP** | Real invariant. `void startStore` at `:224` is dead — drop it. |
| `sim.test.ts:227-236` | Depletion fires `SUSPICION_WEIGHTS.depleted` exactly once | **KEEP** | |
| `sim.test.ts:240-250` | Hatching spends food **and** water | **KEEP** | |
| `sim.test.ts:252-258` | Won't breed into starvation | **KEEP** | |
| `sim.test.ts:260-268` | Starvation only after `STARVE_GRACE` | **KEEP** | |
| `sim.test.ts:270-276` | Population capped at capacity | **KEEP** | |
| `sim.test.ts:278-282` | Never exceeds the worker pool | **KEEP** | |
| `sim.test.ts:286-296` | Weights sum; `topCause` attributes the largest | **KEEP** | |
| `sim.test.ts:298-309` | `expect(seen).toEqual([1,2,3,4])` | **REWRITE** | Literal `[1,2,3,4]` freezes a four-tier ladder. Derive from `TIER_THRESHOLDS` — line `:308` already does. |
| `sim.test.ts:311-318` | Decay floors at a fraction of peak, never zero | **KEEP** | "Evidence is not erasable" is a design pillar. |
| `sim.test.ts:322-332` | Traps land near the ground the player used | **KEEP** | Causal chain, map-agnostic assertion. |
| `sim.test.ts:334-345` | Footfall warns before it kills | **KEEP** | Coordinate `(1600,2200)` is incidental. |
| `sim.test.ts:347-358` | Scout replacement costs a body | **KEEP** | |
| `sim.test.ts:360-366` | Patrol raises room light and drops footfalls | **KEEP** | |
| `sim.test.ts:370-384` | Victory needs every criterion — via `night=3; nightTime=nightLength-0.1` | **REWRITE** | Hard-codes the three-night structure as the win trigger. Keep the "every criterion" claim; drive it through whatever end-of-run trigger the redesign uses. |
| `sim.test.ts:386-406` | `notEstablished` vs `exterminated` at the same moment | **REWRITE** | Same three-night coupling. The *distinction* is worth keeping. |
| `sim.test.ts:408-418` | `collapse` when nothing is left to promote | **KEEP** | Structure-independent. |
| `sim.test.ts:420-426` | `nestDestroyed` | **KEEP** | |
| `sim.test.ts:430-451` | Determinism over 3 000 steps incl. `rng.snapshot()` | **KEEP** | Keep verbatim. Highest-value test in the repo. |
| `sim.test.ts:453-468` | "a new world after a full run is identical to a cold one" | **REWRITE** | **D1 — tautology.** Snapshot a cold world *before* `played` runs, then compare. Standalone asserts at `:464-467` are fine. |
| `sim.test.ts:488-518` | Brood-chamber labour redistributes to a home-anchored route | **REWRITE** | Hardcodes `night=2` + `'crackIsland'`. The behaviour ("labour is not stranded where it hatched") must survive; the setup must not. |
| `loop.test.ts:15-38` | Route → acquisition → delivery, then `food > foodBefore-8.1` | **REWRITE** | **D13.** Loop shape is the right subject; the closing assertion is near-vacuous. Assert `totalFood` rose across the delivery frame. |
| `loop.test.ts:40-46` | First delivery inside 60 s | **KEEP** | A real pacing contract, worth re-tuning not deleting. |
| `loop.test.ts:48-62` | Two reserves flowing ⇒ population grows | **KEEP** | |
| `expansion.test.ts:16-64` (3, one per crack) | Each authored crack is reachable and claimable on its night | **REWRITE** | The `legs` record at `:24-45` is keyed by literal ids `crackIsland/crackPantry/crackWall`. Adding or renaming a crack makes `legs[spec.id]` `undefined` and the test throws rather than fails informatively. The *property* ("every authored crack is reachable") is excellent — regenerate the paths, or pathfind. |
| `expansion.test.ts:66-78` | Unaffordable claim refused with a reason in `world.hint` | **KEEP** | Assertion is `toContain('needs')` — text-coupled but cheap to re-point. |
| `balance.test.ts:57-103` | Open route ⇒ `exposedTrail > 5×` covered; `open.peak>18`, `covered.peak<5` | **REWRITE** | The *thesis* (route geometry is mechanically load-bearing) is the single most important claim in the codebase — keep it. The two literal peaks and the five hand-placed waypoints are calibration against the current map and will be wrong the day the map moves. Express as a ratio. |
| `balance.test.ts:105-125` | Open traffic alone crosses tier 1 (`>25`) | **REWRITE** | `25` is `TIER_THRESHOLDS[0]` written as a literal. |
| `balance.test.ts:127-143` | `lastCause` is a continuous cause, not only a one-shot | **KEEP** | Map-coupled setup, but the assertion is symbolic. |
| `balance.test.ts:147-162` | One node backs a full `NIGHT_LENGTH[1]` | **REWRITE** | Indexes the night table directly. |
| `balance.test.ts:164-184` | Drained source partly regrows next night | **REWRITE** | Same; asserts `world.night === 2`. |
| `balance.test.ts:186-203` | A dry route stays visible | **KEEP** | "Nothing vanishes silently" is a UX pillar. |
| `balance.test.ts:206-360` | The scripted winnable run — ~120 lines of literal waypoints across all three nights | **REWRITE** | Highest-maintenance test in the repo (1.88 s). It proves "the game is winnable", which must survive; every line of its body is map- and structure-specific. |
| `balance.test.ts:364-414` | Labour shifts onto the failing reserve, and the HUD warned | **KEEP** | Assertion is a share comparison, not a magic number. Re-point the setup. |
| `balance.test.ts:416-440` | Re-laying from a trail end extends rather than burning a slot | **KEEP** | Input-affordance contract. |
| `balance.test.ts:442-454` | Route eviction is announced (`hint` contains `'dissolved'`) | **KEEP** | Text-coupled; behaviour is right. |
| `balance.test.ts:458-502` | `LABOUR_SHARE_CAP` — a failing reserve can't take >85 % of labour | **KEEP** | Guards a player-agency decision. Strong test. |
| `balance.test.ts:504-550` | Colony prefers the safer of two equal-length lines | **KEEP** | Directly tests `EXPOSURE_AVERSION`'s purpose. |
| `balance.test.ts:554-584` | Three lines out of one crack stay three routes | **KEEP** | Regression guard for `ADOPT_MIN_ALIGN`. Derives its own start points. |
| `balance.test.ts:586-600` | Resuming the same line extends it | **KEEP** | |
| `balance.test.ts:604-618` | A right-angle turn starts a new line | **KEEP** | |
| `balance.test.ts:622-647` | End card cannot contradict its own numbers (`finalTally`) | **KEEP** | Map-independent invariant. Keep verbatim. |
| `strategies.test.ts:59-283` | Cautious wins; aggressive `tier===4` and doesn't win; reckless ends `population===0` | **REWRITE** | The claim is the design thesis and must survive. As written it is three fully hand-scripted 3-night runs on one seed (3.53 s) with `tier===4` asserted by exact equality. |
| `seeds.test.ts:52-167` | 6 seeds, same strategy, ≥4 wins, always 3/3 claims, never `collapse`/`nestDestroyed` | **REWRITE** | Right idea (win is a property of strategy, not luck), 13.3 s — **97 % of unit-suite runtime**. Fully welded to map + three nights. Docstring claims a 14-seed sweep; the code runs 6 and asserts ≥4. Reconcile. |
| `helpers.ts` (whole file) | `driveTo`/`idle`/`stepUntil` | **KEEP** | Clean, design-neutral driver. |

### tests/e2e

| File:line | What it asserts | Verdict | Why |
| --- | --- | --- | --- |
| `driver.ts:1-232` | Page watch, boot, real-input `driveTo`, `waitForState`, `expectClean` | **KEEP** | Genuinely drives the production input layer — no state injection. Good harness. |
| `driver.ts:236-252` (`PLACES`) | Literal copies of every map coordinate | **REWRITE** | Regenerate from `kitchen.ts` (or export it) so the map has one source of truth. Every spec below depends on it. |
| `gameplay.spec.ts:26-48` (01) | Boots clean, playable scout, `#objective` non-empty, load < 8 s | **KEEP** | |
| `gameplay.spec.ts:50-70` (02) | Onboarding present; real key press moves the scout ≥80 px; `firstMoveAt < 15` | **KEEP** | Tests the input layer end to end. |
| `gameplay.spec.ts:72-138` (03) | Route → outbound → carrying → delivery → hatch, with `firstDeliveryAt < 60` | **KEEP** | The core-loop proof. Re-point coordinates only. |
| `gameplay.spec.ts:140-181` (04) | Covered vs. open route: `open.exposure > covered.exposure × 1.25` | **KEEP** | Ratio, not a magic number. The thesis, checked in a real browser. |
| `gameplay.spec.ts:183-199` (05) | Inspect shows `'Dishwasher crumbs'` and `'food left'` | **REWRITE** | Asserts a specific resource label string. |
| `restart.spec.ts:26-110` (11) | 5 restarts: routes/corpses/hazards/suspicion/stats all zeroed, `< 4 s`, voices ≤ 24, particles ≤ 900 | **KEEP** | The strongest lifecycle test in the repo and the only real coverage of D1's subject. Add an assertion on the `listeners` field it already collects (**D12**). |
| `restart.spec.ts:112-155` (12) | `visibilitychange` discards the hidden gap (`advanced < 1.2 s`), still playable after | **KEEP** | Correctly notes why headless rAF forces the synthetic `document.hidden`. |
| `restart.spec.ts:157-179` (13) | Pause freezes time; a setting survives `KeyR` | **KEEP** | |
| `threats.spec.ts:24-79` (06) | Loitering in light ⇒ `suspicion > 24`, tier ≥ 1, named cause, previewed response, patrol/traps deploy | **KEEP** | `24` is `TIER_THRESHOLDS[0]-1` as a literal; the cause/next regexes are label-coupled. Behaviour is exactly right. |
| `threats.spec.ts:81-98` (07) | Footfall telegraph; "the room light must actually be on" | **REWRITE** | **D11 — the `roomLit` assertion re-reads `counts.patrols > 0`, already awaited. It cannot fail.** Assert `roomLight` from the state snapshot. |
| `threats.spec.ts:100-142` (08) | Scout death costs a body, colony promotes a replacement | **KEEP** | `population < beforePop + 6` is a very loose bound; tighten to "strictly decreased by the promotion". |
| `fullrun.spec.ts:79-244` (09) | A careful three-night run reaches victory, with the end card asserted on screen | **REWRITE** | ~165 lines of literal waypoints; asserts `capacity >= 36` and the card text `'kitchen is yours'`. The *shape* (a real browser plays a full run to a real win card) is worth preserving whole. |
| `fullrun.spec.ts:246-313` (10) | A reckless run is exterminated, `suspicion.peak > 70`, card names a cause | **REWRITE** | Same coupling; `70` is a literal near `TIER_THRESHOLDS[3]=90`. |
| `perf.spec.ts:73-229` (14) | `cpuP99 ≤ 8 ms` and `cpuWorst ≤ 8 ms` unconditionally; `p50 ≤ idle×1.3`; absolute budget only where the host reaches 60 Hz | **KEEP (harness) / REWRITE (scenario)** | The measurement design is correct and hard-won — it measures the game's frame callback, not the compositor. The *scenario* waits on `night >= 2`, `population >= 24` and claims `crackIsland`, so it is welded to the current progression. Keep `BUDGET`/`CPU_BUDGET_MS`/`LOAD_RATIO_BUDGET` and the assertion block verbatim; rebuild the load-generating script. |
| `deploy.spec.ts:26-46` (15) | Production build boots *and plays* from `/bug-game/`; hard refresh doesn't 404 | **KEEP** | |
| `deploy.spec.ts:48-95` (16) | Zero external requests, zero absolute asset refs, `.nojekyll` present | **KEEP** | |
| `deploy.spec.ts:97-148` (17) | Atlases generated (not skipped), 6 glow tints, audio started, ≥6 HUD icons, voices scheduled and ≤ 24 | **KEEP** | `glowTints === 6` and `materials >= 5` are asset-count details that will move with an art redesign — expect churn, but the "no placeholders shipped" claim is worth keeping. |

**Summary:** 73 unit + 17 e2e. Roughly **KEEP 52 / REWRITE 36 / DELETE 0** at test granularity. The
suite is unusually honest — it drives real input, refuses state injection, and several tests carry
measured justifications in their comments. Its single structural weakness is that ~40 % of it encodes
the *current kitchen's coordinates* rather than the properties those coordinates were chosen to
demonstrate. Extracting `PLACES`/waypoints to one generated source would convert most REWRITEs into
re-point-and-run.

---

## 3. Performance — render and sim hot paths

None of this is asymptotically alarming at the shipped caps (`WORKER_CAP=90`, `MAX_ROUTES=5`,
`MAX_HAZARDS=12`, `PARTICLE_BUDGET=900`), and `perf.spec.ts` asserts `cpuWorst ≤ 8 ms` and passes.
The risk is that every item below is `O(cap)` with a *hard-coded* cap: raising `WORKER_CAP` or
`MAX_NODES_PER_ROUTE` hits several at once.

**Render (`src/render/renderer.ts`)**

| Site | Hazard |
| --- | --- |
| `:663-682` | One `drawImage` per pheromone node, plus a second every 3rd node on a linked route. Ceiling `5 × 190 = 950` nodes ⇒ **~1 270 draw calls/frame from pheromone alone** — the dominant term in `drawCalls`. No LOD, no batching, no distance fade (**D10**). |
| `:447-478` | Food crumbs: `n = 8 + round(frac×22)` ≤ 30 per resource, each 5 `valueNoise2D` + 2-3 path fills ⇒ ~720 fills/frame across 8 resources. Fully deterministic in `(k, i)` and depends only on `frac` — could be baked to an offscreen canvas per amount-bucket; it is recomputed every frame. |
| `:848-863` | `drawSprays`: **22 `createRadialGradient` + 2 `addColorStop` per spray per frame.** |
| `:1201-1269` | `composeLighting` allocates a gradient per light (5) + 2 per patrol + 1 per claimed nest + 1 per spray, unconditionally, every frame — even when nothing moved. |
| `:327`, `:355` | `drawDecals` allocates a gradient per `spill`/`ring` decal per frame; `spill` additionally runs 14 arcs × 3 `valueNoise2D`. 15 decals total. |
| `:1365`, `:1381` | Vignette gradient rebuilt every frame; spotted-overlay gradient every frame while `spotted > 0.2`. |
| `:829` | `world.hazards.find((x) => x.id === w.hazardId)` — closure + linear scan, inside a loop over **all 90 workers**, every frame. |
| `:715` | `const ends = [a, b]` — array allocation per route per frame. |

**Sim**

| Site | Hazard |
| --- | --- |
| `workers.ts:345-355` | `hash.query(..., (id) => {…})` — a fresh closure **per live worker per step**: ~5 400/s at 90 workers × 60 Hz. This is the one allocation in a loop explicitly designed to be allocation-free (`spatial.ts:5`). Hoist to a reusable visitor with the worker index on `this`/a field. (**D14**) |
| `workers.ts:263`, `:266-275` | `world.nests.find(…)` (closure) **plus** a full nests scan, per panicking worker per step. `panicWorkers` can flip all 90 at once during a sweep ⇒ 90 closures + 360 nest tests per step, in the frame the game is already busiest. |
| `workers.ts:94` | `world.hazards.find(…)` closure per trapped worker per step. |
| `workers.ts:70-76` | `O(W × R)`: 90 workers × `findResource` (linear over 8 resources, `world.ts:472`) = 720 comparisons/step to rebuild `busy`. |
| `workers.ts:327-339` | `O(W × H)` hazard avoidance: 90 × 12 = 1 080/step, unindexed. |
| `workers.ts:468-475`, `:480-511` | Two full route loops, each calling `findResource` ⇒ `O(routes × resources)` per gated worker. Rate-limited to ~5 workers/step by `:458`. |
| `pheromone.ts:226` | `route.nodes = nodes.slice(...)` — **reallocates the whole node array whenever any single node expires**, which is routine once a route passes `NODE_LIFE`. Up to 190 elements copied. In-place compaction would remove it. |
| `pheromone.ts:244`, `:309`, `:313` | Three separate full passes over every node, per step (decay, exposure mean, exposed-trail sum). Mergeable into one. |
| `hud.ts:134` | `world.routes.filter(r => r.linked).length` — array allocation per frame (≤5 elements, trivial, but per-frame). |

**Correctly done and worth protecting:** `SpatialHash` clears without reallocating (`spatial.ts:22-27`);
`Particles` is a fixed 900-slot pool with priority eviction and never grows (`particles.ts:37-82`);
`Telemetry.frame` uses a fixed ring; `bakeSolids` runs once in the constructor; `blitRoach` is a
single `drawImage` per body; `drawBodies` caps procedural antennae at `ANTENNA_BUDGET = 30`
(`renderer.ts:44`, `:997`); every draw path culls against `cam.bounds()`.

---

## 4. Event / listener leaks

**No leaks.** Every `addEventListener` in `src/` is either boot-once or attached to a node that is
subsequently destroyed:

- `src/main.ts:45, 48, 214, 225, 234, 235, 236, 237, 242, 265` — ten listeners, all registered once at
  module scope on `window`/`document`/`canvas`, which live for the page's lifetime. None is
  re-registered on restart (`startRun()` touches no listeners). Correct.
- `src/ui/overlays.ts:63-80` — re-bound on every `show()`, but `hide()`/`show()` both replace
  `root.innerHTML` (`:48`, `:53`), discarding the old nodes and their listeners together. No growth.

**Audio voice pooling — bounded.** `MAX_VOICES = 24` (`audio.ts:20`); `takeVoice()` refuses past the
cap (`:107-111`); every scheduled node sets `src.onended = this.release` (`:156`, `:188`) with
`this.release` a stable bound arrow (`:113`). `cooldowns` is a `Map` over a fixed set of ~18 string
literals. `e2e 11` asserts `max(voices) ≤ 24` across five restarts. One caveat: while the context is
suspended its clock is frozen, so pending `onended` callbacks do not fire and `voices` stays high
until resume — bounded, not a leak, but it means sound is starved for the first moments after a long
pause. See **D6/D7** for the two real audio-lifecycle bugs.

**Particle pooling — bounded.** Fixed 900 slots allocated in the constructor, `active` flags only,
priority-based eviction, `clear()` on restart (`main.ts:116`). `e2e 11` asserts `≤ 900`.

**Other bounded collections:** captured `errors` capped at 100 with a documented shift
(`main.ts:39-44`); `corpses` capped at 40 (`workers.ts:52`); nodes capped at
`MAX_NODES_PER_ROUTE = 190` with a rolling window (`pheromone.ts:102-105`); routes at `MAX_ROUTES = 5`
with announced eviction (`pheromone.ts:49-58`); `windowSamples` at 20 000 (`telemetry.ts:91`). The
only unbounded collection found is `Telemetry.results` (`telemetry.ts:159`) — test-seam only (**D9**).

---

## 5. Nested-path behaviour

**Correct and genuinely asserted, at four independent layers.**

1. `vite.config.ts:9` — `base: './'`. Emits relative URLs, so the repo name is never baked in and the
   build works from root, from `/bug-game/`, and from `file:`-relative hosting alike.
2. `scripts/check-subpath.mjs` — walks all of `dist/` and greps for root-absolute `src`/`href`
   (HTML), `url()`/`@import` (CSS), `fetch(`/`import(`/`new URL(` (JS), and asserts `.nojekyll`
   exists. Runs in CI at `pages.yml:57`. Limitation at **D15**: it only inspects `.html/.css/.js`.
3. `playwright.config.ts:11-12, 21` — the **entire** e2e suite runs against `dist/` served from
   `http://127.0.0.1:4178/bug-game/`, so every spec is implicitly a subpath test. `:38-45` builds
   inside the `webServer` command with `reuseExistingServer: false`, with a comment recording that a
   bare `playwright test` once validated a stale `dist/` from before a fix.
4. `deploy.spec.ts:26-46 / 48-95` — asserts play (not just boot) from the subpath, a clean hard
   refresh, zero external requests, zero absolute refs, and `.nojekyll`.

`pages.yml` gates deploy on format → lint → typecheck → unit → build → subpath → three e2e specs
(gameplay, deploy, restart), `concurrency: pages` with `cancel-in-progress: false`, and
`pnpm/action-setup@v4` reading `packageManager` from `package.json` as the single version source.
That is a well-built pipeline. Its one live risk is **D2**.

---

## 6. Bundle and asset budgets

`dist/` (built 2026-08-01 21:34, newer than `src/main.ts` at 21:32 — not stale):

| File | Raw | **gzip** | brotli-11 |
| --- | ---: | ---: | ---: |
| `assets/index-BdwhsXh2.js` | 126 151 B | **42 552 B** | 37 563 B |
| `assets/index-ByQb7YUT.css` | 8 986 B | **2 867 B** | 2 486 B |
| `index.html` | 1 504 B | **791 B** | 600 B |
| `.nojekyll` | 0 B | — | — |
| **Total** | **136 641 B** | **46 210 B** | 40 649 B |

Four files, three of them payload. **Zero** external requests at runtime — asserted twice, by
Playwright request interception and by `assetAudit().externalRequests` filtering
`performance.getEntriesByType('resource')` against `location.origin` (`main.ts:741-744`). No fonts,
no images, no audio samples: every sprite, texture, tint and voice is generated procedurally at boot
(`buildAtlas` at `main.ts:55`, WebAudio synthesis throughout `audio.ts`). Sourcemaps deliberately off
(`vite.config.ts:14-15`, with the 456 kB rationale recorded). ~46 kB gzip for a complete game is an
excellent budget and leaves ample headroom for the redesign.

---

## 7. Restart correctness

`startRun()` (`src/main.ts:113-129`) **does** reset: the whole `World`, `particles.clear()`,
`clock.reset()`, `errors.length = 0`, `outcomeTime`, `celebrateAcc`, `renderer.setOutcome(null,0)`,
`camera.snapTo()` (which zeroes `shake`), `audio.resetMix()`, `overlays.hide()`, `paused`,
`bestSaved`, `lastTime`, and re-seeds `onboarding.seenBefore` from settings.

**Not reset:**

| What | Where | Consequence |
| --- | --- | --- |
| `held` input set — and `applyHeld()` is not re-run | `main.ts:133`, `:203-212` | **D5** — unresponsive scout after a button/API restart while a key is held. |
| `AudioContext` suspension state | `main.ts:141-153` | **D3** — silent run after restarting from pause. |
| `renderer.flash` | `renderer.ts:59` | **D8** — defeat flash bleeds into the new run. |
| Pending `victory()` timeouts | `audio.ts:437-447` | **D6**. |
| Pending `defeat()` gain ramps | `audio.ts:449-465` | **D7**. |
| `Telemetry` (fps ring, open perf window, `results`) | `telemetry.ts` | **D9**. |
| `erasePressAt`, `skitterAcc`, `renderer.moteAcc/moteCursor/lastCamX/lastT`, `camera.phase` | various | Cosmetic; harmless. |

**Module-level mutable state in `src/render/`, `src/audio/`, `src/ui/`:** exactly one —
`src/core/storage.ts:9-10` (`memory` map + `available` cache), which backs settings persistence and
is *supposed* to survive. Everything else is instance state on `Renderer` / `Camera` / `Particles` /
`GameAudio` / `Hud` / `Overlays`, all constructed once at boot and reused. `atlas` and
`renderer.solids` are baked once from fixed seed `0xb00c`, so they are deterministic across restarts
by construction. `e2e 11` empirically confirms five consecutive restarts are clean.

---

## 8. Focus loss / restore

`src/main.ts:242-254`:

- **hidden** → `backgrounded = true`, `audio.suspend()`, `held.clear()`, `applyHeld()`.
- **visible** → `lastTime = performance.now()` and `clock.flush()` — the two lines that make the
  discarded gap real rather than replayed — then `audio.resume()` **only if** `!paused && !overlays.visible`.
- `frame()` gates stepping on `active = !paused && !backgrounded && !(pause|help overlay)`
  (`:515-516`), so a hidden tab halts the sim rather than playing on unseen.
- `window blur` (`:237-240`) separately clears held keys, so keys can't stick when focus moves.

Defence in depth is correct: `FixedClock.advance` also clamps at `MAX_FRAME_DELTA = 0.25` and caps at
`MAX_STEPS_PER_FRAME = 5`, accounting the remainder into `discardedTime`/`overloadFrames`
(`clock.ts:41-59`), so even without the `flush()` the sim could not fast-forward. `e2e 12` asserts
`advanced < 1.2 s` across a 4 s hidden window and that play resumes afterwards.

The gap is **D4**: the `overlays.visible` guard on resume treats the interlude — a state in which the
simulation keeps running — like a pause, and nothing calls `audio.resume()` when the interlude ends
at `:526`. Returning to the tab mid-interlude leaves the run silent until the next keypress reaches
`ensureAudio()`.
