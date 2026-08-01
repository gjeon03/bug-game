# Critique dispositions

Three independent critics reviewed the redesigned build. None of them implemented it. Every finding
below is recorded with what was done about it and where the fix lives.

Where a critic was wrong, that is recorded too.

---

## Gameplay + UX critic

| ID | Finding | Disposition |
| --- | --- | --- |
| D1 | **Blocker.** Operation 2 is not passable — 7 of 8 scripted runs die inside it. | **Fixed.** Caused by D2; see below. Regression: `critique.test.ts` "every household routine is reachable inside its own window", plus `winnable.test.ts` which now plays three seeds to a win. |
| D2 | **Blocker.** Two of three routine anchors cannot be reached inside their own window (2 574 u / 34 s and 2 824 u / 30 s, against a 24–26 s round trip), and the cleaning sweep sabotages the only reachable one at the instant it opens. | **Fixed.** Windows lengthened to 13+46 / 11+44 / 13+44 s and the interval widened to 74 s so routines stay events rather than weather. `startSweep` now fires at 55 % into the window instead of on arrival. `routines.ts`. |
| D3 | **Major.** The extermination is outranked in the objective by routines and shortages — the climax tells you to chase crumbs. | **Fixed.** `finalResponse` is now priority 0 in `resolveHud`. Regression: `critique.test.ts` "the extermination outranks every other objective". |
| D4 | **Major.** Operation 4 has no ending for most runs; the labour allocator piles every worker on one route so three zones are unreachable. | **Fixed, differently than proposed.** Rather than adding a per-route labour verb (which would break "workers are never ordered"), hold now accrues from **presence** — bodies *plus* claimed cracks in the region — with a route as an accelerator rather than a precondition, and the objective explicitly tells the player to claim the crack in the region they are trying to take. Three seeds now reach the ending and win. `territory.ts`, `operations.ts`. **Not done:** an outer time limit. Recorded as a known issue below. |
| D5 | **Major.** `cappedAdvice` has two branches that name no affordable spend, one of which instructs an action the same function just ruled out. | **Fixed.** `capped:capacity` only fires when something buildable actually exists and names its price; `capped:milestone` only when the milestone is genuinely ahead. Regression in `critique.test.ts`. |
| D6 | **Major.** The heat grid is inverted with respect to risk — the careful player gets scoured. Trail heat was a fixed budget divided across nodes, so a short covered line concentrated more per cell than a long exposed one. | **Fixed.** Heat is now deposited per node and per worker, scaled by that node's or worker's own above-baseline exposure, unnormalised. Rates calibrated so a hammered open corridor reaches "known" in about a minute and a covered one never does. `suspicion.ts`. |
| D7 | **Major.** Four adaptation effects are dead code; `shadow1` is a pure downside. | **Fixed.** `coveredTrailLifeMult` and `coveredEvidenceMult` wired into `pheromone.ts`, `depletionMult` into the harvest, `panicLead` into `panicWorkers`, and `brood2`'s surge is now written on a casualty. Regression: `critique.test.ts` "shadow1 buys something, not only a penalty", which checks the trait *and* that a covered trail actually outlives a plain one. |
| D8 | **Major.** The end card attributes every loss to a suspicion cause — a colony that died of thirst was told its problem was trails on bare tile. | **Fixed.** Deaths are tallied by `DeathCause`; the card names what actually killed them and reports the largest evidence source separately. `world.deathCauses`, `topDeathCause`, `overlays.ts`. |
| D9 | **Major.** The objective is a routine countdown 58 % of the run. | **Fixed.** A routine outranks the operation gate only while it is still an opportunity — incoming, or active and untaken — and the interval between routines widened. |
| D10 | **Major.** `world.counterplay` is set and never cleared. | **Fixed.** `setCounterplay` gives every hint a lifetime; it expires with the threat. |
| D11 | **Minor.** `Survive the extermination 0.9999999999999639/1` in the shipped checklist. | **Fixed.** `hud.ts` rounds checklist progress. |
| D12 | **Minor.** A 59.3 s plateau counting only `hud.source` changes, pinned on an unaffordable adaptation. | **Fixed before the critique landed**, by the purchase buffer: an offer the colony cannot safely afford now falls through to `adaptation:saving`, which names the shortfall and points at a source. Re-measured in the final evidence package. |
| D13 | **Minor.** The `dishwasher` region is held 35 s into the tutorial, because the home crack and the first food source are both inside it. | **Fixed.** The region containing the home crack does not count toward taking the kitchen. Regression in `critique.test.ts`. |
| D14 | **Minor.** The t=0 objective names the lay key 11 s before the tutorial teaches it. | **Fixed.** Until onboarding has shown the key, the objective describes the action instead. |
| D15 | **Minor.** A blocker string starts lower-case mid-sentence. | **Fixed.** `sentence()` in `operations.ts`. |
| D16 | **Minor.** `capped:territory` advises territory work during operation 2, where zone hold does nothing. | **Fixed.** That branch is gated on operation 4. |
| D17 | **Minor.** No per-zone hold readout during play. | **Not done.** The objective names the region it is pointing at and its percentage, and the end card shows the top four. A persistent per-zone panel is a HUD addition with its own clutter cost; recorded as a known issue rather than added late. |

