# Independent critique — findings and dispositions

Three independent review passes were run against the build at commit `115e738`, by agents that did
not write the game and could not edit it. Each was given the design documents and the evidence
package and asked to find observable defects, rank them, and separate symptom from guessed cause.

Their raw findings are in `visual.md`, `gameplay.md` and `technical.md`. This file records what was
done about each one.

Status vocabulary: **fixed** (change made and verified), **fixed + regression** (a test now locks it
in), **partly fixed**, **accepted** (real, deliberately not changed, with reason), **rejected** (the
finding does not hold), **open** (real, not addressed — listed in the final report as a known issue).

---

## Gameplay critique (measured headless, 12k-point exposure grid + instrumented runs)

| # | Finding | Status | What was done |
| - | ------- | ------ | ------------- |
| 1 | **The game cannot be won.** Colony starves out in night 2 every time; a full scripted run ended `collapse` at t=604 with 20 thirst deaths. | **fixed + regression** | Root causes were findings 2, 3 and 8 below, plus a duplicated-escalation bug the critic did not see. `tests/unit/balance.test.ts` now plays a complete scripted three-night run headless and requires `status === 'won'` with all five criteria. Measured result: population 50, food 317, moisture 186, suspicion peak 65, 17 losses. |
| 2 | Every resource node stripped bare in ~60 s, permanently, silently taking its route with it. | **fixed + regression** | Node amounts raised ~15× (a source now backs several nights of heavy traffic); drained sources partly return each night instead of being gone forever; a route whose source runs dry is now explicitly **dry** rather than silently un-linked, emits a `routeDry` event and drives an objective line. Three regression tests. |
| 3 | Routes anchored on a satellite nest are unusable — 21 of 22 workers out of acquisition range, and brood walked 1269 units back to the home crack. | **fixed + regression** | `spawnWorker` now takes the nest the roach belongs to; a route anchored on the worker's own nest is acceptable at any distance; an idle worker with nothing in range redistributes to the nest anchoring the least-served route. Regression test in `sim.test.ts`. |
| 4 | **Route exposure has no mechanical consequence** — a deliberately awful route ended with *lower* suspicion than a careful one. Continuous evidence was capped below the decay rate. | **fixed + regression** | Evidence is now **graded** by how far above a baseline a roach or trail node sits, rather than passing a binary threshold; decay dropped 0.36 → 0.10; weights and caps retuned. Measured A/B over the same 140 s with the same seed: covered route peak **< 5**, route through the under-sink light peak **> 18**, with a > 5× difference in exposed-trail integral. Two regression tests. |
| 5 | The HUD could never name `traffic` or `droppings` — a per-call `amount >= 0.05` gate that continuous causes can never satisfy at 1/60 s. | **fixed + regression** | Causes now accumulate; a cause surfaces once it has genuinely added up. Regression test asserts the HUD's `lastCause` becomes a continuous cause. |
| 6 | A player who plays well never sees traps or bait, because tier 2 (50) was unreachable. | **fixed** | Follows from 4: an open-floor network now reaches tier 1 inside a night and tier 2 shortly after, and `deployTraps` scores authored sites against the player's own trail nodes. Observed in the probe: traps deployed and sprung on an open network, none on a covered one. |
| 7 | **Soft-lock**: population 0 with the scout alive was a playable, unrecoverable, undeclared state (measured 200 s of it). | **fixed + regression** | `checkLossConditions` now ends the run when the colony is empty and the larder cannot hatch a replacement (4 s grace), or after 45 s regardless. |
| 8 | Breeding cannot be throttled and eats the win condition — brood drained every surplus to 22/12 while the win demands 120/90. | **fixed** | Brood now requires a population-scaled surplus, and stops entirely once the colony is at fighting strength until the larder is above the win thresholds (`world.banking`). |
| 9 | Route eviction is silent, and one lay-press = one route, so touching up a trail burns slots. | **partly fixed** | Cap raised 4 → 5 and the HUD now shows linked-route count, so the budget is visible. The one-press-one-route model is **accepted**: it is what makes a route a deliberate act rather than a paintable overlay, and the eviction now shows up in the HUD counter. |
| 10 | Losing the scout is nearly free and its stated cost is untracked (`workersLost 0`). | **open** | Real. The promotion still bypasses `killWorker`, so it costs a body but does not appear in the loss statistics. Listed as a known issue. |
| 11 | Nest destruction has zero counterplay — integrity only ever decreases. | **fixed** | The crack now repairs at 0.03/s whenever no spray is near it (a destroyed nest stays destroyed), and drain dropped 0.055 → 0.032. Surviving a sweep pass is now recoverable; parking a cloud on the nest still kills it. |
| 12 | ~62 s of nothing at the end of night 1. | **partly fixed** | Sealed cracks are now visible and inspectable before their night, so scouting ahead is a real use of the time. The night length is unchanged; residual downtime is listed as a known issue. |
| 13 | The three upgrades are not three distinct decisions; the Escape Tunnel is nearly inert. | **fixed** | Panic now sends workers to the **nearest claimed crack** (the escape tunnel reaching furthest, 1100 vs 680 units), and a roach inside a claimed crack is untouchable by feet and spray. Sheltering is now the colony's counterplay to a sweep and the reason claiming cracks is worth its evidence cost — measured effect: losses through the final response fell from 69 to 17. |
| 14 | `PLAYTEST_REPORT.md` does not describe this build. | **fixed** | Regenerated from `artifacts/evidence/summary.md`, which is itself generated by `scripts/report.mjs` from the test output and prints "not present" rather than a number when a record is missing. |

