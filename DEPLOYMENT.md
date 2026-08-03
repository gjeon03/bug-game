# DEPLOYMENT — Baseboard Empire

Static build, no runtime server, no runtime network request. Designed to be served from a GitHub
Pages **repository subpath**: `https://<owner>.github.io/<repository>/`.

## Why it works from any path

`vite.config.ts` sets `base: './'`, so every generated script, style and asset reference in
`dist/index.html` is relative. There is no baked-in repository name and no environment variable to
get wrong — the same `dist/` runs from the domain root, from `/bug-game/`, or from any nested path.

All game assets are generated procedurally in JavaScript at boot (`src/render/atlas.ts`,
`src/render/solids.ts`, `src/audio/audio.ts`), so there is no asset directory to resolve
in the first place. The only files served are `index.html`, one JS bundle, one CSS file, a sourcemap
and `.nojekyll`.

## Commands

```bash
pnpm install          # clean install (pnpm 10.13.1, Node >= 20)
pnpm dev              # local dev server        → http://127.0.0.1:5273/
pnpm build            # typecheck + production build into dist/
pnpm serve:nested     # serve dist/ at http://127.0.0.1:4178/bug-game/  (Pages subpath simulation)
pnpm test             # unit + integration tests (Vitest, headless, no browser)
pnpm test:e2e         # real-browser gameplay tests against the nested build
pnpm verify           # format + lint + typecheck + unit + build + e2e
```

`scripts/serve-nested.mjs` deliberately **404s everything outside the prefix**, so a single absolute
`/assets/...` reference would break every E2E test rather than slipping through.

## Repository Pages settings

1. **Settings → Pages → Build and deployment → Source: _GitHub Actions_.**
   (Not "Deploy from a branch" — the workflow uses `actions/deploy-pages`.)
2. No custom domain is required. If one is added, nothing in the build changes.
3. The workflow requests the permissions Pages needs (`pages: write`, `id-token: write`); no PAT or
   secret is required.

## Workflow

`.github/workflows/pages.yml` runs on every push to `main` and on manual dispatch:

1. `pnpm install --frozen-lockfile`
2. `format:check` → `lint` → `typecheck` → unit tests
3. `pnpm build`
4. **Subpath assertion**: fails the build if `dist/index.html` contains any absolute `src=`/`href=`
   beginning with `/`, or if `dist/.nojekyll` is missing.
5. Playwright Chromium install, then the gameplay + deployment + restart specs against `dist/` served
   from a nested path.
6. Uploads `artifacts/evidence` as a workflow artifact.
7. Uploads `dist/` as the Pages artifact and deploys it.

`public/.nojekyll` is copied into `dist/` by Vite, which stops GitHub Pages' Jekyll processing from
touching underscore-prefixed paths.

## Verification status

**Live at <https://gjeon03.github.io/bug-game/>** — deployed by the workflow, then loaded and _played_
by `scripts/verify-live.mjs` against the public URL. The full record is
`artifacts/evidence/deployment-live.json`.

| Check                                                                | Status                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Production build succeeds                                            | ✅ locally and on the GitHub runner                           |
| Clean install with the documented package manager                    | ✅ `pnpm install --frozen-lockfile` in CI                     |
| Format, lint, typecheck, unit tests                                  | ✅ all green in CI before the build step                      |
| `dist/` contains zero root-absolute references, in any file          | ✅ `scripts/check-subpath.mjs` over every emitted HTML/CSS/JS |
| `.nojekyll` present in the build output                              | ✅ asserted by the same script                                |
| Browser tests against `dist/` on a nested path                       | ✅ CI runs gameplay + deployment + restart specs              |
| Deployed URL returns 200                                             | ✅ `deployment-live.json → httpStatus: 200`                   |
| Hard refresh of the published entry point does not 404               | ✅ `reloadStatus: 200`                                        |
| The deployed build **plays** — route, workers, deliveries            | ✅ 1 linked route, **5 deliveries**, first at 14.95 s         |
| Zero requests leave the origin at runtime                            | ✅ `externalRequests: []`                                     |
| Zero failed requests, console errors or page errors on the live site | ✅ all three empty                                            |
| Cold load on the live site                                           | ✅ 1.95 s                                                     |

Captures from the live site: `artifacts/evidence/shots/30-live-boot.png`, `31-live-route.png`,
`32-live-delivery.png`.

## Re-verifying a deployment

```bash
node scripts/verify-live.mjs      # loads the public URL, plays it, writes deployment-live.json
```

It fails loudly if the site 404s, if a request leaves the origin, or if the game cannot complete a
pheromone route and a delivery.

## Runtime guarantees

