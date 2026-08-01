# GAME_CONTRACT — Baseboard Empire

Superseded by `REDESIGN_CONTRACT.md` where the two disagree. This file describes the game as it now
ships.

## Player-experience thesis

_You secretly turn a lived-in human kitchen into a cockroach domain, and every success teaches the
household exactly where to exterminate you._

## Player fantasy

You are not "a small bug dodging things". You are the **logistics mind** of an infestation: you
personally walk every route your colony will use, and the routes you choose are the story of how the
humans find out about you.

## Core verbs

| Verb                | Input                 | Meaning                                                                  |
| ------------------- | --------------------- | ------------------------------------------------------------------------ |
| **Skitter**         | `WASD` / arrows       | Move the lead scout. Fast, fragile, wall-hugging.                        |
| **Lay trail**       | hold `LMB` or `Space` | Secrete a pheromone route from the scout's own body as you walk.         |
| **Erase / recall**  | hold `RMB` or `X`     | Dissolve trail near the scout; tap to recall all workers to the nest.    |
| **Inspect / build** | `E`                   | Claim a crack, fit out a foothold, repair a nest, or inspect a source.   |
| **Choose**          | `1` `2` `3`           | Answer a one-of-three choice: an adaptation, or what a foothold becomes. |
| **Sprint**          | hold `Shift`          | Emergency burst. Costs stamina, spikes exposure, adds noise evidence.    |
| **Pause / restart** | `Esc` / `R`           | Pause menu, settings, one-key restart.                                   |

## Primary differentiator

**The pheromone route is drawn by the scout's own body.** You cannot paint a route on ground you have
not personally walked. Scouting _is_ routing. A dangerous shortcut is dangerous for you first, and it
becomes dangerous for every worker that follows it afterwards.

Workers are never selected, ordered or clicked. They only ever read pheromone.

## Session arc — four operations, ~15–18 minutes

There is no night clock. An operation ends when the player **achieves** its gates. Each operation
carries a soft time limit; overrunning it makes the household restless rather than ending the run.

| Operation                          | Gates                                                     | Introduces                                                        |
| ---------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| **1 — Establish the nest**         | 1 food line · 1 moisture line · 12 roaches                | Movement, cover, routing, first delivery, first hatch             |
| **2 — Infiltrate the routines**    | Exploit 2 household routines · claim 1 satellite foothold | Household events as timed opportunities; footholds; regional heat |
| **3 — Specialise the infestation** | 3 adaptations · 2 foothold functions · 26 roaches         | Opportunity cost; the household's mid-tier responses              |
| **4 — Claim the kitchen**          | Hold 3 regions at once · survive the extermination        | Territory; the final high-risk push                               |

## Territory — what the run is actually won with

Eight semantic regions (sink run, dishwasher, pantry, stove, refrigerator, island, bin corner, hall
doorway) each carry a **hold** meter. Hold rises while the colony has both a live trail and working
roaches inside the region, and falls while the household cleans, sprays or lights it. Three regions
held at once, through the extermination response, is the win.

Territory cannot be banked the way food can, so route geometry stays load-bearing to the last second.

## Economy — every resource has several uses

**Food** — brood; adaptations; claiming cracks; fitting out footholds.
**Moisture** — upkeep; brood survival; claiming and fitting; repairing a damaged nest.

**Every ceiling is a function of what the player built.** `foodCap`, `waterCap` and `capacity` derive
from claimed footholds, their fitted functions and chosen adaptations.

**Invariant:** whenever food or moisture is at its cap, the HUD names either an affordable spend, the
thing that would raise the cap, a reason to hold the reserve, or the real bottleneck. A capped
resource may never produce a dead state.

## Adaptations — 9 in 3 families, ~4 per run

A milestone opens at 11 / 17 / 24 / 30 roaches and offers one of three. Taking one closes the
milestone; the whole tree is not purchasable in a single run.

