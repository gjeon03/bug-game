# 01 — Gameplay loop and progression audit

Read-only audit of the sim at commit `3242189`, branch `gameplay-redesign-v2`.
All timings below are **measured**, not estimated: the shipped balance-test run script (seed
`20260801`, `tests/unit/balance.test.ts:207`) was re-executed headless with per-second instrumentation,
plus two control runs (walk-away, food-only). Method is at the bottom.

> **Line numbers are pinned to `3242189`.** Every `file:line` below was verified against that commit.
> A parallel work stream began editing `src/sim/constants.ts`, `workers.ts`, `world.ts`, `types.ts`
> and `main.ts` (worker spacing / lane / harvest-ring changes) *after* all measurement runs
> completed, so citations into those files may have drifted in the working tree — resolve them with
> `git show 3242189:<path>`. Those edits are positional/rendering only and do not touch any constant
> or code path this audit measures.

## Headline measurement

A run where the player lays two covered trails in the first 10 seconds and then **never presses
another key for the remaining 778 seconds**:

```
  10s n1 pop= 6/14 food= 45/200 water= 33/160 susp= 0 T0
 120s n1 pop=14/14 food=200/200 water=160/160 susp= 0 T0   <- everything capped
 189s n2 pop=14/14 food=200/200 water=160/160 susp= 0 T0
 466s n3 pop=14/14 food=200/200 water=160/160 susp=10 T0
 788s n3 pop=13/14 food=176/200 water=147/160 susp=22 T0   <- lost: notEstablished
 657 deliveries, 0 player inputs after t=10s
 winCriteria: {population:false, food:TRUE, water:TRUE, nests:false, survived:true}
```

Two of the four win criteria are satisfied at **t≈110 s** by a player who has stopped playing, and
can never be un-satisfied afterwards. The delta between "walked away at 10 s" and "won" is: press
`E` on three cracks, and wait for population to tick to 36. That is the whole game.

---

## OBSERVABLE DEFECTS

