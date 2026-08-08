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
- [FAIL] Four distinct persona critics each score >= 80. **Third measurement, panel `w5ygqggh8`:**

  | discipline | 1st | 2nd | 3rd |
  | --- | --- | --- | --- |
  | Systems & economy | 36 | 44 | **51** |
  | Level & environment | 38 | 52 | **51** |
  | Art direction | 52 | 47 | **51** |
  | Game feel & technical | 53 | 61 | **58** |

  **Lowest 44 -> 51**, average 51.0 -> 52.75. The bar is 80 for every one, so the lowest is the
  number that matters and it has moved 15 points across three panels (36 -> 51). Art recovered from
  the reverted regression (47 -> 51) and systems took the largest single jump (44 -> 51) after the
  three live economy rules were finally given an on-screen surface.
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
- [PARTIAL] run length — **measured at HEAD `695bc84`, six runs, five won:**

  | seed | brood | shadow |
  | --- | --- | --- |
  | 20260805 | 17.04 won | 19.70 won |
  | 777 | 23.25 won | 16.31 won |
  | 4242 | 21.57 **lost** | 12.75 won |

  Brood median **21.57 min** against the 25-35 band — 3.43 short. It was 0.13 short before
  `695bc84` wired capacity to supply changes; that fix cost 3.3 min of brood median and is a
  deliberate correctness-over-pacing trade, recorded in its commit. Shadow improved on two of three
  seeds (11.29 -> 19.70, 14.29 -> 16.31), so the loss is not uniform.

  The 12.5-minute halfway floor IS asserted (`tests/unit/run.test.ts:158`, three-seed median). The
  25-35 band is not, and asserting it today would ship a red suite.
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

1. **Persona bar.** Third panel: systems 51 · level 51 · art 51 · feel 58, against 80 for each.
   Scored at `97c1846`; nine commits have landed since, two of them behaviour changes (`a430a22`
   visual timebase, `695bc84` capacity/supply wiring), so the shipped tree has no valid score.
2. **Run length** — median 24.87 min, one seed 17.04, one of six runs lost, band not asserted.
3. **W2 / W3 visual evidence** — both confirmed in source and in the running bundle, neither shown
   in a frame. `COMPLETION_RECOVERY.md` §36, §39, §41.

### Closed, and recorded here because they keep being re-opened from stale notes

- **Zero-caller audio methods** — CLOSED at `4012b29`. Thirteen at the session's start, **zero** now:
  four deleted as remnants of removed mechanics (`operationCard`, `tierUp`, `upgrade`,
  `routineTaken`), the rest wired to real events.
- **ART_BIBLE value ladder** — CLOSED from the floor side, and the ORDER NOW HOLDS at HEAD:
  `cabinetDoor` L* 42.3 below `floorVinyl` L* 46.3, which is what the bible requires. Notes calling
  it "re-opened" predate `f2f7837`. `floorVinyl` #5b5a5e -> #6e6d72 lifts it
  to L* 46.3 above `cabinetDoor`'s 42.3, so the documented order holds without darkening the largest
  vertical area — the move that caused the §42 regression. Playable-region histogram at HEAD:
  dark 1.3 % / mid 49.1 % / light 49.6 %, against 61.5 % / 3.0 % under the regression.

- **Sealed-region routines** — CLOSED in `aa29e9a`. The gate is `household.ts:290`
  (`if (!run.house.regions.some((r) => r.id === spec.region)) continue;`). The `ROUTINES` entries
  for `living.tv` / `bathroom.use` / `bedroom.phone` REMAIN in `state.ts` on purpose: `SEALED_REGIONS`
  is a reactivation list and they return with their rooms. Their presence in that array is not
  evidence they execute.
- **Post-revert luminance distribution** — RECORDED in §42. Playable region, same crop:
  L*<20 **1.3 %**, L*20-40 **52.0 %**, L*>40 46.7 %, against 61.5 % / 3.0 % under the regression.
- **Routines carry no position** — CLOSED in `082f21d` (`routineAt` derives it from `refilledBy`;
  six distinct cue positions where there was one).

## Last Pass (HEAD `cf26b07`)

- gates at HEAD: typecheck, lint, unit 89/89, `test:slow` 19/19, build, capture (0 console errors,
  20 restarts identical), prompt-evidence PASS, perf all green (measured at `1e81ddb` on an idle
  machine; nothing since touches the render path).
- **`cf26b07` — the kitchen's second act.** `ChapterId` gains `hold`, one Korean string, and the
  transition hangs on a colony milestone rather than a door. Three acts now fire in every run:
  `kitchen@0 -> hold@3.9-4.4 min -> final@8.5-9.5 min`. The first attempt used the full winning
  share as the trigger and never appeared, because `finaleArmed` tests the same threshold and
  `final` overwrote `hold` in the same tick — two acts on one event are one act. Moved to half the
  share, which is where the job actually changes.
- Run length and win rate are unchanged by it (17.04 / 23.25 / 21.57, five of six won). **This act
  names time that already existed; it does not create any.** The band still needs content.
- `695bc84` (capacity follows supply) cost 3.3 min of brood median as a deliberate
  correctness-over-pacing trade — the supplied/held HUD added this session was reading live route
  health beside a capacity number that had gone stale.
- `2f6ced1` corrected a stale note: the ART_BIBLE ladder order HOLDS at HEAD
  (`cabinetDoor` L* 42.3 below `floorVinyl` L* 46.3).

## Blockers

**None.** The previous entry named act authoring as a scoped blocker on the grounds of context
budget. That was wrong — a budget is not an external blocker, and the first act has now landed:
`updateFinal` advances the chapter on a colony milestone rather than on a gate, so the chapter
machinery executes for the first time in the project's life. Measured, three brood seeds: the run
crosses into `chapter.final` at 6.50 / 9.43 / 9.52 min.

What remains is more of the same work, not a different kind: further acts, each redefining what
holding the kitchen means, each needing objectives, Korean strings, balance and a re-measure. That
is ordinary authoring and it is where the next session starts.