## Technical verification (clean clone, every command run)

| # | Finding | Status | What was done |
| - | ------- | ------ | ------------- |
| 1 | **`pnpm format:check` fails on a clean checkout**, so CI can never reach `deploy` and `pnpm verify` can never pass. | **fixed** | Formatted; `.playwright-mcp/` and `.claude/worktrees/` ignored; stray root `boot.png` removed. `pnpm format:check` is clean. |
| 2 | Committed `e2e-results.json` records the flagship victory spec **failing**, and `run-win.json` etc. are absent — no evidence the game is winnable. | **fixed** | The balance work above made it winnable; the full suite was re-run and the evidence regenerated. |
| 3 | **Performance evidence measures the wrong quantity** — ~0.9 ms of script CPU compared against a 16.7 ms frame-time budget; all long-frame counters vacuously 0; implied real pacing ~25 ms/frame. | **fixed** | Telemetry now records the **presented frame interval** (rAF timestamp delta) as `p50/p95/p99/worst` and reports frame-callback CPU separately as `cpuP50/cpuP95/cpuP99`. The budget is evaluated against the interval. |
| 4 | `PLAYTEST_REPORT.md` is a template presented as measured results. | **fixed** | See gameplay 14. |
| 5 | All committed evidence stale/inconsistent — three bundle hashes, missing fields. | **fixed** | Whole package regenerated in one pass. |
| 6 | `ARCHITECTURE.md` references `core/events.ts`, which does not exist, and calls `core/` DOM-free when `core/storage.ts` uses `window.localStorage`. | **fixed** | Both corrected, and the document now explains why `world.events` must not be used for gameplay hand-offs — which is exactly the bug that spawned 107 patrols. |
| 7 | CI subpath assertion only scans `index.html`; an absolute `url()` in CSS or `fetch('/…')` in JS would ship. | **fixed** | Replaced with `scripts/check-subpath.mjs`, which scans **every** emitted HTML, CSS and JS file for root-absolute markup references, `url()`, `@import`, `fetch`/`import` paths and `new URL` bases, and verifies `.nojekyll`. |
| 8 | `reuseExistingServer: true` with no build step means E2E can validate a stale or foreign `dist/`. | **fixed** | `reuseExistingServer: false`, and `pnpm test:e2e` now builds first. |
| 9 | `errors` array in `main.ts` grows without bound and is never cleared on restart. | **fixed** | Capped at 100 with a rolling window, and cleared on every new run. |
| 10 | `GAME_CONTRACT` route budget said 4 while the constant was 5; `TEST_PLAN` referenced a non-existent `playtests/` directory. | **fixed** | Both corrected. |
| 11 | A 456 kB production sourcemap ships to Pages — 76 % of the payload. | **fixed** | `sourcemap: false` for production builds. `dist/` is now three files plus `.nojekyll`. |
| 12 | Stray tracked `boot.png` at the repository root. | **fixed** | Removed. |
| 13 | Harness hazard: the agent worktree symlinked `dist`/`node_modules` into the parent repo. | **noted** | Not a repository defect. The verifier worked around it with a clean clone; the worktree has been removed. |

