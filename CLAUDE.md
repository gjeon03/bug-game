# CLAUDE.md — persistent operating rules

These rules survive context compaction. Read them before acting. They override habit, and they
override the other contract documents where the two disagree.

---

## 0. Repository boundary (HARD — violating this is the worst possible outcome)

**All work happens on `experiment/whole-home-infestation-3d`. Verify with
`git rev-parse --abbrev-ref HEAD` before editing anything.**

> Superseded branches, kept intact and never edited: `experiment/isometric-threejs-rebuild`,
> `experiment/whole-home-infestation-3d-v2`, `archive/isometric-kitchen-proof` (all three sit on
> `df9db36`), `gameplay-redesign-v3`, `pre-quality-reboot`, `main`.

The finished result is **for local review only**. It is never published from this effort. The final
build is delivered to the user by running it locally — see `LOCAL_REVIEW.md`.

**Never, under any circumstance, and regardless of how well the work is going:**

| Forbidden                          | Includes                                                    |
| ---------------------------------- | ----------------------------------------------------------- |
| `git push` (any form)              | `--force`, `-u`, pushing tags, pushing other branches       |
| `git merge`                        | into or out of this branch                                  |
| `git rebase` onto another branch   | any history rewrite touching a shared branch                |
| `git cherry-pick` into `main`      | any transplant toward a published branch                    |
| `git switch main` to implement     | inspecting main read-only is fine; **editing there is not** |
| Opening a pull request             | `gh pr create`, the web UI, any API call                    |
| Triggering deployment              | `gh workflow run`, Pages workflow, `gh api` dispatch        |
| Changing remotes                   | `git remote add/set-url`, credential or auth changes        |
| Publishing a package               | `npm publish`, `pnpm publish`                               |
| Uploading a build                  | any artifact upload to a remote host                        |
| Modifying production infra         | workflow files that deploy, Pages settings                  |
| **Claiming anything was deployed** | the deployed URL is **not** evidence for this branch's work |

Local checkpoint commits are allowed and encouraged. Committing is safe; **transmitting is not.**

Do not modify global Claude configuration (`~/.claude/**`). Project-local deny rules live in
`.claude/settings.json` and are part of this contract.

`main`, `pre-quality-reboot`, and the deployed site must remain exactly as they are.

---

## 1. Player fantasy (never dilute this)

> **Scope change, 2026-08-07 — KITCHEN ONLY.** This supersedes the whole-home scope below. Five thin
> rooms were worth less than one that holds up: a player walking the kitchen found floating geometry,
> a dead control and almost nothing to do, while four more rooms sat behind gates in the same state.
> The kitchen is now the entire game, and depth in it is the only measure that counts. The other four
> region files are intact in `SEALED_REGIONS` / `SEALED_GATES` and unreferenced — reactivating one is
> adding it back to `REGIONS` and restoring its gate, not re-deriving it. Where §1–§13 say
> "apartment" or "whole-home", read "kitchen".

You are a **lead scout cockroach** — not a distant commander — secretly infesting the kitchen of a
lived-in modern Korean apartment at night. You personally explore, mark opportunities, lay pheromone
logistics, redirect workers, choose colony adaptations, exploit household routines, and escape human
responses, while the household learns from your evidence exactly where to strike.

> "I am tiny, fast, vulnerable, and clever. Every object in this kitchen is enormous. Every
> successful supply route makes my colony stronger, but it also teaches the humans where to strike."

Scouting **is** routing. Growth is visible in the world, never only in a number.

**This is not:** a distant RTS · a passive idle game · a resource spreadsheet · a generic survival
game · a collectathon · a top-down 2D reskin · a flat floor-plan simulator · a tech-tree colony
manager.

Target **one complete 25–35 minute run** in **one excellent room**. The room has to earn that
duration through density — surfaces to reach, refuges to take, routines to exploit, debris to work
— never through longer walks or costlier prices.

### 1a. Controls are keyboard-only

Every action must be reachable from the keyboard. The mouse is not a supported input: a player who
never touches it must be able to play the whole game, including laying and erasing pheromone routes.
Pointer support may exist only as a redundant convenience, and never as the sole path to anything.

## 2. Renderer (decided — see `DECISIONS.md` for the measured basis)

**three.js + WebGL2, true 3D world, glTF/GLB assets.** TypeScript + Vite. Deterministic fixed-step
simulation with render interpolation.

