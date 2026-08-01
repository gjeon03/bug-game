# Gameplay critique — independent pass

Run against commit `115e738` by a reviewer that did not design or build the game, was given
`GAME_CONTRACT.md`, `PLAYTEST_REPORT.md`, the whole of `src/sim/`, and the evidence package, and was
explicitly told to separate observable symptom from guessed cause. Read-only; it wrote nothing into
the repository.

**Method.** Read the design docs and the full simulation source. Ran `npx vitest run` (54/54 passing
at the time, and the reviewer noted they covered none of what follows). Then ran its own headless
probes by importing `src/sim/*` directly and stepping `stepWorld` at `SIM_DT`: an exposure field
sampled on a 20-unit grid over 12,112 walkable points; three night-1 runs with covered / naive /
deliberately-open routes; a full three-night run replicating `fullrun.spec.ts` waypoints at seed
20260801; an instrumented collapse run with per-cause death counts; targeted probes for depletion
timing, satellite-route range, brood spawn destination, route eviction, soft-lock and night-1 dead
time; and an "expert" bot with home-anchored routes.

> **Headline: the game cannot be won, and the pheromone system — its stated differentiator — has
> almost no mechanical consequence. Both are measured, not inferred.**

## Findings

### 1 — The colony always starves out in night 2. The game is not winnable. (High, very high confidence)

Driving the exact route the win spec drives, seed 20260801:

```
[night2 start] t=190 pop=14 food=183 water=155   routes linked: 0
[n2 built]     t=202 pop=19 food= 86 water=102
[n2+90]        t=293 pop=29 food= 75 water= 26
[n2+135]       t=338 pop=32 food= 28 water=  2   routes: []
[n2+225]       t=428 pop= 9 food=  0 water=  0
[END]          t=604 status=lost loseCause=collapse
deaths by cause: {thirst:20, starve:3, foot:3}
```

Peak suspicion for the entire run: 25.1. "Nothing killed this colony except its own arithmetic."

### 2 — Nodes stripped bare in ~60 s, permanently, silently taking the route with them. (High)

`dishCrumbs` (240 food) depleted at **t = 61 s** of a 178 s night; `sinkDrip` at t ≈ 131 s;
`islandDrop` at 289; `pantryGrain` at 329. By t = 338 there were zero routes and zero live reachable
resources. Cause: throughput ≈ `WORKER_CARRY_FOOD` per ~12 s round trip per worker, 4–6 food/s at
8–12 workers, against a 240-unit node; `nearestResource` then skips depleted nodes so the route
unlinks and `releaseWorkers` fires; and `startNight` skipped depleted nodes so a drained source never
returned. Noted that `PLAYTEST_REPORT.md` claimed this was already fixed.

### 3 — Routes anchored on a satellite nest are unusable. (High)

After claiming both night-2 cracks and laying routes from them, **21 of 22 workers** were outside
acquisition range of every linked route and all 22 sat `idle`. Measured distances from home:
`crackIsland` 1219, `crackPantry` 807, `crackWall` 3345, against a flat 420-unit filter. Compounding:
`spawnWorker` left `targetNest = null`, which resolved to the home nest, so a nymph born in the Brood
Chamber was **1269 units away at the home crack 30 s later** — "the Brood Chamber's own output
evacuates it."

### 4 — Route exposure has no mechanical consequence; a deliberately awful route was *safer*. (High)

Three night-1 runs, identical otherwise:

| route style | mean route exposure | cumulative droppings evidence | suspicion peak |
| ----------- | ------------------- | ----------------------------- | -------------- |
| covered (win-spec waypoints) | 0.067 / 0.102 | 0.56 | **4.50** |
| naive straight line | 0.097 / 0.067 | 3.02 | **4.51** |
| deliberately open | 0.174 / 0.207 | **23.16** | **3.16** |

Cause: every continuous evidence term was capped below `SUSPICION_DECAY = 0.36/s`. `droppings` maxed
at 0.22/s — "trails on bare tile can never raise suspicion, at any length, ever." `traffic` needed
≥ 8 workers above exposure 0.55, but only 3.9 % of walkable floor exceeds 0.55 and unlit open tile
caps at exactly 0.300. The `route-risk.json` "meaningfully riskier" route measured 0.129, below the
0.28 threshold at which a node counted as exposed at all — both routes in the repo's own evidence
scored zero.

> "The thesis 'every metre of ground you claim is a metre of evidence' is not implemented. The
> implemented rule is 'don't personally stand in the light.'"