| # | Symptom | Evidence | Sev | Conf |
|---|---|---|---|---|
| D1 | **Colony fully caps 62 % into night 1 and stays capped for 78 s.** Measured food=200/200 at t=111.8 s, water=160/160 at t=119.8 s, pop=14/14 at t=89 s. Night 1 ends at 178 s. | `constants.ts:82,85,86` (`BASE_CAPACITY 14`, `FOOD_CAP 200`, `WATER_CAP 160`); measured | high | high |
| D2 | **The competent run sits at food cap for 455 s — 58 % of the run.** food=320/320 continuously from t=333 s to t=788 s. Deliveries during that window are silently discarded by `Math.min(c.foodCap, …)` and do not even increment `totalFood`. | `workers.ts:409-416` | high | high |
| D3 | **There are exactly three food sinks and three water sinks in the entire codebase**, two of which are automatic. Verified by exhaustive grep of every write to `colony.food`/`colony.water`: upkeep (auto), brood (auto), nest claim (140 food / 82 water once per run, total). Nothing else spends a resource, ever. | `colony.ts:56-57`, `colony.ts:100-101`, `colony.ts:287-288` | high | high |
| D4 | **Resources are net-positive across nights — scarcity is arithmetically impossible.** `dishCrumbs` starts at 3600; a full night of unbroken traffic consumes ~474; night rollover restores `0.3 × initial = 1080`. Measured ledger: `n1 after routes=3564 → n2 start=3600 → n3 start=3600`. | `kitchen.ts:111` (`amount: 3600`), `constants.ts:148` (`NIGHT_RESOURCE_REGROWTH = 0.3`), `director.ts:180-181` | high | high |
| D5 | **Three of eight authored resource nodes are never touched in a winning run.** End state: `stoveGrease 4200/4200 (100 %)`, `trashSpill 7200/7200 (100 %)`, `petBowl 5400/5400 (100 %)`. In the walk-away run six of eight are untouched. | `kitchen.ts:104-182`; measured | med | high |
| D6 | **Suspicion pins at `SUSPICION_MAX` (100) at t≈363 s and never moves again for the remaining 425 s.** Escalation is edge-triggered only (`if (tier > s.tier) world.pendingTier = tier`), so once tier 4 is reached the household has no remaining output. Tier 4 first reached t=347.8 s = 44 % into the run. | `suspicion.ts:132-142`, `director.ts:142-147`, `constants.ts:113` | high | high |
| D7 | **A covered route generates less evidence than the floor the game hands out for free.** Walk-away run ends at suspicion 22, which is exactly `NIGHT_SUSPICION_FLOOR[3] = 22`. Every point of that player's suspicion was authored, none was earned. | `constants.ts:150`, `suspicion.ts:122`; measured | med | high |
| D8 | **Route geometry is set-and-forget: reinforcement is 18.8× decay.** A linked route decays at `0.4 life/s`; a worker passing within ±2 nodes restores `NODE_REINFORCE = 7.5 /s`. Measured after 160 s hands-off: `nodes=24 linked=true minLife=129.6/130`. A route with any traffic is immortal. | `constants.ts:41`, `pheromone.ts:243`, `workers.ts:183-188`; measured | high | high |
| D9 | **The "old routes become lethal, re-scout and re-route" loop step never executes.** In the winning run, linked-route count changed exactly three times in 788 s: `0→2 @9.8 s` (player), `2→5 @313 s` (player), `5→4 @510 s`. Six hazards were live at the end, three with capacity remaining, and no route was ever abandoned because of one. | `GAME_CONTRACT.md:48`; measured | high | high |
| D10 | **Mean gap between authored beats is 112 s, against a contract budget of 3 s.** Absolute beat times: 104, 232, 358, 500, 598, 712 s. Gaps: 104 / 128 / 126 / 142 / 98 / 114 / 76 s. | `director.ts:41-80`, `GAME_CONTRACT.md:126` | high | high |
| D11 | **Beats are self-suppressing, so authored content is thinner than the table.** Four of five beats are `if (w.patrols.length === 0) spawnPatrol(...)`. At t=358 s the run already had 2 patrols out, so beat 3 fired nothing at all. | `director.ts:44-71` | med | high |
| D12 | **The objective line thrashes ~140 times in night 2 with zero informational change**, because it interpolates live reserve numbers into a goal that is already tripled: `"Build reserves — 219/120 food, 161/90 moisture"` → `"233/120"` → `"225/120"` …, once per second from t=313 s to t=455 s. | `director.ts:387` | med | high |
| D13 | **Win thresholds are met long before they are meaningful.** `WIN_FOOD 120` vs achievable cap 320 (37 %); `WIN_WATER 90` vs 220 (41 %); `WIN_POPULATION 36` vs capacity 52 (69 %). Food/water criteria are met inside night 1. | `constants.ts:196-198`, `colony.ts:41-47` | high | high |
| D14 | **All three upgrades are mandatory, simultaneously affordable, and purely numeric.** `winCriteria.nests` is false if *any* crack is unclaimed. Total cost 140 food / 82 water against a night-2 stock of 200/160 and a cap of 320/220. There is no opportunity cost and no ordering decision. | `director.ts:242-249`, `kitchen.ts:208-241` | high | high |
| D15 | **The only genuinely new capability gained in a whole run is a teleport**, unlocked at ~62 % of night 3, free, uncapped, no cooldown. Everything else an upgrade does is `capacity +8`, `foodCap +120`, `broodRate ×1.75`, `carry ×1.25`. | `colony.ts:266-276`, `colony.ts:40-47`, `workers.ts:240` | high | high |
| D16 | **`colony.upgrades.escape` is written but never read.** The escape behaviour keys off `nest.upgrade === 'escape'` instead. Dead state. | set `colony.ts:292`; consumers `workers.ts:263`, `colony.ts:203`; no reader of `upgrades.escape` exists | low | high |
| D17 | **Brood is a HUD meter the player has no verb for.** `world.colony.brood` is displayed as a percentage bar but is driven entirely by `BROOD_RATE` and reserve thresholds; no input in the game touches it. | `hud.ts:34,127-128`, `colony.ts:97-108` | med | high |
| D18 | **The `banking` mode described in code comments as load-bearing never fires in a competent run.** `bankingFirst` requires `pop ≥ 36 && (food < 135 || water < 105)`; by the time population reaches 36 (t=575 s) food is at 320 and water at 179. Measured: `banking on: never`. | `colony.ts:85-87`; measured | med | high |
| D19 | **`MAX_ROUTES = 5` is not a binding constraint.** Two lines cap every reserve by t=120 s. The winning run ran five and the food meter still sat at ceiling. The "five concurrent routes" budget therefore constrains nothing. | `constants.ts:50`; measured | med | high |
| D20 | **The pheromone reserve is the only binding budget in the game, and it binds for ~5 % of a run.** `RESERVE_MAX 100`, `RESERVE_REGEN 5.2/s`, cost 1 per 26 units. Laying at `SCOUT_SPEED 218` consumes 8.4 nodes/s against 5.2 regen → 31 s of continuous laying before empty. Total laying time in the winning run: under 40 s across 788 s. | `constants.ts:19,42-44`, `pheromone.ts:118,230` | med | high |
| D21 | **A food-only strategy dies on a fixed schedule with no decision in between.** Control run with one food line and no water: water reaches 20 at t=36 s, 0 at t=246 s, colony extinct at t=276 s. 240 seconds of watching a bar go down. | measured; `colony.ts:71-79` | med | high |

