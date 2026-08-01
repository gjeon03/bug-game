# 02 — Economy and balance audit

**Subject:** `bug-game` @ `3242189` (branch `gameplay-redesign-v2`).
**Method:** every number below is either (a) a constant substituted into an equation from the source,
or (b) measured by stepping the real `stepWorld` headless at `SIM_DT = 1/60`. The sim tree was pinned
with `git archive HEAD src tests` into a scratch copy so concurrent edits to `src/` could not move the
numbers mid-audit. Harness + scenarios:
`/private/tmp/claude-501/-Users-jeongyeong-yeon-Documents-LOCAL-bug-game/4d470ed7-d200-410f-8106-392e84c32ebb/scratchpad/{harness,runs,micro,binding,probe2,thresh,earliest}.ts`
(run with `node --experimental-strip-types`). Rows marked *(computed)* are algebra, not simulation.

**One-line verdict:** food and water are not economic resources. They are two gates that open at
t≈77 s and t≈84 s and never close again. Population is limited by which cracks the player walked to,
and by threat attrition — never by supply. 63–80 % of a normal run is spent with every meter pinned
at its ceiling and no legal way to spend anything.

---

## 1. Every equation, with the constants substituted

### 1.1 Production — one worker on one linked route

```
round trip = D/v  +  0.85 (harvest)  +  D/(0.78·v)  +  ~0.3 (deliver latch)  +  ≤0.3 (re-acquire gate)
   v ∈ [118,148] u/s (WORKER_SPEED_MIN/MAX), carrying speed ×0.78, WORKER_HARVEST_TIME = 0.85
payload = 6 food (WORKER_CARRY_FOOD) or 5 water (WORKER_CARRY_WATER),  ×1.25 if `cache` claimed
```

Measured on the canonical covered line home(168,2042) → dishCrumbs(712,1704), path length ≈ 807 u,
14 haulers, reserves pinned mid-band so nothing clamps, 90 s window, 89 deliveries:

| quantity | measured |
|---|---|
| round trip | **14.16 s** |
| food/s per hauler | **0.424** |
| water/s per hauler | 0.353 *(computed, 5/14.16)* |
| colony food/s at pop 14 | 5.93 |

### 1.2 Consumption

```
upkeep_food(N)  = UPKEEP_FOOD  · N = 0.016·N  per second
upkeep_water(N) = UPKEEP_WATER · N = 0.009·N  per second
```

| pop | food/s | water/s | haulers needed to break even |
|---|---|---|---|
| 14 | 0.224 | 0.126 | **0.53 food + 0.36 water** |
| 36 | 0.576 | 0.324 | 1.36 + 0.92 |
| 52 (max) | 0.832 | 0.468 | 1.96 + 1.33 |

**One hauler pays for 26.5 colonists' food (0.424 / 0.016) and 39 colonists' water.** The maximum
colony this game can build is 52. Two workers feed the entire endgame colony.

### 1.3 Brood

```
rate    = BROOD_RATE · (BROOD_CHAMBER_MULT if brood chamber) = 0.09/s → 1 per 11.1 s
                                                    with chamber = 0.1575/s → 1 per 6.35 s
cost    = 8 food + 4 water   (BROOD_FOOD_COST / BROOD_WATER_COST)
drain   = 0.72 food/s + 0.36 water/s   (1.26 + 0.63 with chamber)
gate    = food  ≥ 8 + 14 + 0.8·N       (BROOD_FOOD_COST + BROOD_RESERVE_MARGIN_FOOD + 0.8N)
          water ≥ 4 +  8 + 0.5·N
halt    = N ≥ 36 AND (food < 135 OR water < 105)          ← `banking`
```

Gate values: N=14 → 33.2 food / 19 water · N=36 → 50.8 / 30 · N=52 → 63.6 / 38.
Peak brood drain (1.26 food/s with chamber) is still **4.7× under** the output of three haulers.

### 1.4 Capacity and storage

```
capacity = min(90, 14 + 8·satellites + 14·[brood chamber])      → n1: 14 · n2: 44 · n3: 52
foodCap  = 200 + 120·[cache] = 200 or 320
waterCap = 160 +  60·[cache] = 160 or 220
```

`WORKER_CAP = 90` is unreachable — the map only offers 3 satellites, so 52 is the hard ceiling.

### 1.5 The delivery clamp (the single most consequential line in the economy)