- No application server after build; `dist/` is five static files.
- No essential runtime network request — verified by intercepting every request in `deploy.spec.ts`.
- No CDN, no webfont, no external image or audio.
- `localStorage` is used only for audio volumes, accessibility preferences and a local best-run
  record, and every access is try/catch-guarded so blocked-storage contexts still boot.
- Tab suspension is safe: the run auto-pauses while `document.hidden`, the fixed-step accumulator is
  flushed on return, and audio suspends and resumes with it.

---

## Verification performed for the redesign

| Step                              | Command                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Clean install                     | `pnpm install --frozen-lockfile`                                                        |
| Format / lint / types             | `pnpm format:check && pnpm lint && pnpm typecheck`                                      |
| Unit + integration                | `pnpm test`                                                                             |
| Production build                  | `pnpm build`                                                                            |
| Subpath safety                    | `node scripts/check-subpath.mjs dist` — scans every emitted file for root-absolute refs |
| Nested-path server                | `node scripts/serve-nested.mjs` → `http://127.0.0.1:4178/bug-game/`                     |
| Browser E2E (nested path)         | `pnpm test:e2e`                                                                         |
| Real-browser playtests + evidence | `node scripts/playtest.mjs --out artifacts/evidence/redesign-final`                     |
| Deployed build                    | `pnpm verify:live` after the Pages workflow completes                                   |

The E2E suite is served from `/bug-game/` rather than from the site root, so every gameplay spec is
also a subpath test: an absolute asset URL fails the whole suite rather than one deploy-specific
spec.

---

## Deployment attempt 2026-08-04 — FAILED, site NOT updated

**Do not read this section as a successful deployment. It was not one.**

### What happened

`main` was fast-forwarded `368d1b0..691b259` and pushed (no force-push, no rewritten history).
The Pages workflow ran and **failed**, so the `Deploy` job was skipped and GitHub Pages continues
to serve the previous build.

Verified by polling the live URL for 60 minutes: `https://gjeon03.github.io/bug-game/` still
returns `lang="en"` and `<title>Baseboard Empire</title>` — i.e. the pre-reboot build.

### Exact failure

Run: https://github.com/gjeon03/bug-game/actions/runs/30847369461 (sha `691b259`, conclusion
`failure`).

Every step passed except one:

| Step                             | Result   |
| -------------------------------- | -------- |
| Install (frozen lockfile)        | pass     |
| Format check                     | pass     |
| Lint                             | pass     |
| Typecheck                        | pass     |
| Unit tests                       | pass     |
| Production build                 | pass     |
| Assert the build is subpath-safe | pass     |
| Install Playwright Chromium      | pass     |
| **Browser tests (nested path)**  | **FAIL** |
| Upload Pages artifact            | skipped  |
| Deploy                           | skipped  |

### Why the cause is not yet identified

The same suite passes locally at **17/17, exit 0** (`artifacts/evidence/quality-reboot-final/logs/e2e-final.log`).
`playwright.config.ts` has no CI-conditional branches — same `workers: 1`, `retries: 0`,
`timeout: 180_000`, same production build served from the same nested path — so the difference is
the runner environment, not the configuration.

Fetching the CI job log to identify the failing spec returns **HTTP 403**:

```
GET https://api.github.com/repos/gjeon03/bug-game/actions/jobs/91798855448/logs  ->  403
gh auth status -> "You are not logged into any GitHub hosts."
```

Downloading the uploaded `evidence` artifact requires the same authentication.

A plausible-but-unconfirmed hypothesis is runner slowness against the long specs' own overrides
(`fullrun 09` uses `test.setTimeout(1_500_000)` and took 4.4 min locally; `perf 14` uses
`test.setTimeout(1_200_000)` and took 13.1 min locally). **This is a hypothesis, not a diagnosis** —
it is recorded here so nobody mistakes it for one.

### The single external action required

Authenticate the GitHub CLI so the CI log and evidence artifact become readable:

```
gh auth login
gh run view 30847369461 --log-failed
gh run download 30847369461 -n evidence
```

Or simply open the run URL above in a browser and read the failing step.

Once the failing spec is known it can be fixed and `main` pushed again; the workflow will then
deploy on its own.

### What IS verified

The deployable artifact is finished and verified locally under the real subpath:

- `node scripts/check-subpath.mjs dist` — 26 files checked, build is subpath-safe.
- Full E2E suite served from `/bug-game/`: **17/17 pass**.
- Production build boots at `http://127.0.0.1:PORT/bug-game/` with **zero page errors and zero
  failed requests**, Korean UI, NanumSquareNeo loaded and in use.

The blocker is CI observability, not the artifact.
