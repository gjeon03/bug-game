# CLAUDE.md — persistent operating rules

These rules survive context compaction. Read them before acting. They override habit, and they
override the other documents in this repository where the two disagree.

**Revised 2026-08-09.** The revision is recorded in §14, including what was removed and why. Read §14
first if you worked on this project before that date — several rules you may remember are gone.

---

## 0. Repository boundary (HARD — violating this is the worst possible outcome)

**Work on the branch you are already on.** Verify with `git rev-parse --abbrev-ref HEAD` at the start
of a session and do not switch. This rule used to name a specific branch, went stale the moment a
branch was cut from it, and then contradicted its own verification command on every session — so it
names none.

> Superseded branches, kept intact and never edited: `experiment/isometric-threejs-rebuild`,
> `experiment/whole-home-infestation-3d-v2`, `archive/isometric-kitchen-proof` (all three sit on
> `df9db36`), `gameplay-redesign-v3`, `pre-quality-reboot`, `main`.

### Publishing (rewritten 2026-08-09 on the user's explicit instruction — read the whole section)

This section used to forbid pushing, merging and deploying outright. The user lifted that, in stages,
in one session: first "push the branch so the history is on GitHub", then "merge it into main — I
have no plan to keep main as it was", after the consequence below was put to them in writing and
they chose it.

**The consequence, which must be restated before every main push:** `.github/workflows/pages.yml`
triggers on `push: branches: [main]`. **Merging to `main` and pushing it replaces the live site at
<https://gjeon03.github.io/bug-game/>.** This is public and hard to reverse. Check that trigger is
still what this paragraph says; if the workflow ever changes, re-derive the consequence rather than
trusting this sentence.

**Permitted:** pushing `experiment/**` branches · fast-forward or merge commits from an experiment
branch into `main` · pushing `main`, and therefore deploying · cutting new branches from either.

**Still forbidden, regardless of how well the work is going:** force-pushing anything · deleting a
remote branch · `git rebase` or history rewriting on a branch that has been pushed · changing remotes
or credentials · publishing a package · modifying the deploy workflow to widen its trigger ·
**claiming anything was deployed without checking the workflow run**.

**Ask before every main push.** The standing permission is for the merge the user asked for, not for
a habit. A later session must put the deployment consequence in front of the user again and get an
answer, because the thing being overwritten is public.

**Neither a pushed branch nor a green deployment is a completion claim.** The deployed URL is not
evidence that any gate in §10 passed.

Do not modify global Claude configuration (`~/.claude/**`). Project-local settings live in
`.claude/settings.json` and are part of this contract.

---

## 0a. One source of truth (added 2026-08-09 — the absence of this rule cost more than any bug)

**`.claude/gauntlet-state.md` is the only file that describes the current state of the work.** If any
other file disagrees with it, that other file is wrong.

- `docs/superseded/` holds documents that describe builds that no longer exist. **They are history.
  Never rewrite them, never cite them, never treat "this file is out of date" as a task.** Eight of
  them used to sit in the repository root carrying a banner that redirected to a ninth document that
  was itself out of date — a truth graph whose root node was dead.
- `docs/COMPLETION_RECOVERY.md` is a **frozen** narrative log of sessions up to §62. Read it to find
  out whether something was already tried. **Do not append to it.** It reached 2,155 lines and was
  edited in 61 of 147 commits; the writing had become the work.
- **The commit message is the narrative.** One thesis per commit, in Korean, stating what changed and
  what measurement justified it. That is the record. There is no third place to write it down.
- Update the state file **when a measurement changes a decision** — not at the end of every turn. A
  state file rewritten every turn is a file that gets rewritten instead of the game.

Root holds five documents and no more: this file, `README.md`, `LOCAL_REVIEW.md`, `DECISIONS.md`,
`ASSET_MANIFEST.md`.

---

## 1. Player fantasy (never dilute this)

> **Scope: KITCHEN ONLY** (2026-08-07). Five thin rooms were worth less than one that holds up. The
> other four region files are intact in `SEALED_REGIONS` / `SEALED_GATES` and unreferenced —
> reactivating one is adding it back to `REGIONS` and restoring its gate.

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