The old **Canvas2D runtime (`src/render/`) is being replaced, not preserved.** Once the three.js
proof passes, the obsolete runtime is removed or isolated from the production entry point. **Never
maintain two production renderers.** Do not preserve the old presentation, map layout, UI
composition, procedural object style, operation structure, or architecture merely because it exists.

three.js is now a **runtime** dependency. The old rule "three.js must never reach the runtime
bundle" is **rescinded** — it belonged to the Canvas2D era.

---

## 3. Camera contract

True 3D diagonal viewpoint. **Not** an editor camera, **not** a flat top-down.

- Low-FOV perspective camera, ~28–38° vertical FOV
- ~40–55° downward pitch, ~30–50° horizontal yaw
- Damped follow, stable world orientation, limited zoom, **no free orbit during normal play**
- Orthographic is a comparison candidate only; adopt only on measured equal depth/scale/atmosphere

Requirements: scout stays in a readable screen region · approaching danger stays visible · camera lag
never hides a threat · no nausea · tall props preserve scale · **foreground objects never permanently
hide the player** · world labels never substitute for composition.

**Occlusion fading is a production system, not a nicety.** 150–300 ms fade, dithered alpha or an
equally depth-stable technique, reduced opacity rather than disappearance, readable silhouette
retained, no alpha-sorting artifacts, no exposed backfaces. Never fade floors, the player, hazards,
or essential route feedback. **No hard popping is acceptable.**

---

## 4. Korean-first localization (hard gate)

- `ko-KR` is the **default and only shipped** player-facing locale. `en` is a development control.
- **No player-facing English may ship.** Not in HUD, overlays, tutorial, alerts, outcome screens,
  `<title>`/`<meta>`, `aria-label`s, or `<noscript>`.
- All strings live in a structured catalog. **Never hardcode a player-facing string in a component,
  renderer, or sim file.**

  > **Verified failure, 2026-08-05:** `src/render/renderer.ts:1707` built
  > `` `${guide.label} · ${tiles} tile${tiles === 1 ? '' : 's'}` `` in code while a correct
  > `hud.guide: '{label} · {tiles}칸'` key sat unused in the catalog. Seventeen headless gates
  > missed it; a real browser showed `2 tiles` in a hover tooltip within thirty seconds. **A
  > complete catalog does not prove the catalog is used.** The locale test must scan rendered
  > output, not catalog contents.

- Terminology is governed by the glossary. Do not re-translate ad hoc.
- Glossary: 먹이 · 수분 · 군체 · 번식 · 페로몬 길 · 노출 · 흔적 · 경계 단계 · 거점 · 적응 · 박멸 · 대피
- Concise, natural, tense. Avoid machine-translated word order and long noun stacks (명사 나열).
- A Korean UX critic owns final wording.
- Every final verification screenshot must be Korean.

### 4a. Korean particles are computed, never hardcoded

A particle after an interpolated value depends on the **sound** of that value. For a number that
means how it is read: 24 is 이십사 and takes 가; 18 is 십팔 and takes 이. Write `{amount}{amount?이/가}`
in the catalog — `t()` picks the form. Never write `{amount}이`.

---

## 5. NanumSquareNeo (hard gate)

- Source: Naver official static host `hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/`.
- License: **SIL Open Font License 1.1**; Naver's help centre lists `NanumSquareNeo` as a Reserved
  Font Name. Bundling and embedding permitted; may not be sold standalone. OFL text ships in-repo.
- Font OS/2 `fsType = 8` (editable embedding).
- Vendored at `src/fonts/*.woff2` — **not** `public/`. Vite copies `public/` verbatim and leaves the
  URL root-absolute, which 404s under a subpath; importing from `src/` makes Vite fingerprint it and
  emit a relative URL. **Never** load from Google Fonts or any CDN.
- Weights: Regular 400, Bold 700, ExtraBold 800, explicit `@font-face` mappings, never synthetic.
- **Wait for `document.fonts.ready` before any text measurement or final layout.**
- Verify at 1280×720, 1440×900, 1920×1080, DPR 1 and DPR 2: no tofu, no clipping, no overflow.

---

## 6. Static build contract

- Completely **serverless at runtime**. Zero essential network requests after load.
- Builds to static files and must run from a nested subpath (`/bug-game/`) — this stays true even
  though this branch never deploys, because it is a correctness property of the build.
- `vite.config.ts` uses `base: './'`. Never introduce a root-absolute `/...` URL in HTML, CSS
  `url()`, JS `fetch`, or an asset path. `scripts/check-subpath.mjs` enforces this.
