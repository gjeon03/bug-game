# DECISIONS — material deviations and rationale

Recorded per the production contract. Each entry states what the default was, what was chosen, and
why the change preserves or improves the outcome.

---

## D1 — Canvas2D runtime instead of Phaser

**Default in brief:** TypeScript + Vite + Phaser (or equivalent 2D runtime).
**Chosen:** TypeScript + Vite + a ~1.2 kLOC purpose-built Canvas2D renderer, zero gameplay runtime deps.

**Why this qualifies under the brief's exception clause:**

- _Preserves the player fantasy_ — the art direction is a lighting composite (multiply darkness layer
  with additive light holes) over procedurally generated sprites. Phaser's scene/camera/blend stack
  would have to be bypassed for exactly this effect anyway.
- _Supports deterministic simulation_ — the simulation is DOM-free and imports nothing from the
  renderer, so it runs identically in Node (Vitest) and the browser. Phaser couples update to its own
  scene lifecycle and to `requestAnimationFrame`, which would have required a parallel headless path.
- _Static Pages build_ — unchanged; both produce static output.
- _Improves quality/feasibility_ — every visible asset is generated procedurally at boot, so the
  loader/atlas/texture-packing half of Phaser is dead weight. Measured cost: Phaser ≈ 1.1 MB min
  (≈ 300 kB gzip) versus this build's total gzip budget of 150 kB, which materially affects the
  cold-load gate.
- _Does not increase integration risk_ — the surface actually written (camera, blit, particle pool,
  input, audio mixer) is smaller than the surface that would have been written _against_ Phaser.

**Cost accepted:** no third-party physics/tween/particle editors. Mitigated by keeping collision to
circle-vs-AABB, which is all this authored kitchen needs.

---

## D2 — Pheromone is secreted by the scout, not painted with the pointer

**Default in brief:** "hold the primary pointer input to lay a limited pheromone route."
**Chosen:** hold `LMB` **or** `Space` to secrete pheromone **from the scout's own body** as it moves.

**Why:** pointer-painting lets a player route through ground the scout has never visited, which
decouples the logistics layer from the scouting layer and quietly deletes the reason the scout is
fragile. Secretion makes route creation and personal risk the _same act_: a shortcut across open tile
is dangerous for you before it is dangerous for your workers. It also keeps the differentiator away
from RTS-style drawing.

The primary pointer input is still the primary binding (hold LMB), so the brief's input shape is
preserved; only the origin of the trail moved from the cursor to the body. A full keyboard alternative
exists so the game is playable without a mouse.

---

## D3 — Crack functions are authored, not chosen from a menu

**Default in brief:** three upgrades (Brood Chamber, Food Cache, Escape Tunnel).
**Chosen:** all three exist, but each is pre-assigned to a specific authored crack.

**Why:** a per-crack function picker adds a modal UI, a currency comparison and a "wrong build order"
failure mode, none of which serve the differentiator. Pre-assigning them keeps the decision where the
game is actually interesting — _which risk do I take next, and when_ — and makes each crack a distinct,
recognisable place with a distinct silhouette and reward. Each still has a distinct visual change and a
distinct gameplay consequence, as required.

Placement encodes the risk curve: Brood Chamber under the island (centre, exposed), Food Cache in the
pantry gap (far but covered), Escape Tunnel behind the radiator (far, next to the trash, high traffic).

---

## D4 — No render interpolation

Simulation is fixed 60 Hz and rendering reads entity state directly rather than interpolating between
two sim states.

**Why:** at a 60 Hz sim on 60 Hz displays the interpolation error is sub-pixel, while carrying an
extra previous-transform per entity would double the hot-loop memory traffic for ~90 roaches plus
particles. The clamped accumulator plus a 5-step cap keeps it stable on slower displays; the
`p95 ≤ 20 ms` budget is what actually guards presentation smoothness, and it is measured rather than
assumed. Revisit only if measured frame pacing fails the budget.

---

## D5 — All assets generated procedurally at boot; no binary asset files