---

## Direct answers

### 1. Why growth is a number, not a capability

Trace of everything the player unlocks in a full run:

| t | Unlock | What it actually is |
|---|---|---|
| 0 s | All six verbs live (`GAME_CONTRACT.md:19-27`) | The verb set never grows — this is stated design |
| 189 s | Night 2: +3 resource nodes, +2 claimable cracks | More instances of things already understood |
| ~195 s | Brood chamber, 40f/26w | `capacity +8+14`; `BROOD_RATE ×1.75`; brood spawns here |
| ~312 s | Food cache, 46f/22w | `capacity +8`; `foodCap +120`; `waterCap +60`; `carry ×1.25` |
| 466 s | Night 3: +2 resource nodes, +1 crack | More instances |
| ~484 s | Escape tunnel, 54f/34w | `capacity +8`; panic refuge radius 680→1100; **`E` teleports scout home** |

The teleport (`colony.ts:266-276`) is the single new *action* the player gains in 13 minutes, and it
arrives at 61 % of the way through. Every other unlock is `+N` on a meter the player was already
capping. Contract line `GAME_CONTRACT.md:28` — "Six commands. Nothing else is bound to gameplay" —
makes new-capability growth impossible by construction, so growth had nowhere to go except numbers.

### 2. Where each resource stops creating decisions

- **Food** — sinks are exhaustively: `colony.ts:56` (upkeep, automatic), `colony.ts:100` (brood,
  automatic), `colony.ts:287` (claim, 140 total for the run). Cap reached t=111.8 s. Post-cap income
  is discarded at `workers.ts:410`. **Dead from t≈112 s.**
- **Water** — identical structure, `colony.ts:57/101/288`, 82 total spent on claims. Cap at
  t=119.8 s. **Dead from t≈120 s.**
- **Population** — never spent, only lost. `population` is a read-out of `countAlive`
  (`workers.ts:399`). It is a win threshold and a capacity denominator; the player cannot trade it
  for anything. **Never a decision.**
- **Brood** — `colony.ts:97` is a timer with reserve gates. No input path reaches it. **Never a
  decision**, despite occupying a HUD meter (`hud.ts:34`).
- **Upgrades** — all three required (`director.ts:242-249`), total cost 140/82 against caps of
  320/220, unlock-gated to a fixed order (nights 2, 2, 3). **Never a decision**, only a chore.
- **Pheromone reserve** — the one real budget, and it only binds while the lay key is held.