- **Brood** — capacity, faster maturation, casualty recovery. _Costs_ upkeep and evidence.
- **Forage** — carry, feeding speed, event exploitation. _Costs_ faster depletion and busier routes.
- **Shadow** — trail persistence under cover, alarm response, shelter reach, evacuations. _Costs_
  raw throughput.

Every adaptation changes simulation behaviour, has a stated downside, and lands with synchronised
VFX, audio and UI.

## Household pressure

- **Regional evidence heat** — a 12 × 9 grid. Traffic, corpses, drained sources, exposed trail and
  claims deposit heat where they happen; heat never decays below a fraction of its own peak.
- **Alert tier** — global, and **rate-limited to one promotion per 25 s** so escalation is legible.
- **The director decides _what_ from the tier and _where_ from the heat grid**, spends a refilling
  threat budget, respects a cooldown between actions, never repeats the same family twice running,
  and never fires a response whose counterplay the colony cannot perform.

| Response            | Counterplay                                                                         |
| ------------------- | ----------------------------------------------------------------------------------- |
| Footsteps / patrol  | Cover, and the contracting sole telegraph                                           |
| Cleaning sweep      | Evacuate, then re-lay: it erases scent, not roaches, and leaves a visible aftermath |
| Sticky trap         | Placed on observed traffic — re-routing removes it from play                        |
| Bait                | A slow denial zone; a worker that blunders in has time to leave                     |
| Extermination spray | Claimed cracks are shelter; the bolt-hole adaptation reaches furthest               |

## Household routines — opportunities that cost you

1. **Midnight snack** — the fridge opens, warm light floods a route, fresh crumbs appear briefly.
2. **Washing up** — a moisture bloom at the sink, and a cloth that erases the scent it crosses.
3. **Bin run** — the richest food in the kitchen on the most exposed tile in the kitchen.

Each has anticipation, a telegraph, a decision window, impact, a persistent consequence and recovery.

## Win / lose

**Win** — hold three regions simultaneously and survive the 62-second extermination response.
**Lose** — `collapse` (population 0), `nestDestroyed` (home crack integrity 0), or `exterminated`
(the response ran its course with fewer than three regions held).

The end card states the cause, the largest evidence source, the regions held, and offers restart on
one key.

## Gameplay budgets

| Metric                              | Target           |
| ----------------------------------- | ---------------- |
| First meaningful action             | ≤ 10 s from load |
| First successful worker delivery    | ≤ 45 s           |
| First growth choice                 | ≤ 3 min          |
| Decision-free plateau (normal play) | ≤ 45 s           |
| Total run                           | 15–18 min        |
| Restart to playable                 | ≤ 2 s, no reload |
| Peak living roaches                 | 90 (hard cap)    |
| Concurrent pheromone routes         | 6                |
| Simultaneous hazards                | ≤ 12             |

## Technical budgets

| Metric                                 | Budget    |
| -------------------------------------- | --------- |
| p50 frame time (active play)           | ≤ 16.7 ms |
| p95 frame time (active play)           | ≤ 20 ms   |
| p99 frame time (peak colony + hazards) | ≤ 33 ms   |
| Frames > 50 ms during peak capture     | < 1 %     |
| Unexplained frames > 100 ms after load | 0         |
| Console errors in a complete run       | 0         |
| Failed/missing asset requests          | 0         |
| Essential runtime network requests     | 0         |
| State leakage across 5 restarts        | 0         |
| Production JS bundle (gzip)            | ≤ 150 kB  |

## Scope boundaries (in)

One kitchen · one home crack + five claimable footholds · one scout control model · pheromone
logistics · worker population behaviour · immediate exposure · regional evidence · a responsive
household director · three household routines · nine adaptations · eight holdable regions · one win
state · three loss states · instant replay · audio/readability settings · static deployment.

## Explicit non-goals

Multiplayer, accounts, backend, cloud saves, procedural campaigns, multiple kitchens, open world, a
large tech tree, crafting, inventory, dialogue, cinematics, UGC, monetisation, live service, RTS unit
selection, per-worker micromanagement, idle/clicker progression, tower-defence lanes, a fully
animated human body.
