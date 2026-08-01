# DECISIONS — material deviations and rationale

Recorded per the production contract. Each entry states what the default was, what was chosen, and
why the change preserves or improves the outcome.

---

## D1 — Canvas2D runtime instead of Phaser

**Default in brief:** TypeScript + Vite + Phaser (or equivalent 2D runtime).
**Chosen:** TypeScript + Vite + a ~1.2 kLOC purpose-built Canvas2D renderer, zero gameplay runtime deps.

**Why this qualifies under the brief's exception clause:**

- _Preserves the player fantasy_ — the art direction is a lighting composite (multiply darkness layer
  with additive light holes) over procedurally generated sprites. Phaser's scene/camera/blend stack
  would have to be bypassed for exactly this effect anyway.
- _Supports deterministic simulation_ — the simulation is DOM-free and imports nothing from the
  renderer, so it runs identically in Node (Vitest) and the browser. Phaser couples update to its own
  scene lifecycle and to `requestAnimationFrame`, which would have required a parallel headless path.
- _Static Pages build_ — unchanged; both produce static output.
- _Improves quality/feasibility_ — every visible asset is generated procedurally at boot, so the
  loader/atlas/texture-packing half of Phaser is dead weight. Measured cost: Phaser ≈ 1.1 MB min
  (≈ 300 kB gzip) versus this build's total gzip budget of 150 kB, which materially affects the
  cold-load gate.
- _Does not increase integration risk_ — the surface actually written (camera, blit, particle pool,
  input, audio mixer) is smaller than the surface that would have been written _against_ Phaser.

**Cost accepted:** no third-party physics/tween/particle editors. Mitigated by keeping collision to
circle-vs-AABB, which is all this authored kitchen needs.

---

## D2 — Pheromone is secreted by the scout, not painted with the pointer

**Default in brief:** "hold the primary pointer input to lay a limited pheromone route."
**Chosen:** hold `LMB` **or** `Space` to secrete pheromone **from the scout's own body** as it moves.

**Why:** pointer-painting lets a player route through ground the scout has never visited, which
decouples the logistics layer from the scouting layer and quietly deletes the reason the scout is
fragile. Secretion makes route creation and personal risk the _same act_: a shortcut across open tile
is dangerous for you before it is dangerous for your workers. It also keeps the differentiator away
from RTS-style drawing.

The primary pointer input is still the primary binding (hold LMB), so the brief's input shape is
preserved; only the origin of the trail moved from the cursor to the body. A full keyboard alternative
exists so the game is playable without a mouse.

---

## D3 — Crack functions are authored, not chosen from a menu

**Default in brief:** three upgrades (Brood Chamber, Food Cache, Escape Tunnel).
**Chosen:** all three exist, but each is pre-assigned to a specific authored crack.

**Why:** a per-crack function picker adds a modal UI, a currency comparison and a "wrong build order"
failure mode, none of which serve the differentiator. Pre-assigning them keeps the decision where the
game is actually interesting — _which risk do I take next, and when_ — and makes each crack a distinct,
recognisable place with a distinct silhouette and reward. Each still has a distinct visual change and a
distinct gameplay consequence, as required.

Placement encodes the risk curve: Brood Chamber under the island (centre, exposed), Food Cache in the
pantry gap (far but covered), Escape Tunnel behind the radiator (far, next to the trash, high traffic).

---

## D4 — No render interpolation

Simulation is fixed 60 Hz and rendering reads entity state directly rather than interpolating between
two sim states.

**Why:** at a 60 Hz sim on 60 Hz displays the interpolation error is sub-pixel, while carrying an
extra previous-transform per entity would double the hot-loop memory traffic for ~90 roaches plus
particles. The clamped accumulator plus a 5-step cap keeps it stable on slower displays; the
`p95 ≤ 20 ms` budget is what actually guards presentation smoothness, and it is measured rather than
assumed. Revisit only if measured frame pacing fails the budget.

---

## D5 — All assets generated procedurally at boot; no binary asset files

**Default in brief:** any of authored sprites, procedural canvas/SVG, Blender renders, generated
images, or licensed assets.
**Chosen:** procedural Canvas2D generation (sprites, textures, decals) + WebAudio synthesis (all
sound), both seeded and deterministic. Zero image, audio or font files are fetched at runtime.

