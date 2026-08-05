# GAUNTLET_STATE

**Live production state.** Updated before the end of every turn. If this file disagrees with
anything written in chat, **this file is correct**.

**Branch** `experiment/whole-home-infestation-3d` · **0 pushes, 0 merges, 0 PRs, 0 deployments.**
Verify with `git rev-parse --abbrev-ref HEAD`.

---

## 0. What exists right now

A playable 3-D whole-home game that boots in a real browser. The colony starts under the kitchen
sink and opens the flat by physically breaching sealed passages. Five authored regions, 187 props,
a deterministic fixed-step simulation, a Korean-only UI on locally vendored NanumSquareNeo.

Run it: `pnpm build && pnpm preview` → <http://127.0.0.1:4273/>. See `LOCAL_REVIEW.md`.

Inherited-code disposition: `CANCELLED_GOAL_HANDOFF_AUDIT.md`.

---

## 1. Architecture

```
src/world/   authored apartment: units, types, nav grid + A*, house assembly, 5 region files
src/colony/  deterministic simulation: state, scout, workers, routes, household, progression, step
src/view/    three.js: scene, camera, lighting, materials, shapes, props/ (5 files, 175 builders),
             roaches, routes, occlusion, profiler, surfaces, render facade
src/ui/      hud.ts + styles.css — the ONLY place t() is called
src/i18n/    index.ts (retained) + ko.ts (242 keys) + en.ts (key-echo dev locale)
src/game/    boot.ts, input.ts, loop.ts — one entry point
```

**Hard rule:** simulation state carries catalog **keys + params**, never rendered strings. `t()` is
called only in `src/ui/`. The previous build's English leak is structurally impossible here.

**Scale anchor:** 1 world unit = 35/26 mm. Authored in millimetres, converted once.

**Camera:** FOV 32°, pitch 50°, **yaw 225° fixed**. Because the yaw never changes, the walls between
viewer and room are known at load and built as 320 mm stubs — a static cut, so there is no per-frame
wall fading and no transparency-sorting class of defect. Props fade (alpha hash); walls collide.

---

## 2. Verified in a real browser

`artifacts/evidence/whole-home-reboot-final/` + `runtime-report.json`, produced by `pnpm capture`.

| Check | Result |
| --- | --- |
| Boots and plays | yes — 187 props, 2 073 meshes, 26 lights |
| Console errors | **0** |
| Failed requests | **0** |
| External network requests | **0** |
| Missing prop builders | **0** of 175 |
| Five restarts identical | **yes** |
| Korean at 1920x1080 / 1440x900 / 1280x720 / DPR2 | no tofu, no clipping |
| Routes draw, workers deliver | 27 deliveries in the first 45 s |
| Unit tests | `house.test.ts` 62/62 |
| typecheck / lint / build | clean · clean · 777 kB (213 kB gzip) |

---

## 3. Defects found and fixed this session (all by measurement, not inspection)

| # | Defect | How found | Evidence |
| --- | --- | --- | --- |
| 1 | **Exposure field entirely inert.** `buildGrid` copied base→live before zones were painted, so every authored exposure zone in the flat was discarded. The hallway's whole "fast route vs safe route" mechanic did not exist. | grid histogram | uniform `0.43 x 4428` → `0.43:656 0.52:1148 0.55:984 0.9:1640` |
| 2 | **Blocker rasterisation ate the gameplay gaps.** `ceil()` grew every blocker by up to one 60 mm cell, closing the 100 mm toe-kick — the colony's home corridor. | cell flag probe | pipe mouth `flags=1` → `0`; bathroom shortcut 4641 mm → 2474 mm |
| 3 | **Economy structurally net-negative.** ~0.04 units/s produced vs ~0.049 consumed. Every colony starved regardless of play. | differential: moisture survived at 41.5 while food hit 0, and food upkeep was higher | 122 deliveries, final population 0 → `CARGO_VALUE 3.1`, upkeep 0.011/0.008 |
| 4 | **No cooldown after a sighting.** Standing in light produced a fresh sighting every 2.4 s forever. | sighting counter | 377 → 56 → **9** per run |
| 5 | **Evidence floor capped above the alert-3 threshold.** Five sightings pinned a region at "alarmed" permanently, so it never stopped spawning lethal responses — regional loss was unrecoverable. | alert trace | cap 0.80 → 0.33; workers lost 121 → 52 |
| 6 | **Restart crashed.** `dispose()` force-loses the GL context, then a new `WebGLRenderer` on the same canvas got `null` from `getContext`. | real-browser restart | `Cannot read properties of null (reading 'precision')` → renderer now reused, scene rebuilt |
| 7 | **Luminous intensity was never unit-converted.** Lengths were converted to world units; intensity was not. three.js irradiance is `intensity/distance²` in world units, so a light 1 m away delivered ~1.4e-6. **Whole scene black** while 2 760 draw calls ran. | control test with a bright clear colour proved geometry was rendering | centre luminance 0.040 → 0.189 |
| 8 | **Every spot light aimed at the world origin.** `light.target.position` was set but the target was never added to the scene, so its world matrix never updated. | camera/obstruction probe + light pattern | centre luminance 0.033 → **0.491** |
| 9 | **Camera sat inside the furniture.** No collision; at the toe-kick the camera solved to z = −3045 mm inside a carcass spanning −3300…−2740 mm. | camera position readout | added wall-only camera collision |
| 10 | **Fixed yaw was 180° wrong for the layout.** Fitted furniture is authored against low-X/low-Z walls, so at 45° it stood permanently between viewer and scout; registering it as an occluder turned the entire frame into alpha-hash static. | screenshot | yaw 45° → 225°; run no longer occludes |
| 11 | Fog far plane 2827 mm — shorter than one room's diagonal. | inherited-code audit | → 12 000 mm |