`workers.ts:410` `c.food = Math.min(c.foodCap, c.food + amount)` — overflow is discarded silently.
But `workers.ts:243` `res.amount -= take` already ran during harvest. **A colony at cap keeps
stripping the map and voiding the result**, and a fully drained food node fires
`SUSPICION_WEIGHTS.depleted = 3`. The colony pays suspicion for food it destroyed on its own doorstep.

### 1.6 The largest number that ever matters

| resource | biggest single spend | biggest brood gate | win threshold | **cap** | inert fraction of the bar |
|---|---|---|---|---|---|
| food | 54 (escape tunnel) | 63.6 @ N=52 | 120 | 200 / **320** | 40 % / **62.5 %** |
| water | 34 (escape tunnel) | 38 @ N=52 | 90 | 160 / **220** | 44 % / **59 %** |

Nothing anywhere in the sim consumes food above 120 or water above 90.

### 1.7 Map stock vs lifetime demand *(computed)*

| | food | water |
|---|---|---|
| all 8 nodes | 25 500 | 15 000 |
| all 3 claims | 140 | 82 |
| brood 6→52 (40 paid hatches; 6 are free with the claims) | 320 | 160 |
| upkeep, whole run, mean pop 30 | 368 | 207 |
| reserve held at the end | 120 | 90 |
| **total lifetime demand** | **948** | **539** |
| **demand as % of map** | **3.7 %** | **3.6 %** |

---

## 2. Timelines

Seed `20260801` throughout. `wasted` = delivered minus stored (voided by the cap).
Six of eight nodes are never touched at all in any of these runs.

### 2.1 Threshold crossings (two covered lines, then no further input)

| event | t |
|---|---|
| first delivery | 14 s |
| **food ≥ 120 (win threshold)** | **77 s** |
| **water ≥ 90 (win threshold)** | **84 s** |
| food at cap 200 | 111 s |
| water at cap 160 | 120 s |
| pop at night-1 capacity 14 | ~100 s |

### 2.2 Near-optimal (the line locked in by `balance.test.ts`) — **WON**

| t | night | pop/cap | food/cap | water/cap | linked | susp/tier | note |
|---|---|---|---|---|---|---|---|
| 25 | 1 | 8/14 | 63/200 | 25/160 | 2 | 0/0 | both lines live |
| 100 | 1 | 14/14 | 170/200 | 118/160 | 2 | 0/0 | **pop capped** |
| 125 | 1 | 14/14 | 200/200 | 160/160 | 2 | 0/0 | **everything capped, 53 s of night 1 left** |
| 200 | 2 | 16/36 | 188/200 | 148/160 | 3 | 8/0 | brood chamber |
| 325 | 2 | 36/44 | 269/320 | 189/220 | 5 | 66/2 | cache; **win pop reached** |
| 375 | 2 | 12/44 | 300/320 | 199/220 | 5 | 99/4 | spray wipe: 34 → 12 |
| 500 | 3 | 29/52 | 318/320 | 190/220 | 4 | 100/4 | escape tunnel |
| 725 | 3 | 45/52 | 320/320 | 218/220 | 4 | 100/4 | capped again |
| 788 | 3 | 48/52 | 317/320 | 196/220 | 4 | 100/4 | won |

Totals: 6 372 food delivered / 1 532 stored → **4 840 wasted (76 %)**; 532 s at food cap;
suspicion pinned at 100 from t≈390 onward; 60 workers lost; **all four buildable win criteria
satisfied at t = 567 of 788 (28 % of the run left with nothing to build)**.

### 2.3 Cautious — covered lines only, both night-2 cracks, skips night 3's exposed nodes

| t | night | pop/cap | food/cap | water/cap | susp/tier |
|---|---|---|---|---|---|
| 120 | 1 | 14/14 | 200/200 | 160/160 | 0/0 |
| 240 | 2 | 25/44 | 320/320 | 194/220 | 14/0 |
| 320 | 2 | 37/44 | 320/320 | 220/220 | 13/0 |
| **360–680** | 2–3 | **44/44** | **320/320** | **220/220** | 13→31 /0–1 |
| 788 | 3 | 25/44 | 185/320 | 186/220 | 31/1 |

**63 % of the run at both reserve caps, 51 % at all three caps simultaneously.**
11 540 food delivered / 986 stored → **10 554 wasted (91 %)**. Suspicion peak 32 (tier 1) — this
strategy never provokes the traps, bait or spray at all. Lost only on `nests` + `population`
(never claimed the escape tunnel; the final sweep then cost 19 roaches it had no refuge for).

### 2.4 Novice — one food line, nothing else — **LOST (thirst) at t=267**