**Default in brief:** any of authored sprites, procedural canvas/SVG, Blender renders, generated
images, or licensed assets.
**Chosen:** procedural Canvas2D generation (sprites, textures, decals) + WebAudio synthesis (all
sound), both seeded and deterministic. Zero image, audio or font files are fetched at runtime.

**Why, after tool inspection:** Blender, Inkscape and sox are not installed on this machine; ffmpeg
and ImageMagick are, but a raster pipeline would ship megabytes of PNG/audio for art that is
fundamentally geometric (ellipses, gradients, noise) and for sound that is fundamentally synthetic
(filtered noise, sub-bass thuds). Procedural generation gives: perfect DPI scaling, a 0-byte asset
payload, unambiguous licensing (100 % first-party), and per-instance variation that a fixed sprite
sheet cannot provide.

**This is a final production method, not a placeholder.** The classification per asset class is in
`ASSET_MANIFEST.md`. Typography is the one exception: the UI uses a system font stack rather than a
bundled webfont, which is a deliberate "intentional final" choice recorded there.

**Cost accepted:** ~40–90 ms of one-time atlas generation at boot, measured and reported in the
startup timing evidence.

---

## D6 — `base: './'` rather than a hard-coded Pages base

Vite emits relative asset URLs. The build is therefore path-agnostic: it runs from the domain root,
from `/<repo>/`, or from any nested path, with no environment variable and no rebuild. This is
verified by serving the real `dist/` under a synthetic `/bug-game/` prefix in E2E.

---

## D7 — Deployment held until explicitly approved, then carried out

Creating a public repository and pushing are outward-facing and hard to reverse, so both were held
until the repository owner approved them explicitly, even though `gh` was already authenticated with
the necessary scopes. Until that point `DEPLOYMENT.md` stated plainly that the project was **not**
deployed and named the single external action required.

Approval was given, and the deployment was then carried out and verified against the public URL
rather than assumed: <https://gjeon03.github.io/bug-game/> is loaded, played to a worker delivery, and
checked for stray network requests by `scripts/verify-live.mjs`, whose output is committed as
`artifacts/evidence/deployment-live.json`.

---

## D8 — Evidence is graded by exposure, not gated by a threshold

**Original implementation:** a worker or trail node counted as "exposed" if it crossed a fixed
exposure threshold, and each contributed a fixed amount per second.

**Chosen:** each contributes in proportion to how far it sits _above_ a do-nothing baseline
(`EVIDENCE_BASELINE`), capped per roach so one bright light cannot dominate.

**Why, with the measurement:** an independent gameplay review measured that the threshold approach
had no working setting. At 0.55 nothing on unlit floor ever counted — dark open tile reads exactly
0.30 — so a deliberately terrible route ended a night with _lower_ suspicion (3.16) than a careful one
(4.50). At 0.26 everything counted, because almost the whole floor is more than a toe-kick from
cabinetry, so a passing patrol torch pushed every worker over at once and one patrol pass added ~80
suspicion. Grading gives a continuous gradient — cover ≈ 0, dark open floor a trickle, lit open floor
several times that — which is the shape the design always described and never implemented.

Verified by `tests/unit/balance.test.ts`: same seed, same 140 s, same destination — a cover-hugging
route peaks below 5, a route through the under-sink light peaks above 18.

## D9 — Claimed cracks are shelter

**Added:** a roach inside a claimed crack cannot be touched by a foot or by spray, and panicking
workers run for the nearest claimed crack (the Escape Tunnel reaching furthest at 1100 units versus
680).

**Why:** the extermination response previously had no counterplay at all. The review measured a
careful colony of 52 reduced to 6 by the final sweep, and separately found the Escape Tunnel "nearly
inert" — its 700-unit panic radius contained no colony activity. Making cracks shelter turns a sweep
into something the colony _reacts_ to, gives the third upgrade a real job, and pays back the evidence
that claiming it cost. Measured effect on the same scripted run: losses through the final response
fell from 69 to 17.

This is also why the run can be won at all: surviving the final response is a win criterion, and
before this there was no action that improved the odds of it.

## D10 — Breeding pauses so the larder can fill

**Added:** brood requires a population-scaled surplus, and stops entirely once the colony is at
fighting strength until reserves are above the win thresholds.

