# Gauntlet State

## Status
ACTIVE

## Phase
REVIEW

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
1. Room density: `concealment` has no reader, the kitchen declares zero `hidden:` resources, and
   5 of 6 routines have no position (worklist item 6, ~28 pts across two personas).
2. Run length 3.1-4.9 min vs 25-35 target.
3. Eight audio methods still with zero callers; four of those are for mechanics that no longer
   exist and should be deleted rather than wired.

## Last Pass
- observed: gates green on a clean tree at 894a101
- changed: nothing yet — this pass starts from review
- re-verified: typecheck, unit 89/89

## Blockers
None.