| t | pop/cap | food/cap | water/cap |
|---|---|---|---|
| 59 | 9/14 | **200/200** | 20/160 |
| 120 | 10/14 | 200/200 | 8/160 |
| 240 | 6/14 | 200/200 | **0/160** |
| 267 | 0 | **200/200** | 0/160 |

**209 of 256 playable seconds (82 %) spent at the food cap while starving to death of thirst.**
883 food voided. There is no conversion, no ration, no emergency — 200 banked food cannot buy one drop.

### 2.5 Aggressive — open-floor lines, sprinting, every node — **LOST (thirst) at t=558**

Suspicion 100/tier 4 by t=240 (night 2). Pop crashed 14 → 2 at t≈230. Water line broke under the
response and was never re-linked; food climbed to 320/320 and stayed there while water bled to 0.
**Same death as the novice, from the opposite direction: full larder, empty canteen.**

### 2.6 Capped-resource / AFK — two covered lines in the first ~35 s, then **zero further input**

Survives all three nights. Ends alive: pop 13, food 160, water 139, suspicion peak 22 (**tier 0 —
never even reaches "Something's off"**). 631 s at food cap, 617 s at water cap, 619 s at pop cap;
**80 % of the run at both reserve caps, 77 % at all three.** 2 057 food + 978 water voided.
Loses only because it never claimed a crack.
Control: **zero input for the entire run** collapses at t=298 — so the game's whole demanded skill
expression is the ~35 seconds it takes to lay two trails.

### 2.7 Heavy-loss recovery — 22 → 5 pop, larder emptied, at t=237 — **never recovers**

| t after wipe | pop | food | water |
|---|---|---|---|
| 0 | 5 | 5 | 3 |
| 60 | 2 | 63 | 1.9 |
| 120 | 2 | 116 | 1.1 |
| 180 | 0 (dead) | 191 | 0 |

Diagnosis (probe `H`): the two survivors both live at `crackIsland` and are both bound to the
`islandDrop` **food** route. The only water line is anchored at `home`, 1 219 u away —
past `ACQUIRE_RADIUS = 520`, so `tryAcquireRoute` filters it out entirely. `redistribute()` only
fires after `lostTime > 5`, i.e. only for a worker with *nothing* to do; a worker doing the *wrong*
thing is never reassigned. Brood gate needs water ≥ 4+8+0.5·N = 13; water never exceeds 3. The
colony breeds nothing, banks 191 food, and dies. **Recovery from a heavy loss is not slow — it is
structurally impossible whenever the surviving nest has no local water line.**

---

## 3. Findings

**Runaway growth:** none, and that is itself the defect. Growth is bounded by `capacity`, a pure
function of how many cracks were walked to. Classifying every step of a full winning run by *why*
brood is not ticking (probe `binding.ts`):

| reason | near-optimal (won) | AFK |
|---|---|---|
| actively breeding | 697 s (88 %) | 169 s (21 %) |
| **capacity** | 89 s (11 %) | **597 s (76 %)** |
| **food short** | **0 s (0 %)** | **0 s (0 %)** |
| **water short** | **0 s (0 %)** | **0 s (0 %)** |
| banking | 0 s (0 %) | 0 s (0 %) |

Across a whole winning run, **food is never once the reason the colony stops growing. Neither is
water.** The `banking` mechanism in `colony.ts:85-87` — commented as necessary to make the win
thresholds reachable — never fires, because the larder is full 400 s before pop 36 is reached.

**Dead resources:** *both of them, after t≈110.* Also dead: resource depletion. In a full AFK run
**no node ever depletes**; the lowest any node fell to was 72 % of stock, and six of eight ended at
100 %. That makes `depleted`, `route.dry`, `NIGHT_RESOURCE_REGROWTH`, the "dry route stays visible"
feature and `SUSPICION_WEIGHTS.depleted` all unreachable in normal play — they are only observable in
tests that hand-set `node.amount = 1`. `HARVEST_SLOTS = 4` is likewise inert: mean occupancy on a
single node with the whole night-1 colony on it is 0.87 / 4 (22 %); it would only bind at ~66 workers,
above the 52 the map can support.

**Dominant strategy:** covered lines, three claims, never leave cover. The cautious run reached the
same pop ceiling (44/44) and the same full larders as the near-optimal run at **suspicion 32 / tier 1
instead of 100 / tier 4**, and lost 27 workers instead of 60. The night-2/3 "high-value, high-exposure"
nodes (`islandDrop` 5 100, `fridgeCondensation` 5 700, `trashSpill` 7 200, `petBowl` 5 400) buy access
to stock the colony can neither store nor spend, and the suspicion they generate spawns the spray that
actually kills it. **The risk/reward on the game's central risk decision is negative.**