**Why:** brood previously ran whenever reserves cleared a flat floor of 22 food / 12 water, so the
colony spent every surplus down to that floor while the win condition demanded 120 / 90 banked. The
two goals competed forever and the win was unreachable by construction. The pause is surfaced to the
player (`world.banking`) rather than being a silent rule.

---

## D14 — Four player-driven operations replace the three-night clock

**Default in brief:** a player-driven four-operation infestation run, unless a better structure is proved.
**Chosen:** the default, adopted essentially unchanged.

**Evidence that forced it.** A measured run of the old build with **no player input after t = 10 s**
satisfied two of the four win criteria by t ≈ 110 s and only failed at t = 788 s because population
never reached 36. The clock, not the player, was the content:

- mean gap between authored beats: **112 s** (contract budget: 3 s)
- longest decision-free plateau in a real-browser cautious run: **463.9 s**
- 13 of 14 threat spawns in a winning run were clock-driven

Operations gate on achievement. Time still applies pressure through a per-operation soft limit that
raises household patience when overrun, so dawdling costs pressure rather than ending the run.

---

## D15 — Regional evidence heat, added alongside the global tier

**Default in brief:** the household should learn _where_ activity occurred, not only accumulate a number.
**Chosen:** a 12 × 9 grid (`sim/heat.ts`) that every evidence source deposits into at the position it
happened, plus the existing global tier, rate-limited.

**Why not replace the scalar outright.** The tier answers "how severe may the response be" and the
grid answers "where does it go". Keeping them separate meant the existing suspicion tests, the tier
UI and the cause ledger all survived, while trap siting, cleaning and spray targeting became
consequences of the player's own route geometry.

**Measured defect this fixes.** `addSuspicion(world, cause, amount, x, y)` accepted a position and
discarded it; `SuspicionState` had no positional field; continuous causes passed literal `0, 0`. Trap
siting scored _trail node geometry_ and never read `route.traffic`, so a line six roaches were
pounding scored identically to one nobody used.

---

## D16 — Spacing enforced positionally, not as a steering force

**Default:** keep the existing separation force and tune it.
**Chosen:** a Jacobi positional relaxation pass after integration, plus per-worker lane offsets.

**Why a tune could not work.** The steering vector is re-normalised to the worker's target speed, so
a separation force can only change heading — never spacing — and at the two moments spacing matters
most it produced _exactly zero_ correction: harvesting (`speedMul = 0`) and queue-waiting
(`speedMul = 0.12`). Meanwhile every worker steered to the same node on a single centreline, at a
separation query radius of 17 units against a drawn body ≈ 21 units long. Overlap was structural.

---

## D17 — Caps are derived from what the player built

**Default:** raise the caps.
**Chosen:** low base caps (`FOOD_CAP 120`, `WATER_CAP 100`, `BASE_CAPACITY 13`) that only rise through
claimed footholds, fitted functions and chosen adaptations.

**Why.** The measured failure was not that the cap was too low: it was that the cap was a constant
the player could not move, so reaching it was a dead end. A ceiling with a named, affordable thing
attached to it is a decision. The invariant is enforced in `cappedAdvice()` and asserted by test: a
capped resource must always name a spend, a cap-raiser, a reason to hold, or the real bottleneck.

---

## D18 — Three defects found by playing, not by reading

Recorded because each was invisible to static analysis and to the unit suite, and each was fixed only
after the guided bot reproduced it in a real browser.

1. **Capacity deadlock.** `BASE_CAPACITY` 10 against operation 1's 12-roach gate, with the only
   capacity raisers locked behind operation 2. The colony sat at 10/10 while the blocker told the
   player to claim a foothold they could not yet claim. Fixed by making base capacity exceed the
   first gate — and the general rule is now that an operation's gates must be satisfiable with what
   that operation itself unlocks.
2. **Unaffordable offers monopolised the objective.** An adaptation the player could not pay for held
   the top of the objective hierarchy indefinitely; the shortage warning never got a turn and the
   colony starved being told to spend food it did not have. An offer never expires, so an unaffordable
   one now falls through the hierarchy and becomes a named blocker instead.
