# Cancelled-goal handoff audit

A previous `/goal` was cancelled. Its chat summary and its completed background tasks are treated
here as an **unverified snapshot**, not as a contract. Every claim below was re-checked against the
actual code, git, or command output on 2026-08-05. Claims that could not be reproduced are marked.

---

## 1. What was actually inherited

| Fact                    | Verified value                                                                                                                                 | How                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Inherited commit        | `df9db36` "feat: 그레이박스 주방 8구역 + 앵커 프레임 8장"                                                                                      | `git rev-parse HEAD`              |
| Branches at that commit | `experiment/isometric-threejs-rebuild`, `experiment/whole-home-infestation-3d-v2`, `archive/isometric-kitchen-proof` — **all three identical** | `git rev-parse` on each           |
| Commits ahead of `main` | 13                                                                                                                                             | `git rev-list --count main..HEAD` |
| Working tree            | clean, nothing staged, nothing untracked                                                                                                       | `git status --porcelain`          |
| New work branch         | `experiment/whole-home-infestation-3d` created from `df9db36`                                                                                  | `git switch -c`                   |
| Typecheck               | passes                                                                                                                                         | `pnpm typecheck`, exit 0          |
| Unit tests              | **180 passed, 15 files**, 20.06 s                                                                                                              | `pnpm test`                       |
| Production build        | passes, 995 ms, 64 modules                                                                                                                     | `vite build`                      |

The branch named in the new goal, `experiment/whole-home-infestation-3d`, **did not exist** and was
created for this work. `CLAUDE.md` §0 still named `experiment/isometric-threejs-rebuild`; §0 has been
rewritten to the new branch as the goal requires.

---

## 2. Handoff claims checked

| Claim from the cancelled session                                         | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| "188 props specified across 8 zones, 121 need authoring"                 | **Obsolete, not wrong.** The spec was for a kitchen-only scope. The new scope is five regions; the prop list is re-derived from the new layout.                                                                                                                                                                                                                                                                                                                                                                                                                  | scope change                       |
| "Greybox kitchen with 8 zones at real millimetre dimensions is standing" | **True but superseded.** `src/three/room.ts` hardcodes `ROOM_WIDTH_MM`/`ROOM_DEPTH_MM` as module constants, one centred floor, exactly two walls, and a flat 8-entry `ZONES` array with no room id. It cannot express five rooms.                                                                                                                                                                                                                                                                                                                                | `src/three/room.ts:33-34, 72`      |
| "Floor-bounce light sign error fixed, intensity swept to 1.4"            | **True and load-bearing.** The method (evaluate the vector, then sweep) is carried forward; the specific rig is not, because it solves one kitchen's wall orientation.                                                                                                                                                                                                                                                                                                                                                                                           | `src/three/env.ts:117`             |
| "Occlusion is a production system"                                       | **True, with a real limit.** The alpha-hash technique is correct and retained. `update()` is O(focus × 5 probes × occluders) with a full recursive `intersectObject` per pair and no broadphase. At 10 occluders that is 50 raycasts/frame; a five-region house needs a per-region active set before it is usable.                                                                                                                                                                                                                                               | `src/three/occlusion.ts:185-204`   |
| "Defect 14 closed, criterion partially met (mean 0.1426 vs 0.15 target)" | **Reproduced as written, and the honesty is retained.** Recorded as a miss, not moved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `GAUNTLET_STATE.md`                |
| "GPU p99 10.17 ms with only the sink fragment built"                     | **Retained as baseline.** It is the reason the new build measures GPU separately from CPU from the start.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `artifacts/evidence/perf/`         |
| "The sim is renderer-agnostic, 59 % of TypeScript survives"              | **Half true, and the useful half is smaller than claimed.** The sim genuinely has zero DOM references in 8,071 lines. But it is entirely **planar** — no `z` on any of `TrailNode`, `Worker`, `Scout`, `Solid`, `ResourceNode`, `NestNode`, `Hazard` — and its spatial substrate is module-level singletons: `src/sim/field.ts:3` imports `SOLIDS`/`LIGHTS` straight from `kitchen.ts` and exports parameterless free functions used by five sim modules, two render modules and the tests. A 3-D five-region world cannot reuse this code, only its **design**. | `src/sim/field.ts:3,30,60,157,167` |

### Rejected assumptions

1. **"The sim survives a renderer change, so it survives this rebuild."** Rejected. Surviving a
   _renderer_ change is not surviving a _dimension_ change. Progression is `unlockOp: 1|2|3|4`
   checked at 13 sites — an operation counter, not space — and the new game's entire premise is that
   progression **is** space.
2. **"Player-facing Korean is already correct because the locale tests pass."** Rejected. The audit
   found live hardcoded English in `src/ui/hud.ts` `choicePanel()` with correct Korean keys sitting
   unused in the catalog — the identical defect CLAUDE.md §4 already records, one indirection deeper,
   surviving all 29 localization tests. The new build carries **keys + params in state** and resolves
   text only at the presentation layer, so a sim-side string cannot exist to go untranslated.