### 3. Does the fixed three-night timer help or harm agency?

It harms it, because nothing the player does interacts with it. `NIGHT_LENGTH` is a constant record
(`constants.ts:145`); `startNight` (`director.ts:166-190`) regrows resources by a flat 0.3 and resets
the scout's spotted meter; `NIGHT_SUSPICION_FLOOR` raises the floor by night index regardless of
play (`constants.ts:150`, `suspicion.ts:122`).

Authored per night vs player-driven:

| Night | Authored | Player-driven |
|---|---|---|
| 1 (178 s) | 1 beat @104 s (a patrol, suppressed if one exists) | Lay 2 trails (≈10 s of input) |
| 2 (266 s) | 2 beats @232/358 s, both suppressed if a patrol is out | Claim 2 cracks, lay ≤3 trails |
| 3 (322 s) | 2 beats @500/598 s, final response @712 s + second spray @746 s | Claim 1 crack, lay ≤2 trails |

Total player input in a winning 788 s run: roughly 90 seconds of driving and laying, three `E`
presses. The remaining ~700 s is a fixed metronome the player watches.

The one thing the player's choices carry across a boundary is the suspicion peak — and the peak
floor is `0.55 × peak` (`constants.ts:116`), which in the winning run means the night-3 floor is 55
and the value is already pinned at 100 anyway. So even that channel is closed by night 3.

### 4. Do quantities and caps create scarcity?

No. Measured cap-hit times for a normally-playing colony (seed 20260801, the project's own
"competently played run"):

| Cap | Value | First reached | Fraction of run |
|---|---|---|---|
| Population capacity | 14 (base) | **t = 89 s** | 11 % |
| `FOOD_CAP` | 200 | **t = 111.8 s** | 14 % |
| `WATER_CAP` | 160 | **t = 119.8 s** | 15 % |
| Post-cache `foodCap` | 320 | **t = 333 s** — held to t=788 s | 58 % of run at ceiling |
| Post-all-nests capacity | 52 | t = 721 s | 91 % |

What the game tells the player at that moment: **nothing about the cap**. The objective at t=111.8 s
reads `"Keep both food and moisture flowing."` (`director.ts:380`) — an instruction to keep doing the
thing that is now provably useless. In night 2 it becomes `"Build reserves — 319/120 food, 178/90
moisture"` (`director.ts:387`), which asks for 120 while displaying 319. The HUD meter simply reads
`320/320` (`hud.ts:122`) with no state for "this is full and your workers are wasting trips".

The regrowth arithmetic seals it: `dishCrumbs` initial 3600, measured consumption over a full night
of traffic ≈474, regrowth per night `0.3 × 3600 = 1080` (`director.ts:180-181`). Every resource node
in the game gains more per night than a maximal colony can strip from it.

### 5. Does each minute change the plan?

Beat table (`director.ts:41-80`) converted to absolute run seconds, with the measured night
boundaries (n1 0–178, interlude to 189.8, n2 to 455.9, interlude to 466, n3 to 788):

| Beat | Absolute t | Gap since previous |
|---|---|---|
| n1 @104 — patrol | 104 s | 104 s |
| n2 @42 — patrol | 231.8 s | 127.8 s |
| n2 @168 — patrol | 357.8 s | 126.0 s *(fired nothing: 2 patrols already out)* |
| n3 @34 — patrol | 500.0 s | 142.2 s |
| n3 @132 — patrol + spray | 598.0 s | 98.0 s |
| final response (`nightLength − 76`) | 712.0 s | 114.0 s |
| second spray wave (`finalResponseTime > 34`) | 746.0 s | 34.0 s |

Mean gap **112 s**; longest **142 s**. `GAME_CONTRACT.md:126` budgets "mandatory wait with no
decision ≤ 3 s". The longest *measured* no-decision stretch is worse than the beat gap: from
t=111.8 s (all caps hit) to t=189.8 s (night 2 unlocks cracks) is **78 continuous seconds** in which
every meter is pinned, no beat fires, and the objective text does not change.