3. **Temporary routes evicted permanent ones.** A route to a household spill stayed in the player's
   concurrent-route budget after the spill was cleared away, so opportunistic routing silently
   deleted the colony's own supply lines. Routine routes are now removed with their resource, the
   player is told, and the route budget went from 5 to 6 to leave room for opportunism.

---

## D19 — Four defects the full CI suite found that the local suite could not

The repository's E2E suite was long enough that it had never been observed green end to end on one
machine; the deploy job ran it in CI, and the first honest run of it failed 4 of 17. Recorded because
each failure was a real defect rather than a flaky test, and because three of the four were in the
_verification_ layer, which is exactly where a false green hides.

1. **The performance spec was measuring the host, not the game.** `cpuWorst` came in at 14.7 ms
   against an 8 ms budget on a headless CI box. The frame budget belongs to the game, so the game's
   own cost is what has to be inside it — and it was not, because territory hold and regional heat
   were both recomputed every simulation step. Both are now batched at 10 Hz
   (`TERRITORY_INTERVAL`, `HEAT_INTERVAL`), which took the same measurement to 2.1 ms p99 / 6.2 ms
   worst. The spec's long-frame assertion was also rewritten: counting long intervals on a shared CI
   runner measures the runner, so it now asserts that the game's own CPU time stays inside budget —
   an explainable frame, rather than an absent one.
2. **A restart assertion had become impossible to satisfy.** It required every zone's hold to be 0
   after a restart, which stopped being true the moment the home crack counted as a foothold: a fresh
   world legitimately starts with presence in its own region. Replaced with the property that was
   actually meant — no zone is _held_, and no zone has accumulated meaningful hold.
3. **A player who was only ever seen got no response at all.** Measured: alert tier 2, five sightings,
   zero patrols, zero traps. The household acted only on ground whose regional heat had passed
   `HEAT_KNOWN`, and a player who never routes anything deposits almost no regional heat — so being
   spotted repeatedly produced nothing. Sightings now deposit heavily where they happen, and from
   tier 2 the household will act on the best ground it has, because by then it is looking.
4. **The full-run spec's player starved itself.** It stacked the brood family three times and ran out
   of food. Replaced with the guided player used everywhere else in the evidence package, which acts
   only on `hud.source` and `hud.target` — the same information a human has. That player then
   reproduced defect 2 of D18 inside the test harness itself: an offer it could not afford
   short-circuited its step with neither an action nor a wait, spinning its whole iteration budget in
   seconds. Same shape as the bug in the game's objective hierarchy, same fix — an offer never
   expires, so an unaffordable one is a reason to go earn it, not a reason to stop.

**The general lesson, recorded because it cost the most time here:** a test suite too slow to run
locally is a suite whose failures are discovered by the deploy job. The specs are long because a
playthrough happens in real time and that is not negotiable, so the mitigation is that the deploy job
runs the _whole_ suite rather than a fast subset of it — `.github/workflows/pages.yml` now invokes
`pnpm test:e2e`, and nothing reaches Pages that has not passed all seventeen.

---

## D20 — Panicking roaches pressed into walls, and the stuck ladder could not save them

The worst worker stall in the seven-scenario package was **19.9 s**, in the aggressive run, under a
spray. Every one of the ten worst stalls had the same shape: state `panic`, and a position on the
line **y = 1172** — twenty roaches strung along a single cabinet edge, motionless, at the most
closely-watched moment in the game.

**Two causes, both load-bearing.**

1. **A refuge in range is not a refuge that can be reached.** Panic steers straight at the nearest
   claimed crack and, because that crack is nominally within reach, refreshes `panicTime` every
   step. When a cabinet stands on the straight line, the worker pushes into it forever: the
   distance never closes, so the timer never expires, so the panic never ends. The run now checks
   the surface it is actually standing against — if that surface faces back along the run, the
   worker follows it instead of pushing through it, and the timer stops being pinned so the panic
   can end on its own.
