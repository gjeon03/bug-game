# Gameplay + UX critique — Baseboard Empire

Independent adversarial review. I did not implement this and I did not read `README.md`.

**Method.** Everything below is a number produced by the real simulation, not an opinion about the
code. I drove headless runs with `createWorld(seed)` + the repo's own scripted competent player
(`tests/unit/play.ts`), instrumented `world.hud` with a property setter to capture every objective
change with a timestamp, and wrapped `world.events.push` to capture the authored beat stream. I also
read `scripts/tmp/runA/log.json` (a real browser playtest) and the visual-sweep frames.

Note: `src/sim/{adaptations,director,operations,threats}.ts` and `src/ui/overlays.ts` were being
edited while I measured. Every number below was re-taken against `65413bc`.

**In flight as I filed this:** uncommitted work on `sim/territory.ts` adds hold hysteresis
(`HOLD_RELEASE = 0.5`), softens `HOLD_SUPPRESS` 0.13 → 0.06 and makes a claimed crack count as
standing presence — i.e. **D4's hold arithmetic is already being addressed**; re-measure it before
acting on that row. Nothing in the working tree touches D1, D2, D3, D5, D6 or D7.

---

## 1. Defects

| # | Symptom | Evidence | Severity | Confidence |
| --- | --- | --- | --- | --- |
| D1 | **Operation 2 is not passable by a player who also has to stay alive.** The run cannot reach operations 3 or 4. | The repo's own competent player (`play.ts` + claim + fit-out), 8 seeds, 900 s each: **7 collapse to population 0 inside operation 2** at t = 277–383 s; the 8th is still in operation 2 at t = 942 s. `routinesExploited` = 0 on seven of eight. A player who *ignores* routines entirely is healthy at t = 720 s (pop 45/55, food 210/210, 4 adaptations, 382 deliveries) and **still in operation 2**. | Blocker | High |
| D2 | **Two of the three routine anchors cannot be reached inside their own window** — the cause of D1. | `Midnight snack` is 2574 u from the home crack (11.8 s each way at 218 u/s) against a 34 s window; `Bin run` 2824 u (13.0 s) against 30 s. Measured lay-the-trail time on a dedicated chase: 19–35 s of the window; one attempt spent **35 s of a 34 s window** and the spill closed mid-walk. Only `Washing up` (717 u) is reachable — and `startSweep` fires a cleaning pass down the sink run *at the instant the spill opens*, over the ground you must cross. Two exploits took 5 attempts / 294–357 s on 2 of 3 seeds; the third seed never got there. | Blocker | High |
| D3 | **The extermination is outranked in the objective line by a household routine and by a shortage.** At the climax the game tells you to chase crumbs. | `resolveHud` returns at priority 2 (routine) and 3 (shortage) before reaching priority 4 (`threatAdvice`). Reproduced in a unit test. Present in the shipped evidence: `scripts/tmp/runA/log.json` → `forecast: "EXTERMINATION — 1s. They are spraying where your traffic was heaviest."`, `objective: "Washing up in 5s — Standing water is free moisture…"`, `source: "routine:incoming"`. Visible in `runA/final.png`. Routines are up 66 % of wall time, so ~2/3 of every 62 s extermination is spent showing a spill countdown. | Major | High |
| D4 | **Operation 4 has no ending for most runs, and a run has no outer limit.** | Since `65413bc` the extermination fires only once 3 zones are held. Three grown colonies pushed into operation 4 (pop 22 / 27 / 38, 3–4 footholds) held **one** zone for 420–495 s and the response never fired. Hold vectors read `[0 0 0 0 0 1.00 0 0]` — the colony's own labour allocator concentrates every worker on the best route, and the player has no verb that distributes bodies. Nothing in `sim/**` ends a run on time. | Major | High |
| D5 | **The capped-resource invariant is broken by two of `cappedAdvice`'s own branches.** | `capped:milestone` ("at N roaches you unlock a choice you will need it for") and `capped:capacity` ("claim or fit out a foothold") name no affordable spend. `capped:capacity` is only reached *after* the claimable and fittable affordability checks have already failed, so it instructs an action the same function just ruled out. Constructed dead end: every crack claimed and fitted as a cache, pop 33/33, food 570/570 → "Capacity is the bottleneck — claim or fit out a foothold", with nothing left to claim or fit. Observed live at t = 373.7 s and t = 490.7 s in a played run (pop 45/45). | Major | High |
| D6 | **The heat grid — which aims every trap, sweep, spray and the extermination — is inverted with respect to risk.** The careful player is the one who gets scoured. | Same seed, same source, 200 s: covered line → total heat **1.169**, peak **1.000**, hottest cell = the dishwasher, droppings 15.2, tier 0. Through-the-light detour → total heat **0.043**, peak **0.017**, droppings 132.2, tier 4. The evidence ledger is correct; the grid that decides *where* is backwards, because trail heat is divided across nodes so a long exposed line deposits less per cell than a short safe one. | Major | High |
| D7 | **Four adaptation effects are dead code, and one adaptation is a pure downside.** | No reader anywhere in `src/` outside `adaptations.ts` for `coveredTrailLifeMult`, `coveredEvidenceMult`, `depletionMult`, `panicLead`; `adaptations.evacuations` is written and never read; `adaptations.surgeTime` is read and never written. Net: **`shadow1` "Wall-hugging scent" (22 food / 16 moisture) has exactly one live effect — `haulSpeedMult = 0.88`.** You pay to become 12 % slower. `brood2`'s replacement surge, `shadow2`'s 0.5 s earlier reaction and `shadow3`'s 2 evacuations do not exist; their costs do. | Major | High |
| D8 | **The end card misattributes every loss to a suspicion cause.** | `showEnd` prints "Biggest contributing factor: `CAUSE_LABELS[topCause]`" for all three loss causes. Measured collapse (seed 20260801): food **118/120** — nearly full — water 0, i.e. died of thirst; the card would blame "Trails left on bare tile". `DeathCause` (`starve`/`thirst`/`spray`/`trap`/`foot`/`bait`) is emitted per death and never aggregated; `stats.workersLost` is one undifferentiated total. | Major | High |
| D9 | **The objective line is a household-routine countdown 58 % of the run.** | `hud.source` occupancy over a 625 s played run: `routine:active` **48.4 %**, `routine:incoming` 9.5 %, `gate:routines` 12.9 %, `threat` 7.5 %, `adaptation:offer` 4.2 %, `capped:fit` 3.8 %, `shortage` **2.6 %**. Routines are incoming-or-active 402 s / 600 s at operation 2 and 395 s / 600 s at operation 3. The "objective hierarchy" collapses to one rule. | Major | High |
| D10 | **`world.counterplay` is set and never cleared.** | Assigned in five `updatePressure` branches and in `beginFinalResponse`; no code path resets it to `null`. The HUD's ✽ line keeps advising counterplay for a threat that left the map minutes earlier. | Major | High |
| D11 | **Debug-looking output in the shipped checklist.** | `runA/log.json` and `runA/final.png`: `Survive the extermination  0.9999999999999639/1`. `hud.ts:236` renders `Math.min(item.have, item.need)` unrounded and the `survive` gate returns fractional progress. The contract forbids debug-looking assets. | Minor | High |
| D12 | **The objective-only plateau exceeds the 45 s gate.** | Supply-first play, seed 20260801: longest interval with **no change to `hud.source`** = **59.3 s** (t = 100 → 159.4, pinned on "Choose an adaptation — press 1, 2 or 3"). Counting authored beats as well, the longest gap is **26.0 s** (t = 10.1 → 36.1), which passes. The contract's gate passes on the wider reading and fails on the narrower one. | Minor | High |
| D13 | **A win zone is held by accident during the tutorial.** | `zoneHeld:dishwasher` fires at **t = 35.6 s** of operation 1. The home crack (168, 2042) and the first food source (712, 1704) are both inside the `dishwasher` zone, so operation 1's mandatory opening route holds one of the three win regions before territory has been mentioned. | Minor | High |
| D14 | **The objective names a key the game has not taught yet.** | t = 0 objective: "Walk to Dishwasher crumbs, then walk home **holding the lay key** to leave a trail." The tutorial first names that key ("Hold LEFT MOUSE (or SPACE)…") at **t = 11.3 s**, after `cover` (1.5 s) and `inspect` (9.3 s). For 11 s the primary instruction is unexecutable. | Minor | High |
| D15 | **A blocker string starts lowercase mid-sentence.** | `runA/log.json`: `blocker: "the sink run is being worked by the household — hold is falling while they are there."` — `${next.spec.name}` is authored as "the sink run". | Minor | High |
| D16 | **`capped:territory` sends an operation-2 player to work territory.** | Observed at t = 240.1 / 247.2 / 364.7 / 480.2 s while the active gate was `routines`. Zone hold has no effect until operation 4. | Minor | High |
| D17 | **No per-zone hold readout during play.** | The HUD shows `Hold 3 regions at once 0/3`; the only per-zone number anywhere is the single zone the objective happens to name. Nothing tells the player that the sink run is at 65 % and falling. The end card shows all four — after it is over. | Minor | High |