### 6. Is route geometry strategically relevant late?

No — it becomes strictly set-and-forget after the first lay.

- **Decay cannot beat traffic.** A linked route loses `dt × 0.4` life per node (`pheromone.ts:243`).
  A worker within ±2 nodes restores `NODE_REINFORCE = 7.5 /s` (`workers.ts:183-188`,
  `constants.ts:41`) — **18.8× the decay rate**. Measured after 160 s of hands-off play:
  `nodes=24, linked=true, minLife=129.6/130`. Not one node lost measurable life.
- **The only thing that unlinks a route is the source depleting** (`pheromone.ts:296-298`), and D4
  shows depletion cannot happen.
- **Hazards do not force re-routing.** Workers steer around armed hazards with a `radius × 1.9`
  avoidance push (`workers.ts:326-339`), so a trap on a live line costs throughput the player never
  has to spend, not the line itself. Measured end state: 6 hazards live, 3 with capacity remaining,
  linked-route count unchanged since t=510 s.
- **Exposure aversion works against replanning.** `EXPOSURE_AVERSION = 0.7` (`constants.ts:190`,
  `workers.ts:506`) makes the colony prefer the safe line the player already drew, so the safe line
  gets more traffic, which reinforces it harder, which makes it more permanent.

Net: the strategic layer the contract calls "the game's differentiator"
(`GAME_CONTRACT.md:32-35`) is exercised for ~40 seconds of a 13-minute run and then frozen.

### 7. Why replay with a different strategy?

There is no reason, because there are **no mutually exclusive choices anywhere in the game**:

- **Which cracks to claim** — all three are required to win (`director.ts:242-249`) and all three are
  affordable at once (140/82 vs 200/160 held from t=112 s). Not a choice.
- **Which resources to tap** — 8 nodes, ~2 needed; 3 untouched in a winning run, 6 untouched in the
  walk-away run. Not a choice.
- **Covered vs open route** — covered is strictly dominant. The project's own test asserts
  `covered.peak < 5` vs `open.peak > 18` for identical endpoints (`balance.test.ts:101-102`), and
  workers additionally *prefer* the covered line (`workers.ts:506`). An open route buys nothing.
- **Sprint** — costs stamina and `noise: 0.6/s` suspicion (`constants.ts:138`); the full winning run
  was completed with zero sprint input. Not a choice.
- **Erase / recall** — no run needs it; nothing forces a teardown.
- **Route slots** — 5 available, 2 sufficient (D19). Not a choice.

The only run-to-run variable is *how quickly you press `E` three times*, and even that is
unlock-gated to nights 2, 2 and 3.

---

## REDESIGN OPTIONS, ranked

**R1 — Make reserves spend continuously, not once (fixes D1, D2, D3, D13, D17, D18).**
The root cause of the whole audit is that food and water have three sinks, two of which the player
does not control. Introduce a per-second sink the player sizes: e.g. every claimed satellite has an
upkeep proportional to its distance from home, and brood becomes a *rate the player sets* rather
than an automatic timer. Concretely: replace the `bankingFirst` heuristic (`colony.ts:85-87`) with a
player-chosen brood/stockpile split, and make `capacity` cost water per second rather than being
free. Target: the food meter should oscillate for the entire run, never pin. Verification is cheap —
re-run the instrumented script and assert `food < foodCap` for ≥90 % of samples.

**R2 — Delete the caps, or make hitting them a loss-shaped event (fixes D1, D2).**
`FOOD_CAP`/`WATER_CAP` currently convert 58 % of a run into discarded deliveries with no feedback.
Either remove them and let stockpile size itself be the risk (a big larder is a big smell — feed it
into `SUSPICION_WEIGHTS`), or keep them and make overflow *actively bad*: spilled food on the floor
is evidence the humans find. Both turn D2 from a dead zone into a decision. The second is closer to
the existing fiction.