**Fake choices:**
- *Food cache* (46 f / 22 w): +120 food cap and +60 water cap on bars that were already 40 % inert,
  plus ×1.25 carry on a 26× surplus. Its only live effects are the +8 capacity every claim grants and
  the fact that the win condition requires it. Its own stated benefit is a no-op.
- *All three claims* are mandatory (win requires `nests`), unlock on a fixed night, and cost
  140 f / 82 w against a larder that has been pinned at 200/160 since t≈110 — **≈24 seconds of colony
  output for the whole set.** There is no ordering decision, no affordability decision, no opportunity
  cost. Only *walking there* is gated.
- *Extra routes*: measured deliveries/s with 1, 2, 3 linked lines at fixed pop 14 =
  **1.012 → 0.925 → 0.737**. More lines is strictly *worse* throughput (same workers, longer mean
  walk). `MAX_ROUTES = 5` is not a budget; a route only ever buys access to a *kind* (food vs water).
  Only the brood chamber (+14 capacity, ×1.75 rate) has a real economic effect.

**Plateaus:** night 1 plateaus at t≈120 with 58 s left. The cautious run plateaus at t≈360 and holds
44/44/320/320/220/220 for **320 unbroken seconds**. The AFK run plateaus at t≈120 and holds for
**615 seconds**.

**States with no useful sink:** measured as % of playable time with both reserves ≥98 % of cap —
near-optimal **23 %**, cautious **63 %**, AFK **80 %**. Add the pop cap and it is 10 % / 51 % / 77 %.

**Every observed death is thirst with a full food store** (novice 200/200, aggressive 320/320,
heavy-loss 191/200). Food has never once been the failing resource in any scenario run for this audit.

**Win condition:** `pop ≥ 36, food ≥ 120, water ≥ 90, all 3 upgrades`. Food and water clear at
**77 s and 84 s** — 10 % into the run, before the first patrol. Pop 36 is reached at **t=309** by a
merely-cautious colony (capacity 44 is available all of night 2). The only binding item is walking to
`crackWall`, which unlocks at night 3 (t≥456). Measured first satisfaction of all four buildable
criteria in the winning run: **t=567 of 788 — 221 s (28 %) of the run left**, of which the final
response occupies only the last 76 s. **What the player does after satisfying it: nothing.** There is
no post-goal sink; the colony continues stripping ~10 food/s off the map and voiding all of it.

---

## 4. Observable defects

| # | symptom | evidence | severity | confidence |
|---|---|---|---|---|
| E1 | Both reserves cap ~2 min into a 13-min run and never come off | food 200/200 at t=111, water 160/160 at t=120; 80 % of the AFK run at both caps | **critical** | high |
| E2 | 76–91 % of everything hauled is destroyed on delivery | near-optimal 4 840 of 6 372 food voided; cautious 10 554 of 11 540 | **critical** | high |
| E3 | Food is never the constraint on anything | 0 s of 788 spent food-gated in a winning run (§3 table) | **critical** | high |
| E4 | Every death is thirst beside a full larder; no conversion, ration or emergency | novice 200/200 food at death; aggressive 320/320; heavy-loss 191/200 | **critical** | high |
| E5 | Two trails in the first 35 s survive all three nights with no further input, at tier 0 | AFK run: alive at t=788, suspicion peak 22 | **critical** | high |
| E6 | Heavy loss is unrecoverable when the surviving nest lacks a local water line | probe H: both survivors bound to a food route; water line 1 219 u > `ACQUIRE_RADIUS` 520; brood gate 13 vs water 1.9 | **critical** | high |
| E7 | Colony strips the map while capped, and pays `depleted` suspicion for food it voided | `res.amount -= take` precedes the `Math.min` clamp (`workers.ts:243` vs `:410`) | high | high |
| E8 | Exposed high-value nodes are a negative-EV trade | cautious tier 1 / 27 lost vs near-optimal tier 4 / 60 lost, same pop ceiling | high | high |
| E9 | Resource depletion, dry routes, regrowth and `HARVEST_SLOTS` are unreachable | no node depletes in a full run; min 72 % of stock; slot occupancy 0.87/4 | high | high |
| E10 | Food cache's own effect is a no-op | raises caps from 40 % inert to 62 % inert; carry +25 % on a 26× surplus | high | high |
| E11 | Additional routes reduce throughput | 1.012 → 0.925 → 0.737 deliveries/s for 1 → 2 → 3 lines | high | high |
| E12 | All four buildable win criteria met with 28 % of the run left, and no post-goal sink | first satisfaction t=567 of 788 | high | high |
| E13 | `banking` (colony halts breeding to bank reserves) never fires | 0 s of 788 in the winning run | medium | high |
| E14 | Claims cost ≈24 s of output combined; affordability is never a decision | 140 f / 82 w vs 5.93 food/s at pop 14 | medium | high |
| E15 | `WORKER_CAP = 90` unreachable — real ceiling is 52 | `14 + 3·8 + 14` | medium | high |
| E16 | Suspicion ratchets to 100 and pins there in the aggressive/near-optimal lines | `SUSPICION_PEAK_FLOOR` 0.55, decay 0.1/s vs traffic+droppings accrual | medium | med |
| E17 | Night 1's back half is empty: pop, food and water all capped with 58 s to run | t=120 → 178 all three pinned | medium | high |

