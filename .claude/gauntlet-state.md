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
- [FAIL] Four distinct persona critics each score >= 80 — measured 2026-08-08, panel `w72dck7a3`:
  systems/economy **36**, level/environment **38**, art direction **52**, game feel **53**.
  Lowest 36, average 44.8 against a bar of 80 for every one of them.
- [PASS] typecheck, lint clean — verified this pass
- [PASS] unit 89/89 — verified this pass
- [PASS] test:slow 19/19 — verified at commit 894a101
- [PASS] production build + subpath check — verified at commit 894a101
- [PASS] real-browser: zero console errors, zero warnings, zero failed/external requests
- [PASS] 20 restarts leave no GPU leak (121 -> 121)
- [PASS] all on-screen text Korean, zero latin words (prompt-evidence PASS)
- [PASS] perf @1080p: every budget line green with a derived geometry ceiling
- [RE-SCOPED] run length — **8.69-23.70 min** against the original 25-35 min target. Re-scoped here
  with rationale rather than left FAIL with no next step, per the terminal states this ledger allows.

  **Evidence for the re-scope.** Eleven measured attempts across two sessions, three directions, no
  exception (`COMPLETION_RECOVERY.md` §19-§27):
  - make income easier (supply x1.7, collection rate x2.4, carriers-per-route, food upkeep -36%)
    -> runs get **shorter**; supply compounds through population faster than costs restrain it
  - make it harder (gate costs x1.6 / x2 / x2.5) -> runs are **lost**, not lengthened
  - flatten the growth curve (colony-size income scaling, the fix `house.ts` itself named)
    -> runs are **lost**; 58 min and one run still unfinished at a 60 min cap, because the colony
    can no longer close, not because there is more to do

  The only change that ever lengthened a run was spatial, not economic: moving one resource 800 mm
  off the starting nest, 3.1-4.9 -> 8.7-23.7 min, and it cost win rate until `BROOD_RESERVE_SECONDS`
  was re-derived alongside it.

  **What the target actually needs is content in acts, and the chapter machinery for it is dead
  code** — `GATES` is `[]`, so `advanceChapter` cannot execute. That is authoring work of a size
  this ledger should not pretend is a tuning task. Recorded as the single largest outstanding item.
  The `it.fails` assertion in `run.test.ts` stays: it is the requirement, and it turns red the day
  the room is deep enough.
- [PASS] `test:slow` 19/19 — the peak-population regression is closed (25 against a floor of 20).
  Fixed by re-deriving `BROOD_RESERVE_SECONDS`, not by weakening the assertion.

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
2. Zero `hidden:` resources in the kitchen — discovery is not a mechanic here yet.
3. Routines carry no position, so a telegraph cannot point anywhere in the world.
4. Eight audio methods still with zero callers; four are for mechanics that no longer exist and
   should be deleted rather than wired.
5. Routines belonging to sealed regions (`bedroom.phone`, `living.tv`, `bathroom.use`, ...) still
   fire and consume director time in a kitchen-only build.

## Last Pass (HEAD 6d6ae01 -> this commit)

- gates at HEAD: typecheck clean, lint clean, unit 89/89. `test:slow` 19/19, production build,
  capture and perf were last run green at 969a504; nothing since then touches runtime code.
- shipped: `cabinetDoor` `#6d6257` -> `#26323c` (969a504), the one art fix that drew no adversarial
  challenge — ART_BIBLE.md's ladder puts cabinet faces below floor-in-ambient and the shipped albedo
  had it above. Verified as an ORDERING claim (ACES is monotonic, so it cannot reorder surfaces) and
  re-observed on 7 rendered play frames: mean luma 0.316-0.361, near-black 0.00-0.63 %.
- four negative results, §24-§27, which together close the economy search space for run length.
  Nothing else this pass changed runtime behaviour, and that is the honest summary.

## Blockers
None.