---

## 2. Answers to the brief

### 1. First minute

**Good.** Boot objective is `"Leave the crack and find something to eat."`; on the first simulated
step it becomes `"Walk to Dishwasher crumbs, then walk home holding the lay key to leave a trail."`
with a world marker reading `Dishwasher crumbs · 2 tiles`. No false emergency — `updateShortage`'s
"low **and** nothing coming in" test correctly stays silent at boot. First meaningful action (WASD)
is named at t = 0. **First delivery: t = 17.7 s** (line laid at 6.5 s) — comfortably inside the 45 s
gate.

**Not good.** The objective's verb is unexecutable for 11.3 s (D14). And an idle player's screen
changes exactly twice in 90 s: `gate:foodLine` → `shortage` at t ≈ 32 s. The tutorial stays on
"W A S D — get out of the crack." forever, correctly, but nothing escalates.

### 2. Decision density

**26.0 s** is the longest interval with neither an objective change nor an authored beat, on a
sane supply-first run (t = 10.1 → 36.1, the first population climb). That passes the 45 s gate.

**59.3 s** is the longest interval with no change to `hud.source` (D12). And the density is
misleading: from t ≈ 240 s the objective cycles between four strings for the rest of the run —
routine countdown → "bait is on one of your lines" → "the larder is full, push a line into X" →
"Wait for the house to move". **None of them advances the gate.** High beat density, zero progress.