**R3 — Make resources finite within the run (fixes D4, D5, D19).**
Current node amounts (3600–7200) exceed lifetime consumption by ~7×, and `NIGHT_RESOURCE_REGROWTH
= 0.3` refills more than a night costs. Drop node amounts to roughly one night of colony demand
(order 400–700 at current throughput) and make regrowth a *fraction of what was left*, not of
`initial`. That single change makes all 8 nodes matter, makes MAX_ROUTES bind, gives the player a
reason to scout the far/lit nodes, and gives night 2 and 3 a real reason to exist.

**R4 — Make escalation continuous instead of edge-triggered (fixes D6, D7, D9).**
`requestResponse` fires once per rising tier edge (`director.ts:142-147`), so the household stops
responding at t≈348 s. Replace with a pressure model: response *density* is a function of the current
suspicion value, so a pinned meter means a continuously escalating kitchen. Simultaneously drop
`NIGHT_SUSPICION_FLOOR` (D7) so a stealth player's meter is their own work, not a gift. This is the
change that makes the second half of a run react to the player at all.

**R5 — Make routes perishable under pressure (fixes D8, D9).**
`NODE_REINFORCE = 7.5` against a `0.4/s` linked decay makes a used route immortal. Either cut
reinforcement below the decay rate for *exposed* nodes only (a lit route needs re-walking, a covered
one does not — this makes geometry a maintenance cost, not a one-time cost), or have hazards and
sprays destroy pheromone in their radius. Today a trap on a line is free; it should cost the player
a re-lay.

**R6 — Introduce one genuine either/or per night (fixes D14, D15, and the replay question).**
The cheapest version that fits the existing data model: make the three cracks compete rather than
accumulate — a crack can host *one* of brood / cache / escape, chosen at claim time, and there are
more cracks than the colony can afford. `NestSpec.upgrade` (`kitchen.ts:189`) is already a field;
make it a claim-time argument to `doInteract` (`colony.ts:278-301`) and make `winCriteria.nests`
count functions rather than requiring all cracks. That produces four distinct viable builds with one
day of work and no new systems.

**R7 — Re-author the beat table against measured gaps (fixes D10, D11, D12).**
Six beats over 788 s cannot carry a 13-minute session. At minimum: remove the
`if (w.patrols.length === 0)` suppression (`director.ts:44-71`) so authored beats always land; add
beats in the measured dead zones (t=112–190, t=358–500); and stop interpolating live numbers into
`world.objective` (`director.ts:387`) so the one line answering "what now" stops flickering 140 times
a night.

**R8 — Retire dead state (fixes D16, D17).**
`colony.upgrades.escape` is written and never read. The brood meter occupies prime HUD space for a
value with no player verb. Both should either gain a consumer or be deleted; shipping a meter the
player cannot influence teaches them that meters are decorative, which undermines every meter that
does matter.

---

## Method

- Sim re-run headless via `vitest` with a scratch config; **no file under `src/`, `tests/` or any
  `.md` contract was modified.** Instrumentation lived entirely in scratch test files that import
  the shipped `stepWorld` and the shipped `tests/unit/helpers.ts` drivers.
- **Run A (competent):** exact input script from `tests/unit/balance.test.ts:207`, seed 20260801,
  sampled every simulated second. Outcome `won` at t=788.7 s, pop 52, food 317.6, water 219.8,
  1185 deliveries, suspicion peak 100.
- **Run B (walk-away):** same seed, two covered trails laid by t=9.8 s, scout parked in cover at
  (300, 2000), zero input thereafter. Outcome `lost / notEstablished` at t=788.2 s, pop 13,
  657 deliveries, `food:true water:true survived:true` on the win card.
- **Run C (food-only):** same seed, one food trail, no water line. Outcome `lost / collapse` at
  t=276 s.
- **Route persistence:** one trail laid, 160 s hands-off, node lives sampled.
- Sink enumeration by exhaustive grep of every assignment to `colony.food` / `colony.water` /
  `population` / `capacity` / `upgrades.*` / `reserve` across `src/`.