3. **"Headless Playwright evidence covers the performance gates."** Rejected. Headless renders
   through `ANGLE (SwiftShader)` software Vulkan. It is valid for screenshots and logic, and invalid
   for frame time. Real Chrome on the M1 is the only perf target.

### Defects found during the audit that the previous session did not report

- `scene.fog` far plane is 2100 units = **2827 mm**, shorter than the 5027 mm diagonal of the single
  existing kitchen. Any whole-home sightline would render as flat fog colour. Fixed by construction
  in the new renderer.
- `src/three/counter.ts` builds its **own** floor plane 38 mm below `room.ts`'s floor and overhanging
  it by ~270 mm west and ~1340 mm north. Both modules are obsolete, so this is recorded rather than
  repaired.
- `src/proof/main.ts` has **no dispose path** — nothing calls `dispose()` on room, counter, roach
  assets, occlusion, profiler or the environment texture. It cannot pass a five-restart leak gate.

---

## 3. Disposition of every inherited subsystem

| Subsystem                                                                 | Disposition                     | Why                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/index.ts`                                                       | **RETAIN unchanged**            | `t()` with computed Korean particles (`{n?이/가}`, Sino-Korean digit table + 받침 modulo-28) is exactly what §4a requires. Zero game dependencies.                                                                                                                                             |
| `src/i18n/ko.ts`, `en.ts`                                                 | **REPLACE**                     | Catalogs describe the old kitchen game.                                                                                                                                                                                                                                                        |
| `src/audio/audio.ts`                                                      | **RETAIN, extend**              | 659 lines of pure WebAudio synthesis, zero imports, 4 buses, 24-voice cap, ~40 sounds from two primitives. Reusable verbatim; new sounds appended.                                                                                                                                             |
| `src/three/profiler.ts`                                                   | **RETAIN**                      | GPU timer queries with disjoint-batch discard, and it refuses to convert an absent GPU measurement into a pass.                                                                                                                                                                                |
| `src/three/roach.ts`                                                      | **RETAIN, extend**              | Room-agnostic creature rig, geometry count constant in colony size. Needs a surface-normal argument for climbing — an extension.                                                                                                                                                               |
| `src/three/surfaces.ts`                                                   | **RETAIN**                      | Deterministic seeded procedural surface incident. Caveat recorded: `applyWear` mutates and is **not idempotent**.                                                                                                                                                                              |
| `src/three/occlusion.ts`                                                  | **REFACTOR**                    | Keep alpha hashing, add a per-region active set and distance reject.                                                                                                                                                                                                                           |
| `src/three/env.ts`                                                        | **REFACTOR**                    | `configureRenderer` retained; the light rig and single global equirect are one-kitchen constructs.                                                                                                                                                                                             |
| `src/three/room.ts`, `counter.ts`                                         | **OBSOLETE**                    | Single-room by construction.                                                                                                                                                                                                                                                                   |
| `src/proof/main.ts`                                                       | **OBSOLETE**                    | Proof harness, no restart path, clamps the scout to one worktop.                                                                                                                                                                                                                               |
| `src/sim/**` (20 files, 8,071 lines)                                      | **HARVEST DESIGN, delete code** | Planar and singleton-coupled. The pheromone decay/reinforce model, the six-state worker machine with its stuck-recovery ladder, the unerasable evidence floor, the routine phase machine and the budget/cooldown threat director are all carried forward as **design**, re-implemented in 3-D. |
| `src/render/**`, `src/main.ts`, `src/art/**`, `src/testapi.ts`            | **OBSOLETE**                    | The Canvas2D runtime. Two production renderers are never kept.                                                                                                                                                                                                                                 |
| `tests/**`                                                                | **REPLACE**                     | 180 tests are green and all of them test the deleted game.                                                                                                                                                                                                                                     |
| `artifacts/evidence/isometric-reboot-*`, `quality-reboot-*`, `redesign-*` | **PRESERVE as baseline**        | Never overwritten. New evidence goes to `artifacts/evidence/whole-home-reboot-final/`.                                                                                                                                                                                                         |
| `tools/bake/**`                                                           | **HARVEST**                     | The millimetre-anchored parametric prop library is the single most valuable authored artefact; its shapes and materials are ported to typed builders.                                                                                                                                          |

---

## 4. Obsolete tasks from the cancelled queue — not resumed

The previous queue's next actions were: re-frame 8 kitchen anchor shots, fix per-surface texel
density on the kitchen floor, and author 121 kitchen props in the researched build order. **None are
resumed.** All three are kitchen-only tasks scoped to a layout that no longer exists. The texel-
density _lesson_ (one canvas stretched over 3700 mm is 3.6 mm/texel and reads as banned procedural
noise) is carried forward as a per-surface rule in the new material system.

No background task from the cancelled session is still running. `git status` was clean, so nothing
was left half-written on disk.

---

## 5. First executable action for the new version

**Done at the time of writing:** branch created, world type vocabulary locked
(`src/world/types.ts`), scale anchor unified (`src/world/units.ts`, 1 unit = 35/26 mm), and the
kitchen authored as the reference region (`src/world/regions/kitchen.ts`).

**Next:** assemble the five regions into one navigable house (`src/world/house.ts`) with the gate
graph that makes progression physical, then stand up the colony simulation against it.