### 3. The capped-resource rule

`cappedAdvice` never returns `null` while capped, but the contract asks for more than non-null: "at
least one affordable, non-automatic spend exists, and the HUD names it." Two of its seven branches
name no spend (D5), and one of them (`capped:capacity`) is only reachable after affordability has
already failed, so its instruction is guaranteed wrong. `capped:hold` looks unreachable (it needs all
eight zones held). `capped:milestone` is the old P1 defect wearing a sentence: full larder, nothing
to do, wait for a population number that rises on its own.

### 4. Adaptations

They are not three flavours of "+N" — the families genuinely diverge in play. Same seed, same player,
420 s, family locked:

| seed 909 | pop | peak | deliveries | totalFood | totalWater | outcome |
| --- | --- | --- | --- | --- | --- | --- |
| none | 12 | 21 | 254 | 818 | 235 | playing, op 2 |
| brood | 0 | 23 | 330 | 746 | 245 | **collapse at 348 s** |
| forage | 25 | 28 | 448 | 1264 | 708 | playing, **op 4** |
| shadow | 19 | 22 | 477 | 829 | 566 | playing, op 2 |

That is a real strategic spread — and brood killing a colony via `upkeepMult` (1.25 × 1.25 × 1.3 =
**2.03×**) is the downside working exactly as designed. Credit where due.

But: **`shadow1` is strictly dominated by not buying it** (D7) — both stated benefits are dead code
and the only live trait is a 12 % hauling penalty. `shadow2` is "feed 15 % slower, flee 30 % faster"
(its stated benefit is dead). `brood2` is "+14 capacity, +25 % upkeep" (its stated benefit is dead),
and capacity is frequently not binding — `runA` finished at **14 population against 83 capacity**.

### 5. Economy

Food and moisture both have real sinks now and the larder is not a dead end in the way it was. But
the two reserves are not symmetric: **moisture is the reserve that kills you and food is the one that
sits at cap.** Every collapse I measured died with a near-full or full larder and zero water —
seed 20260801: food 118/120, water 0; seed 1 (supply-first): food 210/210 while water oscillated
0–100. The sink drip finished a lost run at **639/640 units untouched**. The cause is structural:
`maintainLines` (and the HUD) drop everything to chase a spill, spills are up 66 % of the time, and a
routine's death deletes the trail laid to it, so the permanent water line is repeatedly abandoned and
never re-walked. Yes, a player can still reach full larder + nothing to do (D5).