---

## 5. Structural recommendations

These are not constant tweaks. Re-tuning `FOOD_CAP` or `UPKEEP_FOOD` cannot fix E1–E5: the surplus
ratio is 26×, so even a 10× upkeep increase leaves food free, and a lower cap just voids the overflow
sooner.

**R1 — Give stored resources a continuous sink, or stop storing them.** The economy has exactly two
one-shot sinks (3 claims) and one trickle (brood, capped by `capacity`). Either
(a) make upkeep scale so a large colony is genuinely expensive — at pop 52 the colony should consume
close to what 25 haulers produce, not 4 % of it; or (b) convert the larder into a **spend-down**
resource: chamber excavation, trail hardening, sealing a crack the humans found, a stockpile that
buys survival time during a sweep. Right now `food` is a progress bar that fills itself.

**R2 — Break the food/water symmetry, or let them trade.** Both resources are produced by the same
action, at the same rate, from the same node type, and differ only in which of two identical bars
they fill. Every failure observed is "one bar empty, other bar full". Either give them distinct roles
(water gates brood, food gates operations/upgrades) so a shortage is a *choice about what to give up*,
or add an explicit, lossy conversion so a full larder is an answer to a drought.

**R3 — Make population cost something ongoing.** `capacity` as a hard step function (14 → 44 → 52,
set entirely by which cracks were visited) means growth is a checklist, not a decision. Replace it
with a soft ceiling: breeding continues past capacity at rising cost/risk (crowding, exposure,
slower haul), so "how big should I be" becomes a live question the player answers every minute.

**R4 — Delete the caps or make them the interesting constraint.** With the delivery clamp discarding
76–91 % of throughput, the entire hauling loop — the game's main verb — is decorative for most of a
run. If caps stay, they must *bite*: overflow should force a decision (spoilage the humans smell, a
visible pile that raises suspicion, forced idling of workers). If they cannot bite, remove them and
let the sink in R1 do the limiting.

**R5 — Repair labour reachability before tuning labour weighting.** `ACQUIRE_RADIUS = 520` silently
overrides the entire demand-weighting system (`LABOUR_SHARE_CAP`, shortage discount, exposure
aversion) whenever the needed route is anchored at a different nest. `redistribute()` must trigger on
*wrong work*, not only on *no work* — e.g. when `world.shortage` names a kind this worker's nest
cannot reach. Until then, claiming a satellite without also anchoring a water line there is a hidden,
unsignalled, run-ending mistake.

**R6 — Cost the map, or shrink it.** 40 500 units against 1 487 of lifetime demand (3.7 %) makes
depletion, regrowth, dry routes and harvest slots dead systems. Either cut node stock by ~20× so
exhausting a source is a real event the player must plan around (which switches the "extra route"
decision from inert to live, fixing E11), or delete those systems and the code that supports them.

**R7 — Make exposure buy something.** The high-value, high-exposure nodes must offer a resource the
covered nodes cannot, or the dominant strategy stays "never leave the toe-kick". Tying them to the
sink from R1 (e.g. only the fridge/bin nodes yield what an upgrade needs) turns `EXPOSURE_AVERSION`
and the whole suspicion ledger into a live trade instead of a tax on curiosity.

**R8 — Move the win condition off thresholds that clear themselves.** `food ≥ 120` and `water ≥ 90`
are satisfied at t=77 s and t=84 s by a colony that has done nothing but lay two trails. Either raise
them into the region the caps forbid (impossible without R1/R4) or replace them with criteria that
measure the run: peak colony sustained through the final sweep, cracks held under spray, evidence
kept below a tier. A criterion the player clears before meeting the first patrol is not a goal.
