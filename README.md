> **STALE — describes the superseded single-kitchen build (branch `main` / commit `df9db36`), not this one.** This document has NOT been rewritten for the whole-home rebuild and parts of it are now wrong. The current, accurate state is `GAUNTLET_STATE.md` (live state, verified measurements, ranked open defects), `CANCELLED_GOAL_HANDOFF_AUDIT.md` (what was inherited and what became of it), and `LOCAL_REVIEW.md` (how to run it). Rewriting this file is outstanding work.

# Baseboard Empire

A top-down macro-noir strategy-action game about growing a cockroach colony inside a hostile human
kitchen. You play the lead scout. Your workers never take orders — they only read the pheromone you
secrete with your own body, so **the only routes your colony can use are the routes you personally
walked.**

Every metre of open tile you route across is evidence — and the household remembers **where**. It
cleans the corridors you use, puts traps on the lines your workers actually walk, and aims the spray
at the region it has the most evidence about. Win by holding three regions of the kitchen at once and
surviving what that provokes.

**Play it: <https://gjeon03.github.io/bug-game/>**

> Runs entirely in the browser. No server, no network requests, no asset files — every sprite,
> texture, fixture and sound is generated procedurally at boot.

## Play

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5273/
```

| Input                 | Action                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `W A S D` / arrows    | Move the scout                                                        |
| Hold `LMB` or `Space` | Lay a pheromone trail from the scout's body                           |
| Hold `RMB` or `X`     | Rub a trail out · **tap** to recall every worker                      |
| `E`                   | Inspect a source · claim a crack · fit out a foothold · repair a nest |
| `1` `2` `3`           | Answer a choice: an adaptation, or what a foothold becomes            |
| `Shift`               | Sprint — fast, loud, and it shows                                     |
| `Esc` / `P`           | Pause + settings                                                      |
| `R`                   | Restart                                                               |

**The one rule that matters:** a route only works when one end sits on a claimed nest and the other
on food or moisture. Both ends pulse warm when it is live.

## A run

Four operations, about 15–18 minutes. An operation ends when you **achieve** it, not when a clock says
so — but every operation has a soft limit, and running long makes the household restless.

1. **Establish the nest** — get out of the wall, connect food and moisture to home, reach 12 roaches.
2. **Infiltrate the routines** — the fridge opens, the tap runs, the bin lid goes up. Each is a
   windfall on ground you would rather not be standing on. Exploit two, and claim your first crack.
3. **Specialise the infestation** — nine adaptations in three families; you can afford about four.
   Every one of them costs you something you will miss.
4. **Claim the kitchen** — hold three regions at once, and survive the can.

Territory is made of routes and bodies, so you cannot bank it the way you bank food. The last minute
is the fight.

## Commands

```bash
pnpm dev            # dev server
pnpm build          # typecheck + production build → dist/
pnpm serve:nested   # serve dist/ under /bug-game/ (GitHub Pages subpath simulation)
pnpm test           # unit + integration tests (headless, DOM-free)
pnpm test:e2e       # real-browser gameplay tests against the nested production build
pnpm verify         # format + lint + typecheck + unit + build + e2e + evidence
pnpm verify:live    # load the deployed URL, play it, and record what happened
```

## How it is built

TypeScript + Vite + a purpose-built Canvas2D runtime. No gameplay runtime dependencies; the shipped
bundle is ~40 kB gzipped.

```
src/
  core/    deterministic helpers: seeded RNG, fixed-step clock, spatial hash, telemetry, storage
  sim/     ALL authoritative state. DOM-free, deterministic from (seed, input log), unit-testable
  render/  Canvas2D: procedural sprite atlas, baked solids, particles, half-res lighting composite
  audio/   WebAudio synthesis only — no sample files
  ui/      DOM overlay: HUD, pause + settings, interlude and end cards
```

`sim/` never imports from `render/`, `audio/` or `ui/`, and never touches `window`. That boundary is
enforced by lint rules and is what lets the entire simulation run headless in Vitest and reproduce a
run exactly from a seed — including `tests/unit/balance.test.ts`, which plays a complete scripted
three-night run in about a second and fails if the game stops being winnable, or if a covered route
stops being measurably safer than one across open floor.

## Documentation

| File                 | What it holds                                                       |
| -------------------- | ------------------------------------------------------------------- |
| `GAME_CONTRACT.md`   | Design thesis, verbs, loop, win/lose, budgets, completion gates     |
| `ARCHITECTURE.md`    | Subsystems, state ownership, update order, test seams               |
| `ART_BIBLE.md`       | Shape language, palette, lighting logic, animation and VFX rules    |
| `ASSET_MANIFEST.md`  | Every visible and audible element, its production method and status |
| `TEST_PLAN.md`       | Test layers, the states captured, playtest scenarios, perf capture  |
| `PLAYTEST_REPORT.md` | Measured results from the scripted playtests                        |
| `DEPLOYMENT.md`      | Static/Pages deployment, verification status, external blocker      |
| `DECISIONS.md`       | Every material deviation from the brief, with rationale             |

Evidence — screenshots, telemetry, run records, critiques — lives in `artifacts/evidence/`.

## Licence

MIT. All art and audio are first-party and generated by code in this repository.
