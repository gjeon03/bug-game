# Audit 03 — Household threats and encounter design

Read-only audit of `src/sim/threats.ts`, `suspicion.ts`, `director.ts`, `exposure.ts`,
`constants.ts`, `kitchen.ts`, `tests/e2e/threats.spec.ts`, plus the renderer's telegraph paths.

**Method.** Static reading plus five instrumented headless runs (scratchpad probes, not committed;
they wrap `stepWorld` and attribute every threat spawn to either the authored beat clock or an
evidence tier crossing). Probe transcripts are quoted inline as `[PROBE x]`.

---

## OBSERVABLE DEFECTS

| # | Symptom | Evidence | Sev | Conf |
|---|---------|----------|-----|------|
| D1 | In a **winning** run, 13 of 14 threat spawns are clock-driven. The evidence director contributes one event in 13 minutes. | `[PROBE F]` cautious run, seed 31337: `CLOCK=13 EVIDENCE=1`; only spawn attributable to the player is `t=600.8s hazard x2`. | S1 | High |
| D2 | Escalation staircase collapses. Tiers 2→3→4 all fire inside 15 s, so the player never sees a tier's response before the next arrives. | `[PROBE G]` aggressive: `t=191.1 TIER 1->2`, `t=197.5 TIER 2->3`, `t=206 TIER 3->4`. Nothing in `updateSuspicion` (`suspicion.ts:127-142`) rate-limits crossings. | S1 | High |
| D3 | After tier 4 the director is permanently silent. Suspicion pins at `SUSPICION_MAX` and there is no tier 5. | `[PROBE G]`: last evidence spawn `t=206`, run ends `t=740`. 534 s with 3 clock patrols. `TIER_THRESHOLDS` (`constants.ts:117`) has 4 entries; `requestResponse` `default: break` (`threats.ts:446`). | S1 | High |
| D4 | Suspicion is a **global scalar with no spatial memory**. `addSuspicion(world, cause, amount, x, y)` discards `x,y` — it lands in an event and nowhere else. | `suspicion.ts:51-75`: `x,y` used only in `world.events.push`. `SuspicionState` (`types.ts:254-268`) has no positional field. Continuous causes pass literal `0,0` (`suspicion.ts:87, 96, 109`). | S1 | High |
| D5 | A tier crossing can be **silently swallowed**. `handleEscalation` clears `pendingTier` before calling; `requestResponse` early-returns on a patrol/spray count guard and never retries. The HUD still promised the response. | `director.ts:144-146` (`world.pendingTier = -1` then call) + `threats.ts:426` (`if (patrols.length >= 3 \|\| sprays.length >= 3) return`). The `\|\|` also lets 3 live patrols block *trap* deployment. | S1 | High |
| D6 | One threshold can fire the same response **repeatedly**. `reachedTier` is written but never read, so a tier that decays below its threshold and is re-crossed re-runs `requestResponse`. | `suspicion.ts:143` is the only write; grep shows no read outside `tests/unit/strategies.test.ts:43`. `[PROBE C]`: 2 rising edges of tier 1 → 2 patrols from one threshold. Contradicts `threats.ts:423` ("never double-spawned"). | S1 | High |
| D7 | Final response is an **unbounded spray conveyor**: the condition is re-evaluated every frame, so 2 clouds are maintained continuously for the last ~76 s, always on the same authored path. | `director.ts:118-122` (`if (finalResponseTime > 34 && sprays.length < 2) spawnSpray(world, 2)`). `[PROBE F]` sprays at `t=746, 746, 758.9, 771.9, 784.8` — one per ~13 s. | S2 | High |
| D8 | **Hazards are immortal.** Nothing ever removes an entry from `world.hazards` — not the interlude, not age, not capacity exhaustion. | `beginInterlude` clears corpses/patrols/sprays/footfalls (`director.ts:158-163`) but not hazards. Repo-wide grep: the only mutations are two `push` sites in `threats.ts`. Full traps explicitly persist (`threats.ts:267-270`). | S2 | High |
| D9 | Consequence: once `MAX_HAZARDS`(12) is reached against 14 authored sites, `deployTraps`/`deployBait` become no-ops, so tiers 2–4 lose their only non-patrol response. | `threats.ts:87, 123` break on the cap; `threats.ts:71, 110` also exclude sites within 200/240 of any existing hazard, including inert ones. | S2 | Med |
| D10 | Trap siting claims to follow "player traffic" but actually scores **trail geometry**. `route.traffic` — the real worker count — is never read. | `threats.ts:73-80` sums nodes every 2nd index; comment at `threats.ts:66` and `threats.ts:31-33` claim traffic. `[PROBE E]`: a route with `traffic: 6` and one with 0 score identically per node. | S2 | High |
| D11 | `Spray.targeted` decides whether sheltering in a crack saves the colony, and it is **invisible**. Grep for `targeted` outside `sim/threats.ts`+`types.ts` returns nothing. | `threats.ts:380-395` (`sheltered` checks `s.targeted`); `renderer.ts:842-871` draws every cloud identically. | S2 | High |
| D12 | Tier 4 is unavoidable-by-construction against a home-only colony: on every night at least one targeted cloud passes inside `SPRAY_FLUSH_RADIUS` of the home crack, and no other claimed crack is within panic reach. | `threats.ts:442-443` picks paths `night%3` and `(night+2)%3`; `baseboardSweep` point `(260,2040)` and `homeSweep` `(190,2050)` are 92 / 23 units from home `(168,2042)` vs flush radius 150 (`constants.ts:221`). Panic refuge reach is 680 (`workers.ts:269`); nearest other crack is 807 away. | S2 | Med |
| D13 | Suspicion cannot be ground to zero, but **every tier is reversible**, including tier 4 — the peak floor (0.55) is below every threshold once value caps at 100. | `suspicion.ts:122` `floor = max(NIGHT_FLOOR, peak*0.55)`; `SUSPICION_PEAK_FLOOR=0.55`, `SUSPICION_MAX=100` → max floor 55 < 70 < 90. `[PROBE D]`: peak 90 decays 90→61.5 and tier 3→2 in 300 s. | S2 | High |
| D14 | Cautious play sits **pinned to the night floor**, so suspicion is a constant, not a dial. | `[PROBE B]` (routes only, no claims): peak 22.0, tier 0 for all three nights — exactly `NIGHT_SUSPICION_FLOOR[3] = 22` (`constants.ts:150`). | S2 | High |
| D15 | Doing literally nothing still produces the entire night-1/2 threat schedule, and the meter never moves. | `[PROBE A]` zero-input run: `patrols: 2` at `t=104` and `t=231`, `suspicion: 0.08`, `tier 0`. | S3 | High |
| D16 | Traps and bait produce almost no casualties because workers path around them; the cost is invisible throughput loss with no feedback. | `workers.ts:322-331` avoidance radius `hazard.radius * 1.9`. `[PROBE G]` (worst-case play, 4 hazard deployments): `trapsSprung: 3` across a whole run. | S3 | High |
| D17 | E2E coverage asserts only that *something* spawned; it cannot detect D1/D2/D5/D6. | `threats.spec.ts:70-72`: `patrols > 0 \|\| hazards > 0`. `strategies.test.ts:273` asserts `cautious.tier < 4` — passes at tier 2, so the whole evidence chain is unexercised on the win path. | S3 | High |

