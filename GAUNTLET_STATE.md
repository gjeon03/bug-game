# GAUNTLET_STATE

**Live production state for the whole-home rebuild.** Updated before the end of every turn. If this
file disagrees with anything written in chat, **this file is correct**. It is written to survive
context compaction: read it first, act from it, then update it.

**Branch** `experiment/whole-home-infestation-3d` (created from `df9db36`) · **0 pushes, 0 merges,
0 PRs, 0 deployments.** Verify with `git rev-parse --abbrev-ref HEAD`.

---

## 0. What this build is

A 25-35 minute single-run 3-D strategy-action game. A scout cockroach starts in the void under a
Korean apartment kitchen sink and opens the whole flat: **kitchen -> hallway -> living room ->
bedroom**, with the **bathroom** as an optional high-risk shortcut. Progression is spatial - every
chapter ends by physically opening a route in the world.

Superseded: the Canvas2D kitchen game (`main`) and the kitchen-only three.js proof (`df9db36`).
Full disposition of inherited code: `CANCELLED_GOAL_HANDOFF_AUDIT.md`.

---

## 1. Architecture (target)

```
src/
  world/      units.ts types.ts house.ts regions/{kitchen,hallway,living,bathroom,bedroom}.ts
              - authored apartment data. Pure data + assembly. No THREE, no DOM.
  colony/     state, workers, pheromone routes, resources, progression, director, routines,
              threats, adaptations, rng. Deterministic fixed step. No THREE, no DOM.
  view/       scene, camera, occlusion, lighting, materials, props/*, roach, fx.
              - reads colony state, never writes it.
  ui/         hud, panels, css. DOM overlay. Reads keys+params, resolves via t().
  audio/      audio.ts (retained verbatim from the old build) + new sound families.
  i18n/       index.ts (retained verbatim) + rewritten ko.ts / en.ts.
  game/       boot.ts, loop.ts - the only entry point.
```

**Hard rule carried from the old build's worst defect:** simulation state carries **keys + params**,
never rendered player-facing strings. `t()` is called only in `src/ui/` and `src/view/`. This makes
the section-4 English-leak defect structurally impossible rather than test-detectable.

**Scale anchor:** 1 world unit = 35/26 mm = 1.346 mm (`src/world/units.ts`). Everything is authored
in millimetres and converted exactly once, at the point of authorship.

**Apartment plan (millimetres, X east / Z south / Y up):**

| Region | x | z |
| --- | --- | --- |
| KITCHEN | 0 .. 3800 | -3300 .. -300 |
| HALLWAY | -200 .. 9600 | -300 .. 1300 |
| BATHROOM | 200 .. 2600 | 1300 .. 3700 |
| LIVING | 3400 .. 8000 | 1300 .. 5500 |
| BEDROOM | 5200 .. 9600 | -3500 .. -300 |

A double-loaded corridor: every room touches the hallway, which is what makes the hallway a real
logistics spine rather than a corridor with a door at each end.

**Camera looks toward +X and +Z.** Walls with `outward` of `{0,-1}` or `{-1,0}` stand between the
viewer and the room and are built as 320 mm stubs at load time - a static cut, so there is no
per-frame wall fading and no artifact class to debug. Walls with `outward` `{1,0}` / `{0,1}` stay
full height and are each room's visual backing.

---

## 2. Retained from the previous build (verified, not assumed)

| Module | Status |
| --- | --- |
| `src/i18n/index.ts` | **RETAIN unchanged** - `t()` computes Korean particles from the *sound* of the value (`{n?이/가}`). Exactly what section 4a demands. |
| `src/audio/audio.ts` | **RETAIN, extend** - 659 lines, pure WebAudio, zero imports, 4 buses, 24-voice cap, ~40 sounds from 2 primitives. |
| `src/three/profiler.ts` | **RETAIN** -> `src/view/` - GPU timer queries, discards disjoint batches, refuses to pass an unmeasured GPU. |
| `src/three/roach.ts` | **RETAIN, extend** -> `src/view/` - needs a surface-normal argument for climbing. |
| `src/three/surfaces.ts` | **RETAIN** -> `src/view/` - seeded procedural wear. WARNING: `applyWear` mutates and is **not idempotent**. |
| `src/three/occlusion.ts` | **REFACTOR** -> keep alpha hashing; add per-region active set + distance reject. |
| `src/three/env.ts` | **REFACTOR** - `configureRenderer` kept; the light rig is one-kitchen. |
| `tools/bake/**` | **HARVEST** - millimetre-anchored parametric prop shapes/materials, ported to typed builders. |

**Deleted when the new entry point is playable:** `src/render/**`, `src/main.ts`, `src/art/**`,
`src/testapi.ts`, `src/sim/**`, `src/three/{room,counter}.ts`, `src/proof/**`, `proof.html`, and the
17 unit + 8 e2e specs that test the deleted game.

---