**Why, after tool inspection:** Blender, Inkscape and sox are not installed on this machine; ffmpeg
and ImageMagick are, but a raster pipeline would ship megabytes of PNG/audio for art that is
fundamentally geometric (ellipses, gradients, noise) and for sound that is fundamentally synthetic
(filtered noise, sub-bass thuds). Procedural generation gives: perfect DPI scaling, a 0-byte asset
payload, unambiguous licensing (100 % first-party), and per-instance variation that a fixed sprite
sheet cannot provide.

**This is a final production method, not a placeholder.** The classification per asset class is in
`ASSET_MANIFEST.md`. Typography is the one exception: the UI uses a system font stack rather than a
bundled webfont, which is a deliberate "intentional final" choice recorded there.

**Cost accepted:** ~40–90 ms of one-time atlas generation at boot, measured and reported in the
startup timing evidence.

---

## D6 — `base: './'` rather than a hard-coded Pages base

Vite emits relative asset URLs. The build is therefore path-agnostic: it runs from the domain root,
from `/<repo>/`, or from any nested path, with no environment variable and no rebuild. This is
verified by serving the real `dist/` under a synthetic `/bug-game/` prefix in E2E.

---

## D7 — Deployment held until explicitly approved, then carried out

Creating a public repository and pushing are outward-facing and hard to reverse, so both were held
until the repository owner approved them explicitly, even though `gh` was already authenticated with
the necessary scopes. Until that point `DEPLOYMENT.md` stated plainly that the project was **not**
deployed and named the single external action required.

Approval was given, and the deployment was then carried out and verified against the public URL
rather than assumed: <https://gjeon03.github.io/bug-game/> is loaded, played to a worker delivery, and
checked for stray network requests by `scripts/verify-live.mjs`, whose output is committed as
`artifacts/evidence/deployment-live.json`.

---

## D8 — Evidence is graded by exposure, not gated by a threshold

**Original implementation:** a worker or trail node counted as "exposed" if it crossed a fixed
exposure threshold, and each contributed a fixed amount per second.

**Chosen:** each contributes in proportion to how far it sits _above_ a do-nothing baseline
(`EVIDENCE_BASELINE`), capped per roach so one bright light cannot dominate.

**Why, with the measurement:** an independent gameplay review measured that the threshold approach
had no working setting. At 0.55 nothing on unlit floor ever counted — dark open tile reads exactly
0.30 — so a deliberately terrible route ended a night with _lower_ suspicion (3.16) than a careful one
(4.50). At 0.26 everything counted, because almost the whole floor is more than a toe-kick from
cabinetry, so a passing patrol torch pushed every worker over at once and one patrol pass added ~80
suspicion. Grading gives a continuous gradient — cover ≈ 0, dark open floor a trickle, lit open floor
several times that — which is the shape the design always described and never implemented.

Verified by `tests/unit/balance.test.ts`: same seed, same 140 s, same destination — a cover-hugging
route peaks below 5, a route through the under-sink light peaks above 18.

## D9 — Claimed cracks are shelter

**Added:** a roach inside a claimed crack cannot be touched by a foot or by spray, and panicking
workers run for the nearest claimed crack (the Escape Tunnel reaching furthest at 1100 units versus
680).

**Why:** the extermination response previously had no counterplay at all. The review measured a
careful colony of 52 reduced to 6 by the final sweep, and separately found the Escape Tunnel "nearly
inert" — its 700-unit panic radius contained no colony activity. Making cracks shelter turns a sweep
into something the colony _reacts_ to, gives the third upgrade a real job, and pays back the evidence
that claiming it cost. Measured effect on the same scripted run: losses through the final response
fell from 69 to 17.

This is also why the run can be won at all: surviving the final response is a win criterion, and
before this there was no action that improved the odds of it.

## D10 — Breeding pauses so the larder can fill

**Added:** brood requires a population-scaled surplus, and stops entirely once the colony is at
fighting strength until reserves are above the win thresholds.

**Why:** brood previously ran whenever reserves cleared a flat floor of 22 food / 12 water, so the
colony spent every surplus down to that floor while the win condition demanded 120 / 90 banked. The
two goals competed forever and the win was unreachable by construction. The pause is surfaced to the
player (`world.banking`) rather than being a silent rule.
