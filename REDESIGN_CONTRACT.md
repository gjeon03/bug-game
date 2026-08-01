# REDESIGN_CONTRACT — Baseboard Empire

Director synthesis of the Phase-0 baseline (`artifacts/evidence/redesign-baseline/`) and the seven
independent audits in `artifacts/evidence/redesign-baseline/audits/`.

This document is the authority for the redesign. Where it disagrees with `GAME_CONTRACT.md`,
`ARCHITECTURE.md` or a test, this document wins and the other artefact is updated.

---

## 1. Verified player-facing problems

Every row was reproduced, not inferred. "Measured" means a number produced by the real simulation or
the real browser during Phase 0.

| ID  | Player-facing problem                                                      | Measured evidence                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | Growth stops being interesting; the numbers cap and nothing replaces them. | Food hits 200/200 at **t=111.8 s**, water 160/160 at **t=119.8 s**, population 14/14 at **t=89 s** — inside night 1 of 3. The competent run then sits at food cap for **455 s of its 788 s** (58 % of the run). Deliveries in that window are discarded by `Math.min(foodCap, …)`.               |
| P2  | Resources reach their caps with no compelling next action.                 | The whole game contains **three food sinks and three water sinks**; two of each are automatic (upkeep, brood). The only player-facing spend is claiming cracks: **140 food + 82 water once per run**, against caps of 320/220.                                                                   |
| P3  | The player stops knowing what to do.                                       | Longest decision-free plateau in the real-browser cautious run: **114.9 s** (target ≤ 45 s). Only **5 plan-changing beats in 180 s**. Mean gap between authored beats across a full run: **112 s**.                                                                                              |
| P4  | Attacks lack escalation, variety, pressure and counterplay.                | In a winning run **13 of 14 threat spawns are clock-driven**; the evidence director contributes **one** event in 13 minutes. Doing nothing at all still produces the whole night-1/2 schedule. Tiers 2→3→4 can fire inside **15 s**, then the director is permanently silent (no tier 5).        |
| P5  | Household attacks do not react to where the player actually operated.      | `addSuspicion(world, cause, amount, x, y)` **discards x,y**; `SuspicionState` has no positional field; continuous causes pass literal `0,0`. Trap siting scores _trail node geometry_, never `route.traffic`.                                                                                    |
| P6  | The environment does not feel like an occupied home.                       | The kitchen is **26 axis-aligned rectangles and 15 flat decals** over 9.36 M world units. There is no basin, faucet, burner, oven door, handle, dish, bottle, **baseboard** or doorway anywhere in the data. `Solid.label` is authored and never rendered.                                       |
| P7  | Large areas are empty and interchangeable.                                 | Solids cover 47.8 % of the map; the only opaque floor detail is 2 mats + 2 vents = **4.8 %**. The main traffic area is ~90 % bare. Material bases span **17/255** before a ×0.49 multiply crushes them to a 4-value spread — a **5-value difference** separates "dishwasher" from "pantry".      |
| P8  | Some cockroaches look broken, stuck, overlapped or malformed.              | Separation was a _steering blend_: normalised into the desired direction and then re-normalised to target speed, so it changed heading but never spacing — and produced **exactly zero** correction at the two moments spacing matters (harvest, `speedMul = 0`; queue-wait, `speedMul = 0.12`). |
| P9  | Worker columns read as one centipede rather than separate roaches.         | All workers steered to the same `nodeIndex + 4` node on a single centreline with no lateral offset, at a separation _query_ radius of 17 units against a drawn body ≈ 21 units long. Consecutive workers overlapped by ~20 % of their length by construction.                                    |
| P10 | Carrying indicators and other markers read as rendering errors.            | Cargo is a bare filled ellipse over the sprite. Route ends are `ctx.arc()` rings in three states separated only by radius (24/22/18) and dash pattern. Warm amber carries **11 simultaneous meanings**. The scout wears a traced outline _plus_ an 80-unit additive halo.                        |
| P11 | No desire to continue, replay or try another strategy.                     | All three upgrades are **mandatory, simultaneously affordable and purely numeric**; there is no opportunity cost and no ordering decision. Two of four win criteria are satisfied at **t≈110 s by a player who stopped playing at t=10 s**.                                                      |
| P12 | The first thing a new player reads is a false emergency.                   | `START_WATER = 34` is below `CRITICAL_RESERVE × WATER_CAP = 35.2`, so the shortage branch wins on the **first simulation step**: the boot objective is "MOISTURE RUNNING OUT — … or the colony dies." The first non-crisis objective appears at **t = 134.9 s (76 % of night 1)**.               |