- All fonts, models, textures, audio, data and licenses vendored locally. No CDN, ever.
- Must survive focus loss and return, and restart without a page reload.

---

## 7. Asset finality

Every visible and audible element is classified in `ASSET_MANIFEST.md` as **intentional final**,
**authored final**, **generated final**, **licensed final**, or **temporary**.

**Temporary assets block completion.** A placeholder that passes a test is still a placeholder.

Completion is blocked by: greybox props · debug primitives · missing materials · silent core actions
· unexplained circles · floating cargo markers · placeholder particles · default three.js materials ·
broken animations · inconsistent asset-pack collage · unlicensed downloads · remote runtime
dependencies · untranslated English · font fallback errors.

Licensed assets require the asset page, the included license file, and a recorded source before use.

**Banned, because each was a confirmed user-reported defect in the previous build:** objects
represented as bare circles/lines · large unbroken blue-black rectangles · appliances drawn as flat
"walls" · floating labels compensating for weak art · flat vector icons used as world objects ·
uniform darkness · detached floating dots as cargo · a glowing circle as the player identifier.

---

## 8. Real-runtime playtesting (no substitutes)

- A passing test suite is **not** evidence of quality. **A real browser is.** See the §4 failure —
  headless gates certified a build that showed English on first hover.
- A full run must be **played**, not accelerated through hidden state mutation. Automated balance
  agents use only actions available to a real player.
- **Deployment is never evidence.** This branch does not deploy. Local production preview at the
  nested path is the target.
- Evidence lives under `artifacts/evidence/<phase>/`. **Never overwrite earlier evidence** —
  baselines are the comparison basis.
  - `artifacts/evidence/isometric-reboot-baseline/` — the old Canvas build, preserved
  - `artifacts/evidence/isometric-reboot-final/` — the new build
- Debug overlays must never appear in the normal presentation.

---

## 9. Coupled-system owners (one sequential owner each)

A critic may diagnose any system. **Only its owner integrates changes.** Never let parallel agents
edit a coupled group simultaneously — that is the known failure mode this process exists to avoid.

| Coupled group                                      |
| -------------------------------------------------- |
| camera + occlusion + player visibility             |
| lighting + materials + shadows + tone mapping      |
| scout movement + collision + animation             |
| pheromone routes + worker AI + carrying            |
| economy + progression + objective pacing           |
| threat director + telegraphs + damage + recovery   |
| environment layout + navigation + prop composition |
| UI layout + Korean typography + world markers      |
| renderer + profiling + performance budgets         |

Parallel agents are for: repository audit · reference research · asset search · license check · prop
and audio candidate production · localization review · isolated test creation · visual criticism ·
gameplay criticism · technical verification.

**Builders never grade their own final work.**

---

## 10. Completion gates (all must pass; evidence or it did not happen)

**New identity** — unmistakably different from the old Canvas build · real 3D environment and camera
· does not resemble a flat diagram · principal zones recognizable **without labels** · kitchen looks
occupied · scale feels insect-sized.

**Camera and visibility** — diagonal camera stable and readable · scout never persistently hidden ·
blocking props fade smoothly · multiple blockers work · restoration works · no transparency-sorting
defect · hazards readable · spatial context preserved.

**Gameplay** — first action ≈10 s · first delivery ≈60 s · pheromone logistics is the differentiator
· vertical routes create real choices · growth changes capability _and_ world presentation · two
adaptation paths produce observably different runs · routines create both opportunity and danger ·
threats respond to evidence · no unexplained decision plateau > 45 s · victory requires active play ·
failure is attributable · restart is immediate.

**Cockroaches** — scout reads as a cockroach · workers individually legible · animation matches speed
and direction · cargo physically readable · no persistent chain-like overlap · no worker stuck beyond
threshold · no geometry penetration · five restarts leave no stale state.

**Korean** — all required text Korean · NanumSquareNeo locally loaded · source and license documented
· no tofu · no clipping · consistent terminology · objectives understandable without documentation.

**Assets and art** — every major object intentionally finished · no default material on a final prop
· materials read distinctly · lighting motivated · growth visibly transforms the environment · core
interactions have visual _and_ audio feedback · no unintended temporary asset.

**Technical** — clean install · typecheck · lint · unit + integration · production build · local
nested-path build · real-browser E2E · zero console errors · zero missing assets · zero runtime
network dependencies · restart and focus tests · performance tails.

