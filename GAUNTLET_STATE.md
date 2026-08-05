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

| Check                                            | Result                                   |
| ------------------------------------------------ | ---------------------------------------- |
| Boots and plays                                  | yes — 187 props, 2 073 meshes, 26 lights |
| Console errors                                   | **0**                                    |
| Failed requests                                  | **0**                                    |
| External network requests                        | **0**                                    |
| Missing prop builders                            | **0** of 175                             |
| Five restarts identical                          | **yes**                                  |
| Korean at 1920x1080 / 1440x900 / 1280x720 / DPR2 | no tofu, no clipping                     |
| Routes draw, workers deliver                     | 27 deliveries in the first 45 s          |
| Unit tests                                       | `house.test.ts` 62/62                    |
| typecheck / lint / build                         | clean · clean · 777 kB (213 kB gzip)     |

---

## 3. Defects found and fixed this session (all by measurement, not inspection)

| #   | Defect                                                                                                                                                                                                                                                           | How found                                                                            | Evidence                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1   | **Exposure field entirely inert.** `buildGrid` copied base→live before zones were painted, so every authored exposure zone in the flat was discarded. The hallway's whole "fast route vs safe route" mechanic did not exist.                                     | grid histogram                                                                       | uniform `0.43 x 4428` → `0.43:656 0.52:1148 0.55:984 0.9:1640`                              |
| 2   | **Blocker rasterisation ate the gameplay gaps.** `ceil()` grew every blocker by up to one 60 mm cell, closing the 100 mm toe-kick — the colony's home corridor.                                                                                                  | cell flag probe                                                                      | pipe mouth `flags=1` → `0`; bathroom shortcut 4641 mm → 2474 mm                             |
| 3   | **Economy structurally net-negative.** ~0.04 units/s produced vs ~0.049 consumed. Every colony starved regardless of play.                                                                                                                                       | differential: moisture survived at 41.5 while food hit 0, and food upkeep was higher | 122 deliveries, final population 0 → `CARGO_VALUE 3.1`, upkeep 0.011/0.008                  |
| 4   | **No cooldown after a sighting.** Standing in light produced a fresh sighting every 2.4 s forever.                                                                                                                                                               | sighting counter                                                                     | 377 → 56 → **9** per run                                                                    |
| 5   | **Evidence floor capped above the alert-3 threshold.** Five sightings pinned a region at "alarmed" permanently, so it never stopped spawning lethal responses — regional loss was unrecoverable.                                                                 | alert trace                                                                          | cap 0.80 → 0.33; workers lost 121 → 52                                                      |
| 6   | **Restart crashed.** `dispose()` force-loses the GL context, then a new `WebGLRenderer` on the same canvas got `null` from `getContext`.                                                                                                                         | real-browser restart                                                                 | `Cannot read properties of null (reading 'precision')` → renderer now reused, scene rebuilt |
| 7   | **Luminous intensity was never unit-converted.** Lengths were converted to world units; intensity was not. three.js irradiance is `intensity/distance²` in world units, so a light 1 m away delivered ~1.4e-6. **Whole scene black** while 2 760 draw calls ran. | control test with a bright clear colour proved geometry was rendering                | centre luminance 0.040 → 0.189                                                              |
| 8   | **Every spot light aimed at the world origin.** `light.target.position` was set but the target was never added to the scene, so its world matrix never updated.                                                                                                  | camera/obstruction probe + light pattern                                             | centre luminance 0.033 → **0.491**                                                          |
| 9   | **Camera sat inside the furniture.** No collision; at the toe-kick the camera solved to z = −3045 mm inside a carcass spanning −3300…−2740 mm.                                                                                                                   | camera position readout                                                              | added wall-only camera collision                                                            |
| 10  | **Fixed yaw was 180° wrong for the layout.** Fitted furniture is authored against low-X/low-Z walls, so at 45° it stood permanently between viewer and scout; registering it as an occluder turned the entire frame into alpha-hash static.                      | screenshot                                                                           | yaw 45° → 225°; run no longer occludes                                                      |
| 11  | Fog far plane 2827 mm — shorter than one room's diagonal.                                                                                                                                                                                                        | inherited-code audit                                                                 | → 12 000 mm                                                                                 |