---

## 2. Root-cause hypotheses (all confirmed)

- **RC1 — The game is a stockpiling simulation wearing an infestation costume.** Resources only ever
  accumulate. With no sink, a cap is a dead end rather than a decision, and every downstream symptom
  (P1, P2, P11) follows arithmetically.
- **RC2 — Progress is gated by a stopwatch, not by the player.** Nights, beats, unlocks and the final
  response are all `nightTime >=` comparisons. Nothing the player does moves the schedule, so agency
  cannot express itself in pacing (P3, P4, P11).
- **RC3 — Evidence is a scalar, so the household has no memory of place.** Without spatial evidence,
  a response cannot be aimed at the player's choices, and route geometry cannot have a persistent
  consequence (P4, P5).
- **RC4 — The world is a collision map, not a place.** Geometry was authored for physics and tinted
  for material, never modelled as objects, so no amount of lighting or post-processing can make it
  legible (P6, P7).
- **RC5 — Spacing was expressed as a force in a system that discards force magnitude.** Steering is
  normalised, so any "separation force" is advisory; positional guarantees require a positional
  solver (P8, P9).
- **RC6 — The visual vocabulary is saturated.** One shape (the circle) and one hue (amber) were
  re-used until neither carried meaning, at which point every new marker reads as debug output (P10).

---

## 3. Selected structure

**Four player-driven operations, ~15–18 minutes, one continuous night.** The three-night timer is
removed. Time still applies pressure — the household escalates on its own schedule and the run has an
outer limit — but _progress_ is gated on what the player achieves, not on the clock.

| Operation                          | Gate to advance                                                                      | Introduces                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **1 — Establish the nest**         | 2 linked supply lines (1 food, 1 moisture) **and** population ≥ 12                   | Movement, cover, routing, the first delivery, the first hatch, the first evidence                    |
| **2 — Infiltrate the routines**    | Exploit 2 household routine events **and** claim 1 satellite foothold                | Household events as timed opportunities; footholds; regional heat becoming visible in trap placement |
| **3 — Specialise the infestation** | 3 adaptations chosen **and** 2 footholds carrying a function **and** population ≥ 26 | The adaptation system; opportunity cost; the household's mid-tier responses                          |
| **4 — Claim the kitchen**          | Hold 3 zones simultaneously **and** survive the extermination response               | Territory; the final high-risk opportunity; the extermination shaped by the player's own heat map    |

Each operation also carries a **soft timer**. Exceeding it does not fail the run; it raises the
household's baseline alert, so dawdling is paid for in pressure rather than in a game-over.

### Territory — the win is a place, not a number

Each semantic zone (sink, dishwasher, stove, fridge, pantry, island, trash, doorway) carries a
**hold** meter in 0..1. Hold rises while the colony has live pheromone _and_ working roaches inside
the zone, and falls while the household cleans, sprays or lights it. Victory requires three zones
held simultaneously through the extermination response. This is what makes route geometry
strategically load-bearing to the last second: territory is made of routes.

---

## 4. Retained / replaced / removed

### Retained (evidence says they help)

- TypeScript + Vite + the purpose-built Canvas2D runtime; static, serverless, zero runtime requests.
- The DOM-free deterministic `sim/` boundary and fixed 60 Hz step with the spiral-of-death guard.
  (`sim.test.ts:430-451`, the determinism test, is the highest-value test in the repo — kept verbatim.)
- `createWorld(seed)` as the _only_ reset path — this is why restart-leak bugs are structurally
  prevented, and it is kept.
- The scout personally walking every route. The single strongest idea in the design: scouting _is_
  routing, and a shortcut is dangerous for you before it is dangerous for the colony.
- Pheromone routes as the strategic layer; workers never selected or ordered.
- Traffic-reinforced trails (a used line sustains itself, an abandoned one fades) — removes busywork.
- `EXPOSURE_AVERSION`, `LABOUR_SHARE_CAP` and the demand-weighted labour split. All three encode real
  player-agency guarantees and all three have strong tests.
