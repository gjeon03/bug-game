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

| Check                                                        | Status                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Production build succeeds                                    | ✅ verified locally — see `artifacts/evidence/perf/perf.json` → `bundle` |
| `dist/index.html` contains zero absolute asset paths         | ✅ asserted in `tests/e2e/deploy.spec.ts` and in CI                      |
| Game boots from `/bug-game/`                                 | ✅ the entire E2E suite runs only from that path                         |
| Game **plays** from `/bug-game/` (route → worker → delivery) | ✅ `deploy.spec.ts` spec 15                                              |
| Hard refresh of the nested entry point does not 404          | ✅ `deploy.spec.ts` spec 15                                              |
| Zero requests leave the origin at runtime                    | ✅ `deploy.spec.ts` spec 16 → `artifacts/evidence/deployment.json`       |
| `.nojekyll` present in the build output                      | ✅ `deploy.spec.ts` spec 16                                              |
| Deployed to the live Pages URL                               | ⛔ **blocked — see below**                                               |

## Genuine external blocker: no remote, and pushing needs your approval

This repository has **no git remote**:

```
$ git remote -v
(no output)
$ gh repo view
no git remotes found
```

`gh` is authenticated and does have the scopes required (`gh auth status` reports account `gjeon03`
with `repo` and `workflow`), so creating the repository and pushing is technically possible from
here. It has not been done because creating a public repository and pushing are outward-facing,
hard-to-reverse actions that require explicit approval.

**The single external action required** — run these three commands (or approve them being run):

```bash
gh repo create bug-game --public --source=. --remote=origin --push
gh api -X POST repos/:owner/bug-game/pages -f build_type=workflow   # or set Settings → Pages → Source: GitHub Actions
gh run watch                                                        # then open the deployed URL
```

The published URL will be `https://gjeon03.github.io/bug-game/`.

Until that happens, **this project is not deployed**, and nothing in this repository claims it is.
What _is_ proven is that the production build works correctly from a nested repository subpath,
verified by the whole browser test suite running exclusively against `http://127.0.0.1:4178/bug-game/`.

## Runtime guarantees

- No application server after build; `dist/` is five static files.
- No essential runtime network request — verified by intercepting every request in `deploy.spec.ts`.
- No CDN, no webfont, no external image or audio.
- `localStorage` is used only for audio volumes, accessibility preferences and a local best-run
  record, and every access is try/catch-guarded so blocked-storage contexts still boot.
- Tab suspension is safe: the run auto-pauses while `document.hidden`, the fixed-step accumulator is
  flushed on return, and audio suspends and resumes with it.
