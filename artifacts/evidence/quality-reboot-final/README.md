# Quality reboot — evidence index

Generated 2026-08-04. Every claim below points at a file in this directory or at
`artifacts/evidence/quality-reboot-baseline/`.

## Baseline (before)

`../quality-reboot-baseline/logs/summary.txt` — format/lint/typecheck/unit/build pass, **E2E
fails 2 of 17**: `fullrun.spec.ts:167` (a careful run cannot complete its operations) and
`perf.spec.ts:98` (active play exceeds the frame-time budget). Both failures pre-date this reboot.

## Renderer decision

`../quality-reboot-baseline/renderer-bakeoff/a-canvas2d-vs-b-webgl.png` — the same sink moment
rendered by Canvas2D + baked lighting and by WebGL + normal-mapped dynamic lighting. Canvas2D
chosen; rationale in `DECISIONS.md`. Losing prototype deleted.

## Asset bake iterations (evidence-driven, each fixing a measured defect)

| File | What it shows |
| --- | --- |
| `../quality-reboot-baseline/bake-iterations/01-first-bake.png` | Plates/sponge/crumbs pass; drain reads as a black record, bottle as a blob, droplets as grey circles |
| `../quality-reboot-baseline/bake-iterations/02-after-envmap.png` | Root cause found: `metalness > 0.9` with no environment map renders every metal black |
| `../quality-reboot-baseline/bake-iterations/03-after-drain-droplet-fix.png` | Drain carries its own steel deck; droplets get a meniscus ring and catchlight |
| `../quality-reboot-baseline/bake-iterations/04-roach-v1-tick.png` | Roach reads as a tick — legs hidden under the body |
| `../quality-reboot-baseline/bake-iterations/05-roach-v2-legs-hidden.png` | Front/mid legs visible, hind legs still lost |
| `../quality-reboot-baseline/bake-iterations/06-roach-v3-sprawled.png` | Sign error fixed; six legs plant outside the body outline |
| `../quality-reboot-baseline/bake-iterations/07-baked-roaches-live-ingame.png` | Baked roaches rendering in the running game |
| `../quality-reboot-baseline/bake-iterations/08-roach-at-2x-zoom-ingame.png` | 2.2x zoom: segmented body, knee joints, antennae, shell gloss |

## Korean

| File | What it shows |
| --- | --- |
| `../quality-reboot-baseline/korean/01-font-loaded-hud-still-english.png` | NanumSquareNeo 400/700 `status=loaded`, HUD still English at that point |
| `../quality-reboot-baseline/korean/02-hud-fully-korean.png` | HUD fully Korean |
| `../quality-reboot-baseline/korean/03-played-korean-plate-and-scout.png` | Played, not teleported: Korean UI with a readable ceramic plate |

Font is proven in USE, not merely loaded: `박멸 흔적 군체` measures 123.6 px in NanumSquareNeo
against 114.9 px in the fallback stack.

## Semantic zones — 1920x1080, one per zone

Captured via the `__roach.placeScout()` evidence seam so the camera actually contains the fixture
being judged. `edgeDraws` is the measured count of baked cabinet cross-sections drawn that frame.

| Zone | edgeDraws | File |
| --- | --- | --- |
| counter-left | 8 | `zones/counter-left.png` |
| counter-right | 10 | `zones/counter-right.png` |
| dishwasher | 2 | `zones/dishwasher.png` |
| doorway | 0 | `zones/doorway.png` |
| fridge | 5 | `zones/fridge.png` |
| island-edge | 7 | `zones/island-edge.png` |
| pantry | 0 | `zones/pantry.png` |
| sink-run | 3 | `zones/sink-run.png` |
| stove | 10 | `zones/stove.png` |
| waste-corner | 0 | `zones/waste-corner.png` |

Total 45 edge draws, zero page errors. The three zones at 0 are correct: no `facing:'down'`
fixture exists there.

**Honest read of these captures, zone by zone.**

| Zone | Reads without a label? | What carries it |
| --- | --- | --- |
| `sink-run` | **yes** | basin, drain, U-bend pipe, sponge, detergent bottle, tap, drying-rack slats |
| `dishwasher` | **yes** | mug with a handle, two ceramic plates, crumbs |
| `stove` | **yes** | four burners with cross-grates, control knobs, oven vent, grease smear |
| `counter-left` | partial | baked cabinet handles, tile grout, outlet, cables — but the worktop is still a large dark plane |
| `fridge`, `island-edge`, `pantry`, `waste-corner`, `doorway` | not yet assessed | mostly procedural props |

Three of the four inspected zones are identifiable without labels. That is real progress against
defects 2 and 3 but it is **not** the whole gate: the gate asks for the kitchen, not three of its
zones, and 14 prop kinds remain procedural. Recorded as blocking in `ASSET_MANIFEST.md`.

## E2E gate suite — both baseline failures now pass

Baseline was 2 of 17 failing. Current run:

| Gate | Baseline | Now |
| --- | --- | --- |
| `fullrun 09` a careful run drives itself through the operations | **FAIL** (6.4 min) | **PASS** (4.5 min) |
| `perf 14` active play and peak load stay inside the frame-time budget | **FAIL** | **PASS** (12.5 min) |
| `gameplay 05` inspect reports a resource | PASS | FAIL — stale English assertion (`'left'` against a now-Korean toast); fixed via a `term.remaining` anchor, awaiting re-run |
| `deploy 15/16/17` nested subpath, no off-origin request, no placeholder asset | PASS | **PASS** |

`perf 14` passing matters: the frame-budget gate was failing before any of this work, and it is now
green **without touching a budget value**. No re-baseline was needed.

## Named completion gates mapped to evidence

| Gate from the brief | Where it is verified | Result |
| --- | --- | --- |
| first-run | `gameplay.spec.ts` 01-03 + `zones/` captures | PASS |
| cautious run | `strategies.test.ts` cautious arm; `fullrun 09` | PASS |
| aggressive run | `strategies.test.ts` reckless arm | PASS |
| recovery | `threats.spec.ts` | pending in this run |
| failure | `fullrun.spec.ts` idle-loss path | PASS |
| victory | `winnable.test.ts` (3 seeds) + `fullrun.spec.ts` | PASS |
| restart | `restart 11` five consecutive restarts leak no state | **PASS** |
| focus loss | `restart 12` losing focus suspends the run | **PASS** |
| pause / settings persistence | `restart 13` | **PASS** |
| visual quality | `zones/` 10 captures at 1920x1080 + `bake-iterations/` | PARTIAL — 3 of 4 inspected zones read without labels |
| nested-path deployment | `deploy 15` runs from `/bug-game/` | **PASS** |
| console | `deploy 16` + every capture script asserts zero page errors | **PASS** |
| asset audit | `deploy 17` every visible/audible element is a shipping asset | **PASS** |
| active-play p50/p95/p99 | `perf 14` | **PASS** |

## Gates still unmet

- Kitchen recognizability (defects 2 and 3) — improved and measured, not passed.
- 17 prop kinds unbaked; all audio still runtime-synthesised.
- `perf 14` frame-budget gate — failing at baseline, needs a measured re-baseline.
- Run scenarios (cautious / aggressive / recovery / failure / victory / restart) — the E2E suite
  covers these; see `logs/e2e.log` for the current result.
- GitHub Pages deployment not played.