**three.js + WebGL2, true 3D world.** TypeScript + Vite. Deterministic fixed-step simulation with
render interpolation. All art is procedural three.js geometry authored in millimetres; no external
asset is downloaded or required.

**Never maintain two production renderers.** Do not preserve the old presentation, map layout, UI
composition, procedural object style, operation structure, or architecture merely because it exists.

---

## 3. Camera contract

True 3D diagonal viewpoint. **Not** an editor camera, **not** a flat top-down.

- Low-FOV perspective camera, ~28–38° vertical FOV
- ~40–55° downward pitch, fixed yaw (225° at HEAD — `world/viewpoint.ts` is the one value both the
  world layer and the view layer read)
- Damped follow, stable world orientation, limited zoom, **no free orbit during normal play**

Requirements: scout stays in a readable screen region · approaching danger stays visible · camera lag
never hides a threat · no nausea · tall props preserve scale · **foreground objects never permanently
hide the player** · world labels never substitute for composition.

**Occlusion fading is a production system, not a nicety.** 150–300 ms fade, dithered alpha or an
equally depth-stable technique, reduced opacity rather than disappearance, readable silhouette
retained, no alpha-sorting artifacts. Never fade floors, the player, hazards, or essential route
feedback. **No hard popping is acceptable.**

---

## 4. Korean-first localization (hard gate)

- `ko-KR` is the **default and only shipped** player-facing locale. `en` is a development control.
- **No player-facing English may ship.** Not in HUD, overlays, tutorial, alerts, outcome screens,
  `<title>`/`<meta>`, `aria-label`s, or `<noscript>`.
- All strings live in a structured catalog. **Never hardcode a player-facing string in a component,
  renderer, or sim file.** `t()` is called only in `src/ui/`; simulation state carries catalog keys
  and params, never rendered strings.

  > **Verified failure, 2026-08-05:** a renderer built `` `${label} · ${tiles} tile(s)` `` in code
  > while a correct catalog key sat unused. Seventeen headless gates missed it; a real browser showed
  > `2 tiles` within thirty seconds. **A complete catalog does not prove the catalog is used.** The
  > locale check must scan rendered output, not catalog contents — `scripts/prompt-evidence.mjs`.

- Terminology is governed by the glossary. Do not re-translate ad hoc.
  Glossary: 먹이 · 수분 · 군체 · 번식 · 페로몬 길 · 노출 · 흔적 · 경계 단계 · 거점 · 적응 · 박멸 · 대피
- Concise, natural, tense. Avoid machine-translated word order and long noun stacks (명사 나열).
- Every final verification screenshot must be Korean.

### 4a. Korean particles are computed, never hardcoded

A particle after an interpolated value depends on the **sound** of that value. For a number that
means how it is read: 24 is 이십사 and takes 가; 18 is 십팔 and takes 이. Write `{amount}{amount?이/가}`
in the catalog — `t()` picks the form. Never write `{amount}이`.

---

## 5. NanumSquareNeo (hard gate)

- Source: Naver official static host. License **SIL Open Font License 1.1**; OFL text ships in-repo.
- Vendored at `src/fonts/*.woff2` — **not** `public/`. Vite copies `public/` verbatim and leaves the
  URL root-absolute, which 404s under a subpath; importing from `src/` makes Vite fingerprint it and
  emit a relative URL. **Never** load from Google Fonts or any CDN.
- Weights 400 / 700 / 800, explicit `@font-face` mappings, never synthetic.
- **Wait for `document.fonts.ready` before any text measurement or final layout.**
- Verify at 1280×720, 1440×900, 1920×1080, DPR 1 and DPR 2: no tofu, no clipping, no overflow.

---

## 6. Static build contract

- Completely **serverless at runtime**. Zero essential network requests after load.
- Must run from a nested subpath (`/bug-game/`) — a correctness property of the build, true even
  though this branch is never deployed. `vite.config.ts` uses `base: './'`; never introduce a
  root-absolute `/...` URL anywhere. `scripts/check-subpath.mjs` enforces it.