2. **The stuck ladder counted its own nudge as an escape.** Rung 2 shoves the worker sideways. That
   shove moves the body more than the watchdog's progress threshold, so `recoverStage` reset to
   zero — and the panic steering immediately pushed it back into the same wall. The ladder cycled
   0-1-2 for the full nineteen seconds and never reached rung 4, the one that follows a wall out.
   Fixing cause 1 removes the force that was pushing them back; the cycling itself is recorded here
   because it is a general hazard of a ladder whose own rungs create displacement, and because the
   opposite fix — escalating to wall-following sooner — was tried earlier in this project and
   measured **worse** (43 events / 4.7 s worst → 81 events / 28.2 s worst).

**How it was found, and what nearly hid it.** The probe reported a 27 s worst stall but its
`stuckSample` held the _first_ ten events rather than the worst ten, so every recorded sample was a
harmless two-second one and nothing explained the number. Worse, the recorded `state` was read at
the moment the stall _ended_ — and since every excused state (harvest, queue, trapped, idle) counts
as progress and therefore ends a stall, the label was guaranteed to be the wrong one. Events marked
`harvest` were really "stalled somewhere else, then reached the food". The probe now keeps the worst
by duration, records the state the stall began in, every state seen during it, how it ended, and the
recovery rung reached — and counts a worker that died mid-stall separately, so an aggressive run's
casualties cannot inflate the figure that the gate reads.

**The lesson worth keeping:** the measurement was wrong in the direction that made the game look
fine. A sampled-first-N record of a worst-case metric is not evidence about the worst case.

---

## D21 — Two measurements that were reading the wrong thing

Both were found while chasing gates that appeared to be failing, and in each case the check was
answering a question next to the one being asked. Recorded because a wrong measurement is more
expensive than a wrong implementation: it points the work at the wrong place.

**The decision-density probe read the rule id, not the instruction.** The contract forbids a plateau
longer than 45 s without something new for the player to decide, and the probe marked a beat when
`hud.source` changed. That is a fair proxy almost everywhere — it ignores a countdown ticking inside
an otherwise unchanged objective, which is exactly the noise it needs to ignore. It is wrong in the
one place the rule is pinned by design: for the whole 62-second extermination `hud.source` is
`final`, so a finale whose objective moved from "the spray is on the pantry — get them into a crack"
to "holding 2 of 3 — get bodies back into the island" scored as a single **51.8 s** plateau. The
probe now marks a beat when the instruction changes with its digits masked, which counts a different
instruction and still ignores a countdown, and reports the rule-only figure alongside it as
`longestRuleSeconds` so neither reading is hidden.

That said, the frozen finale was a real defect and was fixed first, before the measurement was
touched: the climax objective now names which cloud is where, which region is slipping and how long
is left, and `critique.test.ts` holds it to the 45-second gate. The measurement change came second,
and it changes what the gate reads for one rule in one phase of the game.

**A regex inside the in-page sampler was eaten before it compiled.** The sampler is shipped to the
page as a template literal, so `\d` in its source collapses to a literal `d` and the digit mask
would have stripped the letter d out of every objective instead of the numbers. `eslint` flagged it
as a useless escape, which is precisely what it was. The mask is a character class now. The same
hazard bit once already in this file — a pair of backticks inside a comment in the sampler
terminated the template literal and broke the parse — so it is worth stating plainly: **the sampler
is a string, and normal escaping intuitions do not apply inside it.**

---

## D22 — Three attempts to make the stuck ladder escalate, all measured worse

Recorded as a negative result, with numbers, because the intuition that a worker stuck for seven
seconds should climb the recovery ladder faster is extremely strong and it is wrong in this kitchen
every time it has been tried.

The ladder is: **1** re-read the scent · **2** step sideways and flip lanes · **3** abandon the route
and walk home · **4+** follow the wall, alternating side, cycling forever. A worker resets to rung 0
the moment it makes progress.

