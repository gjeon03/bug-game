# CLAUDE.md — persistent operating rules

These rules survive context compaction. Read them before acting. They override habit, and they
override the other contract documents where the two disagree.

## 1. Player fantasy (never dilute this)

You are the **logistics mind of a cockroach colony** secretly turning a lived-in modern Korean
apartment kitchen at night into your domain, while the household learns from your evidence exactly
where to exterminate you. You personally walk every route the colony will use. Scouting *is*
routing. Growth is visible in the world, not in a number.

## 2. Korean-first localization (hard gate)

- `ko-KR` is the **default and only shipped** player-facing locale. An `en` catalog may exist for
  development only.
- **No player-facing English may ship.** Not in the HUD, overlays, tutorial, alerts, outcome
  screens, `index.html` `<title>`/`<meta>`, `aria-label`s, or `<noscript>`.
- All strings live in a structured catalog under `src/i18n/`. **Never hardcode a player-facing
  string in a component or sim file.** Keys are dot-namespaced and independent of English wording.
- Terminology is governed by the glossary in the localization spec. Do not re-translate a term
  ad hoc; if a term is wrong, change it in the glossary and propagate.
- Korean must be concise and natural for a tense strategy game. Avoid machine-translated word order
  and long noun stacks (명사 나열).
- Every final verification screenshot must be Korean.

## 3. NanumSquareNeo (hard gate)

- Source: Naver official static host `hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/`.
- License: **SIL Open Font License 1.1**. Naver's help centre explicitly lists `NanumSquareNeo` in
  the Reserved Font Name list. Bundling, redistribution and embedding are permitted; the font may
  not be sold standalone. The OFL text and attribution ship in the repo.
- Font OS/2 `fsType = 8` (editable embedding) — machine-readable embedding permission.
- Vendored locally at `public/fonts/*.woff2`. **Never** load from Google Fonts or any CDN.
- Weights shipped: Regular 400, Bold 700, ExtraBold 800. Declare explicit `@font-face` weight
  mappings; never rely on synthetic bolding.
- **Wait for `document.fonts.ready` before any canvas text measurement or final layout.** Font
  swap-in after measurement causes the layout jumps this gate exists to prevent.

## 4. Static GitHub Pages contract (hard gate)

- Completely **serverless at runtime**. Zero essential network requests after load.
- Builds to static files; must run from the repository subpath `/bug-game/`.
- `vite.config.ts` uses `base: './'` — keep it. Never introduce a root-absolute `/...` URL in HTML,
  CSS `url()`, JS `fetch`, or an asset path. `scripts/check-subpath.mjs` enforces this in CI.
- All fonts, art, audio, data and licenses are vendored locally.
- Must survive page focus loss and return, and restart without a reload.

## 5. Renderer and art pipeline

- **Runtime renderer: Canvas2D** (`src/render/`), the only module that touches the game canvas.
  Reconfirm against `DECISIONS.md` before assuming — the renderer bake-off is recorded there, and a
  migration entry supersedes this line.
- **Art is baked offline, never drawn procedurally at runtime.** `tools/bake/` renders parametric
  3D props in headless Chromium (three.js, SwiftShader — deterministic) through **one shared camera
  and light rig** (`tools/bake/lib/rig.mjs`) and writes PNG atlases to `public/art/`.
  - three.js is a **devDependency only**. It must never reach the runtime bundle.
  - Scale anchor: scout = 26 world units = 35 mm. Model every prop in real millimetres via
    `tools/bake/lib/units.mjs`. Never eyeball sizes in world units.
  - Camera tilt is 26° off straight-down so objects show a front face and gain elevation. The
    **simulation stays 2D**; only presentation is 2.5D. Sprites are placed by their baked ground
    anchor, which is what keeps depth sorting correct.
  - Bakes must be deterministic (seeded RNG only) so screenshots remain comparable evidence.
- **Banned, because each was a confirmed user-reported defect:** objects represented as bare
  circles/lines; large unbroken blue-black rectangles; appliances drawn as flat "walls"; floating
  labels compensating for weak art; flat vector icons used as world objects; uniform darkness.
- `ART_BIBLE.md`'s old rule *"Cabinets and appliances are walls, not props"* is **rescinded** — it
  is the direct cause of the giant-rectangle defect.

## 6. Asset finality

Every visible and audible element is classified in `ASSET_MANIFEST.md` as *intentional final*,
*generated final*, *licensed final*, or *temporary*. **Temporary assets block completion.** A
placeholder that passes a test is still a placeholder.

## 7. Real-runtime playtesting (no substitutes)

- A passing test suite is **not** evidence of quality. Screenshots from a real browser at real
  gameplay camera scale are.
- A full run must be **played**, not accelerated through hidden state mutation.
- Capture evidence under `artifacts/evidence/<phase>/`. **Never overwrite earlier evidence** —
  baselines are the comparison basis.
- Debug overlays must never appear in the normal presentation.

## 8. Architecture ownership

The main integration owner keeps control of tightly coupled systems: input/scout/collision/camera;
pheromone/worker AI/carrying/economy; household director/threats/damage/recovery;
renderer/world layout/lighting; Korean UI layout and font metrics; simulation timing and telemetry.
Parallel agents may work on isolated art, audio, localization review, criticism and verification —
**never on shared gameplay state simultaneously.**

## 9. Completion gates (all must pass; evidence or it did not happen)

- Kitchen reads as an occupied home; sink, drain, plates, dishwasher, stove, refrigerator, pantry,
  waste and doorway recognizable **without labels**.
- Cockroaches never read as ovals or malformed chains; all animate and navigate without persistent
  stuck or broken states.
- Zero player-facing English; zero tofu glyphs, clipping or overflow at 1280×720, 1440×900,
  1920×1080 and HiDPI.
- First input ≈10 s; first delivery ≈45 s; no unexplained decision plateau > 45 s.
- Two build paths produce observably different runs. Restart is immediate; five restarts leak no
  stale workers, routes, threats, UI or telemetry.
- Clean install, format, lint, typecheck, unit, build and E2E all pass; game runs at `/bug-game/`.
- Zero unexplained console errors; zero missing asset requests.
- 1080p peak play: p50 ≤ 16.7 ms, p95 ≤ 20 ms, p99 ≤ 33 ms; no unexplained frame > 100 ms after
  load; frames > 50 ms below 1%.

## 10. No planning-only completion

**Planning, greybox, renderer experiments, procedural placeholder art, or a passing E2E script are
never a finished deliverable.** Do not report success without recorded real-browser evidence for the
specific claim being made. If something is blocked, say so plainly and show the exact failure.

## 11. Known environment facts (verified 2026-08-04)

- No Blender, ffmpeg, ImageMagick, Inkscape or Python PIL on this machine. Available: Node 21,
  Python 3.10 (+ `fonttools`, `brotli` installed via pip), `rsvg-convert`, pnpm 9, and Playwright
  Chromium with **WebGL2 via SwiftShader** — which is what makes deterministic offline baking work.
- Package manager is **pnpm** (`packageManager: pnpm@10.13.1`); local pnpm is 9.15.9.
- The ECC Stop hooks resolve correctly here — every referenced script exists under
  `~/.claude/plugins/cache/ecc/ecc/2.1.0/scripts/hooks/`. Do not modify the user's global config.
- A `[Fact-Forcing Gate]` denies the **first** attempt to create any new file and permits the
  retry. State callers/API/instruction, then retry the identical write.