## 3. Verified environment facts (re-run 2026-08-05, not inherited)

| Tool | Verified |
| --- | --- |
| Blender | **5.2.0 LTS**, headless, embedded Python 3.13.13 + numpy 2.3.4. End-to-end rigged+animated GLB export re-verified today: magic `glTF`, version 2, skins 1, animations 1, generator `Khronos glTF Blender I/O v5.2.39`. Cycles 512px/64spp = **1.91 s CPU-only** (no Metal compute device). |
| ffmpeg 8.1.2 / ImageMagick 7.1.2-29 / draco 1.5.7 / librsvg 2.60.0 | present |
| Node 21.7.2 / pnpm 9.15.9 / three 0.185.1 / Playwright 1.62.1 | present |
| Reference machine | MacBookPro17,1 / Apple M1 8-core (4P+4E) / 16 GB / Metal 4 / 2560x1600 |
| **KTX2 / Basis** | **UNAVAILABLE** - not a Homebrew formula. PNG/WebP only; control texture memory by resolution and atlas discipline. |
| **Image / 3-D generation** | **UNAVAILABLE** - no local tool, no provider credentials. **All art is Blender procedural + ImageMagick.** |
| **glTF optimizer CLI** | **UNAVAILABLE** - no gltf-transform/gltfpack/meshopt. Draco via `draco_encoder` or Blender's exporter only. |
| **Headless Playwright** | renders through **ANGLE / SwiftShader software Vulkan**. Valid for screenshots and logic. **INVALID for frame-time evidence.** Real Chrome on the M1 is the only perf target. |
| `gh` | unauthenticated - irrelevant here, nothing may be pushed. |
| pnpm drift | installed 9.15.9 vs `packageManager: pnpm@10.13.1`. Works because corepack is not enforcing; a corepack-strict environment would fail. |

---

## 4. Defects found in the inherited code (recorded, mostly fixed by deletion)

| # | Defect | Disposition |
| --- | --- | --- |
| A | `scene.fog` far = 2100 units = **2827 mm**, shorter than a single room's 5027 mm diagonal - any whole-home sightline renders as flat fog. | Fixed by construction in the new renderer. **Must verify.** |
| B | `counter.ts` builds its own floor 38 mm below `room.ts`'s and overhanging it ~270 mm W / ~1340 mm N. | Both modules obsolete - recorded, not repaired. |
| C | `proof/main.ts` has **no dispose path**; cannot pass a five-restart leak gate. | Obsolete. New boot has an explicit teardown. |
| D | Hardcoded English in `src/ui/hud.ts` `choicePanel()` while correct Korean keys sit unused - survived all 29 localization tests. | Structurally prevented: sim carries keys, not strings. |
| E | `occlusion.update()` is O(focus x 5 probes x occluders) with a full recursive `intersectObject` and no broadphase. | Refactor before the prop count rises. |
| F | Old sim bakes locale at module import (`ZONES`, `ROUTINE_SPECS`, `ADAPTATIONS` all call `t()` at top level). | Design rejected; see section 1 hard rule. |

---

## 5. Progress

| Step | State |
| --- | --- |
| Branch created + boundary recorded in `CLAUDE.md` section 0 | **DONE** |
| `CANCELLED_GOAL_HANDOFF_AUDIT.md` | **DONE** |
| `src/world/units.ts`, `src/world/types.ts` | **DONE** |
| `src/world/regions/kitchen.ts` | **DONE** - reference region |
| `src/world/regions/{hallway,living,bathroom,bedroom}.ts` | **IN PROGRESS** - parallel authoring |
| `src/world/house.ts` (assembly, nav grid, gate graph) | TODO - next |
| `src/colony/**` (sim) | TODO |
| `src/view/**` (renderer, camera, occlusion, props) | TODO |
| `src/ui/**` + Korean catalog rewrite | TODO |
| Old-runtime deletion + test replacement | TODO |
| Real-browser playtest + evidence + critics | TODO |

---

## 6. Exact next executable action

Assemble `src/world/house.ts`: import the five regions, place the inter-region gates
(kitchen->hallway toe-kick, hallway->living door sweep, hallway->bathroom pipe sleeve,
hallway->bedroom door sweep, plus the bathroom<->kitchen pipe shortcut), build the merged navigation
grid at 60 mm cells with the exposure field baked in, and export a single `HOUSE` the colony sim and
the renderer both read. Then typecheck - that is the first hard proof the five authored regions
actually tile.

---

## 7. Method (non-negotiable, this is what worked before)

Record the observable symptom -> identify the exact scenario -> separate symptom from assumed cause
-> form falsifiable hypotheses -> **instrument or build a control** -> run the controlled comparison
-> confirm or reject -> fix the confirmed cause -> replay the identical seed and camera -> compare
against baseline -> run regressions.

Never measure a fixed screen rectangle across a camera change. Anchor measurements to the material.