---

## Findings

### 1. Authored attack timings

`BEATS` (`director.ts:41-80`) is the entire authored table. All five entries key on `world.nightTime`
and nothing else; the guard is only `if (w.patrols.length === 0)`.

| Beat | Trigger | Driver |
|---|---|---|
| `night 1, at 104` — patrol `fridgeRaid` | `nightTime >= 104` | Clock |
| `night 2, at 42` — patrol | `nightTime >= 42` | Clock |
| `night 2, at 168` — patrol | `nightTime >= 168` | Clock |
| `night 3, at 34` — patrol | `nightTime >= 34` | Clock |
| `night 3, at 132` — patrol + `spawnSpray(w, 1)` | `nightTime >= 132` | Clock |
| Final response (`director.ts:107-117`) | `night 3 && nightTime >= nightLength - 76` | Clock |
| Final second wave (`director.ts:118-122`) | `finalResponseTime > 34 && sprays.length < 2` | Clock, **re-armed every frame** (D7) |
| `requestResponse(tier)` (`threats.ts:424-449`) | `pendingTier` rising edge | Player |

Player-driven is one function. Everything else is a stopwatch.

### 2. Suspicion → threat mapping

A single scalar `world.suspicion.value` (0–100) crosses `TIER_THRESHOLDS [25, 50, 70, 90]`, and the
crossing index is switched on:

```
tier 1 → 1 patrol                          (threats.ts:428-430)
tier 2 → 2 traps + 1 patrol                (threats.ts:431-434)
tier 3 → 2 traps + 1 bait + 1 patrol       (threats.ts:435-439)
tier 4 → 2 targeted sprays + 1 trap        (threats.ts:440-445)
```

It is **global, not regional** (D4). The household never learns *where* the player was active from
suspicion. The only "where" in the whole system is `deployTraps`/`deployBait` reading the *current*
`world.routes` node array at the instant of the crossing (`threats.ts:73-80, 112-118`) — a snapshot,
not a memory, and one that decays with `NODE_LIFE` (130 s). Erase a route 3 seconds before a tier
crossing and the household has forgotten it entirely.

### 3. Per-threat scorecard

Scores 0–5. **Leg** = legibility (can the player read what is about to happen and why).
**Ctr** = counterplay (is there an action that changes the outcome).

| Threat | Anticipation | Telegraph | Decision window | Impact | Persistent consequence | Recovery | Leg | Ctr |
|---|---|---|---|---|---|---|---|---|
| **Patrol** | `lightOn` event + `roomLight` lerps in over ~0.3 s at k=3.4 (`threats.ts:63, 237-238`) | Room brightens; cone `coneRange 900` follows facing (`exposure.ts:20-31`) | Full traversal, 236–288 u/s over an authored path | None directly; raises exposure → `spotted` | None; patrol is spliced on finish (`threats.ts:231-234`) | Instant — light off | **4** — authored paths are learnable and the light is the loudest cue in the game | **3** — hide/re-route works, but the player cannot see *which* of the 5 paths spawned until it is on top of them |
| **Room light** | Bundled with patrol | `roomLightTarget = lightPower*(0.42+0.08*night)` | Same as patrol | Multiplies exposure everywhere | None | Exponential decay | **4** | **2** — global, so there is nowhere it does not apply; the only counterplay is stop moving |
| **Footfall** | `panicWorkers` fires on the telegraph, so the colony visibly scatters first (`threats.ts:165-168`) | Contracting dashed ellipse 300→122 + growing pressure shadow (`renderer.ts:878-905`) | `FOOT_WARN_TIME 1.15 s`; scout covers 250 u walking, 462 u sprinting vs `FOOT_KILL_RADIUS 122` | Instant kill inside 122 (`threats.ts:397-421`) | Corpse → `corpse` suspicion while uncovered | Scout respawns in 2.6 s from colony stock | **5** — best-authored moment in the game | **4** — genuinely dodgeable; loses a point because workers, not the player, absorb most of it |
| **Trap** | **None.** It materialises at the tier crossing. | Dashed rectangle for `TRAP_ARM_TIME 2.2 s` (`renderer.ts:791-803`) | 2.2 s, but only if the player happens to be looking at that part of a 3600×2600 kitchen | 1 worker held `TRAP_STRUGGLE_TIME 4.4 s` then dies; capacity 3 | Inert-but-visible forever (D8); blocks re-siting within 200 u (D9) | Re-route; workers auto-avoid at 1.9× radius | **2** — arrival is unannounced and off-screen | **2** — avoidance (`workers.ts:322-331`) makes it near-harmless (`trapsSprung: 3` in the worst run) and therefore decision-free |
| **Bait** | None | Green pool, `TRAP_ARM_TIME*1.4 = 3.08 s` unarmed | 3.08 s + `BAIT_DPS 0.12/s` gives ~8 s expected survival inside | Slow kill + panic (`threats.ts:303-320`) | Permanent denial zone | Leave the radius | **3** — the pool reads clearly once seen | **2** — same avoidance problem; it denies 74 u of floor in a room 3600 wide |
| **Spray** | `sprayStart` event only | Cloud + hard leading edge (`renderer.ts:865-871`); workers panic at radius+380 ≈ 3 s of lead | Cloud moves 128 u/s, lethality ramps over 1.1 s | `SPRAY_DPS 0.8/s`, drains home integrity at 0.032/s within 270 u | Nest integrity (repairs at 0.03/s, `colony.ts:119-120`) | Shelter in a claimed crack — **unless** `targeted` | **2** — the one bit that decides whether shelter works is not drawn (D11) | **2** — depends entirely on owning a second crack within 680 u of the sweep; the home corner has none (D12) |