- All fonts, data and licenses vendored locally. No CDN, ever.
- Must survive focus loss and return, and restart without a page reload.

---

## 7. Asset finality

Every visible and audible element is classified in `ASSET_MANIFEST.md`.

**Temporary assets block completion.** A placeholder that passes a test is still a placeholder.

**Banned, because each was a confirmed user-reported defect:** objects represented as bare
circles/lines · large unbroken blue-black rectangles · appliances drawn as flat "walls" · floating
labels compensating for weak art · flat vector icons used as world objects · uniform darkness ·
detached floating dots as cargo · a glowing circle as the player identifier.

---

## 8. Real-runtime playtesting, and what evidence is (revised 2026-08-09)

- A passing test suite is **not** sufficient evidence of quality. **A real browser is.** See §4.
- A full run must be **played**, not accelerated through hidden state mutation. Automated balance
  agents use only actions available to a real player — that is what `tests/bot.ts` guarantees.
- **Deployment is never evidence**, and neither is a pushed branch.

**Evidence policy.** The rule used to be "never overwrite earlier evidence." It was never honoured —
`capture.mjs` writes fixed paths, so ten frames were rewritten and recommitted 28 times each, and
`.git` reached 1.2 GB. A rule that is both violated and expensive is worse than no rule. Now:

- **Reports are the evidence.** The small JSON/MD files (`runtime-report.json`, `performance.json`,
  `prompts.json`, critic reports) are tracked, diffable, and cited by number in commit messages.
- **Frames are regenerated, not archived.** Screenshots under the script-written directories are
  gitignored. They exist on disk for you to look at; they are not history.
- **A frame that must survive as a comparison basis is promoted deliberately** by copying it into
  `artifacts/evidence/baseline/`, which is tracked, with a line in the state file saying what it is
  the baseline _for_. Promotion is a decision, not a side effect of running a script.
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

**Builders never grade their own final work.**

---

## 10. Completion gates (revised 2026-08-09 — the persona score bar is gone)

### 10a. The bar is a defect ledger, not a score

The previous bar was "four LLM persona critics each score ≥ 80/100". Four panels were run. The mean
went **51.0 → 52.75 → 52.0** and the lowest score went **51 → 47, backwards**, while all four of the
panel's prescriptions failed adversarial verification (`holdsUp=false` × 4). Each panel cost 30–35
minutes and nine subagents, and one of them corrupted a performance measurement by loading the
machine it was measuring. **An instrument with no resolution at this scale, gated on the minimum of
four noisy readings, cannot tell improvement from noise — which is exactly what it reported.**

The bar is now:

> **Every entry in the state file's defect ledger is closed, and closing it means: a reproduction
> procedure, a number before, the fix, the same number after, and the regression suite still green.**

Rules for the ledger:

- An entry names a **player-observable symptom**, never a score and never a code smell.
- An entry is opened by anyone — you, a critic, the user, a measurement. It is closed only by a
  re-measurement of the same quantity that opened it.
- **A prescription that fails verification does not open an entry.** The diagnosis may still be
  right; the fix was wrong. Record the diagnosis, discard the fix.
- Critic panels are still allowed as a **diagnostic** — they find things inspection does not. Their
  output is candidate ledger entries. **Their scores are recorded and are not a gate.** Do not run
  one to find out whether the game got better; run one to find out what is wrong.

### 10b. Mechanical gates — all must pass, evidence or it did not happen

`pnpm review` = format · lint · typecheck · **`pnpm test` (108 tests, ~11 s, including the full-run
design suite)** · production build · real-browser capture. Plus `scripts/check-subpath.mjs`,
`scripts/prompt-evidence.mjs`, `scripts/perf.mjs`.

**`tests/unit/run.test.ts` is in `pnpm test` and stays there.** It holds the only assertions that
describe the game — won, paced, no 45 s dead plateau, extermination survived, builds diverge,
household remembers, restart deterministic. It was exiled to a `test:slow` script on a measurement
that had stopped being true, and during the exile "51 tests pass" was reported several times while it
was red. If it gets slow again, shorten the run or coarsen the sampling; do not move it out.