---

## 3a. Independent criticism — five critics, all FAIL

Full reports: `artifacts/evidence/whole-home-reboot-final/critics/REPORTS.md`.
Five fresh-context critics were told the author's own claims here are to be CHECKED, not believed.

| critic    | verdict  |
| --------- | -------- |
| visual    | **FAIL** |
| gameplay  | **FAIL** |
| camera    | **FAIL** |
| Korean UX | **FAIL** |
| technical | **FAIL** |

**14 BLOCKER + 21 HIGH findings.** They caught things inspection did not, including three where the
author's own evidence disproved the author's own claim.

**Fixed from their findings:**

| Finding                                                                                                                                                                             | Fix                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Korean: `(으)로` written-form fallback rendering literally — the game's FIRST Korean sentence                                                                                       | `t()` now implements the ㄹ-받침 exception (서울**로**, not 서울으로); verified on screen as `쓰레기통으로` / `물기로`                                                          |
| Camera: the 225° yaw was never propagated into world data — nine `solid: true` flags all on camera-NEAR walls, four of five rooms a plasterboard slab                               | flags removed (`outward` already decides); view axis moved to `world/viewpoint.ts` so both layers read one value; load-time assertion throws on any solid near-wall             |
| Visual: scout 88 % hidden behind an unfaded slab in 4 of 8 frames                                                                                                                   | the kitchen run was deregistered as an occluder during the yaw fix; re-registered at `fadeFloor` 0.4                                                                            |
| Visual: 48 % of pixels below luminance 0.04; room unnameable                                                                                                                        | default camera distance 1320 → 1900 mm. Measured: dark pixels 48 % → 12.3 % (`02`), 30.9 % (`03`)                                                                               |
| Gameplay: **13 of 50 exposure zones mathematically inert** — every cover zone in the hallway and bedroom, i.e. chapter 2's entire mechanic                                          | `paintExposure` took `max()` against a 0.425 baseline, so any zone darker than the baseline was discarded. Authored zones now overwrite; only routine LIGHT still takes the max |
| Gameplay: **five referenced routine ids do not exist** — the bedroom had no dynamic light, exposure or refill at all                                                                | `bathroom.shower`, `bedroom.sleep`, `bedroom.restless`, `living.snack`, `hallway.door` added with catalog entries                                                               |
| Gameplay: **victory strictly dominated by the bedroom gate** — the finale never ran, and the win screen congratulated the player for surviving an extermination that never happened | victory now requires surviving `SWEEPS_TO_SURVIVE = 2` whole-home extermination sweeps                                                                                          |

**Their findings still OPEN** (recorded, not fixed — see §4).

---

## 4. Open defects, ranked by player impact

Everything closed this session is struck through with its measurement; everything open is named with
who found it and what they measured, so nothing is quietly retired.