### 4. Do attacks react to the player?

Both, but the mix is inverted. Measured spawn attribution:

| Run | CLOCK | EVIDENCE | Outcome |
|---|---|---|---|
| Idle, no input `[PROBE A]` | 2 | 0 | lost n2, tier 0 |
| Cover-hugging, no claims `[PROBE B]` | 6 | 0 | n3, tier 0, peak 22 |
| **Full cautious (wins)** `[PROBE F]` | **13** | **1** | won, tier 2, peak 58.5 |
| Full aggressive (loses) `[PROBE G]` | 3 | 7 | lost, tier 4 at t=206 |

The reactive system only engages when the player is already losing. On the intended-success line it
is 7 % of the pressure. Worse, the two curves are inverted in time: the aggressive player's entire
household response is spent before minute 4 and the last 9 minutes are quieter than the cautious
player's.

### 5. Decisions or casualties?

The player has exactly three verbs (`sim.ts:31-38`): move the scout, lay/erase pheromone, interact.
Against a live threat only *move* is real-time; laying a new route takes 30–45 s of scout travel, so
it is a between-encounter decision, not an in-encounter one.

- **Footfall** is a real decision — 1.15 s, legible, dodgeable (D-scorecard row 3).
- **Patrol** is a positioning decision made ~10 s before it matters.
- **Trap / bait** produce no decision at all: workers avoid them automatically, so the "choice" is
  made by `workers.ts:322-331` on the player's behalf. Measured casualty count is 3 per run (D16).
- **Spray** is a decision only if a second crack was claimed earlier; at the moment the cloud
  appears there is nothing to do but watch.

Nothing in the threat set asks the player to spend a resource, abandon a position, or trade one
objective against another under time pressure.

### 6. Variety escalation

None. Three families (patrol / hazard / spray) at four tiers, differentiated by count and by
`night`-scaled scalars: patrol speed `210 + night*26`, room light `0.42 + 0.08*night`
(`threats.ts:52, 221`), and the `PATROL_PATHS` night filter (`threats.ts:42`). Content ceiling is 5
patrol paths + 3 spray paths + 14 trap sites. Night 3 tier 4 is night 1 tier 4 with a faster walker.

### 7. Grinding suspicion down

Cannot reach zero (`floor = max(NIGHT_SUSPICION_FLOOR[night], peak * 0.55)`, `suspicion.ts:122`) —
that part works. But every *tier* is reversible, because 0.55 × 100 = 55 is below thresholds 70 and
90 (D13). `[PROBE D]`: from a peak of 90, the meter falls to 61.5 and the tier drops 3 → 2 in 300 s
of quiet. Combined with D6 (`reachedTier` never read), the intended one-way ratchet is a sawtooth
that can re-spawn the same response indefinitely.

### 8. Unavoidable combinations

- **Tier-4 targeted spray over the home crack** (D12). Flush radius 150 vs 23–92 u path proximity;
  `sheltered()` returns false, and panic refuge reach 680 < 807 to the nearest alternative crack.
  Counterplay exists only for a player who claimed `crackWall` (night 3, 54 food / 34 water) — which
  itself costs +7 `expansion` suspicion and helps cause the tier 4 it defends against.
- **Swallowed tier** (D5). Three live patrols make a tier-4 crossing evaporate. The player is told
  "the spray comes out" (`suspicion.ts:37`) and nothing happens — an *unavoidably absent* threat,
  which is the same legibility failure in the other direction.