### 5 — The suspicion HUD can never name traffic or droppings. (Medium)

`addSuspicion` gated the `lastCause` readout on `amount >= 0.05`. Per-step maxima at dt = 1/60:
traffic 0.020, corpse 0.018, noise 0.010, droppings 0.0037 — all below the gate, so the two labels
that exist specifically to explain route choice were unreachable strings.

### 6 — A player who plays well never sees traps or bait. (High)

Traps need tier 2 = 50 suspicion; careful play peaked at 4.5 in night 1 and 25 across a whole run.
So `deployTraps` — the one function where route geometry genuinely mattered — never executed, and the
contract's completion gate 3 failed for competent play.

### 7 — Soft-lock: population 0 with the scout alive. (High)

`checkLossConditions` required `population <= 0 && !scout.alive`. Measured 200 s of `status:
"playing"` with pop 0, food 60, water 0 and no path to recovery.

### 8 — Breeding cannot be throttled and eats the win condition. (High)

Brood ran whenever food ≥ 22 and water ≥ 12, so the colony spent every surplus down to 22/12 while
the win demanded 120/90. At pop 36 with the Brood Chamber: 1.84 food/s and 0.95 water/s consumed
against a measured gross income of ~1.21 food/s and ~0.85 water/s.

### 9 — Route eviction is silent, and one lay-press = one route. (Medium)

`newRoute` shifted the oldest route out with no event. Three taps along a single line created three
separate routes, so touching up a trail burned slots and could silently delete the water line.

### 10 — Losing the scout is nearly free and its cost is untracked. (Medium)

`tryRespawn` set `alive = false` directly instead of calling `killWorker`: no corpse, no
`colony.lost++`, no `workersLost++`, no event. The repo's own `scout-loss.json` showed
`beforePop 7, afterPop 7, workersLost 0` against a doc comment claiming it "costs a body".

### 11 — Nest destruction has zero counterplay. (Medium)

`home.integrity` was only ever decremented; no repair, block, decoy or relocation anywhere. Once tier
4 landed the outcome was decided by the spray path table.

### 12 — Night 1 has ~62 s of nothing. (Medium)

Population hit capacity at t = 89 s and reserves neared cap at t = 116 s against a 178 s night. A full
careful run logged `idleSeconds 511 / 604` (85 %). Pacing that *was* good: first move 0.37 s, first
trail 0.47 s, first delivery 15.2 s (budget 60 s), restart 226–252 ms (budget 2 s), no restart leakage.

### 13 — The three upgrades are not three distinct decisions. (Medium-high)

Food Cache works. Brood Chamber was net-negative (accelerated the starvation in finding 8, and its
spawn location was a liability). Escape Tunnel was nearly inert: panic only redirected workers within
700 units, and `crackWall` is 981 from `petBowl`, 2132 from `crackIsland`, 3345 from home.

### 14 — `PLAYTEST_REPORT.md` does not describe this build. (Medium, process)

Every cell of "Measured pacing" was `—`; the scenario table cited `run-win.json`,
`run-reckless-mid.json` and `run-loss.json`, none of which existed.

## Direct answers the reviewer gave

- **Is routing the differentiator?** Routing is mandatory, but *geometry* is not a decision. The only
  property that pays is length: `home→dishCrumbs` (L≈640) yields 0.48 food/s/worker versus
  `home→fridgeCondensation` (L≈3100) at 0.09 — a **5.3× penalty**. Exposure paid nothing. "The
  strategy the sim rewards is 'shortest possible straight line, ignore cover' — the inverse of the
  design intent."
- **Short+exposed vs long+covered?** Not a trade-off; short+exposed strictly dominates.
- **Silent failure modes?** Five: resource depletion with no remaining-amount readout, route unlink on
  depletion, satellite routes no worker can accept, silent route eviction, and the pop-0 soft-lock.
- **Rejected patterns creeping in?** Two: auto-breeding to capacity with no throttle (idle/incremental
  progression, and the thing that kills you), and a "watch meters, re-lay a trail when a number
  empties" loop.

## The three the reviewer would fix first

1. Make the resource economy solvent, and make depletion visible and reversible.
2. Make workers able to use the nests you paid for.
3. Make trail exposure outrank decay, and let it reach the player — then re-run the three night-1
   route-style probes and require the open route's peak to exceed the covered route's by a clear
   margin.

Dispositions for every finding are in `dispositions.md`.
