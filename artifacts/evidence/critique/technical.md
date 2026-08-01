# Technical verification — independent pass

Run against commit `115e738` by a reviewer that did not build the game, told to assume every claim
was wrong until a command proved it. Read-only with respect to the source.

**Environment.** Node v23.5.0, pnpm 10.13.1 (matching the pinned `packageManager`), macOS arm64.

**Methodology note from the reviewer.** The isolated worktree it was given symlinked `dist` and
`node_modules` back into the parent repository, so `pnpm install` there would have destroyed the
`node_modules` of a concurrently running test process. It therefore ran every write-producing command
against a **fresh `git clone` of HEAD**, which is what the task actually needed. That harness hazard
has since been removed along with the worktree.

## Commands

| # | Command | Exit | Key output |
| - | ------- | ---- | ---------- |
| 1 | `pnpm install --frozen-lockfile` | 0 | `Lockfile is up to date` · `Packages: +159` · `Done in 1.9s using pnpm v10.13.1` |
| 2 | `pnpm format:check` | **1 ❌** | 3 files with style issues → `ELIFECYCLE Command failed with exit code 1` |
| 3 | `pnpm lint` | 0 | clean |
| 4 | `pnpm typecheck` | 0 | no diagnostics |
| 5 | `pnpm test` | 0 | `Test Files 4 passed (4)` / `Tests 55 passed (55)` |
| 6 | `pnpm build` | 0 | `36 modules transformed` · JS `120.02 kB │ gzip: 40.68 kB` |
| 7 | dist inspection | 0 | 5 files; zero absolute refs; `.nojekyll` present |
| 8 | `serve-nested` on port 4188 + curl | 0 | nested index **200**, JS **200**, CSS **200**, domain root **404**, root asset **404** |

Gzipped sizes measured: `index.html` 788 B, CSS 2,832 B, JS **40,533 B**.

## Workflow review

Action versions plausible and current; permissions, environment and concurrency correct for
Pages-via-Actions; `pnpm/action-setup` correctly precedes `setup-node … cache: pnpm`; every
referenced spec file exists.

Subpath assertion tested directly against the regex at the time:

```
CAUGHT: src="/assets/..."          CAUGHT: href="/assets/..."
MISSED: absolute url() in the CSS bundle (CSS was never scanned)
MISSED: absolute fetch() in the JS bundle (JS was never scanned)
MISSED: bare href="/"
```

> **Fatal flaw: this workflow cannot currently go green.** Step 2 is `pnpm format:check`, which fails
> on a clean checkout. The job dies before `build`, before the subpath assertion, and before `deploy`.

## Claim audit — the verdicts

**PROVEN:** clean install with the documented package manager · `sim/` is DOM-free and the boundary is
genuinely lint-enforced · fixed 60 Hz clock with 250 ms clamp, 5-step cap and counted discards ·
worker pool fixed-capacity · audio voice cap 24 · routes/hazards/nodes/corpses all bounded · restart
rebuilds the whole world with no listener leak (15 `addEventListener`, all top-level) · **every asset
generated procedurally with zero fetched files** (no `fetch`/`Image`/`Audio`/`createImageBitmap`
anywhere in `src/`; no `url(` or `@font-face` in the CSS; `dist/` contains no image, audio or font
file) · zero runtime network requests · bundle well inside the 150 kB budget · `dist/` is five static
files · the build is path-agnostic and serves correctly from `/bug-game/` while 404-ing at the root ·
win thresholds match the constants · unit tests headless and DOM-free · no gameplay runtime
dependencies · **"this project is not deployed", with the blocker (no git remote) accurately stated
and independently verified — no overclaim of live deployment anywhere.**

**FALSE:**

- `pnpm verify` cannot complete (format gate).
- The CI gate is permanently red at step 2.
- `core/` described as "pure, DOM-free" while `core/storage.ts` uses `window.localStorage`.
- `ARCHITECTURE.md` references `core/events.ts`, which does not exist.
- `GAME_CONTRACT` route budget said 4 while `MAX_ROUTES = 5`.
- **The p50/p95/p99 frame-time claim.**
- `PLAYTEST_REPORT.md` claiming to be regenerated from evidence.
- `TEST_PLAN.md` referencing a non-existent `artifacts/evidence/playtests/`.

**UNPROVEN:** victory is achievable — `e2e-results.json` recorded the victory spec **failing** and
`run-win.json` / `shots/25-outcome.png` were absent; likewise the reckless and eradication runs.

## The performance claim, in detail

`perf.json` reported `active-play`: `frames 1553`, `durationMs 38812.8`, `mean 0.9`, `p50 0.9`,
`p95 1.3`, `p99 1.4`.

> A window of 1553 frames spanning 38,812.8 ms has a mean frame interval of **24.99 ms** by
> arithmetic. A reported mean of 0.9 ms is off by 27×, so these percentiles cannot be frame intervals.
> `peak-load` is identical: 2614 frames / 64,521.4 ms = **24.68 ms/frame**, reported `mean 0.59`.

Corroborated by the file containing no `cpu*` fields, proving it predated the telemetry change.
Consequences the reviewer drew: the percentiles compared against a 16.7/20/33 ms frame-time budget
were ~0.9 ms of script CPU; `over16/33/50/100` were vacuously 0; the only pacing figure derivable was
~25 ms/frame ≈ 40 FPS, which **breaches** the stated p50 budget; and `perf.spec.ts`'s gate "would pass
even if the game rendered at 5 FPS". Fair caveat noted by the reviewer: 40 FPS may be a headless
presentation artefact, "but the evidence as committed cannot support the claim either way."

## Stale evidence

Three different bundle hashes across a supposedly single verification pass, none matching a build of
HEAD; `asset-audit.json` missing the `peakAudioVoices` field the spec writes; `summary.md` reporting
`atlasMs 104.2` against `perf.json`'s `138.2`. The reviewer noted `summary.md` does honestly print
"not present" for missing records, and that `PLAYTEST_REPORT.md` did not extend the same honesty.

## Ranked defects

| # | Severity | Defect |
| - | -------- | ------ |
| 1 | Critical | `format:check` fails on a clean checkout; CI can never reach deploy |
| 2 | Critical | The flagship victory spec is recorded as failing and the win evidence is absent |
| 3 | High | Performance evidence measures script CPU, compared against a frame-time budget; gate is a no-op |
| 4 | High | `PLAYTEST_REPORT.md` is a template presented as measured results |
| 5 | Medium | All committed evidence stale/inconsistent |
| 6 | Medium | `ARCHITECTURE.md` references a non-existent module and misdescribes `core/` |
| 7 | Medium | Subpath assertion only scans `index.html` |
| 8 | Medium | `reuseExistingServer: true` with no build step lets E2E validate a stale or foreign `dist/` |
| 9 | Low | `errors` array in `main.ts` never trimmed and never cleared on restart |
| 10 | Low | Route-budget and `playtests/` documentation contradictions |
| 11 | Low | 456 kB production sourcemap ships to Pages (76 % of the payload) |
| 12 | Low | Stray tracked `boot.png` at the repository root |
| 13 | Info | Harness hazard: agent worktree symlinks `dist`/`node_modules` to the parent |

Dispositions for every one of these are in `dispositions.md`.
