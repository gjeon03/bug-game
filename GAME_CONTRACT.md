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

---

# Amendment — the 3D reboot (2026-08-05)

Everything above still describes the game's **design**: the fantasy, the differentiator, the four
operations, territory, the economy, adaptations, household pressure, routines, win and lose. That
design survives the reboot intact and is not being rewritten.

What changes is that the game is no longer flat. The sections below **supersede** the corresponding
parts above where they disagree.

## The player is embodied, not a commander

The player is a **lead scout cockroach** in a physically convincing insect-scale world, not a
logistics mind hovering over a floor plan. The target feeling:

> "I am tiny, fast, vulnerable, and clever. Every object in this home is enormous. Every successful
> supply route makes my colony stronger, but it also teaches the humans where to strike."

## Space is three-dimensional

The kitchen is no longer one plane. Three traversal bands, connected by **authored** climb
transitions — pipe, cable, towel, cabinet seam, appliance back, wall crack:

| Band                       | What it offers                                                                  |
| -------------------------- | -------------------------------------------------------------------------------- |
| **Floor**                  | Open tile, appliance gaps, trash, human footsteps, cleaning hazards               |
| **Baseboard / under-unit** | Safer travel, cracks, cables, pipe access, satellite footholds, hidden shortcuts  |
| **Counter and sink**       | High-value food and moisture, dishwashing events, exposed bright routes           |

The scout may use every authored transition. **Workers use only established, validated logistics
links** — verticality is a planning decision, not decoration. No arbitrary wall-crawling: a surface
becomes climbable only if it can meet the animation, collision, camera and AI gates.

## Controls gain one verb

`Space` — contextual climb or gap traversal, where an authored transition is in reach. The command
count stays deliberately low; every other verb in the table above is unchanged.

Movement is camera-relative on the ground plane, and must deliver the full chain:

input → immediate acceleration → body response → leg cadence → antenna response → contact shadow →
skitter audio → nearby worker reaction → subtle camera response.

Floaty character-controller defaults are a defect, not a tuning preference.

## The camera is part of the contract

Low-FOV perspective (~28–38° vertical), pitched ~40–55° down, yawed ~30–50°, damped follow, stable
world orientation, limited zoom, **no free orbit during play**. It must read as a composed
strategy-action camera, never as an editor camera.

**Foreground objects may never permanently hide the player.** Occlusion fading is a production
system with its own gates, not a nicety — see `CLAUDE.md` §3.

## Growth is physical

Growth may never be only a HUD number. Eggs, nymph movement, stored food, moisture deposits, nest
material, occupied wall cracks, worker traffic, gnawed packaging, disturbed household objects,
darkened safe routes, satellite nests, rising colony sound, human countermeasures and abandoned
compromised routes are the readout. **Identical starting and victory camera shots must make it
obvious the player changed the house.**

## Budgets that change

| Metric                           | Was      | Now                                                                     |
| -------------------------------- | -------- | ----------------------------------------------------------------------- |
| First successful worker delivery | ≤ 45 s   | ≤ 60 s (a 3D approach costs real travel time)                           |
| Production JS bundle (gzip)      | ≤ 150 kB | superseded — three.js is now a runtime dependency; budget set on measure |
| p99 frame time                   | ≤ 33 ms  | unchanged, but **CPU-only measurement is no longer valid** — see below   |

**The old `cpuP99 ≤ 8 ms` gate cannot be trusted under WebGL.** `gl.draw*` returns immediately, so a
CPU-callback budget goes green while the game gets slower. Any 3D perf gate needs GPU timing or
`renderer.info.render` ceilings alongside the CPU figure. Recorded in `DECISIONS.md`.

## Scope boundary that changes

**In:** one kitchen, now with eight recognizable zones across three traversal bands and authored
climb transitions between them.

**Still out:** every non-goal listed above, unchanged.
