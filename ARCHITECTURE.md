# ARCHITECTURE — Baseboard Empire

Stack: **TypeScript + Vite + a purpose-built Canvas2D runtime**. No gameplay runtime dependencies.
See `DECISIONS.md` for why Phaser was not adopted.

## Layer map

```
main.ts ─ boot, canvas + DPR, RAF loop, focus handling, wiring
   │
   ├── core/      deterministic helpers (rng, clock, math, spatial, telemetry). `storage.ts` is the
   │              one deliberate exception: it touches `window.localStorage`, guarded, and is excluded
   │              from the DOM-free lint fence for that reason.
   ├── sim/       ALL authoritative game state. DOM-free. Deterministic given (seed, input log).
   ├── render/    reads sim, never writes it. Canvas2D + procedural atlases + lighting + VFX.
   ├── audio/     reads sim events, never writes. WebAudio synthesis only.
   ├── ui/        DOM overlay: HUD, menus, onboarding, end cards. Emits intents, never mutates sim.
   └── testapi.ts thin read-mostly seam exposed as window.__roach
```

**Hard rule:** `sim/` never imports from `render/`, `audio/`, `ui/`, or touches `window`/`document`.
That is what makes the simulation unit-testable in Node and deterministic under a seed.

## State ownership

| Owner              | Owns                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sim/world.ts`     | The single mutable `World` object. Created by `createWorld(seed)`; a restart throws the old one away entirely — there is no partial reset path, which is how restart-leak bugs are structurally prevented. |
| `sim/colony.ts`    | food, water, population, capacity, brood progress, upgrades, nest integrity                                                                                                                                |
| `sim/scout.ts`     | scout transform, stamina, alive/respawn timer                                                                                                                                                              |
| `sim/workers.ts`   | worker pool (fixed-capacity, index-recycled — never grows unbounded)                                                                                                                                       |
| `sim/pheromone.ts` | routes, nodes, reserve                                                                                                                                                                                     |
| `sim/threats.ts`   | patrols, traps, sprays, their timers                                                                                                                                                                       |
| `sim/suspicion.ts` | suspicion value, tier, causes ledger                                                                                                                                                                       |
| `sim/director.ts`  | phase, phase clock, authored beat cursor, run outcome                                                                                                                                                      |
| `render/*`         | camera, particles, screen shake, atlases (all derived, all disposable)                                                                                                                                     |
| `ui/*`             | DOM nodes, settings (persisted), onboarding cursor                                                                                                                                                         |

## Events and interfaces

There is no event-bus module. The sim **pushes** `GameEvent`s onto `world.events`, a plain array
drained by presentation once per rendered frame. That keeps the sim pure while letting audio and VFX
react frame-accurately.

**`world.events` is for presentation only.** Because it is drained per _frame_ and the sim runs up to
five _steps_ per frame, anything gameplay-critical must not be read back out of it — a threat-tier
request that did was re-processed on every subsequent step and spawned a hundred patrols from one
threshold crossing. Gameplay hand-offs between systems use dedicated one-shot slots on the world
(`pendingTier`, `pendingStomp`) that the consumer clears.

```ts
type GameEvent =
  | { t: 'pickup'; x: number; y: number; kind: ResourceKind }
  | { t: 'deliver'; x: number; y: number; kind: ResourceKind; amount: number }
  | { t: 'trailLaid'; x: number; y: number }
  | { t: 'trailAcquired'; x: number; y: number }
  | { t: 'claim'; x: number; y: number; node: string }
  | { t: 'upgrade'; x: number; y: number; kind: UpgradeKind }
  | { t: 'suspicion'; delta: number; cause: SuspicionCause }
  | { t: 'tier'; tier: number }
  | { t: 'footstepWarn' | 'footstepHit'; x: number; y: number }
  | { t: 'trapArmed' | 'trapSprung'; x: number; y: number }
  | { t: 'sprayStart' | 'sprayTick'; x: number; y: number }
  | { t: 'scoutHurt' | 'scoutDied' | 'scoutRespawn'; x: number; y: number }
  | { t: 'workerDied'; x: number; y: number; cause: DeathCause }
  | { t: 'phase'; phase: Phase }
  | { t: 'win' }
  | { t: 'lose'; cause: LoseCause };
```

UI → sim uses **intents** only: `world.intent.restart`, `.claim`, `.paused`. No UI code writes
gameplay numbers.

## Fixed-step simulation strategy

- Simulation runs at a fixed **60 Hz** (`SIM_DT = 1/60`).
- `core/clock.ts` accumulates real frame delta, clamped to **250 ms** per frame, and executes at most
  **5** sim steps per rendered frame (spiral-of-death guard). Leftover accumulator is discarded above
  that, and the discard is counted in telemetry so it is never silent.
- On `visibilitychange → hidden` the accumulator is zeroed and audio is suspended; on return the first
  frame delta is discarded. Tab suspension therefore cannot fast-forward the colony.
- Rendering interpolates nothing (60 Hz sim ≈ display rate); entity positions are read directly. This
  is a deliberate simplicity/accuracy trade recorded in `DECISIONS.md`.

## Update order (one sim step)

```
1  input snapshot          (already latched by main.ts before stepping)
2  director.update         phase clock, authored beats, spawn/unlock gates
3  scout.update            input → accel → collide/slide → stamina → trail secretion
4  pheromone.update        node decay, route validity (nest-linked? resource-linked?)
5  workers.update          state machine → steering → separation → collide → carry/deliver
6  resources.update        depletion, disturbance evidence, regrowth
7  colony.update           upkeep, brood, capacity, nest integrity
8  threats.update          patrol splines, foot telegraph→impact, traps, spray clouds
9  exposure.update         per-entity light/sight/cover sampling (budgeted, round-robin)
10 suspicion.update        integrate graded evidence, tier transitions, set `pendingTier`
11 director.evaluate       win/lose evaluation, phase transition
12 events flushed to presentation
```

Anything that kills an entity does so by setting `alive = false` and pushing an event; removal is a
single compaction pass at the end of step 5/8 so no iteration invalidates.

## Navigation / path-following

No navmesh, no A\*. Deliberate:

- **Collision**: the kitchen is authored as axis-aligned solids. Entities are circles; resolution is
  minimum-translation-vector push-out with slide, giving the "comfortable near walls" feel and zero
  sticky corners.
- **Labour distribution**: an idle worker with no live route within 520 units retargets to the nest
  anchoring the least-served route after five seconds. Without this, a colony that hatches everything
  in its brood chamber strands its whole workforce there — a defect found by playing a full run, and
  now covered by a regression test.
- **Worker path following**: workers sample the pheromone field through a uniform **spatial hash**
  (`core/spatial.ts`, 96-unit cells). A worker steers toward the nearest trail node whose _progress
  index_ is ahead of its own along the desired direction (outbound = toward resource end, returning =
  toward nest end). This yields ant-like single-file flow with local spacing from a separation force,
  without any graph search.
- **Fallback**: a worker with no trail in range wanders with a bias toward the home nest, so the field
  can never strand units.
- **Cover** is derived, not authored: any point within `COVER_RADIUS` of a solid edge counts as cover.
  Hugging cabinetry is mechanically safer, which teaches itself.

## Save / settings boundary

`localStorage` holds **only**: audio volumes, reduced-shake, reduced-flash, high-contrast, onboarding
"seen" flag, and best-run stats. Never gameplay state. Key prefix `bbe.`. All reads are
try/catch-guarded so private-mode browsers degrade to defaults instead of throwing.

## Rendering boundary

`render/renderer.ts` is the only module that touches the game canvas. Pipeline per frame:

1. floor pattern (baked once) → 2. baked debris/stain layer → 3. solids with drop shadow →
2. pheromone trails (additive) → 5. resources/cracks/nest → 6. roaches (atlas blits) →
3. hazards → 8. particles → 9. **lighting composite** (half-res darkness canvas, `multiply`) →
4. threat overlays / vignette → 11. screen-space flashes.

Atlases (`render/atlas.ts`) are generated procedurally into `OffscreenCanvas`/`HTMLCanvasElement` at
boot from seeded code — they are the shipped final assets. Nothing is fetched.

## Audio boundary

`audio/audio.ts` owns one `AudioContext`, four gain buses (master/music/sfx/ui) and a **voice pool
with a hard cap (24)** plus per-sound cooldowns, so worker skitters cannot turn into noise or leak
nodes. Every node is created, scheduled, and self-disposed via `onended`. The context is created
lazily on first user gesture (browser autoplay policy) and suspended on tab hide.

## Test seams

`window.__roach` exposes the minimum needed for automation and nothing that lets a test fake play:

```ts
{
  ready: boolean,
  version: string,
  newRun(seed?: number): void,        // deterministic restart
  state(): StateSnapshot,             // read-only summary (phase, colony, suspicion, counts, outcome)
  telemetry(): TelemetrySnapshot,     // frame-time histogram + entity/particle/voice counters
  markPerf(label: string): void,      // begin a named capture window
  input: { press(k), release(k), moveTo(x,y), tap(k, ms) },   // drives the *real* input layer
  errors: string[],                   // captured window.onerror / unhandledrejection
}
```

`input.*` writes into the same input state the keyboard writes into, so automated play exercises the
real movement, collision and pheromone code — not a scripted state machine.

## Integration order

1. clock + input + scout movement + collision (feel first)
2. nest + one resource + pheromone + one worker → closed micro-loop
3. exposure + escape
4. suspicion + patrol
5. three phases + win/lose + restart
6. final art/audio replacing prototype draws
7. remaining threats + crack upgrades
8. telemetry + automation + deployment
9. independent critique → verified fixes → regression

## Ownership rules for parallel agents

- `sim/**`, `render/**`, `audio/**`, `main.ts` — **single implementation owner**, never edited by a
  parallel agent. Movement feel, pheromone/worker coupling, threat timing, lighting and frame pacing
  are one coherent tuning surface.
- Parallelisable with clean boundaries: repository/tool inspection, `.github/workflows/**`,
  `tests/**` authoring, evidence collection under `artifacts/**`, and the three independent critique
  passes (visual / gameplay / technical), which are **read-only** and report findings rather than
  editing gameplay.