**Camera and visibility** — diagonal camera stable and readable · scout never persistently hidden ·
blocking props fade smoothly · no transparency-sorting defect · hazards readable.

**Gameplay** — first action ≈10 s · first delivery ≈60 s · pheromone logistics is the differentiator
· vertical routes create real choices · growth changes capability _and_ world presentation · two
adaptation paths produce observably different runs · routines create both opportunity and danger ·
threats respond to evidence · no unexplained decision plateau > 45 s · victory requires active play ·
failure is attributable · restart is immediate.

**Cockroaches** — scout reads as a cockroach · workers individually legible · animation matches speed
and direction · cargo physically readable · no geometry penetration · restarts leave no stale state.

**Korean** — all required text Korean · NanumSquareNeo locally loaded · no tofu · no clipping ·
consistent terminology · objectives understandable without documentation.

**Assets and art** — every major object intentionally finished · no default material on a final prop
· materials read distinctly · lighting motivated · growth visibly transforms the environment · core
interactions have visual _and_ audio feedback.

**Technical** — clean install · typecheck · lint · full unit suite · production build · local
nested-path build · real-browser capture · zero console errors · zero missing assets · zero runtime
network dependencies · restart and focus tests.

**Performance @ 1080p peak play** — p50 ≤ 16.7 ms · p95 ≤ 20 ms · p99 ≤ 33 ms · frames > 50 ms below
1% · zero unbounded workers/particles/audio voices/material clones/event listeners · zero restart
leakage. Measure on real Chrome on the M1, on an idle machine — `scripts/perf.mjs` refuses above a
third of the cores, because a nine-subagent panel once made a healthy build read 32.20 ms.

**Repository safety** — no merge · no PR · no deployment · no remote change · `main` untouched.

---

## 11. No planning-only completion

**Planning, greybox, renderer experiments, procedural placeholder art, or a passing E2E script are
never a finished deliverable.** Do not report success without recorded real-browser evidence for the
specific claim being made. If something is blocked, say so plainly and show the exact failure.

Do not use "AAA", "perfect", "commercial quality", or "indistinguishable" as completion claims.

---

## 12. Known environment facts (verified 2026-08-05)

| Tool                  | Where                                                             | Proof                   |
| --------------------- | ----------------------------------------------------------------- | ----------------------- |
| **Blender 5.2.0 LTS** | `~/Applications/Blender.app`, wrapper `/opt/homebrew/bin/blender` | headless glTF export    |
| Blender Python        | **3.13.13** embedded, `io_scene_gltf2` registered                 | `EXPORT_OP_EXISTS True` |
| ffmpeg / ffprobe      | `/opt/homebrew/bin/`                                              | on PATH                 |
| ImageMagick           | `/opt/homebrew/bin/magick`                                        | on PATH                 |
| Draco                 | `/opt/homebrew/bin/draco_encoder`                                 | on PATH                 |

A rigged, animated cockroach is **producible in this environment** — mesh → armature → skinning →
keyframes → valid GLB was run headless and verified. Do not assume no DCC exists.

- **KTX2/Basis is NOT available.** Use PNG/WebP unless a measured need appears.
- Node **21.7.2**, pnpm **9.15.9**, Python **3.10.0** (+ `fonttools`, `brotli`), `rsvg-convert`,
  three.js **0.185.1**, Playwright Chromium with **WebGL2 via SwiftShader** — software raster, slow
  but **deterministic**, which is what makes offline screenshot evidence comparable. **Invalid for
  frame time**; real Chrome on the M1 is the only perf target.
- Reference machine: MacBookPro17,1 · M1 8-core · 16 GB · Metal 4.
- Claude-in-Chrome and Playwright MCP drive a real browser. **Use them** — a real browser caught a
  defect all seventeen headless gates missed.
- `gh` is **not authenticated.** Anything needing the GitHub API needs the user to run it.

---

## 13. Method (this is what actually worked)

Every problem solved cheaply was solved by **instrumenting or building a control**. Every problem
approached by guessing took five or six attempts.