## Visual critique (21 captures, measured luminance patches, ImageMagick crops)

The visual pass ran against captures taken before the balance work. Its structural findings are
addressed below; the captures themselves have been regenerated, so the numbers it measured no longer
describe the build.

| # | Finding | Status | What was done |
| - | ------- | ------ | ------------- |
| 1 | **The player scout is visually identical to every worker** — the cold additive rim halo has near-zero ΔE against a cold floor. | **fixed** | Replaced with a warm ground pool plus a hard warm outline traced on the body silhouette, which the floor palette does not own. |
| 2 | **The sticky trap is a flat gold rectangle** at L=160 against a 32–54 world — the brightest object in the game, in colours outside the palette. | **claimed fixed, was not; fixed in round 2** | See the correction below. The round-1 entry was wrong: no such change ever reached the code. |
| 3 | Value hierarchy collapsed; whole playfield spans L 32→54; the crack interior reads as a mid-tone patch. | **fixed** | Ambient multiply lowered so lights have headroom instead of clipping to white; nest self-illumination reduced and pulled to the crack lip. |
| 4 | **No warm light pools anywhere** — whole-frame hue H=207–213 in every capture. | **fixed** | Same root cause as 3: the ambient base was so high that additive warm light saturated to white. Lowered; warm pools now survive the multiply. |
| 5 | Footfall telegraph is a circle describing a boot-shaped threat, and the foot reads as a hole in the floor. | **partly fixed** | The telegraph now matches the sole's footprint and orientation; the sole gained a rim and contact gradient. |
| 6 | Pheromone reads as evenly spaced fairy lights, not scent. | **fixed** | Per-node positional jitter and size variation added; motes drift perpendicular. |
| 7 | Link/unlink state not readable from across the room. | **fixed** | Linked ends now pulse a warm ring; unlinked ends are dashed and cold; dry routes are marked distinctly. |
| 8 | Bottom-centre stacks up to four competing message pills. | **fixed** | The four bottom-centre channels are arbitrated: at most two are shown, with onboarding suppressed while a contextual prompt is up. |
| 9 | Floor vent reads as a UI skeleton loader. | **fixed** | Slats gained per-slat lit edge and shadow, and a void behind. |
| 10 | Food nodes read as tan balloons inside a debug gizmo. | **fixed** | Rebuilt as a scatter of many small irregular crumbs with contact shadows; the "gizmo" ring was the objective guide and now only draws when that node is the current objective. |
| 11 | Carried cargo sits on the head rather than the back. | **partly rejected, then fixed** | The offset was already *behind* the body centre, so the "head end" reading was a misjudgement from a low-resolution crop — but the underlying complaint was right: the blob was as wide as the thorax. It is now smaller and pushed further back, and it was already tinted by resource type. |
| 12 | Floor texture visibly tiles (97 % identical patches 400 px apart). | **partly fixed** | The tile is a 2×2 block of independently mottled quadrants, so the repeat period is 640 world units — wider than the viewport at play zoom, but a very wide shot can still show it. |
| 13 | Suspicion panel wraps with an orphan word; past vs future encoded by colour alone. | **fixed** | Fixed width and balance; the two rows now differ by icon and weight as well as colour. |
| 14 | Stray unstyled circles and open strokes floating on the floor. | **fixed** | The water-ring and cable decals gained contact shadows and material, so they sit on the floor rather than float. |
| — | Evidence gaps: no victory, failure, spray, room-light or trap-struggle capture. | **fixed** | All are now captured; see `shots/`. |