### 6. Household pressure

It reacts to *something*, but not to risk (D6). The grid correctly remembers place — a run confined
to one corridor makes that corridor the hottest cell — and the peak floor (`HEAT_FLOOR_FRACTION`)
correctly makes evidence unerasable. What it cannot do is tell a safe route from a dangerous one:
the covered line peaked a cell at 1.000 and the through-the-light detour at 0.017. Responses
therefore land on the player's *shortest* corridor, which is usually the tutorial route next to home.

Counterplay at the moment it fires: footsteps (1.15 s telegraph → cover) yes; spray (claimed cracks,
680 u refuge reach) yes; bait (slow, 0.12/s) yes; trap (2.2 s arm, slow catch, re-route later) yes.
The cleaning sweep is the exception — 2.2 s of warning and the stated counterplay is "re-lay the line
once the cloth passes", which is a recovery costing a full walk, not counterplay. It matters more
than it looks because the sweep is bolted to `Washing up`, the only routine a player can reach (D2).

### 7. Territory + ending

Neither a logistical problem nor a formality — **a soft-lock**. The arithmetic: 28.6 s to take a zone
at full staff (6 workers + a linked route), 5.3 s to lose it while the household stands in it — the
house wipes hold **5.4× faster** than you build it. Three zones at once is 18 workers standing in
three regions with three live lines. There is no verb for distributing workers; they choose routes
themselves by demand and exposure, so they pile into one zone. Measured: three grown colonies, 420–
495 s each in operation 4, `held` never exceeded 1.

One zone is free (D13) and the other seven are 320–3197 u from home, so the real ask is two distant
regions staffed simultaneously with the labour allocator working against you.

Consequence: most runs have no ending at all (D4). The extermination is now caused by success, which
is the right instinct — but with no outer limit, a colony that cannot reach 3 zones plays forever.

### 8. Failure

Three causes, and only one is attributable. `collapse` is shown as "Nothing left to send out" with
"Biggest contributing factor: <a suspicion cause>" — which is wrong for the starvation and thirst
deaths that produce nearly every collapse (D8). `nestDestroyed` and `exterminated` are attributable
from the tier panel and the forecast. The information exists (`DeathCause` per event); nothing counts
it.

### 9. Replay

Concrete reasons that exist today: adaptation families produce measurably different runs (§4); the
end card names them and says "A different set is a different run"; `pickSeed()` randomises the map's
RNG each run; a best-run record persists. Reasons that do not exist: the player has never seen a win,
because most runs cannot reach one; there is no scoring beyond a best-run line; and the failure they
did see was mis-explained. **Right now the honest answer is: a player would replay once to test a
different adaptation family, discover the same operation-2 wall, and stop.**

### 10. UX answerability

| Question | String that answers it | Verdict |
| --- | --- | --- |
| What am I? | `"You are the scout, not the swarm"` — help card only, reachable from pause or the end card. | **Nothing during play.** A first-timer never sees it. |
| What now? | `hud.objective`, e.g. `"Walk to Dishwasher crumbs, then walk home holding the lay key…"` | Good — but 58 % of the time it is a spill countdown (D9) and at the climax it is wrong (D3). |
| Why? | `hud.blocker`, e.g. `"Sink-run crack needs 30 food — you have 21."` | Good. Best thing in the HUD. |
| What changed? | Toast (`world.hint`), e.g. `"The spill is gone — that trail went with it."`; the operation card. | Adequate. |
| What threatens me? | Suspicion panel: `"Infestation suspected — Trails left on bare tile, worst around the island. Expect traps on the routes they have noticed."` | Excellent. |
| What can I do about it? | `hud.counterplay`, e.g. `"Traps land where your traffic went. Move the line and the trap is wasted."` | Good text, **stale forever** (D10). |
| What unlocks next? | `"Next: Adaptations: the colony starts specialising, and you choose how."` | Good. |
| How close am I to winning? | Checklist `Hold 3 regions at once 0/3`. | Weak — no per-zone hold (D17), and one entry prints a float (D11). |
| How close am I to losing? | Food/moisture meters go `CRITICAL`; colony meter; nest-integrity arc drawn on the crack. | Adequate; nest integrity is world-space only, easy to miss. |