---

## 4. Open defects, ranked by player impact

| # | Defect | State |
| --- | --- | --- |
| A | **No audio.** `src/audio/audio.ts` is retained, functional, and **not wired** to the new simulation's cue stream. The game is silent. Core interactions being silent is an explicit completion blocker. | **OPEN — largest gap** |
| B | **Chapter pacing is front-loaded.** All five gates fall inside ~3 minutes; the remaining ~20 are spent accumulating toward the victory condition. A 2.5× cost increase was tried, measured, and **reverted** because it broke winnability outright (see the note above `GATES` in `src/world/house.ts`: won 24.5 min → not won at 45 min, 5 gates → 3, sightings 9 → 183, end population 39 → 0). Fixing this needs the economy re-derived alongside the costs, not just larger numbers. | **OPEN, documented, not papered over** |
| C | **No real-hardware performance measurement.** All browser evidence is headless SwiftShader — deterministic and useless for frame time. 2 239–2 760 draw calls and ~260–322 k triangles are high and unmeasured on the M1. | **OPEN** |
| D | **Visual finish is uneven.** The apartment is built and lit, but only the kitchen has been looked at by a human. Four regions have never been seen. | **OPEN** |
| E | **No independent critics have reviewed this build.** Visual, gameplay, camera, Korean-UX and technical review are all unrun. | **OPEN** |
| F | Occlusion fade is implemented and unit-tested but **not visually verified in scene** for the multi-blocker case. | **OPEN** |

---

## 5. Verified environment facts (re-run 2026-08-05)

Blender 5.2.0 LTS headless with working glTF export (rigged+animated GLB re-verified). ffmpeg 8.1.2,
ImageMagick 7.1.2-29, draco 1.5.7, Node 21.7.2, pnpm 9.15.9, three 0.185.1, Playwright 1.62.1.
Reference machine: MacBookPro17,1 · M1 8-core · 16 GB · Metal 4.

**Unavailable:** KTX2/Basis (not a Homebrew formula) · any image or 3-D generation tool, local or
remote (no credentials) · glTF optimiser CLI. **All art in this build is procedural three.js
geometry authored in millimetres** — no external asset was downloaded or required.

**Headless Playwright renders through ANGLE/SwiftShader.** Valid for screenshots and logic. Invalid
for frame time. Real Chrome on the M1 is the only perf target.

---

## 6. Exact next executable action

Wire `src/audio/audio.ts` to `run.cues`, which `boot.ts` already drains every frame and currently
discards. The cue kinds the simulation already emits are: `route.laid`, `route.erased`,
`worker.born`, `worker.died`, `worker.pickup`, `worker.deliver`, `worker.recover`, `scout.seen`,
`scout.found`, `scout.climb`, `foothold.claimed`, `gate.opened`, `adaptation.chosen`,
`routine.incoming`, `routine.active`, and `threat.<kind>.telegraph` / `.start`. That closes the
largest open gate (A) with no new systems.

Then (C): capture a profile in real Chrome on the M1 and set budgets from it.

---

## 7. Method (non-negotiable — it found every defect in §3)

Record the observable symptom → separate symptom from assumed cause → form a falsifiable hypothesis
→ **instrument or build a control** → run the controlled comparison → confirm or reject → fix the
confirmed cause → re-measure the same seed and camera.

Defect 7 is the case for this: "the scene is too dark" was the symptom, and three plausible causes
(exposure, camera, materials) were all wrong. Setting the clear colour bright — a control that costs
one minute — proved geometry was rendering and pointed straight at lighting. Two of the fixes in §3
were reverted after measurement showed they made things worse; guessing would have shipped both.