## Round 2 — re-review after the balance work

Both critics re-reviewed, first against a stale checkout (`115e738`, nine commits behind) and then,
after being told, against `a375b63` and `143b5c7`. Their own corrections are recorded here alongside
mine, because the retractions are part of the evidence.

### A correction to this document

Row 2 of the visual table above said the trap had been redrawn. **It had not.** The visual critic
checked four ways at HEAD — `grep` for the replacement colours (no matches anywhere in the repo),
the literal source line, `git diff 115e738..HEAD` on the renderer (zero lines touched in the trap
block), and the pixels (L=119.6 against a scene mean of 40, still the brightest object in the world
layer, still the most visible thing behind a modal backdrop). The claim was false and stood through
three HEADs. It is fixed now, and measured: the gradient's mean luminance goes 158.6 -> 88.1, from
3.96x the scene mean to 2.20x.

That failure is the reason this table exists. A disposition of "fixed" is worth nothing unless
someone checks the artefact rather than the intent.

### Findings raised in round 2

| # | Finding | Status | What was done |
| - | ------- | ------ | ------------- |
| R1 | **Route adoption merged distinct supply lines.** The `adoptNearbyRoute` rule added in round 1 keyed on distance alone. Every route anchored on a nest must start inside `LINK_RADIUS`, and three lines out of one crack were measured starting within 19 units of each other — less than one node spacing — so no distance threshold can separate them. | **fixed** | The critic's specific scenario did not reproduce, because adoption anchors on a route's *tail*, not its start, and fanned-out lines have distant tails. A narrower variant did: a short stub east, then a line north from the same crack, merged into one route. Adoption now also requires the lay to start within 60 degrees of the trail's terminal tangent, and prefers dry or unlinked routes. Two regression tests. |
| R2 | **A failing reserve conscripted the entire colony.** Demand weighting is right when the reserve can recover — share glides 89 % -> 50 % over ~90 s — but when it cannot, 100 % of labour pinned itself on the most exposed route in the game for a whole night while the other reserve drained behind it. | **fixed** | `LABOUR_SHARE_CAP = 0.75`: past that share the demand discount is withdrawn, so the other line starts winning workers again. A player may rationally choose to run thin on one reserve rather than march bodies through the fridge light; the colony no longer overrules that. |
| R3 | **Worker route choice ignored exposure**, which is odd when exposure is the game's central currency. | **fixed** | Exposure now counts against a route in the acquisition score. With a safe and a risky line to the *same* crumbs, the colony takes the safe one (regression test holds distance constant so exposure is the only variable). Weight set by measurement, not taste: at 1.6 workers crowded the single safest line instead of spreading across the network and the careful strategy fell to 35 roaches — under the win threshold. At 0.7 it wins with 51 and provokes one response tier fewer. |
| R4 | **The end card contradicted itself** — "120 food banked — 198" marked with a cross, and "All three nest functions built — 1/4". | **fixed** | Three defects, not two, and the first fix was wrong. The label/denominator mismatch was as described: the criterion counts all four cracks while the label says three, so only the three side cracks are counted now and the label is generated from the same number. The number/verdict mismatch was *not* a timing skew between the verdict and the render, as first assumed — the real cause is that only the successful ending scored the run at all, so a colony that collapsed in night 2 was shown a default verdict beside live numbers. Every ending now scores itself and freezes the numbers behind that score, which also makes the loss card informative: a collapse with a full larder now reads "120 food banked ✓ 199" beside a failed population line, telling the player they died of thirst, not hunger. Caught because the first fix was checked against a regenerated capture and the contradiction was still on screen. |
| R5 | **Footfall telegraph overflowed the viewport.** `ringR` reached 437, giving a 542x874 ellipse against a 1200x675 view, so for most of the warning the player saw two near-vertical dashed lines with no visible curvature. | **fixed** | Clamped to 300. It still contracts by 2.5x, which is the part that carries the meaning. |
| R6 | **The circle had become the universal verb** — nine circular strokes counted in one frame, discriminated only by radius, and the round-1 depletion gauge added a sixth to the stack around a single node. | **fixed** | The gauge is a bar, not a ring, and food reads as discrete segments while moisture reads as one continuous fill, so the kind survives in greyscale rather than riding on hue alone. The trap's arming indicator became a rectangle — which is also what the sticky area actually is; a circle there both lied about the footprint and added to the pile. |
| R7 | **`25-outcome.png` was not a victory shot** and `26-eradicated.png` stopped showing the run-over card entirely — mid-crisis frames under the wrong filenames. | **fixed** | The capture fired on the simulation's status change, which precedes the overlay render by a frame or more. Both now wait for the card to be on screen. The evidence package was claiming to show payoffs it did not show. |
| R8 | **Light dominates geometry by ~10x.** Unlit open tile evaluates to 0.30 against an `EVIDENCE_BASELINE` of 0.24, so the whole cover-to-open axis in the dark spans 0.06, while the fridge light sits 0.59 above baseline. Suggested lowering the baseline to ~0.18, or raising the open-floor term. | **measured, not adopted** | The arithmetic is correct and both knobs were swept over 12 seeds and the three-strategy test. `EVIDENCE_BASELINE` 0.20: careful play *loses* at 12 roaches, tier 4, win rate 9/12. 0.18: careful play wins but provokes the extermination tier, breaking the design thesis that careful routing never does. Open-floor term 0.40: careful play reaches tier 4, win rate 8/12. 0.48: **0/12**. Both knobs raise suspicion globally rather than widening the dark-open axis specifically, because every route carries partially covered nodes that cross the lowered bar. Kept at 0.24 / 0.30. |
| R9 | Inter-worker overlap has no depth cue, so six roaches at a nest read as one tangle. | **open** | Raised as High ("bodies at L=26 against a 41 floor invert the art bible"), then retracted by the critic on re-measurement — 15 L of separation plus a 19-degree hue offset, adequate — and downgraded to a Medium overlap/depth problem. Not addressed; recorded in the known-issues list. |
| R10 | The resource gauge encodes food vs water by hue alone. | **fixed** | Addressed by R6: the two kinds now differ in fill pattern as well as colour. |

| R11 | *(found while verifying R4)* A bare `playwright test` validated whatever `dist/` was lying around. `reuseExistingServer: false` protects against a stale server; nothing protected against a stale build, and the rebuild lived in an npm script that not every invocation goes through. | **fixed** | The build is now part of the Playwright `webServer` command, so no invocation path can test an old binary. Found the honest way: a spec run reported green on a defect that had already been fixed in source. |

### What the critics confirmed

Independently re-measured at HEAD and found to hold: the evidence gradient is real (identical
targets, night 1, only route geometry differing — cover-hugging peaks at 0.0 suspicion, the open
middle at 6.6, the lit route at 86.5 and tier 3, against a pre-fix table where the bad route was
*safer*); the `pendingTier` re-entrancy fix; the own-nest rule in `redistribute`; the scout outline
holding up in a twelve-roach crowd; crumb tan not collapsing against roach amber at the delivery
beat (28-41 L of separation, 2x the saturation); and `.meter.critical` reading instantly.