Two more UI observations from the frames: the adaptation panel covers the centre of the screen while
the world keeps running and a spill window keeps closing behind it (`h-bin-door.png`,
`i-pantry.png`); and `final.png` shows the objective pill and the blocker pill stating contradictory
things at the same instant ("chase the washing up" / "the sink run is being worked by the household").

---

## 3. The three changes I would make

**1. Make operation 2's gate reachable, because nothing downstream of it is currently playable.**
Seven of eight scripted runs die inside it and the eighth never leaves. Two fixes, both small:
spawn the two far routines' resources at an anchor chosen relative to the colony's current claimed
footholds rather than at a fixed fridge/bin coordinate (or reduce the gate to one exploit and lengthen
the `active` window to cover a 26 s round trip), and delay `startSweep` until the second half of the
`dishes` window so the only reachable spill is not sabotaged on arrival. Verification is already
written: `routinesExploited ≥ 2` inside 300 s for a player who also keeps two supply lines alive,
across five seeds.

**2. Fix the heat deposit so the household aims at risk, not at brevity.** RC3 was the whole reason
for the regional grid, and today it points the household at the safest, shortest corridor: covered
peak 1.000 vs. lit-detour peak 0.017 on the same seed. Deposit per exposed node scaled by that node's
own exposure instead of dividing a fixed per-second budget across all nodes. Until this is right,
"household responses reflect observed behaviour" is false in the direction that matters, and the
strategic promise — route geometry has a persistent consequence — is inverted.

**3. Give operation 4 a resolution, and give the player a way to spread labour.** Right now a colony
that cannot reach three zones plays an unbounded treadmill and never sees the ending, and one that
can is fighting an allocator that piles every worker onto one route. Either add a per-route labour
weight the player can set (the recall key already exists; a per-route "hold here" is the smallest
verb that fits "you never order units"), or make hold accrue from *route presence* plus a much lower
staffing requirement so three lines is enough. Add an outer limit that triggers the extermination
regardless, so every run ends in an answer rather than in the player closing the tab.

Cheapest high-value fix that is not in the top three: move the `finalResponse` check above the routine
and shortage rules in `resolveHud`. It is four lines and it stops the game from telling the player to
chase crumbs during its own climax.

---

## 4. What is genuinely good

- **The core loop reads.** The scout personally walking every route, and a scent ribbon with visible
  direction and taper, is a strong, legible idea; `d-two-lines.png` communicates it without a word.
  First delivery at 17.7 s is a real hook.
- **`hud.source` is an excellent piece of engineering.** Exposing *which rule* produced the objective
  made this entire critique measurable from the outside. Most games ship an objective string; almost
  none ship the reason.
- **The blocker line.** "Sink-run crack needs 30 food — you have 21." is the single best UI string in
  the game: it names the thing, the price and the gap.
- **The forecast is the household reasoning out loud** — cause, place and next likely action in one
  sentence — and it is the part of the UI that most makes the kitchen feel occupied.
- **The shortage model** ("low **and** nothing coming in") is the right shape, and it correctly keeps
  quiet at boot. The old build's opening lie is genuinely gone.
- **Adaptations really do diverge.** A forage colony reaching operation 4 while a brood colony starves
  on the same seed, from the same player, is exactly the "two paths, observably different outcomes"
  the contract asked for. The upkeep downside bites hard enough to kill — that is the good version of
  a downside.
- **The economy is honestly finite.** Sources deplete, spills die and take their trail with them, and
  a supply line is a thing you maintain. The run where the player ignores the routine gate and just
  runs an economy is a tense, legible game.
- **Evidence is unerasable and it is modelled per place.** The concept is right, the floor mechanism
  is right, and only the deposit normalisation is wrong.
- **Determinism.** Every number in this report came from `(seed, script)` and reproduced exactly.
  That is rare, and it is why the problems above are findable at all.

---

**Scratch files.** I wrote `tests/unit/zz*.test.ts` to produce the measurements above and deleted them
before finishing. Four of them (`zz4`–`zz7`) were swept into commit `65413bc` by a concurrent commit
while I was working; their deletion is in the working tree and needs committing.
