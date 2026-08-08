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
- [FAIL] Four distinct persona critics each score >= 80. **Re-scored at HEAD, panel `wrdbef5zw`:**

  | discipline | first | second | third | delta |
  | --- | --- | --- | --- | --- |
  | Systems & economy | 36 | 44 | **44** | 0 |
  | Level & environment | 38 | 47 | **52** | +5 |
  | Art direction | 52 | 56 | **47** | **-5 from first** |
  | Game feel & technical | 53 | 57 | **61** | +4 |

  Lowest 44, average 51.0. **Art regressed, and the cause is mine**: the `cabinetDoor` albedo change
  (969a504) was re-measured on the same crop and the playable region's midtones (L* 20-40) fell
  39.6 % -> 3.0 % while L* < 20 rose 6.6 % -> **61.5 %**. That is §7's banned uniform darkness. My
  own check passed because frame MEAN luminance stayed at 0.316-0.361 — the mean hid a collapsed
  distribution. See `COMPLETION_RECOVERY.md` §42.
- [PASS] typecheck, lint clean — verified this pass
- [PASS] unit 89/89 — verified this pass
- [PASS] test:slow 19/19 — verified at commit 894a101
- [PASS] production build + subpath check — verified at commit 894a101
- [PASS] real-browser: zero console errors, zero warnings, zero failed/external requests
- [PASS] 20 restarts leave no GPU leak (121 -> 121)
- [PASS] all on-screen text Korean, zero latin words (prompt-evidence PASS)
- [PASS] perf @1080p at HEAD, measured on an idle machine (load 2.45): p50 **16.70**/16.7,
  p95 18.60/20, p99 18.70/33, GPU p99 13.73/33, draw calls 464/900, triangles 174k/400k,
  geometries 141/196, textures 27/40, programs 0/40. Every line green.

  This is the same p50 as before the failed reading, which confirms §33: the 32.20 measured under
  load average 4.25 was the panel's nine subagents, not a regression. `scripts/perf.mjs` now refuses
  to measure above a third of the cores (`fc0d1a8`), so that particular mistake cannot recur.
- [PARTIAL] run length — **median 24.87 min** (17.04 / 27.51 / 24.87, three brood seeds at HEAD)
  against the 25-35 min target. The median is at the band's threshold for the first time in the
  project, from a starting point of 3.1-4.9 min. `it.fails` is off, on a repaired harness this time.
  Not yet PASS: one seed sits at 17.04, one of six runs is lost, and the band itself is not asserted
  — only the 12.5 min halfway floor is. See `COMPLETION_RECOVERY.md` §38.
- [PASS] `test:slow` 19/19 at HEAD aa29e9a, including the re-derived population assertion.

## Quality Bar
Not "it works". Four disciplines must each find it good: systems/economy, level/environment,
art direction (stylised is explicitly acceptable — photorealism is NOT the bar), and game feel.

## Persona Panel — 2026-08-08 (run wf_575f0e85-da4, 4 critics + 4 adversarial challengers)

| Discipline | Score | Their top fix | Challenge |
| --- | --- | --- | --- |
| Systems & economy | 36 | per-refuge `heat` rising with deliveries routed out of it, wired into the three places that read nothing | **holdsUp=false**, +2 — challenger re-ran `tests/bot.ts` on three seeds with traffic/busy/evidence/alert instrumented and found the premise did not hold |
| Level & environment | 38 | a graded cover-and-light field in `exposureZones`, with `concealment` feeding it | **holdsUp=false**, +3 — "most of the change is already in the tree", which is correct: it landed in 4ffc882 while the panel was running |
| Art direction (stylised) | 52 | put the shipped materials back on the value ladder ART_BIBLE.md already specifies; edit the SPECS hex literals only | — |
| Game feel & technical | 53 | feed the view layer real elapsed seconds rather than simulation steps; fix the fade time constant | **holdsUp=false**, +3 — the prescribed patch is algebraically inverted and would ship a regression (`occlusion.ts:330`) |

**All four prescriptions failed adversarial verification.** The diagnoses are not thereby wrong; the
prescriptions were. Weight the next pass toward the two lowest scores (36 and 38), not the mean.

Sharpest new finding, from art at 52: *"a frame that has no palette, no value hierarchy and no
night"* — and the fix is that `ART_BIBLE.md` already writes the value ladder down and the shipped
`SPECS` hex literals do not follow it. That is the fifth instance this session of the same shape:
**documented, and not honoured.**

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
1. Persona scores 36 / 38 / 52 / 53. Attack the two lowest, then re-run the panel.
2. `hidden:` resources — PARTIAL. `kitchen.bin.inside.food` landed in 9db096e and raised the
   run-length median 13.18 -> 14.31. Two more candidates deferred until it is understood why three
   at once cost length when one gains it.
3. ~~Routines carry no position~~ — CLOSED in 082f21d: `routineAt` derives it from the
   resources each routine refills, giving six distinct cue positions where there was one.
4. Eight audio methods still with zero callers; four are for mechanics that no longer exist and
   should be deleted rather than wired.
5. Routines belonging to sealed regions (`bedroom.phone`, `living.tv`, `bathroom.use`, ...) still
   fire and consume director time in a kitchen-only build.

## Last Pass (HEAD: the overlay fix below)

- gates re-run at this HEAD: typecheck, lint, unit 89/89, `test:slow` 19/19, production build,
  capture (0 console errors, 0 warnings, 20 restarts identical), prompt-evidence PASS, perf green.
- `wlgsvl62q` re-score: systems 36->44, level 38->47, art 52->56, feel 53->57. Average 51.0,
  lowest 44. The consolidator's own arithmetic: even if every surviving worklist item lands,
  systems reaches 73, level 72, art 75, feel 81 — only game feel signs off from its own list.
- landed since that panel: `9db096e` kitchen discovery, `da42d43` layTick + sprint audio,
  `daeca36` repaired the bot's brood control and restored `it.fails`, and the overlay fix — the
  ring and ribbon are now `depthTest:false`, which is the only panel top-blocker that survived
  adversarial challenge (§3 names both as things a prop may never hide).

## Blockers

**None.** The previous entry named act authoring as a scoped blocker on the grounds of context
budget. That was wrong — a budget is not an external blocker, and the first act has now landed:
`updateFinal` advances the chapter on a colony milestone rather than on a gate, so the chapter
machinery executes for the first time in the project's life. Measured, three brood seeds: the run
crosses into `chapter.final` at 6.50 / 9.43 / 9.52 min.

What remains is more of the same work, not a different kind: further acts, each redefining what
holding the kitchen means, each needing objectives, Korean strings, balance and a re-measure. That
is ordinary authoring and it is where the next session starts.