Record the observable symptom → separate symptom from assumed cause → form a falsifiable hypothesis →
**instrument or build a control** → run the controlled comparison → confirm or reject → fix the
confirmed cause → re-measure the same seed and camera → run regressions.

Two corollaries this project paid for:

- **Numbers from a broken instrument are not evidence about the thing measured.** Twenty-seven
  instrument failures are logged in `docs/COMPLETION_RECOVERY.md`; several were read as game defects
  and chased as game defects.
- **Byte-identical output from a changed build means the changed code never executed.** Three
  separate "fixes" to the brood economy produced identical numbers before anyone checked whether the
  guard clause returned early.

**And one this section earns its place with: re-measure the premise, not just the result.** The rule
that kept the design suite out of the gate was written when that suite took over 600 s. It takes
11 s. Nobody re-measured for months, and the whole quality gate was shaped by the stale number.

---

## 14. What was removed on 2026-08-09, and why

The user's report was "개선이 크게 되는 느낌을 못받는다" — improvement is not being felt. It was
measured against the repository rather than argued about. Kitchen phase, 147 commits since
2026-08-07:

| Signal                                            | Measured                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Commit types                                      | **docs 64 · fix 42 · feat 31 · chore 8 · test 1**                                            |
| Most-churned file                                 | `COMPLETION_RECOVERY.md` — **61 of 147 commits**                                             |
| Second                                            | `.claude/gauntlet-state.md` — **35**                                                         |
| Most-churned **source** file                      | `src/i18n/ko.ts` — **18**                                                                    |
| Root markdown                                     | 16 files, 5,785 lines; **8 self-marked STALE**, all redirecting to a 9th that was also stale |
| Quality bar over four panels                      | mean 51.0 → 52.75 → 52.0; **lowest 51 → 47**                                                 |
| Panel prescriptions surviving verification        | **0 of 4**                                                                                   |
| `pnpm test:slow`, believed "far too slow to gate" | **11.3 s**                                                                                   |
| `.git`                                            | **1.2 GB**, 426 tracked PNGs, ten frames committed 28 times each                             |

Two bookkeeping files were edited five times more often than the most-edited source file. That is the
answer to the user's report, and it was a policy outcome, not a discipline problem.

**Removed or replaced:**

1. **The persona score bar** → a defect ledger (§10a). It could not distinguish improvement from
   noise, and it consumed 30–35 minutes and nine subagents per reading.
2. **The append-only narrative log** → frozen at §62. The commit message is the record (§0a).
3. **"Update the state file before the end of every turn"** → update it when a measurement changes a
   decision (§0a).
4. **Ten root documents**, eight of them self-marked stale and each carrying the standing instruction
   that "rewriting this file is outstanding work" → `docs/superseded/`, never to be rewritten (§0a).
5. **The `test` / `test:slow` split** → one suite in the gate, 108 tests, 11 s (§10b).
6. **"Never overwrite earlier evidence"** → reports tracked, frames regenerated, baselines promoted
   deliberately (§8).
7. **A hardcoded branch name in §0** that HEAD had already diverged from → verify HEAD, don't name it.
8. **The blanket push prohibition** → experiment branches may be pushed, on the user's explicit
   instruction and because the deployment trigger is main-only (§0). Merge, PR and deployment are
   unchanged and remain forbidden.

**Global ECC rules that do NOT apply to this repository.** `~/.claude/rules/ecc/**` loads generic
service guidance into every session. This project is a local, single-player, serverless WebGL game
with no backend, no database, no network, no user accounts and no untrusted input. The following are
**void here** and must not drive work: SQL injection · CSRF · XSS · rate limiting · authentication
and authorization · secret management · the Repository pattern · API response envelopes · Zod
boundary validation · the 80 % coverage floor and the "unit + integration + E2E for everything"
requirement. What replaces the coverage floor is §10b: the design suite is in the gate, and it
asserts behaviour a player would notice.

Still binding from the global rules: immutability, KISS/DRY/YAGNI, small focused files, explicit
error handling, naming conventions, and the conventional-commit format.