- The `window.__roach` seam, which cannot fake a run.

### Replaced

| Old                                        | New                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Three fixed nights + interludes            | Four player-gated operations with soft timers (`sim/operations.ts`)                                                        |
| Global scalar suspicion driving everything | Global **alert tier** (rate-limited) + **regional evidence heat grid** (`sim/heat.ts`)                                     |
| 5 clock beats + threshold escalation       | Hybrid **household director** with threat budget, cooldowns and heat-aimed placement (`sim/pressure.ts`)                   |
| 3 mandatory numeric upgrades               | **9 adaptations in 3 families**, one choice per milestone, not all affordable in one run (`sim/adaptations.ts`)            |
| Caps as constants                          | Caps raised only by things the player builds                                                                               |
| Per-node additive glow blobs for trails    | A continuous tapered **scent ribbon** with directional flow                                                                |
| Cargo as a bare ellipse                    | Recognisable crumb / droplet geometry with a carry pose                                                                    |
| 26 tinted rectangles                       | Authored **props with elevation**, toe-kicks, foreground occluders, contact shadows (`sim/kitchen.ts` + `render/props.ts`) |
| Objective = status restatement             | Objective **hierarchy**: operation → blocker → next unlock → household forecast                                            |

### Removed

- The night/interlude state machine and `NIGHT_SUSPICION_FLOOR` (authored suspicion the player never
  earned; the cautious run's entire suspicion score was this constant).
- `NIGHT_RESOURCE_REGROWTH` (the reason scarcity was arithmetically impossible).
- `colony.upgrades.escape` — written, never read. Dead state.
- The `banking` mode (measured: never fires in a competent run).
- The unbounded final-response spray conveyor (`sprays.length < 2` re-evaluated every frame).
- Immortal hazards: hazards now age out, so `MAX_HAZARDS` can never permanently disable tiers 2–4.

---

## 5. Progression model

### Resource sinks (the fix for RC1)

**Food** — brood; adaptation costs; foothold construction; foothold functions; rallying a colony
after heavy casualties; packing a haul before a household event.
**Moisture** — upkeep; brood survival; nest repair after spray; sustaining high-population
adaptations; emergency recovery after a cleaning pass.

**Caps rise only by building.** `foodCap`/`waterCap`/`capacity` are derived from established
footholds and chosen adaptations. Reaching a cap therefore _is_ the prompt to build the thing that
raises it, and the HUD names that thing.

**Invariant (enforced by test):** whenever food or moisture is at cap, at least one affordable,
non-automatic spend exists, and the HUD names it. Hitting a cap can never produce a dead state.

### Adaptations — 3 families × 3 tiers, one choice per milestone

Milestones arrive at population 12 / 18 / 24 / 30 and at each foothold function installed. The player
chooses **one** adaptation per milestone; a run affords roughly four of nine.

- **Brood** — bigger sustainable population, faster recovery, nursery behaviour.
  _Cost:_ higher upkeep, more visible traffic, more evidence when exposed.
- **Scavenging** — larger carry, faster extraction, better event exploitation.
  _Cost:_ sources deplete faster, depletion is noticed sooner, routes get busier.
- **Shadow network** — trails persist longer near walls, faster alarm response, claimed cracks reduce
  travel risk, one limited emergency evacuation.
  _Cost:_ slower raw production, more investment in infrastructure.

**Every adaptation must** visibly change the nest or the roaches, change simulation behaviour, alter
at least one strategic decision, carry a readable downside, and land with synchronised
animation + VFX + audio + world reaction + UI confirmation. An adaptation that only changes a number
is not shipped.

---

## 6. Household-pressure model

### Evidence, split four ways (the fix for RC3)

- **Exposure** — instantaneous, per-entity, already exists.
- **Regional heat** — a 12 × 9 grid over the world. Traffic, corpses, depleted sources, trail nodes
  on open floor and claims all deposit heat into the cell where they happened. Heat decays slowly and
  never to zero.
- **Alert tier** — global, derived from total evidence, **rate-limited to one promotion per 25 s** so
  the staircase cannot collapse (the measured 2→3→4-in-15 s defect).
- **Known locations** — the top-heat cells, which is what the household actually acts on.

The director decides **what** from the tier and **where** from the heat grid. Heavy traffic through
one corridor changes future trap, cleaning, light and spray placement _in that corridor_.

### Director

Explicit **threat budget** and per-family **cooldowns**. Every threat must have: anticipation → a
readable telegraph → a decision window → impact → persistent consequence → recovery. The director may
never assemble a combination with no available counterplay, and this is asserted by test.

| Threat                                       | Counterplay                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Footsteps / room activity                    | Cover, and the contracting sole telegraph (kept — it works)                                                |
| Cleaning sweep (broom / cloth / vacuum edge) | Evacuate, then re-route: it erases pheromone and moves small resources, leaving a visible aftermath        |
| Sticky trap                                  | Placed on **observed traffic heat**, so re-routing removes it from play                                    |
| Bait                                         | A slow denial zone; a worker that blunders in has time to leave                                            |
| Extermination spray                          | Claimed cracks are shelter; the evacuation adaptation reaches furthest; exposed infrastructure is punished |

The player can accept risk for a temporary opportunity, abandon a compromised route, split traffic,
build safer footholds, use a limited recall, or trade throughput for concealment. The player can
never grind evidence to zero.

### Household routine events (opportunities, not only threats)

Three, polished and combinatorial rather than many and thin:

1. **Midnight snack** — the fridge opens, warm light floods a route, footsteps arrive, fresh crumbs
   appear for a limited time. Is the haul worth the evidence?
2. **Dishwashing** — sink vibration creates a temporary moisture bloom, cleaning motion blocks an old
   route, soap zones deny ground, and a drain gap opens a safer path.
3. **Trash / pet routine** — a bin, bowl or dropped scrap becomes briefly very valuable on exposed
   ground that will later attract cleaning and traps.

Events are what make the house feel occupied without animating a whole human.

---

## 7. Environment plan

Rebuild the kitchen as **objects with elevation**, not tinted rectangles.

- **Recognisable without labels:** sink + under-sink void, dishwasher, stove/oven, refrigerator,
  pantry, island, trash area, doorway (a real gap in the bottom wall), and a continuous
  **baseboard + toe-kick** network — the thing the game is named after and which does not currently
  exist.
- **Props carry a job.** Every prop must support scale, navigation, concealment, a resource
  opportunity, a threat telegraph, or household identity. No decorative noise.
- **Depth stack:** floor → baked grime concentrated at believable sources → contact shadows →
  solid bodies with cabinet-face elevation and toe-kick voids → props → entities → **foreground
  occluders** (overhangs the roaches pass under) → motivated lighting → screen space.
- **Mid-scale objects.** The measured gap is 30–300 world units: everything is either invisible
  (<10 u) or architecture (>400 u). Props fill this band, which is what restores insect scale.
- **Lighting is motivated and occluded.** Each light sits on the object it is named for; solids
  occlude and cast into the room.
- **Colour discipline.** Amber is reduced to a single meaning: _the player and what the player must
  act on now_. Material values are spread far enough to survive the darkness multiply.

Floor may be dark; it may not be uniform, and it may never hide navigation. Player, active threat,
current objective and the pheromone route stay readable at all times.

---

## 8. Worker-AI repair plan

_(Implemented ahead of the rest of the redesign; all 73 pre-existing unit tests pass.)_

1. **Lanes.** Each worker holds a stable `lane ∈ [-1,1]` for life. Its steering target is offset
   perpendicular to the trail tangent by `dirSign × LANE_OFFSET + lane × LANE_JITTER`, so outbound and
   inbound traffic counter-flow in separate bands instead of sharing one centreline.
2. **Positional separation.** A Jacobi relaxation pass after integration pushes any pair closer than
   `WORKER_CLEARANCE = 22` apart, then re-resolves against solids. It works at zero speed, which is
   exactly where the old steering blend produced nothing. Corrections are accumulated before they are
   applied, so the result is order-independent and the simulation stays deterministic.
3. **Endpoint rings.** Harvesters take positions on a ring around a source instead of standing inside
   it; workers arriving at a full source enter an explicit **`queue`** state and take a place on a
   wider waiting ring.
4. **Bounded turning.** Facing rotates at `WORKER_TURN_RATE` instead of snapping to `atan2(vy, vx)`,
   which removed the 180° single-frame flips that read as broken sprites. Harvesters keep the facing
   that points at their food.
5. **Stuck watchdog.** "Useful progress" is defined per state, so feeding, queueing, sheltering and
   growing are never mistaken for stalling. Beyond `STUCK_GRACE` the recovery ladder is: re-read the
   trail → step out of the corridor and invert lane → abandon the route and walk home. Nothing
   teleports a visible roach.
6. **Presentation.** Cargo becomes recognisable geometry in a carry pose; nymph, corpse, panicking,
   queueing and trapped states are visually distinct.

---

## 9. Measurable success gates

### Purpose and progression

- First useful objective without the README; **first meaningful action ≤ 10 s**; **first delivery ≤ 45 s**.
- First growth choice early enough to shape most of the run.
- **No decision-free plateau > 45 s** in any validated normal-play scenario (baseline: 114.9 s).
- A capped resource always names a spend, a cap-raiser, a reason to hold, or the real bottleneck.
- Every operation introduces a new decision, event, threat interaction or capability.
- Victory follows an active final operation, never passive waiting.

### Strategy

- Two adaptation paths produce observably different priorities and outcomes.
- Cautious and aggressive routing produce different growth **and** different household pressure.
- No single route or upgrade order dominates every validated scenario.
- Household responses reflect observed behaviour or regional evidence.
- Every major threat has perceivable warning and usable counterplay; loss causes are attributable.

### Worker quality

- No unintentionally stuck worker > **2 s**; no persistent solid penetration; no severe 3-worker
  overlap > **0.75 s** outside authored states; no permanent endpoint piles.
- Carrying state and rendered cargo always agree. Five restarts leave no stale worker state.

### Environment

- Sink, dishwasher, stove, refrigerator, pantry, island, trash and doorway recognisable **from world
  art alone**. Believable evidence of habitation in representative frames. Insect scale communicated.
- Empty floor has navigation, tension, composition or event purpose. Lighting is motivated.
- No unintended placeholder or debug-looking asset.

### Technical

- Clean install; format, lint, typecheck, unit, integration, production build, browser E2E all pass.
- Works at `/bug-game/`; **zero** essential runtime network requests; no missing assets; no
  unexplained console errors.
- p50 ≤ 16.7 ms, p95 ≤ 20 ms, p99 ≤ 33 ms in peak play; < 1 % of peak frames > 50 ms; no unexplained
  frame > 100 ms after load.
- Zero unbounded entity/particle/voice/listener growth; zero restart-state leakage.

---

## 10. Explicit non-goals

Multiplayer, online progression, accounts, backend, cloud saves, a large campaign, an open world,
multiple kitchens, crafting clutter, a large inventory, dialogue, cinematics, monetisation, live
service, RTS unit selection, per-worker micromanagement, idle/clicker progression, tower-defence
lanes, and a fully animated human body.

---

## 11. Implementation sequence

1. ✅ Baseline captured; seven audits complete; worker-AI repair landed (73/73 tests green).
2. Contracts updated to this document.
3. **One redesigned end-to-end micro-loop**, connected: household event appears → scout discovers it →
   player routes to it → workers collect → the nest visibly grows → a growth choice unlocks → the
   household reacts to that traffic → the player re-routes or evacuates. Playtested before expanding.
4. Environment: rebuild the weakest representative area to final quality, then the rest.
5. Full four-operation session; full adaptation system; full responsive director.
6. Complete visual and audio pass; replace every temporary asset.
7. Tests rewritten to this contract (the technical audit's disposition table is the work list).
8. 16 real-browser scenarios; independent visual / gameplay / UX / technical critique.
9. Falsifiable root-cause hypotheses for the highest-impact findings; fix; replay the same evidence
   path; regress.
10. Nested-path verification, deployment, and a real play session on the deployed URL.

**Ownership.** `sim/**`, `render/**`, `audio/**`, `main.ts` have a single implementation owner.
Parallel agents may produce read-only audits, authored asset data, tests and evidence, but every
tightly coupled state change is integrated by the owner.