**Performance @ 1080p peak play** — p50 ≤ 16.7 ms · p95 ≤ 20 ms · p99 ≤ 33 ms · no unexplained frame

> 100 ms after load · frames > 50 ms below 1% · zero shader-compilation stalls during validated
> active play · zero unbounded workers/particles/audio voices/material clones/event listeners · zero
> restart leakage. **Any revised budget requires measured justification.**

**Repository safety** — work stayed on `experiment/whole-home-infestation-3d` · no merge · no push ·
no PR · no deployment · no remote configuration change · old branches intact.

---

## 11. No planning-only completion

**Planning, greybox, renderer experiments, procedural placeholder art, or a passing E2E script are
never a finished deliverable.** Do not report success without recorded real-browser evidence for the
specific claim being made. If something is blocked, say so plainly and show the exact failure.

Do not use "AAA", "perfect", "commercial quality", or "indistinguishable" as completion claims. The
bar is: **stop looking like a prototype, and meet this document's gates.**

---

## 12. Known environment facts (verified 2026-08-05)

The user authorized installing the missing toolchain. **It is installed and proven, not assumed.**

| Tool                  | Where                                                             | Proof                     |
| --------------------- | ----------------------------------------------------------------- | ------------------------- |
| **Blender 5.2.0 LTS** | `~/Applications/Blender.app`, wrapper `/opt/homebrew/bin/blender` | headless probe, see below |
| Blender Python        | **3.13.13** embedded, `io_scene_gltf2` registered                 | `EXPORT_OP_EXISTS True`   |
| ffmpeg / ffprobe      | `/opt/homebrew/bin/`                                              | on PATH                   |
| ImageMagick           | `/opt/homebrew/bin/magick`                                        | on PATH                   |
| Draco                 | `/opt/homebrew/bin/draco_encoder`, `draco_decoder`                | on PATH                   |

**Proven capability (run 2026-08-05, headless, `--factory-startup`):** mesh → armature → vertex
skinning weights → keyframed animation → `export_scene.gltf` produced a valid GLB
(`magic glTF`, `version 2`, `skins: 1`, `animations: 1`, `nodes: 4`,
generator `Khronos glTF Blender I/O v5.2.39`). **A rigged, animated cockroach is therefore
producible in this environment.** Do not fall back to hand-built code geometry for the hero
character on the assumption that no DCC exists.

- **KTX2/Basis is NOT available** — `ktx` / `ktx-software` / `libktx` are not Homebrew formulae, and
  KTX-Software ships only via GitHub releases. Treat KTX2 as optional ("when supported" in the
  brief). Use PNG/WebP textures unless a measured need appears.
- Also available: Node **21.7.2**, pnpm **9.15.9** (`packageManager: pnpm@10.13.1`), system Python
  **3.10.0** (+ `fonttools`, `brotli`), `rsvg-convert`, three.js **0.185.1**, Homebrew **6.0.15** on
  **arm64**, and Playwright Chromium with **WebGL2 via SwiftShader** — software raster, slow but
  **deterministic**, which is what makes offline rendering produce comparable screenshot evidence.
- Homebrew notes: install casks with `--appdir="$HOME/Applications"` to avoid a `sudo` prompt that
  would hang a non-interactive shell. `--no-quarantine` is **not** a valid option in Homebrew 6.x.
  A single bad package name aborts the whole `brew install` — verify names first.
- Claude-in-Chrome browser automation is available and drives the user's real Chrome. **Use it** —
  it caught a defect all seventeen headless gates missed.
- The ECC Stop hooks resolve correctly here. Do not modify the user's global config.
- A `[Fact-Forcing Gate]` denies the **first** attempt to create any new file and permits the retry.
  State the request and what the command produces, then retry the identical write.
- `gh` is **not authenticated** — and on this branch that is irrelevant, because nothing may be
  pushed, deployed, or opened as a PR.

---

## 13. Method (this is what actually worked)

Every problem solved cheaply in the previous effort was solved by **instrumenting or building a
control**. Every problem approached by guessing took five or six attempts. A frame budget with a
total but no per-phase breakdown sends you to optimize something that costs nothing.

For each high-impact defect: record the observable symptom → identify the exact scenario → separate
symptom from assumed cause → form falsifiable hypotheses → add instrumentation → run a controlled
comparison → confirm or reject → fix the confirmed cause → replay the identical seed and camera →
compare against baseline → run regressions.