| Attempt                                                 | Worst real-browser stall | Outcome                                                                                                                        |
| ------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Baseline (this ordering)                                | 43 events / **4.7 s**    | shipped                                                                                                                        |
| Skip straight to wall-following when a wall is involved | 81 events / **28.2 s**   | reverted — a worker that has also lost the trail runs along the wall away from its line                                        |
| Hold the rung 1.2 s so a nudge cannot reset the ladder  | —                        | reverted — queue jams promoted healthy workers to "drop the route"; seed 20260801 went from a win to a collapse at operation 2 |
| Wall-following ahead of the abandon step, with the hold | **66.7 s**               | reverted — the island is a 1 240-unit convex edge and a committed follower walks its whole length                              |

The rung that resets the ladder is doing real work: **rung 2's own sideways shove is movement**, so
it clears the progress threshold and the worker starts again from rung 1 next time. That looks like
a bug and reads like a cycle in the probe output (`recoverStage: 2`, over and over). It is also what
keeps a jammed-but-fine worker from being promoted to a rung that costs the player a supply line.

**Where that leaves the gate.** The contract asks for no unintentionally stuck worker over 2 s. Sixty
seconds of two-route traffic meets it and is asserted in `workers.test.ts`. A ten-minute real-browser
run with thirty roaches, hazards and a spray does not: the worst measured stall is **7.2 s**, and the
stalls cluster on one coordinate — the top-left corner of the island. That is an honest miss, it is
in `PLAYTEST_REPORT.md` §5, and the four attempts above are why it is not being fixed by tuning the
ladder. The next thing to try is the map rather than the AI: a convex corner that thirty roaches
route around at once is a level-design problem, and rounding or chamfering that corner is a smaller,
more predictable change than another pass at the recovery heuristic.

---

## D23 — A lane offset that aimed workers into cabinetry

Every worst stall in the shipped evidence package sat on one line: **y = 1172**, the top edge of the
island, spread across 400 units of it, in `inbound`, on recovery rung 2, the longest **69.7 s**.

The cause is arithmetic, not AI. Workers ride two counter-flowing lanes offset perpendicular to the
trail tangent, `lateral = sign * LANE_OFFSET + lane * LANE_JITTER`, and the steering target is that
offset applied to a lookahead node. Where the player's line runs along cabinetry — which the shortest
route very often does — the lane whose sign faces the cabinet computes a target **inside** it, and
every step aims the whole cohort at the wall. The stuck ladder cannot help: it nudges the worker
free and the steering immediately puts it back. Exactly the shape of the panic defect in D20, in a
different system.

The fix mirrors the lane when its target is inside a solid. Counter-flow separation is lost for those
few nodes and the traffic moves. Measured directly: over 120 s on a wall-hugging route, the old
formula produced **4 745** steering targets inside cabinetry; the new one produces **zero**, and
`workers.test.ts` asserts it.

**The test for it was wrong three times, and each way was instructive.**

1. **It counted idle roaches as stuck.** It reported **18.7 s → 2.4 s**, which read as a decisive
   win. The 18.7 s figure was an `idle` roach loitering at a nest, which is not stuck at all — the
   simulation's own watchdog excuses idle for exactly that reason and the test did not. With idle
   excluded the figure was identical with and without the fix.
2. **It re-derived the fix and asserted its own arithmetic.** Rewritten to check the invariant
   directly, it recomputed the lane offset in the test body and asserted the recomputed result was
   reachable — which is true by construction. It passed with the guard deleted from the game
   entirely. A test that reimplements the code under test is testing itself.
3. **The guard used a point test, so it barely worked.** With the test finally measuring an
   observable — how long a routed worker is held in continuous contact with cabinetry — the guard
   showed 11.1 s → 2.8 s rather than the clean result the earlier versions implied. The reason is
   that `isInsideSolid` is a _point_ test: a lane target one unit clear of a cabinet passes it, while
   a body of radius 8 cannot stand there at all. The real-browser package agreed and was blunter —
   worst stall **212 s**, still on y = 1172. The guard tests a circle now.

The shipped assertion is the observable one: no worker following a route is held against cabinetry
for longer than the bound, measured on a trail deliberately laid along the island's top edge.

## 렌더러 판정 — Canvas2D + 구운 스프라이트 채택, WebGL 후보 폐기

**일자:** 2026-08-04
**증거:** `artifacts/evidence/quality-reboot-baseline/renderer-bakeoff/a-canvas2d-vs-b-webgl.png`