- **Final-response conveyor** (D7): 2 clouds maintained for 76 s on `homeSweep`, with no budget or
  cooldown. Survivable in practice (`[PROBE F]` won), but by attrition, not by any decision.

---

## PROPOSED PRESSURE MODEL

A hybrid director: the **clock guarantees a floor** of authored teaching moments, the **evidence
grid decides where and what**, and a **budget with cooldowns decides when**. Nothing spawns outside
the budget, so the tier-collapse (D2) and the conveyor (D7) become structurally impossible.

### A. Regional evidence heat

Keep the global scalar (it is already in the HUD contract and drives tiers); add a grid that decides
*targeting*. 400 u cells over 3600×2600 → **9 × 7 = 63 cells**.

```ts
// world.ts
interface HeatGrid {
  heat: Float32Array;      // 63, current
  peak: Float32Array;      // 63, high-water mark — the household's long memory
  cause: Uint8Array;       // 63, dominant SuspicionCause index, for the HUD and the reaction card
  cols: 9; rows: 7; cell: 400;
}
```

`addSuspicion(world, cause, amount, x, y)` deposits into the grid instead of discarding `x,y`:
0.60 into the containing cell, 0.10 into each 4-neighbour. Continuous causes must stop passing
`(0,0)` — `traffic` deposits per worker at the worker's position (`workers.ts:394`), `droppings`
per exposed node (`pheromone.ts:315`), `corpse` at the corpse.

Decay: `heat[i] = max(peak[i] * HEAT_PEAK_FLOOR, heat[i] - HEAT_DECAY * dt)` with
`HEAT_DECAY = 0.05/s`, `HEAT_PEAK_FLOOR = 0.30`. Slower than the global meter (0.1/s) on purpose:
the household forgets *how bad* faster than it forgets *where*.

Consumers:
- `deployTraps` / `deployBait`: rank sites by `heat[cellOf(site)] * 1.0 + routeTrafficNear(site) * 0.6
  + (1 - coverAt(site)) * 0.2`, where `routeTrafficNear` sums `route.traffic` (fixes D10) for linked
  routes with a node within 190 u. Drop the node-count term entirely.
- Patrol path selection: score each `PATROL_PATHS` candidate by mean heat under its polyline, pick
  the argmax instead of `index % candidates.length` (`threats.ts:44`).
- Spray path selection: same, replacing `night % SPRAY_PATHS.length` (`threats.ts:442`).
- HUD: the interlude card names the hottest *cell* ("they have been looking under the island"),
  which is the missing feedback that makes re-routing a legible strategy.

### B. Threat budget and cooldowns

```ts
interface DirectorState {
  budget: number;            // threat points
  gap: number;               // seconds until the next spend is allowed at all
  cd: Record<ThreatKind, number>;
  active: Record<ThreatKind, number>;
  lastKind: ThreatKind | null;
}
```

```
BUDGET_REGEN  = { 1: 0.55, 2: 0.85, 3: 1.15 }  // points/s
BUDGET_CAP    = { 1: 26,   2: 40,   3: 55   }
GLOBAL_GAP    = { 1: 26,   2: 19,   3: 14   }  // seconds between ANY two spends
```

Regen is additionally scaled by `0.6 + 0.4 * suspicionFraction(world)` so evidence controls *rate*,
while tier controls *unlocks*. A cautious player at tier 1 still gets a rising floor of pressure
(fixes D1, D14); an aggressive player cannot buy the whole catalogue in 15 s (fixes D2).

| Kind | Cost | Cooldown | Max concurrent | Min tier | Notes |
|---|---|---|---|---|---|
| `patrol` | 12 | 40 s | 2 | 0 | path chosen by heat |
| `spotlightHold` | 6 | 30 s | 1 | 1 | modifier on a live patrol |
| `trapPair` | 8 | 55 s | 6 hazards | 2 | 2 traps, heat-sited |
| `trailWipe` | 9 | 70 s | 1 | 2 | new family, see D |
| `bait` | 11 | 90 s | 3 hazards | 3 | |
| `sourceSealed` | 14 | 110 s | 2 | 3 | new family, see D |
| `sweep` (untargeted) | 18 | 75 s | 1 | 3 | |
| `nestProbe` (targeted) | 26 | 120 s | 1 | 4 | replaces the tier-4 double-spray |