| #   | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | State                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| A   | **The apartment does not read as an apartment.** The visual critic could not name the room without reading the HUD, and measured 48 % of pixels below luminance 0.04 with 61.2 % of the frame inside one ±6 % band — worse than the 53.9 % figure this project's own code comments cite as the defect they exist to fix. 175 prop builders are on disk; roughly a dozen are ever in frame. Partially improved (camera pulled 1320 → 1900 mm, dark pixels now 12.3 % / 30.9 %), **not solved**.                                                                                                                                                               | **OPEN — largest gap**       |
| A2  | ~~Occlusion has never executed a raycast.~~ **CLOSED — not reproducible on the current build.** Re-measured: `registered 98 / candidates 13 / tests 15`, and with the base run between camera and scout in **26 of 26** sampled frames, `fading: 1`. The critic's finding was true when measured; the yaw fix and occluder re-registration resolved it.                                                                                                                                                                                                                                                                                                      | **CLOSED**                   |
| A3  | ~~Threats are never drawn.~~ **CLOSED.** `src/view/threats.ts`: the telegraph is a ring that grows toward the real radius (its size _is_ the warning), then snaps full and drops a kind-specific silhouette — slipper sole, cloth, sticky pad, robot vacuum, spray cone. Verified in a real browser: a `light` threat fired at t=72 s and went telegraph → active (`11-threat-telegraph.png`).                                                                                                                                                                                                                                                               | **CLOSED**                   |
| A4  | ~~Route ribbons leak GL buffers.~~ **CLOSED.** Fixed-capacity `BufferAttribute`s allocated once and written in place with `setDrawRange`. Re-measured with a live route: **5 creates over 540 frames** (all one-time), down from 1 386 over 462.                                                                                                                                                                                                                                                                                                                                                                                                             | **CLOSED**                   |
| A5  | ~~`pnpm test` never completes.~~ **CLOSED.** `pnpm test` is the fast suite (79 tests, under a second); full-run balance moved to `pnpm test:slow`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **CLOSED**                   |
| B0  | ~~The run is not winnable end-to-end.~~ **CLOSED.** Measured seed 20260805 / brood: **WON in 18.4 min**, all five gates, bedroom gate at **18.2 min**, peak population 67, 36 sightings, 87 workers lost, longest plateau 4.4 s.                                                                                                                                                                                                                                                                                                                                                                                                                             | **CLOSED**                   |
| B   | **Chapter pacing is still front-loaded.** The bedroom gate now lands at 18.2 min — a real 16-minute living-room phase — but the first four gates still fall inside ~2 minutes, and the run is 18.4 min against a 25–35 target. Six measured configurations are tabled in §5a.                                                                                                                                                                                                                                                                                                                                                                                | **OPEN — improved, not met** |
| B2  | **Adaptation families are scalar multipliers on one loop.** The gameplay critic showed the test that claims two builds diverge cannot discriminate between them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **OPEN**                     |
| B3  | ~~The household never passes alert 1.~~ **CLOSED — two bugs, both mine.** (a) `EVIDENCE_DECAY` raised to 0.0075/s exceeded the ~0.0045/s a chapter-1 colony generates, so evidence could never climb — measured: two loud routes for 90 s, every region alert 0, evidence 0.01. Decay is now scaled by traffic, normalised against colony size, with a floor so nothing is pinned. (b) `quietFor` is the cooldown since the last _response_, but was reset whenever the alert _rose_, so a worsening region kept postponing its own response — evidence 0.02 → 0.82, alert 0 → 3 over 163 s, zero responses. Both fixed; first response now fires at t=72 s. | **CLOSED**                   |
| B5  | ~~`traffic` grew without bound~~ (gains 0.05/s per worker, decays 0.12/s). **CLOSED** — clamped, as the no-unbounded-growth gate requires.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **CLOSED**                   |
| B4  | **Player-drawn routes are locked to the scout's own surface**, so sites on other surfaces cannot be routed to by dragging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **OPEN**                     |
| C   | ~~No real-hardware performance measurement.~~ **CLOSED.** Real Chrome on the M1 via Metal with GPU timer queries, 30 s of active play with a live colony: presented **p50 16.70 / p95 17.80 / p99 18.50 ms**, worst 18.70; CPU 4.20/4.80; GPU 3.97/4.23; **0 frames over 33 ms**; 393 draw calls. Was 50.0 / 51.6 / 83.4 with CPU 47.9 and GPU 43.9 before static baking and the fixed light pool. `performance.json`                                                                                                                                                                                                                                        | **CLOSED**                   |
| C2  | ~~No audio.~~ **CLOSED.** `src/audio/bridge.ts` maps `run.cues` to the retained synthesiser, panned from real world positions against the camera basis. Verified in real Chrome: `audio: started, 2 voices`.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **CLOSED**                   |
| C3  | ~~No independent criticism.~~ **CLOSED.** Five fresh-context critics, all FAIL, 14 blocker + 21 high findings; seven fixed this session, the rest recorded above. `critics/REPORTS.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **CLOSED**                   |
| D   | **Visual finish is uneven.** Four of five regions have still never been looked at by a human.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **OPEN**                     |
| E   | ~~Korean: `log.threat.incoming` ungrammatical; route-health strings never rendered.~~ **CLOSED.** Threat labels are action-nouns (`불 켜기`, `끈끈이 설치`, `로봇청소기 가동`, `살충제 살포`) under one frame — `{region}에서 {threat}{threat?이/가} 시작된다` — grammatical for all seven. A HUD route panel renders all seven `hud.routeHealth.*` strings with severity colour.                                                                                                                                                                                                                                                                            | **CLOSED**                   |
| E2  | Other authored-but-unrendered keys remain (WebGL2 error path, loading screen, adaptation cost).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **OPEN**                     |

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

## 5a. The economy sweep, in full

Every configuration measured, seed 20260805 (brood) and 4242 (shadow). This is the record of what
run length actually responds to, and it is not what it looked like from the armchair.

| gate costs | source amounts               | systems                            | brood             | note                                                     |
| ---------- | ---------------------------- | ---------------------------------- | ----------------- | -------------------------------------------------------- |
| x1         | x1                           | exposure INERT, 5 routines missing | WON 21.4 min      | winnable _because_ things were broken                    |
| x2.5       | x1                           | same                               | NOT WON at 45 min | starved: food 404, moisture 0                            |
| x2         | x1.7                         | same                               | WON 6.4 min       | more supply compounds faster than bigger costs hold back |
| x1.6       | x1                           | same                               | NOT WON at 50 min | food 4, moisture 467 — wrong resource, not no resource   |
| x1         | x1                           | exposure + routines FIXED          | NOT WON at 50 min | peak 14, food 0, moisture 176                            |
| x1         | x1, kitchen food x2 + refill | fixed                              | **WON 18.4 min**  | bedroom gate at 18.2 min                                 |

The lesson the numbers actually support: run length is not a constant to sweep. Every failure had
the same signature — food at zero while moisture overflowed — and the fix was never a multiplier, it
was **putting enough food where the colony starts**. Once cover zones worked, every route to distant
food got long, and the map had nothing close by. Nothing in the first four attempts addressed that
because none of them looked at _which_ resource ran out.

---

---

## 6. Exact next executable action

**Occlusion has never executed a raycast.** The technical critic measured `maxTests: 0` across
1 022 frames with 94 occluders registered, both standing still and walking. Either the per-region
broadphase filter or the bounding spheres computed at registration are wrong — the sphere comes from
`Box3.setFromObject`, and each occluder group is re-baked into a single child mesh immediately
before that call, so a bounds/transform mismatch is the likeliest cause. Instrument `candidates`
versus `tests` per frame and find which of the two rejects everything.

That is top of the list because it means the entire occlusion system — unit-tested, documented, and
credited in three commit messages — is not running at all in the shipped build.

Then: draw the threats (`run.threats` is read by nothing under `src/view/`), and fix the route
ribbon GL buffer leak (1 386 `createBuffer` / 0 `deleteBuffer` over 462 frames).

## 7. Method (non-negotiable — it found every defect in §3)

Record the observable symptom → separate symptom from assumed cause → form a falsifiable hypothesis
→ **instrument or build a control** → run the controlled comparison → confirm or reject → fix the
confirmed cause → re-measure the same seed and camera.

Defect 7 is the case for this: "the scene is too dark" was the symptom, and three plausible causes
(exposure, camera, materials) were all wrong. Setting the clear colour bright — a control that costs
one minute — proved geometry was rendering and pointed straight at lighting. Two of the fixes in §3
were reverted after measurement showed they made things worse; guessing would have shipped both.