동일한 싱크대 장면을 두 방식으로 실제 렌더링해서 비교했다. 습관이 아니라 측정으로 골랐다.

- **후보 A** — Canvas2D가 구운 스프라이트를 합성하고, 손전등은 화면 합성 원뿔로 처리.
- **후보 B** — WebGL이 알베도 + 노멀맵을 샘플링해 움직이는 손전등으로 픽셀 단위 재조명.

### 판정: A

1. **두 패널의 물체 인식·깊이·재질 분리·접지 그림자가 동일하다.** 품질은 렌더러 API가
   아니라 오프라인 베이크에서 나왔다. 같은 아트를 그리는 한 WebGL로 바꿔도 더 나아지지
   않는다. 이것이 판정의 핵심 근거다.
2. **B의 유일한 고유 능력이 오히려 나쁘게 읽힌다.** 손전등은 부피를 가진 원뿔로
   지각되는데, B는 "물체들이 이유 없이 밝아지는" 것으로 보인다. A의 합성 원뿔이
   빛으로 읽힌다.
3. **B의 노멀은 26° 기울인 카메라의 뷰 공간 노멀이다.** 이를 평면처럼 조명하는 것은
   근사에 불과하며, 프롭이 클수록 오차가 커진다.
4. **환경 설계 명세의 독립 분석:** 광원 14개 중 9개가 정적이라 450x325 라이트맵
   하나(~0.59MB, 블릿 1회)로 구워진다. 프레임마다 차폐가 필요한 것은 2개뿐이다.
   즉 동적 재조명은 이 주방이 실제로 요구하는 기능이 아니다.
5. **이관 위험이 이익보다 크다.** perf 14 게이트는 내 작업 이전에 이미 실패 중이었다.
   여기에 셰이더 컴파일·컨텍스트 소실 처리·번들 증가를 얹는 것은 정당화되지 않는다.
6. A는 기존 렌더러 구조와 노출(exposure) 결합을 유지한다. 노출이 라이트맵 샘플 +
   해석적 항 몇 개가 되므로 "플레이어가 보는 것이 곧 사람이 보는 것"이 구조적으로 성립한다.

### 폐기 조치

패배한 프로토타입은 남기지 않는다. 프로덕션 렌더러 둘을 유지하지 않는다는 원칙에 따라
노멀맵 패스(`opts.pass === 'normal'`), 아틀라스의 `normalFile` 항목, `public/art/*-n.png`,
그리고 비교 스크립트를 제거한다.

### 유의점

A를 택했다고 조명이 정적이라는 뜻은 아니다. 손전등 원뿔·냉장고 문 개폐 홍수광은
런타임 합성 레이어로 남고, 그 레이어는 노출 시스템이 샘플링하는 바로 그 필드여야 한다.

---

## 렌더러 재판정 — three.js 진짜 3D로 이관 (2026-08-05)

**위 「렌더러 판정」(2026-08-04)을 대체한다.** 그 항목은 삭제하지 않는다. 당시 근거는
당시 비교 대상에 대해 옳았고, 지금 뒤집히는 이유는 **비교 대상 자체가 달라졌기 때문**이다.

### 이전 판정이 실제로 비교한 것

후보 A와 B는 둘 다 **2.5D 스프라이트 합성**이었다. B는 "26° 기울인 카메라로 구운
스프라이트를 픽셀 단위로 재조명"하는 것이었고, 그 판정문 3번 항목이 스스로 적었듯
"B의 노멀은 뷰 공간 노멀이라 평면처럼 조명하는 것은 근사에 불과"했다. 즉 그 실험은
**진짜 3D 씬을 한 번도 렌더해 본 적이 없다.** "품질은 렌더러 API가 아니라 오프라인
베이크에서 나왔다"는 결론은 그 전제 위에서만 참이다.

### 무엇이 바뀌었나

사용자가 전면 리부트를 지시하며 새 렌더러·진짜 3D 세계·three.js를 명시적으로 승인했다.
이건 같은 아트를 다른 API로 그리는 문제가 아니라, **평면 도면처럼 읽힌다는 최상위 결함을
표현 차원 자체를 바꿔서 없애는** 문제다.