Selection each tick: filter by `tier`, `cd`, `active`, affordability; exclude `lastKind`; pick the
highest-cost affordable option (so saved budget reads as a bigger event). Spend → `budget -= cost`,
`cd[kind] = cooldown`, `gap = GLOBAL_GAP[night]`.

This also fixes D5 (an unaffordable choice defers rather than being dropped — the request stays in
the budget) and D6 (drive spending from `reachedTier`, never from the reversible `tier`; the
sawtooth then only affects the HUD label, not spawns).

Hazards get `ttl` — `night` expiry at the interlude for traps, plus removal at `capacity <= 0 &&
age > 25` — fixing D8/D9.

### C. Encounter template

Every threat, new or existing, must fill all six slots. Concrete targets:

| Slot | Requirement | Example: `nestProbe` |
|---|---|---|
| Anticipation | ≥ 6 s of *diegetic* pre-warning, off-screen-safe (HUD arrow + audio) | Footsteps + a HUD bearing to the crack being walked toward, 8 s out |
| Telegraph | On-screen shape naming the affected ground | Crosshair ring on the target crack; the cloud is drawn **red-tinted when `targeted`** (fixes D11) |
| Decision window | ≥ 3 s in which a player action changes the outcome | 8 s to walk the scout into the crack and trigger an evacuation |
| Impact | Bounded, attributable, ≤ 25 % of colony per event | Flush + `SPRAY_DPS` on anything still inside |
| Persistent consequence | Something that outlives the event | Nest integrity −0.25, and that crack is `probed` for the rest of the night: shelter there is worth half |
| Recovery | An affordable path back | `NEST_REPAIR_RATE` plus a one-off 12-food "re-seal" interact |

Retro-fits required by this template: **traps and bait need anticipation** — emit a
`threat:incoming` beat 6 s before placement with a world marker, so the player can pre-emptively
erase the route (currently there is nothing, scorecard row 4). **Sprays need a targeted tell**
(D11). **Patrols need to announce which path** — a 4 s "door" cue at the path's first point.

### D. New families (variety, fixes D3/D6)

Two reuse existing systems and cost no new lethality:

1. **`trailWipe` (tier 2+).** A human walks the hottest route corridor with a cloth and removes
   pheromone nodes (`ERASE_RATE`-equivalent) instead of killing. Anticipation 6 s, telegraph = a
   lit corridor along the affected route, decision window = the wipe takes 20 s to traverse so the
   player can re-lay behind it, impact = throughput loss, consequence = that corridor's heat is
   *reset* (a real reward for accepting the loss), recovery = re-lay elsewhere. This is the missing
   threat that attacks the player's actual asset — routes — rather than bodies.
2. **`sourceSealed` (tier 3+).** The hottest food/water node is put away: `unlockNight`-style
   unavailability for 90 s, announced 10 s ahead. Forces the re-route decision the game currently
   never asks for, and makes `HARVEST_SLOTS`/route planning matter under pressure.

And a **tier 5 (`threshold 100`, "They're moving out the furniture")** so the meter has somewhere to
go after 90 (fixes D3): budget regen ×1.6, `nestProbe` cooldown halved, patrols gain
`spotlightHold`. Ceiling-out should read as an ongoing state, not silence.

### E. Verification hooks the current tests lack

- Assert the CLOCK/EVIDENCE spawn ratio on the cautious win path is ≥ 40 % evidence (D1, D17).
- Assert no two spends occur within `GLOBAL_GAP[night]` (D2).
- Assert `sum(spawns)` over a run is within ±15 % of `budgetSpent / meanCost` (D7).
- Assert a route erased 5 s before a tier crossing still draws traps to its historical corridor
  (D4 — proves heat is a memory, not a snapshot).
- Assert every hazard is gone by the start of the next night (D8).
