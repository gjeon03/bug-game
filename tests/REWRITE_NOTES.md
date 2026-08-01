# Test rewrite notes

Working notes from rewriting `tests/**` to the redesign contract. Two sections: what changed in the
suite, and what was found in `src/**` and deliberately **not** fixed here (this rewrite owns
`tests/` only).

---

## 1. What changed

### New shared infrastructure

| File                 | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/map.ts`       | Every map coordinate the suite uses, **derived** from `SOLIDS` / `RESOURCES` / `NESTS` / `LIGHTS`. Includes a Dijkstra router (`path(from, to, style)`) that produces a "safe way round" or an "exposed way round" on demand, `detourPath` (out through the brightest tile and back), `mostExposedPoint` / `mostOpenPoint`, and `spreadPoints`. This is the fix for the technical audit's largest finding: ~40 % of the old suite encoded the current kitchen's coordinates instead of the properties those coordinates were chosen to demonstrate. The kitchen was in fact rebuilt while this rewrite was in progress, and nothing in `tests/` needed re-pointing. |
| `tests/unit/play.ts` | A scripted competent player expressed as _intent_ — keep a food line and a moisture line running, chase household spills, claim what you can afford, fit it out, take the growth choice — with the geometry asked of `tests/map.ts`. Replaces ~360 lines of literal waypoints spread across three files. It drives the real input struct and the real `doInteract` / `chooseFunction` / `chooseAdaptation` entry points; it never writes colony state.                                                                                                                                                                                                              |

### Per file

| File                   | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.test.ts`         | **Kept verbatim** (15 tests). All pure primitives, redesign-independent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `helpers.ts`           | **Kept verbatim.** Clean, design-neutral driver.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sim.test.ts`          | **Kept + rewritten.** The determinism test is verbatim. Cover probes now derive from `SOLIDS`; the tier-ladder test derives from `TIER_THRESHOLDS` and accounts for `TIER_HOLD`; the win/lose block is rewritten around operations, territory and the final response; `layRouteToCrumbs` now takes its endpoints. **D1 fixed**: the restart-equality test snapshots a cold world _before_ the played run, so it can actually fail. The traffic-reinforcement test now compares a walked line against an unwalked stub laid at the same moment, because a household cleaning pass can wipe either one and the old formulation was really testing the routine schedule. |
| `loop.test.ts`         | **Rewritten (D13).** The closing assertion compared food against a hand-computed upkeep allowance and passed whether or not anything was delivered; it now asserts the larder steps up on the frame a delivery lands.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `expansion.test.ts`    | **Rewritten.** The hand-written `legs` record keyed by crack id (which _threw_ rather than failed when a crack was renamed) is replaced by generated walks, so the property — every authored foothold is reachable and claimable in its operation — holds for whatever cracks exist. Adds the sealed-crack case.                                                                                                                                                                                                                                                                                                                                                      |
| `balance.test.ts`      | **Rewritten.** Route-exposure claims are ratios (exposed trail, trail evidence, suspicion peak) instead of the calibrated literals `open.peak > 18` / `covered.peak < 5`; the tier crossing uses `TIER_THRESHOLDS[0]`; the night-length and night-regrowth tests are gone with the systems they tested; the scripted three-night win run is replaced by a played progression run; the end-card test is rewritten against the new `FinalTally`. The brood-chamber labour test moved here from `sim.test.ts`.                                                                                                                                                           |
| `strategies.test.ts`   | **Rewritten.** Same seed, same player, two intents. Compares growth and **evidence per delivery**, which is the honest form of the claim: the careful colony hauls far more in total, so comparing total evidence would flatter the reckless run.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `seeds.test.ts`        | **Deleted**; its claim ("the win is a property of the strategy, not of one lucky seed") now lives in `strategies.test.ts` as a five-seed sweep of the competent opening. The old file was 13.3 s — 97 % of unit-suite runtime — and welded to the three-night structure. The whole suite is now 8 s.                                                                                                                                                                                                                                                                                                                                                                  |
| `operations.test.ts`   | **New.** Operation gates, achievement-not-clock advance, the objective hierarchy, the "no dead state at cap" invariant, blocker strings, adaptations (cost, traits, milestone closure, cannot buy the tree), capacity derivation, recovery after casualties.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `household.test.ts`    | **New.** Regional heat (deposit location, hottest cell, peak floor), tier rate-limiting, director budget/cooldown, spray gating, hazard ageing, trap telegraph, routine lifecycle and spill cleanup, the cleaning sweep, extermination aiming.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `workers.test.ts`      | **New.** The contract's worker gates as numbers: 60 s of two-route traffic with no `stuckTime > 2`, nobody inside a solid, no three bodies inside 0.6 clearance for > 0.75 s, positional separation while feeding and queueing, no teleports, `carrying !== null` iff `carryAmount > 0`, lane stability, restart cleanliness.                                                                                                                                                                                                                                                                                                                                         |
| `e2e/driver.ts`        | **Rewritten `PLACES`** — generated from `kitchen.ts` instead of being a literal second copy of the map. Adds `walkTo` / `layLine` / `claimAt` / `chooseSlot` so specs stop carrying waypoint lists, and `chooseSlot` presses a real number key (adaptations and fit-outs are keyboard, not `__roach.input`).                                                                                                                                                                                                                                                                                                                                                          |
| `e2e/gameplay.spec.ts` | Re-pointed to derived places; `night` → `operation`; the inspect test derives the resource label from the map rather than asserting `'Dishwasher crumbs'`; the covered-vs-open route test routes through the computed brightest tile.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `e2e/threats.spec.ts`  | **D11 fixed.** The "the room light must actually be on" assertion re-read `counts.patrols > 0`, a value the test had already awaited, so it could not fail. It now asserts the telegraph's _counterplay_: after a footfall lands, leaving the marked ground keeps the run alive. Patrols are now provoked rather than waited for, because they are a response and no longer a schedule. Adds a regional-heat assertion.                                                                                                                                                                                                                                               |
| `e2e/restart.spec.ts`  | `night` → `operation`, plus adaptations/zones/heat zeroed. **D12 fixed**: the spec collected a `listeners` count and never asserted on it; it does now.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `e2e/fullrun.spec.ts`  | **Rewritten** around operations. The waypoint script is gone; the bot maintains supply, claims, fits out and takes adaptations, and the spec asserts that every advance is attributable to a completed checklist. The reckless spec asserts regional heat and an aimed response rather than a literal suspicion number.                                                                                                                                                                                                                                                                                                                                               |
| `e2e/perf.spec.ts`     | Harness, budgets and the whole assertion block **kept verbatim** — the measurement design is the part that was right. Only the load-generating scenario is rebuilt (operations instead of nights, derived foothold instead of `crackIsland`).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `e2e/deploy.spec.ts`   | Kept; re-pointed to derived places.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Rules followed

- No test writes colony state to skip play, except where the pre-existing suite already did so to
  construct a specific scenario (hatching, starvation, capacity arithmetic, the labour-share cap).
  Every such line carries a comment saying why.
- Symbolic constants everywhere: `TIER_THRESHOLDS`, `TIER_HOLD`, `MAX_ROUTES`, `WORKER_CLEARANCE`,
  `BASE_CAPACITY`, `CAPACITY_PER_NEST`, `NURSERY_CAPACITY`, `CACHE_*_BONUS`, `HEAT_FLOOR_FRACTION`,
  `FINAL_RESPONSE_LENGTH`, `ZONES_TO_WIN`, `HOLD_THRESHOLD`, `TRAP_ARM_TIME`, `TRAP_CAPACITY`,
  `HAZARD_LIFE`, `LABOUR_SHARE_CAP`, `SWEEP_WARN`, `STUCK_GRACE`.

---

## 2. Found in `src/**`, not fixed here

### Fixed by the owner mid-rewrite

- **Operation 1 was a deadlock.** With `BASE_CAPACITY = 10`, operation 1's `populationGate(12)` was
  unreachable: every capacity raiser (footholds, brood adaptations) unlocks at operation 2 or later,
  and `MILESTONE_POPULATION[0] = 11` was also above the ceiling. A run sat at 10/10 forever with both
  reserves at cap. This was observed here and independently fixed in `constants.ts`
  (`BASE_CAPACITY = 13`) while the rewrite was in progress. `operations.test.ts` now plays operation 1
  through to its gate, so the deadlock cannot come back silently.

### Still open

1. **`world.winCriteria` is dead state.** Nothing in `src/**` writes it; it is still declared on
   `World`, still initialised to five `false`s, and still exported through `StateSnapshot`. The old
   E2E asserted on it. Either the fields should be derived from the operation-4 gates or the state
   should go.
2. **`adaptations.surgeTime` is read but never written.** `colony.ts:106` doubles the brood rate while
   it is positive, and nothing sets it — so `brood2`'s stated effect ("losses are replaced at double
   rate for 20 s after a casualty") does not exist. Its cost (upkeep +25 %) does.
3. **`adaptations.evacuations` is written but never read.** `shadow3` grants 2, and no code consumes
   them, so "you gain 2 emergency evacuations" does nothing. Its cost (hauling −15 %) does.
4. **More dead state:** `world.banking` (assigned `false` every step, never `true`), `world.beatFired`
   (always empty), `world.reactionNote` (always `''`, still in `StateSnapshot`).
5. **Dead constants and types after the redesign:** `NIGHT_LENGTH`, `INTERLUDE_LENGTH`,
   `NIGHT_RESOURCE_REGROWTH`, `NIGHT_SUSPICION_FLOOR`, `WIN_POPULATION`, `WIN_FOOD`, `WIN_WATER`;
   types `UpgradeKind`, `RunStatus`'s `'interlude'`, `LoseCause`'s `'notEstablished'`, and the
   `{ t: 'upgrade' }` game event. `NightIndex` survives only because `Hazard.night`, `Patrol.night`
   and `PATROL_PATHS` still carry a night field that nothing reads.
6. **`roomLight` is not on `StateSnapshot`.** The technical audit's suggested fix for D11 was "assert
   `roomLight` from the state snapshot"; it is not exposed, so the E2E asserts the telegraph's
   counterplay instead. Exposing it would let the spec make the stronger claim.
7. **The win is not demonstrated end to end.** A scripted competent player reliably reaches operation
   4 and triggers the extermination with a healthy colony (measured on an earlier build: 43 roaches,
   full reserves, three fitted footholds, four adaptations), but could not hold three zones through
   the 62-second response in any scripted attempt — supply lines die to sprays and sweeps faster than
   hold accumulates, and `HOLD_SUPPRESS` (0.12/s) outruns `HOLD_GAIN` (0.055/s) wherever the household
   is standing. The win branch of `checkLossConditions` is therefore covered by a constructed unit
   test (`sim.test.ts` → "declares victory only when the last operation is genuinely complete") rather
   than by a played run. This is a balance question, not a test question, but it means "the game is
   winnable" is currently **unproven**.
8. **Operation 2's routine gate stalls a competent run.** `scheduleRoutines` now refuses to start any
   routine while `operation < 2`, so the first spill a player can ever see arrives after operation 1
   is finished. From there routines fire roughly every 62 s, but a routine is only _exploited_ if the
   colony takes something out of it inside a 30–38 s window, and the two rich anchors (`snack` at the
   fridge, `trash` by the door) sit ~2 400–2 800 units from the home crack. Measured: a scripted
   player that maintains supply, claims and fits out every operation-2 crack, and re-routes to every
   live spill still reached only 0–1 exploited routines in **900 s** of play past operation 2, so the
   run never leaves operation 2. Either the gate wants to be 1, or the first routines want to land
   where a colony that has just left its first crack can actually reach them.
9. **Regional heat is diluted by route length.** `depositTrailHeat` splits a fixed per-second total
   across _all_ exposed trail nodes, so a long exposed line deposits a smaller amount into each of
   many cells while a short one concentrates its deposits. Measured over 200 s on the same seed and
   source: the covered line ended on 0.126 total heat and the through-the-light detour on 0.024 —
   backwards, for exactly the route the system exists to punish. Trail _evidence_ (the `droppings`
   cause) behaves correctly over the same runs (14.2 vs 132.6), so this is a normalisation problem in
   the heat deposit, not in the evidence model. The tests assert the evidence ledger and the location
   of the hottest cell rather than heat totals, and say so in a comment.
10. **A sheltering roach is teleported into the crack.** `workers.ts`'s panic branch assigns
    `w.x = refuge.x + rng.signed() * 26` the moment a fleeing worker reaches a claimed nest. Measured:
    a visible body moving 74 units — about three body lengths — in a single frame while travelling at
    183 u/s, which is 4 400 u/s of apparent motion. The contract says nothing teleports a visible
    roach; this does. It is probably meant to read as "pours into the wall", but at that distance it
    reads as a pop. The worker test exempts exactly this case and says so, so the exemption is
    visible rather than silent.
11. **The washing-up wipes the trail laid to reach it.** `dishes` is the only routine a colony still
    living in its first crack can physically reach inside the window, and `startSweep` fires the
    cleaning pass down the sink run at the same instant the spill appears — over the ground the player
    has to cross to get to it. The counterplay exists (wait for the cloth, then lay), but it costs
    most of the window, and nothing in the HUD says so.