### 결정적 발견

베이크 파이프라인이 이미 답을 갖고 있었다. `tools/bake/props/` 의 프롭 44개는 스프라이트가
아니라 **실측 밀리미터로 모델링된 three.js 지오메트리**이고, 베이크는 그것을 납작하게
누르는 마지막 단계였을 뿐이다. 리부트의 실체는 한 문장이다 — **굽던 것을 실시간으로 렌더한다.**
새 에셋 제작이 아니라 마지막 단계를 제거하는 작업이었다.

### 실측 근거 (Apple M1, 1920x1080, 헤디드 Chromium, ANGLE Metal)

| 항목 | 값 |
| --- | --- |
| 프레임률 | 60 fps (vsync 상한) |
| 드로우콜 | 549 |
| 삼각형 | 133,460 |
| 지오메트리 | 71 |
| 페이지·콘솔·HTTP 오류 | 0 |

이전 판정의 5번 근거("이관 위험이 이익보다 크다 — perf 14가 이미 실패 중이었다")는
더 이상 성립하지 않는다. perf 14는 그 뒤 통과로 바뀌었고, 실측 3D 씬이 예산 안에 든다.

### 반드시 함께 기록할 것 — 3D에서 성능 게이트는 거짓 통과한다

`cpuP99`는 게임 프레임 콜백의 CPU 시간만 잰다. Canvas2D에서는 `ctx.*` 가 동기 CPU
작업이라 이 값이 렌더 비용을 정직하게 추적했다. **WebGL에서는 `gl.draw*` 가 즉시
반환한다.** 따라서 `cpuP99 ≤ 8ms` 게이트는 **게임이 느려지는 동안 오히려 초록으로 간다.**
3D 게이트에는 GPU 타이밍이나 `renderer.info.render` 상한이 반드시 함께 있어야 한다.

### 폐기 조치

`src/render/` (4,473줄)는 프루프가 통과하면 삭제한다. `proof.html` 은 `index.html` 에
합친다. **프로덕션 렌더러 둘을 나란히 두지 않는다** — 이전 판정의 원칙을 그대로 승계한다.

**선행 조건:** `tests/unit/i18n.test.ts:5` 가 `src/render/props.ts` 를 모듈 스코프에서
임포트한다. 그 파일을 먼저 분리하지 않고 지우면 한국어 불변식 23개를 포함한 테스트 25개가
임포트 단계에서 함께 죽는다.

### 승계되는 것

- 오프라인 베이크의 **척도 계약** (`MM_PER_UNIT = 35/26`) — 그대로 유지.
- **환경맵** — 금속은 확산 반사가 없어 반사할 환경이 없으면 검게 죽는다. 이전 빌드에서
  배수구가 LP판으로 보였던 실측 원인이며, 3D에서도 동일하게 필수다.
- **머티리얼 어휘 20종** — `MeshStandardMaterial`/`MeshPhysicalMaterial` 그대로 런타임으로.
- `materials.mjs` 의 **텍스처 부정 결과** — 반복 타일링은 격자를 만든다. 3D에서도 유효하다.

### 기각된 대안

- **HDRI 환경맵**: 공개된 실내 HDRI가 전부 주광이다. 야간 주방에 주광 HDRI를 얹는 것은
  절차적 환경맵보다 **더 나쁜** 오차다. 자체 제작 유지.
- **Kenney 3D 지오메트리**: 텍셀 밀도가 사실상 0이고(팔레트 아틀라스 조회용 UV라 재텍스처
  불가), 비-PBR 스와치라 강철 냄비와 도자기 그릇이 동일하게 반응한다. 권위 있는 프롭 옆에
  두면 스타일이 아니라 **미완성**으로 읽힌다. UI 입력 글리프 SVG만 채택 후보.
- **KTX2**: `ktx`/`ktx-software`/`libktx` 가 Homebrew formula 에 없다. 브리프가 "when
  supported" 로 단 항목이므로 선택 사항으로 둔다. 필요해지면 `ktx2-encoder`(MIT, WASM).
