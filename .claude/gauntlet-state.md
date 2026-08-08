# Gauntlet State

## Status
ACTIVE

## Phase
ADDRESS

## Depth
DEEP — a game with visual, gameplay, audio and performance surfaces; multi-system coupling; and a
recorded history of premature completion claims (CLAUDE.md §11 exists because of it).

## Goal Ledger

**G1 (locked, 2026-08-08)** — Improve the kitchen build until **four different game-discipline
persona agents each score it 80 or above**, independently and with adversarial verification of
their findings.

Prior context, preserved but superseded as the scoring bar: an earlier standing goal asked for five
personas at 90+. The last measured average under that rubric was **41.0** (five personas, every
top-fix challenged; all five challenges returned holdsUp=false). G1 lowers the bar to 4 @ 80 but
does not discard anything already achieved.

## Outcome
A kitchen-only 3D infestation game that four independent game-discipline critics would each sign off
at 80/100 in their own discipline.

## Mandatory Criteria
- [UNVERIFIED] Four distinct persona critics each score >= 80
- [PASS] typecheck, lint clean — verified this pass
- [PASS] unit 89/89 — verified this pass
- [PASS] test:slow 19/19 — verified at commit 894a101
- [PASS] production build + subpath check — verified at commit 894a101
- [PASS] real-browser: zero console errors, zero warnings, zero failed/external requests
- [PASS] 20 restarts leave no GPU leak (121 -> 121)
- [PASS] all on-screen text Korean, zero latin words (prompt-evidence PASS)
- [PASS] perf @1080p: every budget line green with a derived geometry ceiling
- [FAIL] run length 3.1-4.9 min against a 25-35 min design target (`it.fails` in run.test.ts)

## Quality Bar
Not "it works". Four disciplines must each find it good: systems/economy, level/environment,
art direction (stylised is explicitly acceptable — photorealism is NOT the bar), and game feel.

## Evidence Ledger
- gates -> `pnpm typecheck | lint | test | test:slow | build`
- subpath -> `scripts/check-subpath.mjs`
- runtime -> `scripts/capture.mjs` (console, requests, 20-restart leak)
- korean -> `scripts/prompt-evidence.mjs`
- perf -> `scripts/perf.mjs` (refuses a dirty tree; judged in-page against one source of truth)
- balance -> `tests/bot.ts` bot runs, 3 seeds x 3 builds

## Current Risk Areas
- Run length is the largest single gap and no fix so far has moved it materially.
- A repeated defect shape found three passes running: **code that is computed, catalogued, tested,
  and never executed** (the sixth nav link, `zoneHeld`, `costKey`, five audio endings). The density
  cluster is suspected to be the same shape.

## Remaining High-Impact Gaps
1. Run length 3.1-4.9 min vs 25-35 target. Still the only mandatory FAIL.
2. Zero `hidden:` resources in the kitchen — discovery is not a mechanic here yet.
3. Routines carry no position, so a telegraph cannot point anywhere in the world.
4. Eight audio methods still with zero callers; four are for mechanics that no longer exist and
   should be deleted rather than wired.
5. Routines belonging to sealed regions (`bedroom.phone`, `living.tv`, `bathroom.use`, ...) still
   fire and consume director time in a kitchen-only build.

## Last Pass (commit 4ffc882)
- observed: `concealment` authored on 8 kitchen refuges (0.44-0.92) and read by NOTHING; the kitchen
  declared 4 exposure zones, 3 on the counter and 1 on the floor, so table top / chair seat / bin
  interior returned a uniform 0 and the stealth mechanic did not exist on 3 of 5 surfaces.
- changed: `shadeExposure()` bakes refuge cover into `baseExposure` at build time (zero frame cost);
  authored 4 exposure zones for the three dark surfaces, two of them routine-gated (dinner lights
  the table, an open bin lid lights its inside); re-measured the sweep coefficient 0.6 -> 0.9.
- re-verified: cover contrast measured at every refuge (0.000-0.110 at cover vs up to 0.720 away);
  15 routines fire in a 4-min run with all 6 kitchen ones reachable; both routine zones light to
  1.000; 27 bot runs across the coefficient sweep, all won; typecheck, lint, unit 89/89,
  test:slow 19/19, build, prompt-evidence PASS, capture clean, perf all green.
- caught by a gate, not by me: wiring cover lowered sightings 8 -> 6, which lowered sweep severity,
  which silently un-did last pass's failable finale (0/9 runs dipped). `test:slow` went red and the
  coefficient was re-derived by sweep rather than by guess.

## Blockers
None.
