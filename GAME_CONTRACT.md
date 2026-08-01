# GAME_CONTRACT — Baseboard Empire

## Player-experience thesis

One sentence: _You are the lead scout of a cockroach colony, and every metre of ground you claim in a
human kitchen is also a metre of evidence that will get your nest exterminated._

## Player fantasy

Secretly turn a hostile human kitchen into a thriving cockroach colony, balancing aggressive
expansion against the evidence that will cause the humans to discover and eradicate the nest.

You are not "a small bug dodging things". You are the **logistics mind** of an infestation: you
personally walk the routes your colony will use, and the routes you choose are the story of how the
humans find out about you.

## Core verbs

| Verb                | Input                 | Meaning                                                               |
| ------------------- | --------------------- | --------------------------------------------------------------------- |
| **Skitter**         | `WASD` / arrows       | Move the lead scout. Fast, fragile, wall-hugging.                     |
| **Lay trail**       | hold `LMB` or `Space` | Secrete a pheromone route from the scout's own body as you walk.      |
| **Erase / recall**  | hold `RMB` or `X`     | Dissolve trail near the scout; tap to recall all workers to the nest. |
| **Inspect / claim** | `E`                   | Claim a food/water node or a wall crack; install a nest function.     |
| **Sprint**          | hold `Shift`          | Emergency burst. Costs stamina, spikes exposure, adds noise evidence. |
| **Pause / restart** | `Esc` / `R`           | Pause menu, settings, one-key restart.                                |

Six commands. Nothing else is bound to gameplay.

## Primary differentiator

**The pheromone route is drawn by the scout's own body.** You cannot paint a route on ground you have
not personally walked. Scouting _is_ routing. A dangerous shortcut is dangerous for you first, and it
becomes dangerous for every worker that follows it afterwards. Trail length is a limited, regenerating
reserve, so route geometry — not unit micromanagement — is the strategic decision layer.

Workers are never selected, ordered or clicked. They only ever read pheromone.

## Core loop

```
scout out of the crack
  → find food / water / a claimable crack
    → walk back laying pheromone (choose: short + exposed, or long + covered)
      → workers acquire the trail, carry resources home
        → colony population and reserves grow
          → more traffic + more claims = more evidence
            → suspicion rises, household escalates a response tier
              → old routes become lethal; re-scout and re-route
```

## Session arc

Three nights, ~13 minutes total, separated by a short **Household Reaction** card that names what the
humans noticed and what they will do next.

| Phase                   | Length | Introduces                                                                                                                                                          |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Night 1 — Establish** | ~180 s | Movement, darkness/cover, the nest, one food + one water node, pheromone routing, first delivery, first "you were seen in the open" beat.                           |
| **Night 2 — Expand**    | ~270 s | Two new kitchen zones, the first crack claim, human patrol (feet + room light), sticky traps if evidence warrants, the short-dangerous vs long-safe route decision. |
| **Night 3 — Infest**    | ~330 s | All three response families combined, bait, and a final extermination sweep aimed at the home nest.                                                                 |

## Counterplay — what the player can actually do about a response

Every household response has an answer, and each answer is a thing the player builds or a place they
route around. This is what stops escalation from being a countdown.

| Response                     | Counterplay                                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Footfall                     | Telegraphed for 1.15 s by a contracting decal in the shape of the sole; workers scatter on the telegraph, not on the impact.                                                                                                             |
| Room light / flashlight cone | Cover. Cabinetry within 120 units suppresses most exposure, and a covered route generates almost no evidence.                                                                                                                            |
| Sticky trap                  | Placed where _your_ traffic went, so re-routing removes it from play. Workers steer around armed hazards; the scout can be caught and struggles free.                                                                                    |
| Bait                         | A slow denial zone, not an instant kill — a worker that blunders in has time to leave.                                                                                                                                                   |
| Extermination spray          | **Claimed cracks are shelter.** A roach inside one cannot be reached by feet or spray, and panicking workers run for the nearest claimed crack — the Escape Tunnel reaching furthest. The home crack also repairs itself between passes. |

## Win condition

At the end of Night 3 the colony must have **survived the final extermination sweep** while holding:

- population ≥ **36** living roaches,
- food reserve ≥ **120**,
- moisture reserve ≥ **90**,
- **all three** satellite nest functions established (Brood Chamber, Food Cache, Escape Tunnel).

Payoff: the kitchen lights come up on a floor that is visibly, audibly a roach domain.

## Failure conditions

1. **Colony collapse** — population reaches 0 with no brood able to produce a replacement scout.
2. **Nest destroyed** — home-nest integrity reaches 0 (spray sweeps parked on the crack).
3. **Extermination completed** — the final sweep runs its full course while suspicion is at Tier 4 and
   the colony is below survival mass.

The failure screen states the cause, the single largest contributing evidence source, full run stats,
and offers restart on one key.

## Intended session duration

12–15 minutes for a complete run. Restart to first input < 2 seconds, no page reload.

## Control scheme

Desktop keyboard + mouse only. Remappable directions are out of scope; `WASD` and arrows are both
always live. All actions have a keyboard alternative so play is possible without a mouse.

## Scope boundaries (in)

One kitchen map · one home nest + three authored cracks · one scout control model · pheromone
logistics · worker population behaviour · immediate exposure · persistent suspicion · three household
response families · one onboarding sequence · one win state · one eradication state · instant replay ·
audio/readability settings · static deployment.

## Explicit non-goals

Multiplayer, accounts, backend, cloud saves, procedural campaigns, multiple kitchens, open world,
tech trees, crafting, inventory, dialogue, cinematics, UGC, monetisation, live service, RTS unit
selection, idle/clicker progression, tower defence lanes.

## Gameplay budgets

| Metric                           | Target           |
| -------------------------------- | ---------------- |
| First meaningful action          | ≤ 15 s from load |
| First successful worker delivery | ≤ 60 s           |
| First crack claimed              | ≤ 5 min          |
| Mandatory wait with no decision  | ≤ 3 s            |
| Total run                        | 12–15 min        |
| Restart to playable              | ≤ 2 s, no reload |
| Peak living roaches              | 90 (hard cap)    |
| Concurrent pheromone routes      | 5                |
| Simultaneous hazards             | ≤ 12             |

## Technical budgets

Reference environment recorded in `artifacts/evidence/perf/`.

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

## Observable completion gates

1. A cold load reaches a playable scout in < 3 s and teaches movement without a wall of text.
2. Scout → resource → pheromone → worker delivery → visible colony growth completes in one unbroken
   chain, verified in a real browser.
3. Each of the three response families is observed reacting to player-generated evidence.
4. A cautious run, an aggressive run, a deliberate eradication and a victory are all completed and
   captured.
5. Five consecutive restarts leave no residual entities, listeners, audio voices or suspicion.
6. `pnpm verify` is green: format, lint, typecheck, unit tests, production build, browser E2E.
7. The production build plays correctly when served from a nested `/<repo>/` path.
8. Every visible/audible element is classified in `ASSET_MANIFEST.md` as intentional/generated/
   licensed final — zero unintended temporaries.
