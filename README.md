# Baseboard Empire

A top-down macro-noir strategy-action game about growing a cockroach colony inside a hostile human
kitchen. You play the lead scout. Your workers never take orders — they only read the pheromone you
secrete with your own body, so **the only routes your colony can use are the routes you personally
walked.**

Every metre of open tile you route across is evidence. Evidence raises suspicion. Suspicion brings
feet, then sticky traps, then the spray. Win by making the infestation self-sustaining before the
household escalates to extermination.

**Play it: <https://gjeon03.github.io/bug-game/>**

> Runs entirely in the browser. No server, no network requests, no asset files — every sprite,
> texture and sound is generated procedurally at boot. ~42 kB gzipped.

## Play

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5273/
```

| Input                 | Action                                                     |
| --------------------- | ---------------------------------------------------------- |
| `W A S D` / arrows    | Move the scout                                             |
| Hold `LMB` or `Space` | Lay a pheromone trail from the scout's body                |
| Hold `RMB` or `X`     | Rub a trail out · **tap** to recall every worker           |
| `E`                   | Inspect a resource · claim a crack · use the escape tunnel |
| `Shift`               | Sprint — fast, loud, and it shows                          |
| `Esc` / `P`           | Pause + settings                                           |
| `R`                   | Restart                                                    |

**The one rule that matters:** a route only works when one end sits on a claimed nest and the other
on food or moisture. Both ends pulse warm when it is live.

## A run

Three nights, about 13 minutes, separated by a card showing what the humans noticed.

1. **Establish** — leave the crack, find the crumbs and the sink drip, run your first supply lines.
2. **Expand** — claim the brood chamber under the island and the food cache in the pantry gap. Patrols
   start. Traps go down wherever your traffic crossed open floor.
3. **Infest** — claim the escape tunnel behind the radiator, then hold the kitchen through the final
   extermination sweep.

**Victory** needs 36 roaches, 120 food, 90 moisture, all three nest functions built, and survival of
the last sweep. **Failure** is a collapsed colony, a destroyed home crack, or a completed
extermination — each one tells you which of your own decisions cost you the most.

Every response has an answer. Feet are telegraphed and workers scatter on the warning, not the
impact. Traps go down where _your_ traffic went, so re-routing removes them. And a claimed crack is
shelter: nothing the household owns can reach a roach that is inside the wall, which is what the
Escape Tunnel is for and why claiming cracks is worth the evidence it costs.

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