---

## Visual critic

| ID | Finding | Disposition |
| --- | --- | --- |
| 1–3 | **Blocker.** The captured frames came from a build that predated the art fixes; the water rings in them are the old concentric-stroke version, oversized. | **Fixed.** The fixes were committed and every frame in this package was recaptured from the build under review. |
| 4–5 | **Blocker.** Five of eight fixtures share one material value and three share one draw path; the island is an anonymous black slab. | **Fixed.** Per-solid `tone` pulls same-material fixtures apart in value, and `island` and `counter` have their own draw cases — a counter-top overhang, a chopping board and a bowl for the island, a drawer bank for the counter. |
| 6 | **High.** Cargo is a ~6 px dot, and the moisture variant is cold blue on a cold blue trail over a cold blue floor — six workers on a live line showed no visible cargo. | **Fixed.** Cargo is now an irregular crumb or a droplet with its own cast shadow and a warm/bright key, carried above the body. Visible on every hauling worker in `visual-sweep/d-two-lines.png`. |
| 7 | **High.** One worker sprite and no per-individual variation — a crowd reads as stamped decals. | **Fixed.** Three worker colourings baked as separate atlas rows, selected by the worker's lifetime `variant`, plus a wider scale spread. |
| 8 | **High.** The player marker is a traced ellipse outline — a selection ring. | **Fixed.** Replaced with an additive rim-light along one edge; the other edge lights danger-red when the player is being noticed. |
| 9 | **High.** The exposure telegraph is a world-space radial progress meter. | **Fixed.** Removed; the state now reads off the player's own body. |
| 10–11 | **High.** The evidence package could not answer its own questions: modals covered three fixture frames, and no victory frame existed. | **Fixed.** The sweep dismisses modals before each capture, and the playtest harness captures the outcome frame for every scenario including a win. |
| 12 | **Med.** `ART_BIBLE` shape language says pheromone must never be a hard line; rule 7 makes it a continuous stroke. | **Accepted as a deliberate deviation.** The dotted rule is what produced the debug-looking chain the redesign exists to remove. The ribbon is soft-edged, three-pass and colour-coded rather than a hard line, and the same critic calls it "the strongest element in the game". Recorded in `ART_BIBLE.md`. |
| 13 | **Med.** Sealed nests are still a dashed ring. | **Fixed.** Solid crack mouth with the paint-crust bars that were already authored. |
| 14 | **Med.** Two of six lights have no drawn emitter and sit outside their fixture. | **Not done.** Recorded as a known issue. |
| 15–18 | **Med/Low.** Antenna budget, fridge framing, grout weight, floor tiling. | **Not done.** Recorded as known issues. |

---

## Technical verifier

| ID | Finding | Disposition |
| --- | --- | --- |
| D1 | **Blocker.** Three diagnostic dump scripts committed as `*.test.ts`; they run in CI and are the direct cause of format/lint/typecheck failures at HEAD. | **Fixed.** Deleted, and `scripts/tmp/` is now git-ignored so scratch harnesses cannot break the pipeline again. |
| D2 | **High.** No test ever wins the game by playing — every `won` assertion writes the win condition into the world first. | **Fixed, and it immediately paid for itself.** `winnable.test.ts` plays three seeds to a win with an intent-driven player that never writes a colony value. The first run of it exposed the territory defect the gameplay critic had also found from the other direction. |
| D3 | **High.** CI runs 3 of 7 E2E specs; the performance, full-run and threat gates never run on CI. | **Fixed.** `pages.yml` runs the whole suite. |
| D4 | **Medium.** The absolute frame budget is conditional on the host being fast. | **Accepted, and the reasoning is sound** — a headless CI box cannot prove a desktop frame budget. The CPU-time budget covers the gap. Recorded in the final report as a stated limit rather than a claim. |
| D5–D7 | **Medium/Low.** Several restart and deploy assertions restate a hard cap and cannot fail. | **Not done.** Recorded as a known issue: they are noise rather than false green, since the load-bearing assertions in those specs are real. |
| D8–D9 | **Low.** Vacuous trailing assertions; one test advertises a precondition it does not hold. | **Not done.** Same reasoning. |
