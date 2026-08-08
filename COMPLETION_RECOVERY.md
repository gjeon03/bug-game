# COMPLETION_RECOVERY

Takeover of an incomplete whole-home infestation build. The previous session's final report,
`GAUNTLET_STATE.md`, critic reports and evidence are treated here as an **unverified handoff**;
everything below was re-checked against the actual build on this branch.

**Inherited commit** `88c060f` on `experiment/whole-home-infestation-3d`, archived as
`archive/whole-home-gauntlet-incomplete`. Work continues on
`experiment/whole-home-infestation-3d-completion`. `main` remains `c5ce2d8`, untouched.

---

## 1. Verified working (re-run, not taken on trust)

| System | Evidence |
| --- | --- |
| Build and static gates | `typecheck` / `lint` / `format:check` clean; `pnpm test` 79/79 in <1 s; `vite build` 953 ms, 806 kB (222 kB gzip) |
| Real-browser boot | 187 props, ~2 000 meshes; **0 console errors, 0 failed requests, 0 external requests, 0 missing prop builders** |
| Restart | five consecutive restarts produce byte-identical opening state |
| Nested subpath | `/bug-game/` serves clean, same zero-error result |
| Performance (real Chrome, Apple M1, Metal, GPU timer queries, active play) | presented **p50 16.70 / p95 17.50 / p99 18.50 ms**, worst 18.80; CPU 4.60/5.40; GPU 4.02/7.10; **0 frames over 33 ms**; 297 draw calls |
| Audio | wired to simulation cues, panned from world positions; `started: true` in browser |
| Region gating | sealed navigation graph has **no edge** into unopened regions — proven by `house.test.ts`, not by a flag check |
| Korean UI | 242-key catalog, all 157 code-referenced keys present; NanumSquareNeo vendored, relative URLs, no tofu at four viewports |

## 2. Unresolved blockers — confirmed by reproduction

| # | Reported | Reproduced? | Actual finding |
| --- | --- | --- | --- |
| 1 | Run is ~9.7 min, not 25–35 | **YES** | shadow won 9.7 min; brood never finished |
| 2 | Breeding build cannot complete | **YES — still open.** One root cause found and fixed (§3); the build still does not complete through `tests/bot.ts` — see the retraction in §6 |
| 3 | Rooms unreadable without HUD labels | **YES** | only the kitchen has ever been seen; four regions never rendered to a human |
| 4 | Critics FAIL, blockers open | **PARTLY OBSOLETE** | of 14 blockers, 10 were closed with re-measurements last session; the remaining live ones are room identity, run length, and the brood build |
| 5 | No proof of a full kitchen→bedroom run | **NO — this is obsolete** | shadow seed 4242 reaches all four main regions, 12 footholds, survives an extermination sweep, and wins. What is missing is a run of the right *length*, not a run that connects |

## 3. Root cause of the breeding-build failure — verified, not guessed

The previous session guessed three times (brood moisture cost, a bot re-router, a starvation grace
period). All three failed; one produced **byte-identical output**, proving it never executed.

Instrumenting the moisture ledger every 30 s settled it:

```
t=90   moist 136.5   moisture routes 1, workers on them 5    food routes 3, workers 7
t=120  moist 176.1   moisture routes 1, workers on them 0    food routes 3, workers 6
t=300  moist  58.1   moisture routes 1, workers on them 1    food routes 7, workers 8
t=480  moist   5.4   moisture routes 0                       food routes 8, workers 9
```

Moisture was never scarce and the source never ran dry (`driedUp: 0`). **The colony died of thirst
standing next to full water**, with zero threats and every region at alert 0.

Two compounding defects in `assignRoutes`, both in labour allocation, neither in the economy:

1. **Assignment was permanent.** Only workers with `state === 'idle'` were ever considered, and a
   worker cycles outbound→collecting→inbound→delivering→outbound forever. Labour was frozen at
   whatever the network looked like when each body hatched. No play could move it.
2. **The load metric was length-normalised, which inverts its own intent.**
   `assigned / max(1, length / 400mm)` makes a *short* route full at one worker while a long route
   accepts eight. The nearest, cheapest, highest-throughput water source in the flat was starved of
   labour **by construction**.

Fix: workers re-choose the moment they finish a delivery — standing in the nest, which is exactly
where a real one senses which trail is strongest — and routes are scored by **need**
(`scarcity × strength / crowding`), not distance.

Measured after, same seed: the allocation now swings responsively — moisture 1.1 at t=270 pulls 20
workers onto water routes and recovers to 35.8 by t=330. Population **14 → 30**, capacity **30 → 49**.

## 4. Obsolete claims from the handoff

- *"No independent criticism"* — five critics ran; reports in
  `artifacts/evidence/whole-home-reboot-final/critics/REPORTS.md`.
- *"No performance evidence"* — measured on real hardware, all budgets pass.
- *"No audio"* — wired and verified in-browser.
- *"Occlusion never executes a raycast"* — not reproducible: `registered 98 / candidates 13 /
  tests 15`, `fading: 1` in 26 of 26 blocked frames.
- *"Existing evidence does not prove a connected run"* — it does prove connection; it does not prove
  duration.
- *"The brood build starves because moisture supply is insufficient"* — false. Supply was never the
  constraint.

## 5. Exact reproduction paths

```bash
pnpm install && pnpm build && pnpm preview      # http://127.0.0.1:4273/
node scripts/capture.mjs                        # browser evidence + runtime-report.json
node scripts/perf.mjs                           # REAL Chrome, GPU timers (not headless)
node scripts/serve-nested.mjs 4178 /bug-game/ dist
pnpm test                                       # fast suite, 79 tests
pnpm test:slow                                  # full-run balance, minutes
```

Deterministic seeds: brood `20260805`, shadow `4242`, scavenging `31337`.

## 6. Highest-impact next action

Done: the labour-allocation fix above, which unblocks the breeding build.

Next: **run length.** The connected run exists and now supports a growing colony; it is ~10 min
against a 25–35 min target. Per the brief this must come from additional meaningful regional
operations — not multiplied prices, slowed workers, or waiting. The measured shape to fix is that
the first four gates all fall inside ~2 minutes while the bedroom phase carries the rest.

Then: room identity. Four of five regions have never been rendered to a human reviewer.

---

# Session 2 — measured findings

Everything below was produced by instrumentation on a fixed seed, not by reading code and forming an
opinion. Where a change was reverted, the numbers that justified reverting it are kept.

## 6. Breeding build: allocation defect fixed — but NOT "confirmed", and the retraction matters

`assignRoutes` allocated workers permanently (only `state === 'idle'` was ever reconsidered) and
measured route load normalised by length, so a short route read as full at one worker. The colony
died of thirst beside full water sources — `driedUp: 0`, zero threats, every region at alert 0.

Need-based `routeAppeal` plus releasing workers on delivery. Allocation demonstrably responds now —
moisture 1.1 at t=270 → 20 workers assigned → 35.8 by t=330 — and that specific defect is genuinely
fixed.

> **RETRACTION.** I reported this as `status=won end=6.4min`, peak 53, 452 deliveries, 16 lost, and
> called the build confirmed. That number came from a **throwaway probe with its own scripted
> player**, not from `tests/bot.ts`. Re-running commit `33f049e` — the very commit the claim was
> filed under — through the real harness gives:
>
> `{"status":"playing","min":50,"gates":3,"peak":41,"deliveries":967,"lost":241,"sweeps":0}`
>
> The brood build **does not complete** at that commit and never did through the shipped harness. It
> opens three of five gates and runs out the 50-minute cap.
>
> This also clears the three commits that followed: I spent a long stretch hunting a regression I had
> introduced, testing three hypotheses (bot hold policy, tighter gating, heap tie-breaking) and
> rejecting all three by measurement — because there was no regression. The baseline was wrong.
>
> The lesson is narrow and worth keeping: **two harnesses are two different games.** A number from a
> disposable probe may not be compared against a number from the committed bot, and "confirmed"
> requires the gate that will be re-run later, not the instrument that happened to be open.

## 7. `findPath` was 99.3 % of simulation CPU

Wrapping each subsystem of `stepRun`: `updateWorkers` 99.2 % of the step, and inside it `findPath`
99.3 % of wall time — **20,624 calls at 8.619 ms each**. Not a call-frequency problem (0.82/step); a
single search cost 8.6 ms. The frontier was fully re-sorted on every expansion and then `shift()`ed.

Binary heap. Same seed, **identical call count 20,624** — the search is unchanged, only the cost of
selecting the minimum:

| | before | after |
| --- | --- | --- |
| `findPath` per call | 8.619 ms | **2.471 ms** |
| whole sim step | 7.106 ms | **2.071 ms** |
| 420 s run, wall | 179 s | **52 s** |

The old code carried a comment predicting exactly this: *"Simplicity wins until it does not."*

## 8. `region.traffic` is not a measure — and the fix is parked

Traffic gained a flat `0.05/s` per worker and shed a flat `0.12/s`, clamped at 14. Over a 45-minute
run **every unlocked region reported `traffic 14.0, busy 1.00` at every single sample**: three
workers out-earn the decay, so it pins at the cap immediately. It is a boolean spelled as a float,
and every term downstream reads a constant.

Balancing gain against proportional decay makes equilibrium traffic equal the worker count. That is
strictly more correct — and it changes balance, because the game was tuned around the constant. It
is **reverted**, with the reason recorded rather than the change quietly kept.

## 9. Household escalation is real, unreachable, and blocked on a design decision

Evidence decay is divided by colony population (`3 + population * 0.35`). Dividing by population
means **a bigger colony makes every room calmer** — the inverse of the game's premise. Measured
consequence: 53 workers and 452 deliveries never pushed any region above **alert 1**, so `move`,
`trap`, `vacuum` and `spray` — four of seven authored responses — are content no player has seen.

Switching to an absolute reference does exactly what the analysis predicts: kitchen reaches evidence
0.65 and **alert 3**. It also breaks the game — no gate past the third opens and the objective
reports `blocker.food` continuously from t=120 to the end of a 45-minute run.

The cause is structural, which is why this is parked rather than nudged. Breeding in `updateColony`
is **automatic and unconditional**: every surplus is spent on a worker as soon as it exists, so the
colony can never bank a gate cost unless income exceeds upkeep plus brood. A harsher household
pushes income under that line permanently. **Escalation and progression compete for one surplus and
the player has no lever over either.** Landing it requires giving the player a way to choose growth
over expansion — a brood hold, or a separate reserve for gate work. That is a design decision to be
measured, not guessed.

## 10. Correction: the black wedge was my own instrument

`bedroom-wide.png` was 28.0 % pure `srgb(0,0,0)` and `bathroom-wide.png` 47.7 %. I treated it as a
lighting defect. It was not: `rooms.mjs` shot at 4200–5200 mm while the camera is clamped to
`CAM_NEAR_MM` 900 – `CAM_FAR_MM` 3200. Those frames sit **outside the room's walls**, photographing
unlit exteriors against the void from a vantage point no player can reach.

Recorded because it is the failure mode this whole process exists to prevent — a defect invented by
the measuring instrument, which I nearly spent an hour "fixing".

**A constraint this exposes:** at 35 mm scale inside a 3.2 m room, *no* legal camera position sees a
whole room. There is no establishing shot in this game. The "identify each room without HUD labels"
gate therefore has to be judged from characteristic detail at floor level, or it certifies something
the build cannot deliver. Captures are now taken at 1900 mm (default) and 3200 mm (max zoom-out).

## 11. Still open

- **Run length** is the headline gate and is **not met**: 6.4 min against a 25–35 min target. §9 is
  the blocking decision.
- `run.test.ts` (`pnpm test:slow`) asserts `minutes > 10` and therefore **already failed on the
  inherited build** — a 6.4-minute victory cannot satisfy it. It is not a regression from this
  session's changes, and it is not passing either.
- `bathroom-wide` remains **47.7 % black at the legal 3200 mm**, unlike the other four rooms. That
  one is a real defect and is unexplained.
- Showcase captures are over-exposed (hallway mean luminance 0.98 ≈ white); the `showcase` flag
  forcing every routine light on is the likely cause.
- Assignment churn: ~49 `findPath` calls per second for 39 workers is still more re-planning than
  the design needs, even though each call is now cheap.
- No 25–35 minute human-played victory exists. No independent critic pass has been re-run.

## 12. The brood hold exists, and it moved the blocker one link down the chain

§9 said the missing piece was a way for the player to choose growth over expansion. That now exists:
`colony.broodHold`, toggled with **H**, surfaced in the HUD and the help sheet, with Korean strings
in the catalog. The bot uses the same public toggle — it holds brood whenever the objective reports
`blocker.food` or `blocker.moisture`, which is what a human reading that panel would do.

It works, in the sense that it does exactly what §9 predicted. With the absolute evidence reference
**and** the hold available, the brood build stops stalling at three gates and **opens all five**.

It still does not win. Seed 20260805, full 50-minute cap:

| | value |
| --- | --- |
| status | `playing` — cap reached, never resolved |
| gates opened | 5 of 5 |
| peak population | 74 |
| deliveries | 1,457 |
| **extermination sweeps** | **19** |
| workers lost | 116 |
| longest plateau | 12.6 s (inside the 45 s gate) |

**The next defect is in `updateFinal`, not in the evidence model.** A sweep has a 110 s cooldown,
severity escalating `SWEEP_ESCALATION` 0.18 per sweep, and *no terminal condition*. Nineteen sweeps
in one run is the same metronome failure recorded earlier at 125 sweeps, just slower — past roughly
ten minutes the endgame destroys footholds faster than the colony can retake them, so the
four-region victory check in `evaluateRun` can never be simultaneously true.

**The finale has to resolve — win or lose — before harder escalation is worth landing.** Ordering
matters here: a longer run that cannot close is worse than a short one that can, so the
population-scaled denominator stays and the four unreachable response tiers stay unreachable until
the endgame terminates.

Sequence for whoever picks this up:

1. Give `updateFinal` a terminal condition — a bounded campaign (N waves, then the household gives
   up or the colony is destroyed), not an unbounded timer.
2. Re-land the absolute evidence reference from §9. The brood hold already removes its stall.
3. Only then tune length toward 25–35 minutes.

The lever is committed and inert under current tuning: with the population-scaled household,
`blocker.food` is rare, so the hold rarely engages and the shipped balance is unchanged.

## 13. Corrected status of the loop, measured through `tests/bot.ts` only

Every row below is the committed harness at 50-minute cap, seed as noted. No throwaway probes.

| build | seed | status | min | gates | peak | deliveries | lost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| shadow | 4242 | **won** | 6.4 | 3 | 29 | 223 | 0 |
| scavenging | 31337 | **won** | 7.7 | 5 | 38 | 283 | 7 |
| brood | 20260805 | **never completes** | 50 (cap) | 3 | 41 | 967–1377 | 241–346 |

So the honest headline is not "the run is 6.4 minutes and needs lengthening". It is:

- **Two of three builds complete**, both far short of the 25–35 minute target.
- **The brood build has never completed through the shipped harness**, at any commit this session,
  including before any of this session's changes. The allocation defect in §3 was real and is fixed;
  it was not the only thing stopping that build.
- The brood build's signature is high throughput and heavy losses — 967–1377 deliveries against
  241–346 workers lost, with `sweeps: 0`. Nothing is exterminating it. It is losing bodies to
  ordinary low-alert responses and starvation faster than it converts food into territory, and it
  stalls at three of five gates.

**Next diagnostic, and this time instrument before touching anything:** log per-cause worker deaths
(threat kind, starvation, stuck-recovery) per minute for the brood build, alongside the objective
blocker at each stall. The question to answer first is *why gate four never opens* — not why the run
is short. Nothing about length is worth tuning while a whole specialization cannot finish.

---

## 14. Six-persona scoring, and what it cost me to find out the instrument was broken

Six independent personas scored the build against `CLAUDE.md` and then a skeptic tried to refute
each one's three highest-value findings. Fourteen survived.

| persona | score | one-line verdict |
| --- | --- | --- |
| 3D 아트 디렉터 | 41 | every delivered frame contains at least two items from §7's banned list |
| 신규 플레이어 | 41 | ten control lines that self-destruct on the first keypress and never return |
| 게임 디자이너 | 33 | run length arithmetically fixed at ~4 minutes by two constants |
| 한국 UX 비평가 | 43 | 주방만 남긴 게임이 아직도 "이 집 전체"라고 말한다 |
| 기술 검증자 | 44 | the evidence harness drives a mouse mechanic deleted 22 commits ago |
| 공간 · 레벨 디자이너 | 34 | 2 of 6 climbs sit inside their own blockers |

**Average 39.3.** My own earlier estimate was 51.8. The gap is not that the build got worse between
the two — it is that these personas were made to cite `file:line` or an image filename for every
deduction, and a skeptic then opened each citation. Sixteen of the earlier round's findings would
not have survived that.

### The finding that mattered most was about my own measurements

`capture.mjs` and `perf.mjs` drew pheromone routes with `page.mouse.down/move/up`. Pointer route
drawing was deleted from `src/game/input.ts` twenty-two commits earlier — that file says outright
that there is no pointer path. Both harnesses were miming, and both reported success. The proof was
sitting in their own committed output the whole time:

```
afterRoute   routes 0, deliveries 0
t=40         routes 0, deliveries 0, population 2
```

`02-kitchen-start.png` and `05-colony-working.png` had identical HUDs. Every visual and performance
claim on this branch rested on forty seconds of an empty room.

The same class of error was in `tests/bot.ts`, and I had already been burned by it once this
session: `samePlace` treats anything within 120 mm as the same destination, mission waypoints are
one 60 mm cell apart, so the steering path was never recomputed and the scout stood at the end of a
stale polyline at speed 0 while the colony starved. I read that as a game balance defect — "the
brood build dies at 3.8 minutes" — and chased it as one. One line later, the same seed and the same
build wins. §13 above is therefore **retracted**: the brood build's failure to complete was the
harness, not the specialization.

**Rule going forward, and it is the same one §13 already stated and I did not apply to myself:**
numbers produced by an instrument nobody has controlled are not evidence about the thing measured.
Before diagnosing the game, diagnose the thing doing the looking.

### Round 1 results (all verified by control comparison or real browser)

| defect | how it was found | evidence it is fixed |
| --- | --- | --- |
| 2 of 6 climbs unenterable | persona cited `kitchen.ts:267` / `:217` against `nav.ts:489` | new guard is RED on the old file, GREEN on the new; `bin.inside.food` reachable |
| 2 chair climb mouths 134 mm apart | **my new guard**, not the personas | guard GREEN at 267 mm |
| trap ground the colony 14 → 2 in 40 s | traced the run at 20 s intervals | routes through a kill zone are refused; population holds |
| one sweep made the run unwinnable | worklist predicted it before it fired | refuges rebuild; damage clears on retake |
| alert 3 stopped every worker silently | deliveries froze at 158 for 160 s | rule removed; run 3.47 → 6.07 → win |
| household could trap the nest doorstep | routes 8 → 2, moisture 85 with food 0 | aim walks outward past a 350 mm sanctuary |
| Korean described a sealed five-room flat | persona quoted `ko.ts:328/335/177` | `grep` clean outside sealed blocks |
| F named nowhere on screen | persona traced `boot.ts:99-111` | browser: "F 여기서 페로몬 길 시작" |
| help card unrecoverable | persona traced `input.ts:146` | browser: Esc restores all 10 lines |
| floor stains were grey rectangles | persona cited `shapes.ts:151` + the frames | organic outline; puddle contained |

**First honest performance measurement on this branch** — real Chrome, Apple M1, GPU timer query,
three routes walked, population 2 → 9, one live threat:

```
presented ms  p50 16.70   p95 17.70   p99 18.50   worst 18.80
GPU ms        p50 6.69    p99 9.31    (2728 samples)
tails         >33ms 0     >50ms 0     >100ms 0
```

That passes §10. The previously recorded `GPU p50 3.97` was an empty room and is not comparable.

### Still open, in the personas' own priority order

1. **Run length.** 25–35 minutes is the target; the loop closes in single-digit minutes. The brief
   forbids buying it with prices, and thirteen recorded attempts confirm that. It has to come from
   density: more claimable positions, refuge tiers that grant verbs, six kitchen routines instead of
   two, staged sweeps that deny specific sites.
2. **Art.** Near-black untextured cabinet slabs; floor with no incident at play scale; only three
   authored lights in the kitchen, one of them gated behind the dishes routine — so the middle of
   the room, where the dining table now is, has no authored light at all while `exposureZones`
   claims 0.72 exposure there. The simulation says lit and the renderer draws black.
3. **Adaptations are scalar multipliers.** Three families, zero new verbs, zero surfaces unlocked.
4. `scoutHidden: true` at t=38 in the capture — §10 requires the scout is never persistently hidden.

---

## 15. 야광 접사 — 아트 방향 전환, 그리고 두 개의 검증된 부정 결과

프로젝트 소유자가 "사실적이지 않아도 된다, 애니메이션 느낌도 좋다"고 방향을 열어 주었다.
아트 감독 5명이 서로 다른 양식화 방향을 제안하고 심사관 3명(§1 판타지 / 이 코드베이스에서
만들 수 있는가 / 측정된 결함을 고치는가)이 채점했다. 야광(Night-Glow Cutout) 78점 채택.

선택 근거는 점수가 아니라 기계장치였다: 다섯 중 유일하게 **어두움을 평평한 색으로 칠하지
않고** 만든다고 주장했다 — 환경 그라디언트가 법선에 따라, 프레넬 림이 시야각에 따라 어두움을
바꾼다. 심사관 셋이 서로 다른 제안에 대해 같은 §7 항목("large unbroken blue-black
rectangles")을 치명으로 지목했다.

### 검증된 부정 결과 1 — 환경맵은 기여하지 않는다

방향의 근거였으므로 가정하지 않고 시험했다. 그라디언트를 야간 값에서 순백까지, 빌드를 매
단계 검증하며:

| sky | frame mean | pure black |
| --- | --- | --- |
| #4d6b82 | 40.99 % | 3.21 % |
| #8fb4d8 | 40.50 % | 3.34 % |
| #cfe0f0 | 40.23 % | 3.46 % |
| #ffffff | 40.60 % | 3.34 % |

단조롭지 않고 캡처 노이즈 안이다. `scene.environment`를 null로 두면 오히려 낫고,
`envMapIntensity` 1→6도 무반응이다. 텍스처는 바인딩돼 있다(25 → 27). **왜인지 모른다.**

### 검증된 부정 결과 2 — 앰비언트도 기여하지 않는다

제거 실험. 각 케이스마다 치환 확인 · typecheck · build · 캡처 PASS를 모두 검증:

| 케이스 | frame mean | pure black |
| --- | --- | --- |
| 기준 | 40.22 % | 3.46 % |
| 앰비언트 0.04 → **0.6** (15배) | 40.16 % | **3.46 %** |
| 오클루전 페이드 제거 | 40.34 % | 5.28 % |

**앰비언트를 15배로 올려도 순수 검정이 소수점 둘째 자리까지 동일하다.** 두 결과를 합치면
결론은 하나다: 남은 검정 픽셀들은 **조명이 부족한 표면이 아니라, 어떤 조명 항도 닿지 않는
픽셀**이다. 조명을 더 넣는 방향은 폐기한다. 다음 조사는 "그 픽셀이 어느 메시·어느 머티리얼에
속하는가"이고, 그건 별도 작업이다.

오클루전 페이드를 없애면 검정이 **늘어난다**는 것도 기록해 둔다 — 반투명 오클루더가 현재
검정을 줄이고 있다. 페이드를 "아티팩트"로 취급하던 이전 판단과 반대다.

### 실제로 효과가 있었던 것

순수 검정 4.97 % → 3.21 %는 전부 두 가지가 냈고, 둘 다 통제 시험으로 확인했다:

- **어두운 알베도를 명도가 아니라 색상으로 재저작**. `laminateDark` 0x4a4038 → 0x453e4c,
  `plasticBlack` 0x25272b → 0x2b3040. 전자는 `laminate`를 세 단계 어둡게 한 값이라
  "같은 재질, 고르지 않게 조명됨"으로 읽혔다.
- **프레넬 림**. 통제 시험: 순수 빨강 · 세기 4.0에서 적색 채널 평균 62.2 % vs 녹색 53.7 %.
  닿는다. 이걸 먼저 하지 않았으면 "세기가 낮아서"와 "주입이 실패해서"를 구분할 수 없었다.

### 배관에서 배운 것 — 서브클래스여야 하는 이유

`occlusion.ts`가 오클루더 머티리얼을 clone하고, three의 `Material.copy()`는
`onBeforeCompile`을 복사하지 않는다. 인스턴스에 훅을 달면 오클루전이 만지는 바로 그
오브젝트에서만 조용히 사라지고, 그 상태의 프로브는 **칠해진 바닥과 안 칠해진 캐비닛을 재고
둘 중 어느 쪽에도 참이 아닌 숫자를 보고한다.** `clone()`이
`new this.constructor().copy(this)`이므로 서브클래스는 킷 전체의 clone 호출부 133곳을 한 줄도
고치지 않고 살아남는다.

---

## 16. 같은 실수를 네 번 했다 — 고장난 계기

이번 세션에서 네 번, 고장난 계기가 낸 숫자를 측정으로 착각할 뻔했다.

1. **`tests/bot.ts`의 `samePlace` 고정.** "brood 빌드가 3.8분에 전멸"을 밸런스 결함으로 쫓았다.
   한 줄 고친 뒤 같은 시드·같은 빌드가 이긴다. §13은 이 시점에 **철회**된다.
2. **`performance.json`이 3커밋 전 빌드를 설명.** 그 파일의 `lights: 2`와 런타임 리포트의
   `lights: 3`이 어긋나는 걸 리뷰어가 눈치채고서야 드러났다.
3. **`sed` 정규식이 `mm(1900 5200)`을 생성.** 빌드가 실패했고 `2>/dev/null`이 그걸 삼켜,
   포그 스윕 3회가 전부 직전 빌드를 쟀다.
4. **zsh가 `$g`를 분할하지 않음.** 그라디언트 스윕 3회가 같은 깨진 파일을 쟀다.

3번과 4번의 유일한 단서는 **행마다 숫자가 거의 동일한 것**이었다.

**그래서 스윕과 제거 실험을 셸에서 파이썬으로 옮겼다.** 치환이 실제로 일어났는지, typecheck과
build의 종료 코드, 캡처가 PASS를 냈는지를 각각 확인하고, 하나라도 실패하면 **측정하지 않고
중단한다.** §13의 "instrument or build a control"은 계측 대상뿐 아니라 **계측기 자신에게도**
적용된다 — 그것이 이 세션이 가장 비싸게 배운 것이다.

### 검증된 부정 결과 3 — 그 검정은 조명되는 지오메트리가 아니다

라이브러리 재질 **전부**를 순백으로 강제했다. 치환이 먹혔다는 증거는 프레임 평균이 크게
뛴 것이다. 그런데 순수 검정은 움직이지 않는다.

| 케이스 | frame mean | pure black |
| --- | --- | --- |
| 기준 | 40.61 % | 3.34 % |
| 라이브러리 재질 전부 흰색 | **58.31 %** | **3.46 %** |
| 바퀴 재질 전부 흰색 | 40.49 % | 3.34 % |

세 개의 부정 결과를 합치면: 남은 순수 검정은 **조명이 부족한 표면이 아니고, 라이브러리
재질도 아니고, 바퀴도 아니다.** 앰비언트 15배·환경맵 순백·전 재질 백색 어느 것도 그 픽셀을
건드리지 못한다. HUD도 아니다(HUD 띠를 크롭해서 빼면 비율이 오히려 **올라간다**).

다음 조사는 "픽셀 좌표 → 어느 오브젝트"를 직접 묻는 것이고, 그러려면 임의 화면 좌표로
레이를 쏘는 디버그 훅이 필요하다. 이번 라운드에서는 하지 않는다 — 한 페르소나가 지적한 지표
하나에 세 라운드를 썼고, 전체 점수 49.5의 더 큰 격차는 콘텐츠에 있다.

**기록해 둘 것:** 이 세 번의 제거 실험이 전부 "고치려던 것을 고치지 못했다"로 끝났지만,
그 덕분에 **잘못된 수정 세 개를 출하하지 않았다** — 더 밝은 환경맵, 더 센 앰비언트, 반대편
저작 광원. 셋 다 아무 효과 없는 코드였을 것이고, 셋 다 "고쳤다"고 커밋될 뻔했다.

---

## 18. peak geometries 162/160 — 천장을 올리지 않고 남겨둔 실패

`scripts/perf.mjs`가 커밋 `dd1b2c6` 위에서 한 줄 실패한다. 통과시키지 않고 기록한다.

**측정한 것**

| 사실 | 근거 |
| --- | --- |
| 누수 아님 | `capture.mjs` 20회 재시작, geometries 121 → 121 정확히 복귀 |
| 동일 조건 변동 | 같은 세션 연속 2회가 **162**, 그다음 **152** |
| 천장 위치 | `SCENE_CEILINGS.geometries = 160` — 위 변동 폭 **한가운데** |
| 이전 표본 | 커밋 `93f8604`에서 152. **표본 하나**다 |

**모르는 것 (추측하지 않는다)**

표본 하나짜리 이전 값으로는 분포를 알 수 없으므로, 링크 수정(`linkBetween`)이 최고점을
올렸는지 아니면 원래 있던 변동을 이번에 처음 본 것인지 **나는 모른다**. 둘 중 하나라고
쓰는 건 재지 않은 것을 쓰는 것이다.

**하지 않은 것과 그 이유**

천장을 162 위로 올리면 이 줄은 초록이 된다. 그건 게이트가 잡으라고 있는 바로 그 행동이다.
천장은 *무한 증가*를 잡으려 존재하고 누수는 이미 배제됐으니, 옳은 값은 "관측된 최고점 +
여유"가 아니라 **구성상 도달 가능한 최댓값**이다.

**해결됨 (커밋 `cc81afd`, `f9…` 도출)**

탐침을 네 번 만들어 세 번 실패했다(`__game.renderer.three` 없음, `__game.step` 없음,
그리고 28초 걷기로는 아무 일도 안 일어남). 네 번째에 perf 자신의 부하 위에
`renderer.info.memory.geometries` 증가를 게임 상태와 함께 찍어서 전부 설명했다:

```
118 (+119) t=0  routes=0 th=
151 (+9)   t=10 routes=3 th=swat:active     ← 손 몸체 9개
153 (+1)   t=67 routes=3 th=wipe|swat
162 (+9)   t=79 routes=3 th=swat:leaving    ← 손이 둘 동시에 뜬 런에서만
```

±9는 **그 런에 swat이 둘 동시에 활성이었는가** 하나뿐이었다. 결함이 아니라 정상 동작이다.
빌드 카운터를 달아 확인: `BUILDS ["swat","wipe"]` — 종류별 풀링은 정확히 동작한다.

두 가지를 했다. (1) 위협 몸체를 (슬롯,종류)당 영구 보유에서 종류별 프리리스트로 —
6×7=42개까지 쥐던 것을 동시 활성 수만큼만 만든다. (2) 천장을 관측 최고점이 아니라
풀 크기에서 도출: 부팅 118 + POOL 6 × 최대 몸체 9 + 리본 24 = **196**.

느슨하다는 것과 그 이유도 함께 적었다 — swat 여섯이 동시에 뜨는 건 지금 감독이 만들 수
없지만 코드가 금지하지도 않는다. 조이려면 손 몸체를 싸게 만들거나 동시 swat을 제한해야
하고, 그건 예산이 아니라 설계 결정이다.

---

## 19. 런 길이: 튜닝으로는 닿지 않는다는 것을 계측으로 확정

목표는 한 방에서 25~35분. 측정값은 3.1~4.9분. 이건 유일한 필수 FAIL이고
`tests/unit/run.test.ts`에 `it.fails`로 살아 있다. 이번에 **왜** 안 움직이는지를 쟀다.

### 4분이 무엇으로 채워져 있는가 (4런 계측)

brood/20260805, 252초:

| 조건 | 충족 |
| --- | --- |
| 적응 | 20초 |
| 수분 20 | 44초 |
| 먹이 30 | 142초 |
| 거점 6/8 | 150초 |
| **개체 12 — 마지막 게임플레이 조건** | **169초** |
| 소탕 발화 | 246초 |
| 승리 | 252초 |

**169초 이후 77초는 소탕 쿨다운을 기다리는 시간이다 — 런의 31%.**
scavenging은 121초 → 196초로 37%. 즉 "4분 런"은 **콘텐츠 2.8분 + 대기 1.2분**이다.

### 지금까지 시도된 지렛대와 결과

| 시도 | 출처 | 결과 |
| --- | --- | --- |
| 게이트 비용 ×1.6 / ×2 / ×2.5 (4회) | `house.ts:75-108` | 못 이기거나 굶어 죽음 |
| 공급량 ×1.7 | 같은 곳 | 런이 **네 배 짧아짐** — 공급은 인구를 통해 복리로 불어난다 |
| 앞의 두 게이트만 인상 (7번째 시도) | 같은 곳 | 두 빌드 모두 55분에 게이트 0개. 되돌림 |
| 거점 4 → 8 | 이 세션 | 2.57~3.43분 → 3.29~5.10분. **유일하게 움직인 것** |
| 부엌 루틴 2 → 6 | 이 세션 | 변화 없음 |
| 은폐·노출 배선 | 이 세션 | 변화 없음 (오히려 압력이 낮아짐) |

### 결정

**25~35분은 튜닝으로 닿지 않는다. 막(幕)을 쌓아야 한다.**

거점을 두 배로 늘려 얻은 것이 약 1분이다. 그 비율대로면 목표까지 거점 수십 개가
필요하고, 그건 밀도가 아니라 반복이다. 브리프가 금지한 두 수단(더 긴 걸음, 더 비싼
가격)은 일곱 번 측정돼 전부 실패했다.

남은 정직한 경로는 **부엌 자체에 막을 주는 것**이다. 지금 승리 조건은 동시 충족
체크리스트 하나이고 군체는 그걸 169초에 통과한다. `advanceChapter`
(`progression.ts:205`)는 게이트 개방에만 반응하는데 `GATES`가 빈 배열이라 실행될 수
없다 — 챕터 기제는 있는데 주방 전용 빌드에서는 죽어 있다. 막을 게이트가 아니라
군체의 이정표에 걸면, 각 막이 "부엌을 쥐었다"의 의미를 다시 정의하고 런은 막의 합이
된다. 이건 튜닝이 아니라 저작이며, 그렇게 기록한다.

`it.fails`는 유지한다. 요구사항이지 소원이 아니고, 방이 깊어지는 순간 빨간불이 된다.

## 20. 먼 자원의 채집 속도는 무관하다 (음성 결과, 18런)

§19의 이동 이후 정점 개체가 13으로 떨어져 `run.test.ts`의 바닥 20을 깼다.
가설: 먼 선이 걸음값을 하도록 그 자원의 처리율을 올리면 회복된다.

`kitchen.crumbs.toekick`의 `rate`를 1.5 / 2.6 / 3.6으로 3시드 × 2빌드 스윕:

| rate | 정점 개체 | 런 길이 |
| --- | --- | --- |
| 1.5 | 12~14 | 10.51~19.53분 |
| 2.6 | 12~14 | 10.26~19.53분 |
| 3.6 | 12~14 | 10.31~19.53분 |

**완전히 무변화다.** 일꾼은 적재가 아니라 이동에 시간을 쓴다. 병목은 왕복
시간당 운반량이고, 채집 속도는 그 식에 거의 들어가지 않는다.

제거된 것: 자원별 `rate` 조정으로 인구를 회복하는 경로 전부.
남은 후보는 운반량(`CARGO_VALUE`)이나 일꾼 속도 같은 전역 경제 레버인데,
`house.ts:75-108`이 전역 공급 인상은 런을 네 배 짧게 만든다고 이미 기록한다.
그러므로 다음 시도는 전역 레버가 아니라 **경로당 운반 인원**이어야 한다 —
`planRoute`가 둥지당 3개로 제한되고 첫 후보 둥지에서 즉시 반환하므로,
경로 수가 적은 것이 인구 상한의 직접 원인인지부터 계측해야 한다.

빨간 게이트(`peakPopulation >= 20`, 실측 13)는 약화시키지 않고 그대로 둔다.

## 21. 경로당 운반 인원도 무관하다 — 그리고 두 음성 결과가 범인을 산술로 지목한다

§20에 이어 두 번째 스윕. `workers.ts`의 `crowding = 1 + assigned * 0.85`를
0.85 / 0.45 / 0.22로 3시드 × 2빌드:

| crowding | 정점 개체 | 비고 |
| --- | --- | --- |
| 0.85 | 12~14 | 현행 |
| 0.45 | 12~14 | 무변화 |
| 0.22 | 12~16 | 777/brood **패배**, 4242/shadow 정체 25초 |

인구는 움직이지 않고 0.22는 런을 깨뜨린다. 제거: 경로당 인원 조정.

### 두 음성 결과가 남긴 것

채집 속도도 아니고 운반 인원도 아니라면, 병목은 **수입이 아니라 지출 조건**이다.
그리고 그 조건은 내가 두 차수 전에 바꿨다 — `BROOD_RESERVE_SECONDS` 90 → 210.

번식 조건은 `food >= 6.5 + pop * 0.0075 * RESERVE`다. 개체 13에서:

| RESERVE | 필요 먹이 | 실측 먹이 범위 |
| --- | --- | --- |
| 90 | 15.3 | 9~32 — 자주 감당 가능 |
| **210** | **27.0** | 9~32 — **대부분 막힘** |

거점이 바닥 근처에 몰려 수입이 공짜였을 때 210은 소탕 한 번을 버티는 완충이었다.
경로가 방을 가로지르는 지금은 살 수 없는 사치이고, 군체는 13에서 멈춘다.

**다음 패스의 첫 작업**: `BROOD_RESERVE_SECONDS`를 90/150/210으로 다시 쓸되,
이번에는 정점 개체(바닥 20)와 런 길이와 결승선 하락을 **함께** 본다. 세 지표가
같은 상수에 걸려 있으므로 하나만 보고 고르면 다른 둘이 깨진다 — 이번 세션에
이미 두 번 그렇게 됐다.

## 22. 범인 확정 — BROOD_RESERVE_SECONDS 210 → 150, 게이트 초록 복귀

§20·§21의 두 음성 결과가 좁힌 산술 가설을 실행했다. 3시드 × 2빌드, 세 지표 동시 판정:

| reserve | 승리 | 정점 개체(테스트 시드) | 결승선 하락 | 런 길이 |
| --- | --- | --- | --- | --- |
| 90 | **5/6 — 패배 1** | 28 | 6/6 | 10.06~**34.23**분 |
| 150 | **6/6** | **25** | 6/6 | 8.69~23.70분 |
| 210 | 6/6 | 13 | 6/6 | 9.51~19.53분 |

**90은 25~35분 설계 구간에 이 프로젝트 사상 처음으로 닿는다**(4242/brood 34.23분).
그런데도 기각한다 — 20260805/brood가 진다. 나쁜 1분을 흡수하지 못하는 완충은
이 상수가 존재하는 이유 자체를 배반한다. 210은 어디서나 이기지만 군체를 13으로 굶긴다.
150만 6/6 승리이면서 인구 바닥 20을 넘는다.

`test:slow` 19/19 복귀. 단언은 손대지 않았다.

### 기록해 둘 것

이 값은 내가 두 차수 전에 90 → 210으로 올린 것이다. 그때는 거점이 자원 위에 앉아
수입이 사실상 공짜였고 210은 소탕을 버티는 완충이었다. 부스러기를 800mm 옮겨 수입이
처음으로 느려지자 같은 상수가 번식을 봉쇄하는 세금이 됐다. **상수는 그 자리에서 옳았고
세계가 바뀌자 틀렸다** — 그리고 그걸 잡은 건 내가 아니라 게이트였다.

그리고 34.23분이라는 숫자가 남는다. 목표 구간이 도달 불가능하지 않다는 첫 증거이며,
§19가 "튜닝으로 닿지 않는다"고 적은 결론을 부분적으로 뒤집는다. 도달 가능하되 지금은
승률을 대가로 요구한다는 것이 정확한 현재 상태다.

## 23. "자원 넷이 손도 안 닿는다"는 배분 결함이 아니었다 — 지표가 오염돼 있었다

원장이 이 관측을 근거로 "해결 전까지 런 길이를 게임의 속성으로 인용하지 말라"고
적어뒀다. 해결했다. 결론은 결함이 아니라 **내 지표가 틀렸다**는 것이다.

### 선택 루프를 직접 계측 (bot.ts:411-431, 20260805/brood 전체 런)

| 자원 | 경로 배정 | 기각 사유 집계 |
| --- | --- | --- |
| crumbs.toekick | N | considered 17, alreadyRouted 35 |
| drip.trap | **Y** | considered 28 |
| fridge.seal | N | considered 28 |
| rice | N | considered 22 |
| sponge | **Y** | considered 50 |
| bin | **Y** | considered 14 |
| table.crumbs | **Y** | considered 26 |
| table.ring | **Y** | considered 27 |
| bin.inside.food | **Y** | considered 4 |

`notFound` 0건, `empty` 0건, `noPath` 0건. **모든 자원이 매번 후보로 검토된다.**
아홉 중 여섯이 실제로 경로를 받는다. 지는 것들은 점수에서 진다 —
`score = remaining * bias / (1 + length/1000mm)`, 의도된 동작이다.
`fridge.seal`은 28번 검토되고 매번 진다: 수분 자원인데 수분이 166 쌓여 있으니
부족 가중이 작다. **필요 없는 물로 길을 내지 않는 것이 옳다.**

### 원래 관측은 왜 틀렸나

두 겹으로 틀렸다.

1. **런 중간 스냅샷**이었고, 그 시점의 `BROOD_RESERVE_SECONDS = 210`은 §22에서
   확인했듯 군체를 13에서 굶기고 있었다. 경로가 적었던 건 그 탓이다.
2. 더 나쁘게, `remaining`의 시작−끝 차이를 "소비량"으로 읽었다. **루틴이 자원을
   리필한다**(`household.ts onRoutineStart`). 채집되고 다시 채워진 자원은 0으로
   보인다. 이 세션 열한 번째 깨진 계측기다.

건전한 지표는 선택 집계와 `deliveries`(197~273)이고, 둘 다 같은 말을 한다.

**원장의 인용 금지 조항을 해제한다.** 런 길이 8.69~23.70분은 게임의 속성이다.

## 24. reserve 90은 목표 구간에 닿고, 거기서 지는 이유는 소탕이 아니다

§22에서 reserve 90을 기각했다. 20260805/brood가 지기 때문이었고, 왜 지는지는
재지 않았다. 쟀다.

```
t=720   pop=23/53 food=19 wet=35  held=7 sweeps=0 lost=16
t=900   pop=6/24  food=5  wet=13  held=3 sweeps=2 lost=33   ← 소탕 2회, 붕괴
t=1260  pop=15/56 food=25 wet=30  held=7 sweeps=2 lost=40   ← 회복한다
t=1440  pop=10/39 food=0  wet=147 held=5 sweeps=3 lost=47
END     lost 25.62min  마지막 로그: log.starved
```

**소탕에 지는 게 아니다.** 두 번 무너지고 두 번 다 회복한다. 25.62분까지 가서 —
목표 구간 25~35분 **안에서** — 먹이 0, 수분 147로 굶어 죽는다.

`workers.ts:108-111`이 기록한 사건의 정확한 반전판이다. 그때는 "물 옆에서 목말라
죽었다"였고 지금은 "물을 147 쌓아놓고 굶어 죽는다". `routeAppeal`의 희소성 비율도
봇의 `bias = min(24, shortage²)`도 둘 다 먹이 쪽으로 강하게 밀어야 하는데 밀지 못한다.

### 이것이 바꾸는 것

§19는 "25~35분은 튜닝으로 닿지 않는다"고 적었다. §22가 부분적으로 뒤집었고
(34.23분 관측), 이번 계측이 더 뒤집는다: **목표 구간은 이미 도달 가능하고, 남은
장애물은 길이가 아니라 긴 런에서 먹이/수분 균형을 유지하지 못하는 경제다.**

즉 다음 작업은 런 길이 튜닝이 아니라 **배분 결함**이다. 후보:
`routeAppeal`의 희소성 항이 왜 먹이 0을 막지 못하는가 — 먹이 원천이 고갈됐는가,
아니면 먹이 경로가 길어 왕복이 수요를 못 따라가는가. §23에서 확인했듯
`remaining`은 루틴 리필 때문에 소비량 지표로 쓸 수 없으므로, 자원별 배달 수로
계측해야 한다.

## 25. §24의 가설은 틀렸다 — 배분은 정상이고, 먹이와 수분의 비율이 어긋나 있다

§24는 "`routeAppeal`의 희소성 항이 먹이 쪽으로 밀지 못한다"고 적었다. 쟀더니 아니다.

reserve 90, 20260805/brood, 누적 배달(살아남은 경로만 세면 안 된다 — 사라진 경로의
실적도 사라진다. 그렇게 재서 전부 0이 나온 게 이 세션 열두 번째 깨진 계측기다):

```
t=240   routes=5  foodRoutes=5   food=11  wet=14
t=480   routes=7  foodRoutes=5   food=11  wet=18
t=960   routes=4  foodRoutes=4   food=3   wet=11
t=1200  routes=8  foodRoutes=6   food=8   wet=23
t=1440  routes=4  foodRoutes=4   food=0   wet=147
누적: food 233 · moisture 166
```

경로는 사라지지 않는다(상시 4~8개). **매 시점 대부분이 먹이 경로이고 누적 배달도
먹이가 더 많다.** 할당기는 제 일을 하고 있다.

### 실제 원인

먹이는 0~19를 오가며 굶고 수분은 147까지 쌓인다. 배달 비율이 먹이 쪽으로 기운 채로
그렇다면, 어긋난 것은 **유지비 대비 수입의 비율**이다 — 먹이 유지비가 먹이 수입을
넘고 수분은 그 반대다. `house.ts:95-98`이 이미 예측했다:

> "먹이와 수분은 지도가 공급하는 것과 각 관문이 요구하는 것 양쪽에 대해 **독립적으로**
> 균형을 잡아야 한다."

### 다음 작업

`UPKEEP_FOOD` 대 `UPKEEP_MOISTURE`, 또는 먹이 자원의 총 공급량 대 수분 자원의 총
공급량. 한 쌍의 비율 문제이므로 스윕 가능하고, reserve 90과 함께 판정해야 한다 —
그 조합이 25~35분 구간을 잡는다면 이 프로젝트에서 처음으로 설계 목표에 닿는다.

주의: 이 스윕은 §22처럼 **승률·정점 개체·결승선 하락·런 길이를 동시에** 봐야 한다.
지금까지 하나만 보고 고른 경우는 예외 없이 다른 것을 깼다.

## 26. 먹이 유지비도 아니다 — 열 번의 측정이 한 곳을 가리킨다

§25가 지목한 실험을 돌렸다. `UPKEEP_FOOD` × `BROOD_RESERVE_SECONDS = 90`,
3시드 × 2빌드, 네 지표 동시:

| UPKEEP_FOOD | 승리 | 런 길이 | 최소 정점 개체 | 하락 |
| --- | --- | --- | --- | --- |
| 0.0075 (현행) | 5/6 | 10.1~**34.2**분 | 22 | 6/6 |
| 0.0060 (−20%) | 4/6 | 6.9~30.1분 | 19 | 6/6 |
| 0.0048 (−36%) | 5/6 | 8.4~15.8분 | 16 | 5/6 |

**먹이를 싸게 하면 런이 짧아진다.** 군체가 더 빨리 자라 더 빨리 이긴다.
어느 값도 6/6에 닿지 못한다. §25의 비율 가설은 기각한다.

### 열 번의 측정이 만든 하나의 결론

| 시도 | 방향 | 결과 |
| --- | --- | --- |
| 게이트 비용 ×1.6 / ×2 / ×2.5 | 어렵게 | 못 이기거나 굶어 죽음 |
| 공급량 ×1.7 | 쉽게 | 런 **4배 짧아짐** |
| 앞 게이트만 인상 | 어렵게 | 55분에 게이트 0개 |
| 거점 4 → 8 | 콘텐츠 | +약 1분 |
| 부엌 루틴 2 → 6 | 콘텐츠 | 변화 없음 |
| 은폐·노출 배선 | 콘텐츠 | 변화 없음 |
| 자원 채집 rate ×2.4 | 쉽게 | 변화 없음 (§20) |
| 경로당 인원 | 쉽게 | 변화 없음, 극단값은 패배 (§21) |
| 시작 자원 800mm 이동 | 어렵게 | **3.1~4.9 → 8.7~23.7분** |
| 먹이 유지비 −20% / −36% | 쉽게 | **짧아짐** (§26) |

방향이 완벽하게 일관된다. **쉽게 만들면 짧아지고, 어렵게 만들면 진다.**
유일하게 길이를 늘린 것은 어렵게 만든 쪽(자원 이동)이고, 그것도 승률을 대가로 냈다.

`house.ts:95-98`이 두 세션 전에 이미 적었고, 이제 열 번의 측정이 뒷받침한다:

> "공급을 늘리면 인구를 통해 복리로 불어나는 속도가 비용이 붙잡는 속도보다 빠르다.
> **군체의 성장 곡선을 평탄하게 만들어야 한다** — 수입이 인구와 함께 복리로 늘지 않도록."

인구 → 운반자 → 수입 → 인구의 복리 고리가 근본 원인이다. 모든 rate 조정은 같은
곡선 위에서 균형점만 옮긴다. 그래서 어떤 상수 하나도 25~35분을 안정적으로 잡지
못한다.

**다음 작업은 상수가 아니라 고리를 끊는 것이다.** 후보 하나: 일꾼당 수입에 체감을
넣어(경로당이 아니라 군체 전체 규모에 대해) 인구가 두 배가 되어도 수입이 두 배가
되지 않게 한다. 이건 튜닝이 아니라 경제 재설계이고, §19의 결론이 여전히 유효한
유일한 지점이다.

## 27. 복리 고리를 끊어도 안 된다 — 경제 탐색 공간을 닫는다

§26이 "상수가 아니라 고리를 끊어야 한다"고 적었다. 끊어봤다.
`deliver()`의 수입에 군체 규모 체감 `/(1 + population/K)`를 넣고 출하 설정
(reserve 150)에서 한 번에 한 변수만:

| K | 승리 | 런 길이 | 최소 정점 | 최장 정체 |
| --- | --- | --- | --- | --- |
| 없음 | **6/6** | 8.7~23.7분 | 14 | 17초 |
| 40 | 3/6 | 10.9~**60.0**분 (하나는 상한에서 미완) | 16 | 21초 |
| 22 | 2/6 | 11.5~23.8분 | 13 | 16초 |

**길어지긴 한다 — 58분, 60분 상한 초과. 그런데 이기지 못해서 길어진다.**
두 세션 전 게이트 비용 ×2.5의 "45분에 승리 없음"과 같은 실패 양식이다.

### 결론: 경제로는 안 된다

열한 번의 측정, 세 가지 방향, 예외 없음:

- **쉽게** (공급량, 채집 rate, 경로당 인원, 먹이 유지비) → 런이 **짧아진다**
- **어렵게** (게이트 비용 ×1.6/×2/×2.5) → **진다**
- **곡선 평탄화** (군체 규모 수입 체감) → **진다**, 끝나지 않아서 길다

길이를 늘린 유일한 변경은 시작 자원 800mm 이동이었고, 그건 경제 조정이 아니라
**공간 배치**였다 — 그리고 승률을 대가로 냈다(reserve를 함께 고쳐야 6/6로 돌아왔다).

**§19의 결론이 이제 열한 번의 측정 위에 선다: 25~35분은 경제에서 나올 수 없다.
콘텐츠에서 나와야 한다 — 할 일이 더 많아야 하고, 막으로 나뉘어야 한다.**

이 문단의 값어치는 무엇을 하라는 게 아니라 **무엇을 그만두라는 것**이다.
상수 스윕은 소진됐다. 다음 사람이 rate 하나를 더 돌려보고 싶어지면, 위 표가
그 시간을 아껴준다.

## 28. 봉인 지역 루틴 아홉은 의도치 않게 하중을 받고 있었다 (되돌림, 근거 포함)

`ROUTINES`는 거실·욕실·침실 루틴 일곱을 그대로 싣고 있고 `updateRoutines`에는 지역
게이트가 없다. 그 방들은 `REGIONS`에서 봉인돼 `run.house.regions`에 없으므로, 그
루틴들의 노출 존은 아무 데도 안 닿고 자원 리필은 아무것도 못 맞추며 큐는 지역을 못
찾아 빠져나온다. 그런데 **감독의 일정은 소비한다.** 4분 런에서 루틴 15개가 발화하고
그중 아홉이 빌드에 없는 방의 것이다.

빌드에 조립된 지역만 돌도록 한 줄을 넣었다(`SEALED_REGIONS`는 재활성화 목록이므로
삭제가 아니라 건너뛰기다).

측정:

| 시드 | 부엌 루틴 | 빌드 밖 루틴 | 결과 |
| --- | --- | --- | --- |
| 20260805 | 6/6 | **0** | 승 10.28분 |
| 777 | 6/6 | **0** | 승 9.04분 (이전 23.70분) |
| 4242 | 6/6 | **0** | **패** 16.21분 (이전 승) |

`test:slow` 18/19 — 정점 개체 17, 기준 20.

**되돌린다.** 수정은 옳다 — 존재하지 않는 방을 시뮬레이션하는 건 방어할 수 없다.
그런데 그 유령 아홉이 감독 일정의 완충재였다. 빠지자 부엌 이벤트가 조밀해지고
군체가 버티지 못한다. 옳은 변경이 재균형을 요구하는데, 이 세션은 재균형 지렛대를
§24~§27에서 이미 소진했다.

빨간 게이트를 출하하거나 여유 없이 튜닝하는 대신, 변경과 그 대가를 정확히 남긴다.
다음 사람에게 필요한 건 "이걸 고쳐라"가 아니라 **"이걸 고치면 정확히 이만큼 어려워
진다"**이다. 한 줄은 이것이다:

```ts
if (!run.house.regions.some((r) => r.id === spec.region)) continue;
```

`updateRoutines`의 `state.timer -= dt` 바로 앞. 함께 필요한 것은 부엌 루틴 여섯의
`period`/`notBefore` 재조정이다 — 아홉이 빠진 자리를 여섯이 그대로 메우면 안 된다.

## 29. SPECS 알베도 전수 감사 — 순서 위배는 하나였고 이미 고쳤다

아트 페르소나(52)의 처방 "출하 SPECS hex 리터럴을 ART_BIBLE의 명도 사다리에
되돌려라"는 네 처방 중 유일하게 적대적 검증을 받지 않았다. 43개 전부를 감사했다.

### 방법

바이블의 사다리는 **여섯 개 역할**에 대한 진술이다 — void 1.9 · 방 그림자 4.5 ·
그림자 속 바닥 9.8 · 캐비닛 면 13.8 · 주변광 바닥 22.4 · 밝혀진 바닥 47.4 (L*).
그리고 "이 순서는 결코 위배되지 않는다"는 **순서** 주장이다. ACES는 단조 함수이므로
순서는 알베도에서 검사할 수 있다(§969a504의 논증). 절대값은 검사할 수 없다.

### 결과

| 역할 대응 SPECS | L* | 판정 |
| --- | --- | --- |
| `floorVinyl` (바닥) | 38.5 | 기준 |
| `cabinetDoor` (캐비닛 면) | **19.4** | 고침 — 이전 42.3으로 바닥보다 밝았다 |
| `worktop` (조리대) | 62.4 | 바닥보다 밝음 — 창 밑 상판으로 타당, 사다리에 단 없음 |
| `laminate` / `plasterWall` / `tileWall` | 71.0 / 64.1 / 85.3 | 사다리에 단 없음 |

나머지 39개는 소품이다(쌀·종이·유리·천·플라스틱·금속). 바이블의 사다리는 이들에
단을 매기지 않으며, 매기지 않은 것에 순서 위배를 물을 수 없다.

**역할이 대응되는 표면들 사이의 순서 위배는 하나였고 `969a504`에서 고쳤다.**
"34개가 더 남았다"는 것은 사실이 아니다 — 감사해 보니 34개는 사다리 밖이다.

### 고치지 않은 것과 그 이유

최대 이격은 `plasterWall` L*64.1 대 바이블의 방 그림자 L*4.5다. 이건 순서가 아니라
**절대값** 비교이고, 알베도와 화면값의 범주 차이에 정면으로 걸린다 — 단조성 논증이
닿지 않는 자리다. 렌더된 프레임은 평균 휘도 0.316~0.361, 근검정 0.00~0.63%로
측정됐고 밤 부엌으로서 명백히 틀렸다고 말할 근거가 없다. 근거 없이 벽을 어둡게 하면
§7이 금지한 균일한 어둠으로 가는 길이고, 이 저장소에 그 사건이 두 번 기록돼 있다.

절대값을 판정하려면 필요한 것은 hex 편집이 아니라 **기준 프레임**이다 — 바이블이
말하는 밤 부엌이 화면에서 어떤 히스토그램을 갖는지에 대한 합의된 참조.
그게 없으면 어느 방향으로 밀든 취향이다.

## 30. §28은 잡음이었다 — 그리고 게이트 하나가 운으로 통과하고 있다

§28은 봉인 지역 루틴 게이트가 "게임을 깬다"고 판정하고 되돌렸다. 근거는 3시드였다.
시뮬레이션은 시드된 결정론적 RNG를 쓰므로, 소비자 아홉을 빼면 스트림 전체가 어긋난다.
3시드로는 체계적 효과와 재추첨을 구분할 수 없다. 8시드 × 2빌드 = 16런으로 다시 쟀다.

| | 승리 | 런 길이 중앙값 | 정점 개체 중앙값 | 정점 ≥ 20 |
| --- | --- | --- | --- | --- |
| 현행 | 15/16 | 11.7분 (8.7~23.7) | 17 (14~25) | **3/16** |
| 지역 게이트 | 14/16 | 10.2분 (8.6~20.2) | 16 (12~21) | 2/16 |

**총량에서 중립이다.** §28의 판정은 잡음이었고, 되돌림의 근거는 서지 않는다.
그 수정은 옳고(존재하지 않는 방을 시뮬레이션하지 않는다) 대가는 측정되지 않는다.

### 더 큰 발견

같은 표의 마지막 열: **`peakPopulation >= 20`은 16런 중 3런에서만 성립한다.**
`run.test.ts`가 초록인 이유는 테스트 시드 20260805/brood가 우연히 그 셋 중 하나이기
때문이다. 이 단언은 게임의 속성이 아니라 **스트림의 운**을 검사하고 있다.

그래서 §22와 §28에서 "정점 개체 바닥을 깼다"를 근거로 내린 두 판단이 모두 흔들린다.
§22의 reserve 150 선택은 다른 근거(6/6 승리)로도 서지만, §28의 되돌림은 서지 않는다.

### 이번에 하지 않은 것

수정을 출하하지 않았다. 출하하면 게이트가 빨간불이 되고, 그 게이트를 고치는 건
**단언을 분포 위에서 다시 유도하는 일**이다 — 통과시키려 고치는 것과 구분되게 하려면
"눈에 보이는 군체"가 실제로 몇 마리인지에 대한 근거가 필요하다. 남은 여유로 반쯤
하면 이번 세션이 열두 번 피해 온 바로 그 실수가 된다.

다음 사람에게 필요한 순서: (1) `peakPopulation` 단언을 16런 분포 위에서 재유도,
(2) 그다음 지역 게이트 한 줄을 출하. 순서를 뒤집으면 옳은 수정이 잘못된 게이트에
막힌다.

## 31. 수용력은 원인이 아니라 증상이다 — 성장은 70% 시간 동안 예약에 막혀 있다

새 단언이 드러낸 "군체가 거점 여덟을 차지하고 3분의 1만 채운다"를 고치라는 지적을
받았다. 고치기 전에 프레이밍을 확인했다. 616 표본:

| | 비율 |
| --- | --- |
| 수용력 도달 | **0%** |
| 수용력 여유는 있는데 먹이 예약에 막힘 | **70%** |

**수용력이 성장을 막은 적이 한 번도 없다.** 막는 것은 `food >= 6.5 + pop × 0.0075 × 150`
이고, 런의 70%가 그 조건 아래 있다. 수용력이 큰 이유는 거점이 여덟이기 때문이고,
군체가 거기 못 미치는 이유는 알 값을 못 내기 때문이다. 둘은 같은 원인의 두 증상이다.

### 이미 소진된 지렛대

이 결합을 풀 상수는 전부 쓸어봤다:

| 지렛대 | 결과 | 기록 |
| --- | --- | --- |
| 자원 채집 rate | 정점 개체 무변화 | §20 |
| 경로당 운반 인원 | 무변화, 극단값은 패배 | §21 |
| BROOD_RESERVE_SECONDS | 90이면 정점 22~28인데 **패배 1** | §22 |
| 먹이 유지비 | 낮추면 런이 짧아짐 | §26 |
| 군체 규모 수입 체감 | 패배 | §27 |

reserve 90이 정점 개체를 22~28로 올린다 — 수용력 대비 절반이다. 그래도 6/6을
못 지킨다. **어떤 상수 하나도 이 비율을 고치지 못한다.**

### 남은 진짜 선택지

수용력은 거점 수에 비례해 커지는데 수입은 그렇지 않다. 거점을 하나 더 차지하면
방은 늘고 그 방을 채울 능력은 안 는다. 설계상 의미 있는 교정은 **수용력을 차지가
아니라 보급으로 벌게 하는 것**이다 — 건강한 경로가 닿지 않는 거점은 수용력을 주지
않는다. 그러면 거점에 길을 놓을 이유가 생기고, 그게 시스템 페르소나(36)가 지적한
"결정 밀도" 진단에 정확히 대응한다.

이번 패스에 하지 않았다. 기제 변경이고 남은 여유로는 반쯤밖에 못 한다. 그리고
지금 그걸 넣으면 수용력이 급감해 **내가 방금 추가한 정점/수용력 단언이 저절로
통과한다** — 자기가 만든 게이트를 자기 변경으로 통과시키는 모양이 된다.
그건 이 세션이 열두 번 피해 온 것과 같은 종류의 실수다.

## 32. 발견 기제는 완전히 구현돼 있고 부엌만 쓰지 않는다 (측정 후 되돌림)

`hidden` 자원은 기제가 전부 있다 — `state.ts:492`가 `found`를 정하고 `scout.ts:212`가
지나가며 드러낸다. **봉인된 네 방이 전부 쓴다. 부엌만 0회다.** 그래서 출하되는 방에서는
모든 자원이 tick 0에 알려져 있고, 탐색이 정보를 돌려주지 않는다 — 레벨 페르소나(38)의
진단 그대로다. 이번 세션에 반복해 나온 "구현됐고 실행되지 않는" 패턴의 여섯 번째다.

바닥에서 볼 수 없는 셋에 `hidden: true`를 붙였다(`bin.inside.food`, `fridge.seal`,
`table.ring`). 3시드 × 2빌드:

| 시드/빌드 | 결과 | 길이 | 전부 발견 |
| --- | --- | --- | --- |
| 20260805/brood | 승 | **10.82분** | 36초 |
| 20260805/shadow | 패 | 16.50분 | 36초 |
| 777/brood · shadow | 승 · 승 | 11.98 · 12.64분 | 36초 |
| 4242/brood · shadow | 승 · 승 | 16.62 · **49.04분** | 36초 |

발견은 실제로 일어난다 — tick 0이 아니라 36초다. 그런데 정규 시드가 13.18 → 10.82분으로
떨어져 방금 소원에서 게이트로 승격시킨 `> 12.5분` 단언을 깬다.

**되돌린다.** 단언을 약화시키지 않는다.

### 정정: 이 되돌림은 §28과 같은 함정이 아니었다

처음에 나는 "6런 표본의 중앙값이 낮아졌다고 말하기 어렵다"고 적고, 게이트가 단일
시드를 보는 것이 문제라고 진단했다. **틀렸다.** 6런 혼합 빌드 스프레드를 단일 시드
값과 비교한 잘못된 비교였다.

그래서 순서대로 했다. 먼저 런 길이 단언을 분포 위로 옮기고(같은 빌드 3시드의 중앙값),
그다음 세 줄을 다시 넣었다. 분포 게이트가 거부했다:

| | brood 3시드 | 중앙값 |
| --- | --- | --- |
| `hidden` 없음 | 13.18 · 10.45 · 16.21 | **13.18** |
| `hidden` 셋 | 10.82 · 11.98 · 16.62 | **11.98** |

**중앙값이 실제로 떨어진다.** 단일 시드 잡음이 아니었고, 첫 되돌림은 옳았다.
분포 게이트는 남긴다 — 그게 이 답을 낸 도구다.

왜 발견이 런을 짧게 만드는지는 아직 모른다. 자원 셋이 36초간 감춰지는 것이
초반 경로 순서를 바꾸는 것으로 보이지만 재지 않았다. 그걸 알아내는 것이 이
기제를 부엌에 들이는 전제조건이고, 붙일 위치는 `bin.inside.food` ·
`fridge.seal` · `table.ring`의 `kind:` 바로 앞이다.

## 33. perf는 지금 측정 불가다 — 패널이 기계를 쓰고 있다

`9db096e` 직후 perf가 p50 32.20/16.7로 실패했다. 회귀로 읽지 않는다.

그 커밋은 자원 하나에 `hidden: true` boolean을 붙인 것이다. 프레임 비용이 생길
경로가 없다. 부하 평균이 **4.25**이고 빌드 시간이 0.97초에서 1.54초로 늘었다 —
페르소나 패널 `wlgsvl62q`가 서브에이전트를 돌리며 CPU를 쓰는 중이다.
재실행해도 p50 32.3으로 같은 부하에서 재현된다.

**이번 세션 열세 번째 깨진 계측기이고, 이번엔 계측기가 아니라 환경이다.**
`scripts/perf.mjs`는 더러운 트리를 거부하는 가드는 있지만 **바쁜 기계를 거부하는
가드는 없다.** 프레임 시간을 재면서 옆에서 아홉 개 에이전트가 도는 것을 모른다.

기록: `9db096e`의 게이트 상태는 typecheck·lint·단위 89/89·test:slow 19/19·빌드·
캡처(오류 0, 경고 0, 20회 재시작 동일)·prompt-evidence PASS까지 초록이고,
**perf만 미측정**이다. 패널이 끝난 뒤 조용한 기계에서 다시 재야 한다.

다음에 넣을 가드: `perf.mjs`가 시작 전에 부하 평균을 읽고 임계를 넘으면
측정을 거부하는 것. 더러운 트리를 거부하는 것과 같은 이유다 — 설명하지 못하는
숫자를 내놓느니 아무 숫자도 내놓지 않는 편이 낫다.

## 34. 열한 번의 경제 스윕이 전부 H를 누르지 않은 채 돌았다 — §27의 결론을 유보한다

재채점 패널의 반박자가 찾아냈고, 확인했다.

`tests/bot.ts:115-117`은 hold 정책을 이렇게 건다:

```ts
const waitingOnStores =
  run.objective.blockerKey === 'blocker.food' ||
  run.objective.blockerKey === 'blocker.moisture';
run.colony.broodHold = waitingOnStores && run.colony.population >= 12;
```

그 두 키는 `checkGate`(`progression.ts:112`)에서만 나오고, `checkGate`는 `GATES`를
통해서만 도달한다. **`GATES`는 `[]`다.** 그러므로 `waitingOnStores`는 언제나 false이고
`broodHold`는 봇의 손에서 죽어 있다.

`broodHold`는 죽은 기능이 아니다. H로 눌리고(`input.ts:123`, 한글 ㅗ 별칭 `:57`),
디스패치되고(`boot.ts:211`), HUD 칩으로 그려지고(`hud.ts:254`), 도움말이 가르친다
(`help.broodHold`). 유지비도 계속 문다(`progression.ts:351`). **플레이어는 쓸 수 있고
봇만 못 쓴다.**

### 무엇이 흔들리는가

§20~§27의 열한 번의 스윕 — 채집 rate, 경로당 인원, 브루드 예약, 먹이 유지비, 군체
규모 수입 체감 — 이 전부 번식 통제가 꺼진 봇으로 측정됐다. 그 스윕들이 내린 결론이
**"경제로는 25~35분에 닿을 수 없다"**(§27)이다.

그 결론을 철회하지는 않는다. 방향의 일관성(쉽게 → 짧아짐, 어렵게 → 짐)은 열한 번에
걸쳐 예외가 없었고, 그건 통제 하나로 뒤집히기 어려운 신호다. **하지만 유보한다** —
번식을 억제할 수 있는 플레이어는 굶주림 실패를 피하면서 더 길게 갈 수 있고, reserve
90이 25.62분에서 `log.starved`로 죽은 것(§24)이 정확히 그 실패 양식이다.

### 순서

1. `tests/bot.ts`의 hold 트리거를 도달 가능한 신호로 바꾼다. 게이트 블로커가 아니라
   저장고 자체를 봐야 한다 — 예컨대 먹이가 번식 예약선 아래로 내려갈 때.
2. 그다음 §22(reserve)와 §24(reserve 90의 굶주림)를 다시 잰다.
3. 그 결과가 나오기 전까지 §27은 "측정된 방향성"이지 "닫힌 공간"이 아니다.

계측기를 열네 번 틀렸고, 이번 것은 내가 아니라 적대적 검증자가 찾았다.


## 35. 계측기를 고치니 런이 짧아졌다 — §27은 약해진 게 아니라 강해졌다

§34가 찾은 죽은 트리거를 고쳤다. `tests/bot.ts`의 hold 조건을 도달 불가능한
`blocker.food`에서 `progression.ts`의 번식 규칙 자체로 바꿨다 — 다음 알을 낳고도
예약을 지킬 수 있는가.

3시드 brood, 같은 커밋:

| | 런 길이 | 중앙값 |
| --- | --- | --- |
| H 죽어 있음 | 11.22 · 14.31 · 16.76 | **14.31** |
| H 작동 | 11.22 · 11.95 · 12.17 | **11.95** |

**번식을 관리하는 봇은 더 빨리 이긴다.** 굶주림 나선을 피하니 효율이 올라가고
결승선에 먼저 닿는다. 이전의 긴 런은 부분적으로 봇이 성장을 잘못 관리한 결과였다.

### 두 가지가 따라온다

**1. `it.fails`를 되돌렸다.** 그 래퍼는 깨진 봇 위에서 벗겨졌다. 요구사항은 애초에
충족된 적이 없고, 충족된 것처럼 보인 것은 계측기가 고장 나 있었기 때문이다.
`run.test.ts`에 그 경위를 적었다.

**2. §27은 유보를 거둔다.** §34에서 나는 "번식을 억제할 수 있는 플레이어는 더 길게
갈 수 있다"고 추측하며 §27을 유보했다. 측정은 반대다 — 더 나은 플레이가 런을
**짧게** 만든다. 그러므로 25~35분 구간은 경제에서 더 멀지 가깝지 않다.
§27의 결론("경제로는 닿을 수 없다")은 약해진 게 아니라 강해졌다.

내 유보 자체가 추측이었고, 재보니 방향이 반대였다.

## 36. W2는 소스 수준까지만 검증됐다 — 시각 확인은 막혔고, 그렇게 기록한다

`be8dda4`는 위협 링과 경로 리본을 `depthTest: false`로 만들었다. 근거는 코드 읽기다:
투명 큐가 `renderOrder` 우선으로 정렬되고, 페이드된 오클루더가 0에서 깊이를 쓰고
(`occlusion.ts:366`), 이 둘은 그보다 높은 order에 있으므로 기각된다.

**시각적으로 확인하지 못했다.** 프롭 뒤의 링이 실제로 보이는 프레임을 찍으려면
씬 그래프에 접근하거나 위협을 의도적으로 띄워야 하는데, `window.__game`은 `run`·
`stats`·`frame`·`audio`·`judge`만 노출하고 씬 핸들이 없다. 디버그 표면을 넓히는 건
가능하지만 이번 패스에 남은 여유로는 반쯤밖에 못 한다.

그래서 이 수정의 증거 등급은 이렇다:

| 검증 | 상태 |
| --- | --- |
| 소스 논증 (정렬 순서와 depth write) | 확인 |
| typecheck · lint · 단위 89/89 · test:slow 19/19 · 빌드 | 통과 |
| 캡처 (콘솔 0, 경고 0, 20회 재시작 동일) · perf 전 항목 | 통과 |
| 출하 번들의 런타임 상태 | **확인** — `depthTest:false` 메시 12개, renderOrder 3(링)과 2(필·리본) |
| **프롭 뒤의 링이 보이는 프레임** | **없음** |

§11은 "특정 주장에 대한 기록된 실브라우저 증거 없이 성공을 보고하지 말라"고 한다.
이 수정이 회귀를 일으키지 않는다는 것은 증거가 있다. **이 수정이 의도한 것을 한다는
것은 증거가 없다.** 둘은 다른 주장이고, 뒤엣것은 아직 미검증이다.

**갱신:** 씬 핸들을 노출했고(`GameRenderer.scene`, `__game.scene`), 출하된 번들을
순회해 확인했다 — `depthTest:false`인 메시 12개가 renderOrder 3과 2에 있다. 위협
링과 필, 경로 리본이다. 소스가 아니라 실행 중인 상태다.

여전히 **없는 것**은 카메라와 위협 사이에 프롭이 오는 구도의 before/after 프레임이다.
그러려면 위협을 의도적으로 띄워야 하는데, 그건 §8이 금지하는 "숨은 상태 조작으로
가속한 플레이"에 가깝다 — 실제 플레이에서 그 구도가 나올 때까지 기다리거나, 그
구도를 만드는 시드를 찾아야 한다. 기제는 검증됐고 그림은 아직이다.

## 37. W1 첫 시도 — 방향은 맞고 크기가 런을 죽인다 (되돌림)

패널의 최대 항목(~27점, 시스템 44의 핵심)은 "차지는 순전히 이득이다"였다.
수용력을 보급에 묶어 *보급*에는 값을 붙였으니(`2de6a8e`), 이번엔 *보유*에 붙였다:
한 지역에 쥔 거점 수만큼 그 방이 덜 식는다. 여덟 곳에 퍼진 군체는 여덟 곳에
흔적을 남기고, 다수 승리 규칙은 이미 "전부는 필요 없다"고 말한다.

```ts
const spread = 1 / (1 + heldHere * 0.12);   // 2곳 0.81 · 8곳 0.51
region.evidence -= EVIDENCE_DECAY * dt * abandoned * max(COOL_FLOOR, 1 - busy) * spread;
```

3시드 brood:

| 시드 | 이전 | 이후 |
| --- | --- | --- |
| 20260805 | 승 12.17분 | **패** 18.07분 · 최대보유 5 · 소탕 0 |
| 777 | 승 11.95분 | **패** 17.07분 · 최대보유 7 · 소탕 1 |
| 4242 | 승 11.22분 | **패** 15.76분 · 최대보유 5 · 소탕 0 |

**되돌린다.** 3/3 패배는 튜닝으로 다듬을 여지가 아니라 규칙이 군체를 못 살게
만든다는 뜻이다.

### 남는 것

방향은 확인됐다 — 보유에 값을 붙이면 런이 길어지고(11~12분 → 16~18분) 거점
확장이 실제로 억제된다(8 → 5~7). 그게 정확히 W1이 요구하는 결정이다.
0.12가 너무 클 뿐이다. 다음 시도는 0.04 / 0.07을 쓸어 승률을 지키는 값을 찾는
것이고, 이번 세션이 확립한 대로 **승률·정점 개체·결승선 하락·런 길이를 함께**
판정해야 한다 — 하나만 보고 고른 경우는 예외 없이 다른 것을 깼다.

## 38. 보유 과금 0.04 — 이 프로젝트가 설계 구간에 처음 닿았다

§37의 후속 스윕. 3시드 brood, 네 지표 동시:

| k | 승리 | 런 길이 중앙값 | 범위 | 정점 개체 | 최대 보유 | 결승선 하락 |
| --- | --- | --- | --- | --- | --- | --- |
| 없음 | **3/3** | 11.95분 | 11.22~12.17 | 13~17 | 6 | 3/3 |
| **0.04** | 2/3 | **24.87분** | **17.04~27.51** | 14~17 | 7~8 | 3/3 |
| 0.07 | 1/3 | 14.55분 | 13.71~17.42 | 14~17 | 6~7 | 3/3 |

**k=0.04의 중앙값 24.87분은 25~35분 목표 구간의 문턱이고 최댓값 27.51분은 그 안이다.**
프로젝트 통틀어 처음이다. 시작점이 3.1~4.9분이었다.

곡선이 단조롭지 않다는 점도 중요하다 — 0.07은 0.04보다 **짧다**(14.55분). 과금이
세지면 군체가 일찍 무너져 런이 짧게 끝난다. 최적은 0.04 근처의 좁은 창이고,
그 바깥 양쪽 모두에서 길이가 준다.

### 대가와 남은 판단

3시드 중 하나가 진다. 이건 튜닝 잔여물일 수도 있고 규칙의 정직한 비용일 수도 있다 —
봇은 완벽한 플레이어가 아니고 패배가 가능해야 한다는 것 자체는 결함이 아니다.
다만 `run.test.ts`는 정규 시드(20260805/brood)의 승리를 단언하므로, **어느 시드가
지는지 확인하기 전에는 출하할 수 없다.** 이번 스윕은 총계만 냈다.

다음 단계는 셋 중 하나다:
1. 시드별 결과를 찍어 정규 시드가 이기면 그대로 출하한다.
2. 정규 시드가 지면 0.045 / 0.05를 좁게 쓸어 승률을 회복하는 값을 찾는다.
3. 그래도 안 되면 이건 "길이를 승률로 사는" 교환이며, 브리프가 금지한 것은 아니지만
   (가격도 걸음도 아니다) 명시적으로 기록하고 선택해야 한다.

### 이 세션이 런 길이에 대해 확정한 것

길이를 움직인 변경은 셋뿐이고 전부 같은 성질이다 — **공짜였던 것에 값을 붙인 것**:
시작 자원을 둥지에서 떼기(보급선이 존재하게), 수용력을 보급에 묶기, 보유에 과금.
§20~§27의 rate 스윕 열한 번은 하나도 움직이지 못했다. 경제의 상수가 아니라
**무엇이 공짜인가**가 이 게임의 길이를 정한다.

## 39. W3도 미검증이다 — §36과 같은 등급 구분

`f7781d3`은 일꾼 몸 크기를 id에서 유도해 ±12% 흩었다. 감사가 CRITICAL로 분류한
"일꾼별 시각 변주가 사실상 없다"에 대한 수정이다.

**주장한 것을 확인하지 못했다.** 런타임 탐침이 두 군데 틀렸다 — 씬 그룹 이름이
`roaches`가 아니었고, 걷기만으로는 군체가 자라지 않아 일꾼이 두 마리였다.
겹친 일꾼 프레임이 필요한데 그 구도를 만들려면 실제로 경로를 놓고 배달을 돌려야
한다.

증거 등급:

| 검증 | 상태 |
| --- | --- |
| 소스 (id → 안정적 스케일, ±12%) | 확인 |
| typecheck · lint · 단위 89/89 · test:slow 19/19 · 빌드 | 통과 |
| 캡처 (콘솔 0, 경고 0, 20회 재시작 동일, draw call 불변) | 통과 |
| 런타임 스케일 (경로를 놓고 45초 배달 후 씬 순회) | **확인** — 보이는 몸 3개가 `[0.88, 1.0, 1.101]`. 정찰병 1.0, 일꾼 둘이 서로 25% 차이 |
| 스크린샷 | `artifacts/evidence/completion/workers/workers-varied.png` |
| **일꾼 여럿이 빽빽이 겹친 프레임** | **없음** — 45초에 군체가 둘까지만 자란다 |

§36에서 W2에 대해 세운 구분과 같다. **"회귀를 일으키지 않는다"는 증거가 있고
"의도한 것을 한다"는 증거가 없다.** 둘은 다른 주장이다.

**갱신:** 했다. `layRoute`로 경로를 놓고 45초 배달을 돌린 뒤 씬을 순회했다.
그룹 이름은 `colony`다(`roaches.ts:50`). 스케일이 실제로 흩어져 있다 —
`[0.88, 1.0, 1.101]`, 일꾼 둘 사이 25% 차이. 기제는 확인됐다.

남은 것은 **밀집 프레임**이다. 45초에 군체가 둘까지만 자라므로 "겹침이 한 마리
동물로 읽히던 것"이 풀렸는지는 여전히 못 봤다. 그러려면 몇 분을 돌려야 하고,
그건 캡처 하네스에 재생 시간을 늘리는 일이다.

### 이 세션의 미검증 목록

| 항목 | 소스/게이트 | 시각 확인 |
| --- | --- | --- |
| W2 오버레이 (`be8dda4`) | 확인 (출하 번들에서 depthTest:false 12개) | 없음 (§36) |
| W3 일꾼 변주 (`f7781d3`) | 확인 | 없음 (§39) |

둘 다 §3·§10이 시각으로 규정한 항목이다. 게이트가 초록이라는 것과 계약이
요구하는 그림이 나온다는 것은 다른 말이고, 이 저장소는 그 혼동 때문에 §11을 갖고 있다.

## 40. 밀집 프레임을 못 찍는 진짜 이유 — 헤드리스가 rAF를 스로틀한다

W3의 남은 증거는 "일꾼 여럿이 겹친 프레임"이고, 두 번 시도해 두 번 다 일꾼 두
마리만 나왔다. 군체가 안 자란다고 읽었는데 틀렸다. 쟀다.

경로 셋을 놓고 벽시계로 약 **280초**를 기다린 뒤 `run.time`을 읽으니 **26초**였다.
시뮬레이션이 실제 시간의 1/10로 돈다. Playwright 헤드리스 Chromium이
`requestAnimationFrame`을 스로틀하기 때문이고, 군체는 26초분만큼만 자란 것이 맞다.
일꾼이 둘인 것은 정상이다.

**이 세션 열다섯 번째 깨진 계측기이고, 앞선 두 번의 "군체가 안 자란다" 판단이
전부 이것이었다.**

### 결과

`scripts/capture.mjs`가 짧은 장면만 찍는 이유도 이것으로 설명된다 — 긴 재생을
전제한 증거는 이 하네스로 얻을 수 없다. 밀집 프레임을 찍으려면 셋 중 하나가
필요하다:

1. ~~`--disable-renderer-backgrounding --disable-background-timer-throttling` 등으로
   스로틀을 끄고 재시도한다~~ — **했다. 이것으로 해결된다.**
   `capture.mjs`와 `prompt-evidence.mjs`의 실행 플래그에 세 개를 넣었다:
   `--disable-background-timer-throttling` · `--disable-renderer-backgrounding` ·
   `--disable-backgrounding-occluded-windows`.
   측정: 시뮬 30.0초 / 벽시계 30.0초, **비율 1.00** (이전 약 0.1).
   두 줄짜리 편집이 이 세션에서 세 번의 잘못된 판단을 만든 원인을 없앴다.
2. 헤드풀(headless: false)로 띄운다. Claude-in-Chrome이 이미 있으므로 실제
   Chrome에서 몇 분 돌리는 것도 경로다.
3. 시뮬레이션을 빨리 감는 디버그 훅을 만든다 — 그러나 §8이 "숨은 상태 변경으로
   가속한 플레이"를 금지하므로, 증거용으로만 쓰고 그렇게 표시해야 한다.

### 미검증 표 갱신

| 항목 | 소스/게이트 | 런타임 기제 | 시각 |
| --- | --- | --- | --- |
| W2 오버레이 | 확인 | 확인 (번들에서 depthTest:false 12개) | 없음 |
| W3 일꾼 변주 | 확인 | 확인 (`[0.88, 1.0, 1.101]`) | 부분 — 3체 프레임만 |

둘 다 기제는 실행 중인 빌드에서 확인됐고, 계약이 요구하는 **그림**은 아직이다.
이제 그 그림을 막고 있는 것이 코드가 아니라 하네스라는 것까지 특정됐다.

## 41. 스로틀은 풀렸는데 밀집 프레임은 여전히 안 나온다 — 원인이 하나가 아니었다

§40의 처방(플래그 셋)은 실제로 듣는다. 단독 측정: **시뮬 30.0초 / 벽시계 30.0초,
비율 1.00.** 이전은 약 0.1이었다.

그런데 같은 플래그로 밀집 프레임 스크립트를 돌리면 **벽시계 240초에 `run.time` 28초**다.
두 측정이 모순되므로 스로틀은 원인의 전부가 아니다.

차이는 이렇다. 통한 탐침은 Space를 누르고 곧바로 30초를 기다렸다. 안 통한 쪽은
`layRoute`를 세 번 부른 뒤 20초씩 열두 번 기다린다. 후보:

- 게임이 blur/hidden에서 멈춘다. `boot.ts`가 blur에 `audio.suspend()`를 부르므로
  시뮬 쪽에도 같은 처리가 있을 수 있다. 긴 `waitForTimeout` 동안 페이지가
  비활성으로 판정되는 것이 설명이 된다.
- 런이 이미 끝났다. `t=28`에 일꾼 둘이면 군체가 죽었을 수 있고, 그러면 시간이 선다.

**쟀다. 둘 다 아니었다 — 내 스크립트였다.**

```
D0  t=0.1   status=playing vis=visible focus=true pop=2
D1  t=5.7   (경로 셋을 놓은 뒤)
D2  t=25.7 → 45.7 → 65.7   20초 대기당 정확히 20초
```

시뮬은 1.00으로 돈다. 페이지는 visible·focused, status는 playing이다. 스로틀 수정은
완전히 듣는다.

밀집 스크립트가 `best`를 `s.alive > best.alive`일 때만 갱신했는데 일꾼이 2에서
늘지 않으니 첫 샘플이 끝까지 `best`로 남았다. **240초를 돌고도 t≈28을 출력한 것은
측정값이 아니라 첫 샘플이다.** 이번 세션 열여섯 번째 계측기 실패이고 또 내 것이다.

### 그래서 남는 진짜 질문

경로 셋을 놓고 65초에 일꾼이 여전히 둘이다. 봇은 같은 게임에서 13~17까지 간다.
65초는 봇 기준으로도 이른 시점이므로 이것만으로는 이상하다고 말할 수 없다.
필요한 것은 **마지막 샘플을 출력하는 몇 분짜리 재생**이고, 그건 이제 가능하다.

미검증 표는 그대로다:

| 항목 | 소스/게이트 | 런타임 기제 | 시각 |
| --- | --- | --- | --- |
| W2 오버레이 | 확인 | 확인 | **확인 — 아래 §49** |
| W3 일꾼 변주 | 확인 | 확인 | **확인 — §45, 몸 10개·스케일 10종, `workers-crowd.png`** |

플래그 수정 자체는 유지한다. 하네스가 실제 시간으로 도는 것은 그 자체로 옳고,
캡처가 39초 시점에 배달 20건을 기록하게 된 것도 그 덕이다.

## 42. 내가 출하한 아트 회귀 — 평균이 무너진 분포를 가렸다

패널 재채점에서 아트만 내려갔다: 52 → 56 → **47**. 원인은 `969a504`, 내가 바이블의
명도 사다리를 근거로 넣은 `cabinetDoor` #6d6257 → #26323c다.

비평가가 같은 크롭에서 재측정한 값:

| 지표 | 이전 | 이후 |
| --- | --- | --- |
| 플레이 영역 중간톤 (L* 20~40) | 39.6 % | **3.0 %** |
| 플레이 영역 어두운 값 (L* < 20) | 6.6 % | **61.5 %** |

**§7이 금지한 균일한 어둠이다.** 프레임의 60%가 근검정 쪽으로 쏠렸다.

### 내 검증이 왜 통과했나

나는 프레임 **평균 휘도**와 근검정 비율을 쟀고 0.316~0.361 / 0.00~0.63%로 정상이었다.
평균은 분포가 무너져도 움직이지 않는다 — 밝은 창과 어두운 캐비닛이 평균에서 서로를
지운다. 근검정 임계(4%)도 L* 20 근처의 붕괴를 잡지 못한다.

**§29에서 나는 "순서는 알베도에서 검사할 수 있다"고 옳게 논증했고, 그 논증이 맞다는
것과 그 변경이 프레임을 낫게 만든다는 것을 혼동했다.** 순서는 고쳤고 분포는 깼다.

### 다음

되돌리거나, 사다리 순서를 지키면서 중간톤을 살리는 값을 찾아야 한다. #26323c는
바이블의 steel이지만 바이블의 사다리는 **화면값**이고 이건 알베도다 — §29가 스스로
적어둔 범주 구분을 정작 값을 고를 때 쓰지 않았다.

측정할 지표도 바뀌어야 한다: 평균이 아니라 **플레이 영역의 L\* 히스토그램**이다.

### 되돌렸고, 이번엔 분포로 쟀다

`cabinetDoor`를 `0x6d6257`로 복귀. 플레이 영역(1520×760 크롭) 분포:

| | 되돌린 뒤 | 회귀 상태 (비평가 측정) |
| --- | --- | --- |
| 어두움 (<20%) | **1.3 %** | 61.5 % |
| 중간톤 (20~40%) | **52.0 %** | 3.0 % |
| 밝음 (>40%) | 46.7 % | — |

프레임이 회복됐다. 사다리 순서 위반은 다시 열린 채로 두고, 다음에 고칠 때는
가장 넓은 수직면이 아니라 바닥 쪽에서 접근해야 한다 — 비교의 반대편이고
화면 점유가 훨씬 작다.

계측 방법도 남긴다:

```
magick <frame> -crop 1520x760+200+160 +repage -colorspace gray \
  -threshold 20% -format "%[fx:1-mean]" info:     # 어두움 비율
```

`-fx`는 비교 연산자를 지원하지 않는다(`u<0.2`는 파싱 오류). 임계 이미지의 평균을
읽는 방식으로 우회한다. 이 세션 열일곱 번째 계측기 문제였고 이번엔 도구의 문법이었다.

## 43. 캡처 하네스에 거점 차지를 더했다 — 그래도 밀집 프레임은 안 나온다, 그리고 이유가 다르다

W3의 시각 증거를 네 번째로 시도했다. `scripts/lib/walk.mjs`는 걷기와 길 놓기만 할 수
있었고 거점을 차지하는 수단이 없었다 — 수용력은 거점에서 오므로 하네스가 **구조적으로**
큰 군체를 만들 수 없었다. `claimNearest`를 더했다.

결과 (경로 하나, 25초마다 차지 시도, 206초):

```
R0 claimed=- t=27  pop=2 cap=9
R7 claimed=- t=206 pop=2 cap=9
```

**여덟 번 모두 차지에 실패했다.** 조건은 `food >= site.cost.food`이고, 그 먹이가 없다.
그리고 수용력 9에 개체 2이므로 **수용력이 아니라 먹이가 성장을 막고 있다.**

### 이건 이제 게임 관측이다

하네스는 확인됐다 — 시뮬 1.00배, 경로가 놓이고 배달이 돈다(39초에 20건). 그런데
경로 하나로 206초를 돌면 군체가 둘에서 멈추고 거점 하나도 못 산다.

봇은 같은 게임에서 13~17까지 간다. 차이는 봇이 경로를 여럿 놓고 번식을 관리한다는
것이다. 즉 **한 줄만 놓고 기다리는 플레이는 성립하지 않는다** — 그것이 의도된 난이도인지
초반 곡선의 결함인지는 이 측정만으로 말할 수 없다.

### W3 증거의 현재 상태

| 검증 | 상태 |
| --- | --- |
| 소스 (id → 안정적 ±12% 스케일) | 확인 |
| 런타임 (실행 중인 번들) | 확인 — `[0.88, 1.0, 1.101]`, 세 몸이 서로 다름 |
| 밀집 프레임 (여럿이 겹침) | **확인** — t=349, 개체 9, 몸 10개에 서로 다른 스케일 10개 (0.88~1.101). `artifacts/evidence/completion/workers/workers-crowd.png` |

네 번의 시도로 장애물이 세 겹이었음이 드러났다: 스크립트의 `best` 버그(§41),
헤드리스 rAF 스로틀(§40), 그리고 하네스에 차지 수단이 없던 것(여기). 셋 다 고쳤고
남은 것은 게임 쪽이다 — 하네스가 만들 수 있는 최대 군체가 둘이라는 사실.

## 44. §43의 열린 질문에 답한다 — 초반 곡선은 결함이 아니다

§43은 "경로 하나로 206초에 거점을 하나도 못 산다"를 관측하고, 의도된 난이도인지
초반 곡선의 결함인지 말할 수 없다고 적었다. 쟀다. 봇으로 3시드, 첫 5분:

```
route#1@1s  route#2@12s  route#3@21s
claim#1@1s   (food 8, routes 1)   ← 시작 거점
claim#2@201s (food 4, routes 2)
claim#3@235s (food 3, routes 5)
```

세 시드가 초 단위까지 같다. **경로 셋을 21초에 놓는 유능한 플레이도 두 번째 거점에
200초를 쓴다.** 그리고 매 차지 시점의 먹이가 8 · 4 · 3이다 — 군체는 살 수 있게 되는
즉시 전부 쓴다.

**결함이 아니다.** 한 줄만 놓고 기다린 내 탐침이 206초에 아무것도 못 산 것은 정확히
한 줄짜리 플레이가 그래야 하는 모습이다. 25분 런에서 두 번째 거점이 3분 20초에 오는
것은 페이싱으로 합당하고, 첫 배달 60초 목표와도 어긋나지 않는다.

§43의 질문을 닫는다. 그리고 이것은 W3의 밀집 프레임이 왜 안 나왔는지도 최종적으로
설명한다 — 하네스의 문제 셋을 다 고친 뒤에도 남은 것은 **게임이 그 시점에 그만큼의
군체를 주지 않는다**는 사실이었고, 그건 옳은 동작이다. 밀집 프레임을 원하면 봇처럼
경로를 여럿 놓고 몇 분을 더 돌려야 한다.


## 45. W3의 밀집 프레임이 나왔다 — 네 번째 시도, 세 결함을 고친 뒤

봇처럼 몰았다: 시작 즉시 경로 셋, 30초마다 거점 차지와 경로 추가, 5분 이상.

```
t=64   pop=2 routes=1  bodies=3
t=250  pop=2 routes=4  bodies=3
t=290  pop=3 routes=2  bodies=4
t=349  pop=9 routes=3  bodies=10  distinct=10  min=0.88 max=1.101
```

**몸 10개가 전부 서로 다른 스케일이다.** ±12% 폭이 열 마리에 걸쳐 겹치지 않는다.
`workers-crowd.png`에 남겼다. W3의 시각 증거가 처음으로 존재한다.

네 번의 시도가 필요했고 매번 다른 것이 막고 있었다 — 스크립트의 `best` 버그(§41),
헤드리스 rAF 스로틀(§40), 하네스에 차지 수단 없음(§43), 그리고 마지막으로 봇처럼
경로를 여럿 놓지 않은 것(§44가 알려준 것). 셋은 도구였고 넷째는 사용법이었다.

## 46. 시각 타임베이스가 60 Hz 위에서 틀렸다 — 패널이 찾은 계약 위반

`src/game/boot.ts:266`:

```ts
const dt = Math.min(0.05, steps * SIM_DT || 1 / 60);
```

스텝을 하나도 만들지 않은 프레임에 시각 시간 16.7 ms를 통째로 청구한다.
패널이 두 경로를 그대로 복제해 잰 값:

| | 60 Hz | 120 Hz | 144 Hz | 240 Hz |
| --- | --- | --- | --- | --- |
| 시각 시간 / 실제 시간 | 1.00× | **2.00×** | **2.40×** | **4.00×** |
| 스텝 0 프레임 | 0/600 | 600/1200 | 840/1440 | 1800/2400 |

이 `dt`는 오클루전·카메라 감쇠·보행·위협 맥동·오디오 베드에 전부 들어간다.
`DEFAULT_FADE_SECONDS = 0.22`가 144 Hz에서 **92 ms**가 되고, §3이 요구하는
150~300 ms 아래다 — 번호가 붙은 계약 조항 위반이다.

**모든 증거가 이걸 놓친 이유**: 이 저장소의 캡처와 perf는 전부 60 Hz다.
`round9/performance.json`의 presented p50이 16.70 ms인 것이 그 증거다. 60 Hz에서만
1.00×이므로, 계약을 깨는 조건이 우리 하네스에 존재한 적이 없다.

**고쳤다.** 시각 `dt`가 실제 벽시계 델타를 읽는다. 시뮬레이션은 그대로 고정 스텝이고,
보간된 표현만 흐른 시간을 본다 — 원래 그래야 했던 것이다.

하네스가 한 번도 밟은 적 없는 조건에서 검증했다. `requestAnimationFrame`을 144 Hz로
갈아끼우고(대부분의 프레임이 시뮬 스텝을 만들지 않는 상태) 8초를 돌렸다:

```
frames=1099  sim=7.63s  →  144 Hz
```

시뮬 시간이 실시간으로 흐른다. 이전 식이었다면 시각 시간이 2.40배로 흘러
0.22 s 페이드가 92 ms가 됐을 조건이다.

perf도 HEAD에서 조용한 기계(부하 2.45)에 다시 쟀다 — 전 항목 초록:
p50 16.70/16.7 · p95 18.60/20 · p99 18.70/33 · GPU p99 13.81/33 ·
draw 438/900 · triangles 174k/400k · geometries 141/196.

### 잰 것과 못 잰 것

| 주장 | 상태 |
| --- | --- |
| 시각 타임베이스가 144 Hz에서 실시간이다 | **측정** — frames 1099 / sim 7.63 s |
| perf 전 항목이 HEAD에서 초록이다 | **측정** — 조용한 기계, 부하 2.45 |
| 페이드가 §3의 150~300 ms 안에 있다 | **측정** — 144 Hz에서 **250 ms** |

처음 시도는 40초 동안 아무 오클루더도 못 잡았다 — 정찰병이 싱크대 밑에서 시작하므로
카메라와 몸 사이에 프롭이 오는 구도가 저절로 나오지 않는다. §45와 같은 교훈이다.
정찰병을 여덟 방향으로 걷게 하고 4 ms 간격으로 연속 표집하니 나왔다:

```
144 Hz · 표본 5020 · 최저 불투명도 0.26 · 페이드 구간 250 ms
```

**§3이 요구하는 150~300 ms 안이다.** 이제 추론이 아니라 프레임에서 잰 값이고,
`a430a22` 이전이라면 시각 시간이 2.40배로 흘러 같은 구간이 약 104 ms — 조항 위반 —
이었을 조건에서 쟀다.

두 번째 시도가 필요했던 이유도 계측기다: 첫 검출기가 불투명도 **변화만** 기록하고
1.0에서 시작하는 샘플을 요구해서, 페이드가 실제로 일어나는데도 "없음"을 냈다
(샘플 71개, 최저 0.26이 이미 그 증거였다). 연속 표집으로 바꾸니 잡혔다.

## 47. 구간은 도달 가능하고 값은 승률이다 — 세 번째 확인, 이번엔 수용력 수정 뒤

`695bc84`가 수용력을 보급에 이으면서 그 아래 상수의 세계가 바뀌었다. §22의 교훈대로
다시 유도했다. 3시드 × 2빌드:

| k | 승리 | brood 런 길이 | 중앙값 |
| --- | --- | --- | --- |
| **0.04** (현행) | **5/6** | 17.04 / 21.57 / 23.25 | 21.57 |
| 0.055 | 3/6 | 12.48 / **26.65** / **30.50** | **26.65** |
| 0.07 | 4/6 | 12.48 / 13.70 / 18.42 | 13.70 |

**0.055의 중앙값 26.65분은 25~35 구간 안이다.** 두 런이 구간 안에 들어간다(26.65, 30.50).
그리고 승률이 5/6에서 3/6으로 떨어진다.

곡선은 여전히 단조롭지 않다 — 0.07은 0.055보다 짧다. 최적은 좁은 창이고 양쪽이 나쁘다.

### 출하하지 않았다

`run.test.ts`가 정규 시드의 승리를 단언하고, 3/6은 그걸 지킬 수 없다. 그리고 12.48분
런이 둘 다 k를 올린 쪽에 나타난다 — 과금이 세지면 일부 시드가 일찍 무너져 짧게 끝난다.

### 이 세션이 런 길이에 대해 확정한 것

구간에 세 번 닿았고 **세 번 다 같은 값을 요구했다**:

| 언제 | 설정 | 중앙값 | 승률 |
| --- | --- | --- | --- |
| §22 | 예약 90 | 34.23분(최대) | 5/6 — 정규 시드 패배 |
| §38 | 보유세 0.04 (수용력 수정 전) | 24.87분 | 5/6 |
| §47 | 보유세 0.055 (수용력 수정 후) | **26.65분** | **3/6** |

**구간은 도달 불가능하지 않다. 매번 승률이 값이다.** 그리고 그 교환은 상수를 더
돌린다고 사라지지 않는다 — 열네 번의 스윕이 같은 벽을 보여줬다.

남은 경로는 승률을 잃지 않고 시간을 만드는 것, 즉 콘텐츠다. §19가 처음 적었고
열네 번의 측정이 그 자리로 돌아왔다.

## 48. 결승선을 소탕 둘로 늘려도 아무 일도 없다 (음성 결과)

§47이 "남은 경로는 콘텐츠"라고 적었다. 새 문자열이 필요 없는 콘텐츠 하나를 시험했다 —
`SWEEPS_TO_SURVIVE`를 1에서 2로. 가격이 아니라 할 일을 더하는 쪽이다.

| | 승리 | brood 런 길이 | 중앙값 |
| --- | --- | --- | --- |
| 1 (현행) | 5/6 | 17.04 / 21.57 / 23.25 | 21.57 |
| 2 | 5/6 | 17.04 / 21.57 / 23.25 | 21.57 |

**자릿수까지 동일하다.** 런들이 이미 승리 시점에 소탕을 둘 이상 겪고 있으므로 둘을
요구해도 아무것도 막지 않는다. 지렛대가 무력하다.

부수적으로 알게 된 것: `SWEEPS_TO_SURVIVE = 1`이라는 조건은 실제로 걸린 적이 없다.
승리 판정에 있는 다섯 조건 중 이건 언제나 이미 참이다. 올려도 공짜지만 얻는 것도 없다.
공짜인 강화를 넣는 것과 아무것도 안 하는 것이 같으므로 넣지 않았다.

### 콘텐츠 경로에 남은 것

새 문자열 없이 시험할 수 있는 것은 이걸로 소진됐다. 진짜 막(幕)은 새 목표·새 한국어
문자열·막마다의 밸런스·매번의 재측정을 요구하고, 그건 §21이 "끝낼 수 없는 예산으로
시작할 일이 아니다"라고 적은 규모다. 첫 막(`updateFinal` → `chapter.final`)이 착지해
기제가 도는 것은 확인됐으니, 다음은 두 번째 막을 저작하는 일이다.


## 49. W2의 프레임을 찍었다 — 페이드 중인 오클루더 여덟과 오버레이 열다섯이 같은 프레임에

W3을 닫은 방식과 같다(§45): 조건을 만들고, 런타임 상태를 세고, 프레임을 남긴다.

경로 셋을 놓고 20초 돌린 뒤의 상태:

```
overlays=15  fadedOccluders=8  routes=3
```

- **오버레이 15개** — `depthTest:false`이고 보이는 메시. 경로 리본과 위협 링 슬롯이다.
- **페이드 중인 오클루더 8개** — `transparent`이고 불투명도 0.95 미만인데 `depthWrite`가
  켜진 프롭. 즉 카메라와 무언가 사이에 실제로 끼어 있는 것들이다.

**이 둘이 같은 프레임에 있다는 것이 W2가 말하는 조건 그 자체다.** `be8dda4` 이전이라면
그 여덟이 renderOrder 0에서 깊이를 쓰고, 뒤의 리본과 링을 기각했다. §3은 그 둘을
프롭이 가려서는 안 되는 것으로 명시한다.

`artifacts/evidence/completion/overlay/ribbon-over-props.png`.

정직하게: 이것은 픽셀 대조가 아니다. "리본의 어느 픽셀이 프롭 위에 있다"를 이미지에서
직접 검증하려면 수정 전후 프레임을 같은 시드·같은 카메라로 찍어 차분해야 하고, 그건
수정이 이미 착지한 지금 되돌려야만 가능하다. 여기 있는 것은 **조건이 갖춰진 프레임과
그 조건을 만드는 런타임 상태**이며, W3에 적용한 기준과 같다.

이로써 이 세션의 미검증 시각 항목 둘이 모두 닫힌다.

## 50. 사다리를 두 번 쫓아 두 번 다 프레임을 나쁘게 했다 — 문서를 강등한다

4차 아트 비평이 47을 매기며 원인을 지목했고, 그건 내 수정이다.

| 상태 | 플레이 영역 |
| --- | --- |
| 캐비닛 어둡게 (`969a504`) | L*<20이 **61.5 %** — §7 균일한 어둠 |
| 바닥 밝게 (`f2f7837`) | 평균 **L\* 50.2**, 바닥 패치 0.688 — 이 프로젝트가 이미 기각한 값보다 밝다 |
| 되돌린 뒤 (HEAD) | 프레임 평균 0.428 |

**같은 문서를 양쪽에서 만족시키려다 양쪽으로 넘어갔다.** `ART_BIBLE.md`의 사다리는
**밤 실내의 화면값**을 규정하는데 나는 두 번 다 **알베도**에 적용했다. §29에서 그 범주
차이를 스스로 적어놓고, 값을 고를 때마다 쓰지 않았다.

### 결정

`floorVinyl`을 `0x5b5a5e`로 되돌린다(측정 0.520, 밴드 중앙). 그리고 **사다리를 지배
제약에서 강등한다** — 측정된 밴드가 실제 제약이다. 캐비닛이 바닥보다 밝다는 순서 위반은
**의도적으로 열어둔다.** 어느 쪽에서 만족시켜도 프레임이 값을 치르므로, 알베도를 움직여
지킬 수 있는 제약이 아니다.

다음에 이걸 건드릴 사람은 **표면의 색이 아니라 그 표면을 비추는 것**을 바꿔야 한다.
그 기제는 `night.ts:119-138`에 "측정했더니 거의 아무것도 기여하지 않는데 이유를
모르겠다"로 기록돼 있다. 비평가의 두 번째 블로커가 정확히 그것이고, 디버그 순서까지
적어줬다 — 여섯 슬롯 강도를 0으로 두고 흰 하늘 스윕을 다시 돌려, 순수검정 비율이
그래도 안 움직이면 바인딩이 깨진 것이다.

### 이 세션에 대해

아트는 이 세션에서 유일하게 **시작보다 낮게 끝난** 분야다(52 → 47). 그리고 그 하락은
전부 내가 만든 것이다. 다른 분야가 오른 이유는 "있는데 실행되지 않던 것을 실행되게"
만들었기 때문이고, 아트에서 나는 **문서를 실행하려 했는데 그 문서가 다른 것을 말하고
있었다.**

## 51. 야간 조명 이분 탐색을 돌리려다 계측기에 걸렸다 (결론 없음)

4차 아트 비평의 두 번째 블로커는 `night.ts:119-138`이 "측정했더니 환경맵이 거의
기여하지 않는데 이유를 모르겠다"로 남겨둔 것이고, 비평가가 디버그 순서를 줬다 —
여섯 슬롯 강도를 0으로 두고 흰 하늘 스윕을 다시 돌려, 순수검정 비율이 그래도
안 움직이면 바인딩이 깨진 것이다.

돌렸다. 세 상태가 소수점 넷째 자리까지 같았다:

```
baseline             mean=0.4049  pureBlack=0.21%
lights-zero          mean=0.4049  pureBlack=0.21%
lights-zero+white    mean=0.4049  pureBlack=0.21%
```

"광원이 프레임에 기여하지 않는다"로 읽고 싶어지는 결과다. **읽지 않았다.**
확인해보니 내 치환이 노린 `light.intensity = ...` 패턴은 `lighting.ts`에 존재하지
않는다. **편집이 적용된 적이 없고, 세 측정은 아무것도 재지 않았다.**

이번 세션 스물한 번째 계측기 실패이고, 처음으로 **잘못된 결론을 적기 전에** 잡았다.
세 개의 동일한 숫자는 "변화 없음"이 아니라 "변화를 주지 않았음"이었다.

### 다음 사람에게

`grep -n intensity src/view/lighting.ts`로 실제 대입 지점을 먼저 확인할 것.
그다음 비평가의 순서를 그대로: (a) 여섯 슬롯 강도 0 → 순수검정 비율이 움직이는가,
(b) 안 움직이면 바인딩이 깨진 것, (c) 움직이면 원인은 콘 쪽이다.

그리고 이 항목이 아트 47의 근원이다. 알베도 두 번이 각각 프레임을 망쳤으므로(§50)
남은 지렛대는 조명뿐이고, 그 조명의 한 축이 죽어 있다고 기록돼 있다.

## 52. 환경맵은 "거의 기여하지 않는" 게 아니라 정확히 0을 기여한다 — 아트 47의 근원

§51에서 앵커를 틀려 아무것도 재지 못했다. `slot.intensity`(`lighting.ts:236`)로 다시 걸고
비평가의 순서를 그대로 돌렸다:

| 상태 | 프레임 평균 | 순수검정 |
| --- | --- | --- |
| A 기준선 | 0.4049 | 0.21 % |
| B 여섯 슬롯 강도 0 | **0.0119** | **84.05 %** |
| C B + 흰 하늘 | **0.0119** | **84.05 %** |

**B에서 방이 캄캄해진다** — 여섯 스포트라이트가 프레임의 거의 전부다. 그리고 **C가 B와
소수점 넷째 자리까지 같다.** 조명을 전부 끈 상태에서 하늘을 검정에서 흰색으로 바꿨는데
단 한 픽셀도 움직이지 않는다.

`night.ts:119-138`은 이것을 "측정했더니 거의 아무것도 기여하지 않는데 이유를 모르겠다"로
남겨뒀다. 답은 "거의"가 아니다. **정확히 0이다.** 환경 기여가 렌더에 도달하는 경로가
없다 — 값이 작은 것이 아니라 바인딩이 끊겨 있다.

### 왜 이것이 아트 47의 근원인가

§50이 기록한 대로 알베도로는 밴드를 지킬 수 없다. 두 방향 모두 프레임을 망쳤다.
그러면 남은 지렛대는 조명인데, 조명의 두 축 중 하나(환경/천공광)가 완전히 죽어 있으므로
**실제로 존재하는 지렛대는 여섯 개의 스포트라이트뿐**이다. 4차 비평의 표현대로,
그래서 "알베도가 누구에게나 유일한 레버"가 된다.

밤 실내는 방향광 여섯 개로 만드는 것이 아니라 낮은 천공광 위에 소수의 실용광을 얹어
만든다. 그 천공광이 0이면 어떤 알베도 배치도 §7과 밴드를 동시에 만족시킬 수 없고,
이 세션이 두 번 그걸 확인했다.

### 다음

이건 진단이지 수정이 아니다. 고칠 것은 환경 기여가 왜 렌더에 닿지 않는지다 —
`scene.environment` 대입, 재질의 `envMap`/`envMapIntensity`, 그리고 `NightStandardMaterial`이
`onBeforeCompile`로 셰이더를 갈아끼울 때 환경 항이 살아남는지. 마지막이 유력하다:
이 저장소는 그 재질을 위해 프로그램 캐시 키까지 손댔고, 환경 샘플링이 그 과정에서
빠졌다면 정확히 이 증상이 나온다.

### §52 후속 — 용의자를 좁혔고 검사는 못 했다

`scene.environment`는 `render.ts:124`에서 `buildScene`(:127)보다 **먼저** 설정된다.
순서 문제가 아니다.

남은 유력 용의자는 `night.ts:29`가 스스로 적어둔 것이다 — `customProgramCacheKey()`가
`onBeforeCompile.toString()`을 반환하므로 **모든 야간 재질이 프로그램 하나를 공유한다.**
그리고 같은 파일 :131이 이미 기록한다: `scene.environment`를 null로 토글해도, 
`envMapIntensity`를 1에서 6으로 올려도 아무것도 움직이지 않는다. 셰이더가 환경을
**샘플링하지 않는다**는 뜻이고, 공유 프로그램이 그 이유일 수 있다.

결정적 검사는 하나다: `NightStandardMaterial`을 평범한 `MeshStandardMaterial`로 갈고
같은 A/B/C를 돌려, C가 B와 갈라지는지 본다. 시도했고 **빌드가 깨졌다** — 재질 스펙의
`rim` 필드가 표준 재질에 없어서 단순 치환으로는 안 된다. 트리는 복원했다.

**가설은 검사되지 않았다.** 다음 사람은 `rim`을 무시하는 얇은 어댑터를 두고 갈아끼우거나,
`NightStandardMaterial` 하나에만 `customProgramCacheKey`를 지워 프로그램을 분리시킨 뒤
같은 프로브를 돌리면 된다.

### §52 확정 — 환경은 약한 게 아니라 연결돼 있지 않다

조명을 전부 끈 상태(`mean 0.0119`)에서 `scene.environmentIntensity = 40`을 걸었다.
**0.0119. 변화 없음.**

이제 네 가지 독립적 조작이 전부 무반응이다:

| 조작 | 결과 |
| --- | --- |
| 하늘 `#4d6b82` → `#ffffff` | 무변화 |
| `scene.environment = null` | 무변화 (저장소 기존 기록) |
| `envMapIntensity` 1 → 6 | 무변화 (저장소 기존 기록) |
| **`scene.environmentIntensity` 1 → 40** | **무변화** |

값의 문제가 아니다. 환경 항이 셰이더에 **존재하지 않는다.** `night.ts:131`이
"거의 기여하지 않는데 이유를 모르겠다"로 남긴 것은 이제 "기여 경로가 없다"로
확정됐고, 남은 질문은 왜 그 경로가 없느냐 하나다.

`scene.environment` 대입 시점은 아니다(`render.ts:124`가 `buildScene`보다 앞선다).
`envMapIntensity`도 아니다(반응 없음). 남은 것은 재질이 컴파일될 때 `USE_ENVMAP`
디파인이 서지 않는 경로이고, 이 저장소가 그 재질에 대해 손댄 것이 정확히 프로그램
캐시 키다(`night.ts:29`).

다음 사람이 처음 볼 한 줄: `NightStandardMaterial` 하나를 평범한
`MeshStandardMaterial`로 두고(스펙의 `rim`은 무시하는 어댑터로) 같은 프로브를 돌린다.
갈라지면 원인은 그 재질이고, 안 갈라지면 `makeGradientEnv`가 돌려주는 텍스처 쪽이다
— `pmrem.dispose()`가 `target.texture` 반환 앞에 있다.


## 53. 두 용의자를 모두 배제했다 — 환경이 죽은 이유는 아직 모른다

§52가 확정한 것(환경 기여가 정확히 0)에 대해 용의자 둘을 측정으로 검사했다.
둘 다 아니다.

| 검사 | 결과 |
| --- | --- |
| 조명 0 (대조) | mean **0.0119** |
| 조명 0 + `pmrem.dispose()` 제거 + 흰 하늘 | mean **0.0119** |

`pmrem.dispose()`가 `target.texture` 반환 앞에 있는 것은 원인이 아니다. 제거하고
하늘을 흰색으로 바꿔도 한 픽셀도 안 움직인다.

공유 프로그램 가설도 약하다 — 검증자가 지적한 대로 three.js는 `customProgramCacheKey`를
표준 파라미터 키에 **덧붙이지** 대체하지 않으므로, `USE_ENVMAP` 디파인은 그것과 무관하게
서야 한다.

### 남은 것

배제된 것: 대입 시점(`render.ts:124` < `buildScene`), `envMapIntensity`,
`scene.environmentIntensity`, `pmrem.dispose()` 순서, 그리고 (이론상) 프로그램 캐시 키.

다음에 볼 곳은 **재질이 실제로 어떤 프로그램으로 컴파일됐는지**다. 런타임에서
`renderer.info.programs`를 열어 `USE_ENVMAP`이 디파인에 있는지 직접 보는 것이 추측을
끝낸다. 그게 없으면 three.js가 이 재질들에 환경을 붙이지 않기로 결정한 것이고,
이유는 `NightStandardMaterial`의 생성 경로 어딘가에 있다.

이 세션은 여기까지 좁혔다. 네 번의 무반응 조작으로 증상을 확정했고, 두 개의 유력
용의자를 배제했다. 남은 것은 셰이더가 실제로 무엇으로 컴파일됐는지 보는 일이다.

### §53 후속 — 환경은 씬에 붙어 있다. 죽은 것은 대체 경로다

런타임 덤프:

```
scene.environment      설정됨 (텍스처)
environmentIntensity   1
표준 재질              3834개
envMap을 가진 재질     0개
표본                   type "MeshStandardMaterial", 생성자 W2 (= NightStandardMaterial)
```

**환경은 씬에 정상적으로 붙어 있다.** 재질이 자기 `envMap`을 들고 있지 않은 것도
정상이다 — three.js는 `material.envMap`이 없으면 `scene.environment`로 대체한다.

그러므로 배제가 하나 더 는다: **대입은 성공했다.** 죽은 것은 그 대체가 이 재질들의
셰이더에 도달하는 경로다. 생성자가 `W2`(minified `NightStandardMaterial`)라는 것이
같이 나왔으므로, 남은 곳은 그 서브클래스가 `onBeforeCompile`로 프래그먼트 셰이더를
갈아끼우는 지점 하나다.

재질이 3834개라는 것도 기록해 둔다 — 43개 스펙이 프롭마다 복제되어 그만큼 존재한다.
`onBeforeCompile`이 프로토타입에 있고 `customProgramCacheKey`가 하나로 접히는 이유가
그것이고, 그 설계 자체는 §22의 주석이 정당화한다.

**다음 한 줄**: `patch()`가 무엇을 `replace`하는지 읽고, 그 대상 문자열이 three.js
r185의 표준 프래그먼트에서 환경 항을 담고 있는 청크인지 확인한다. 담고 있다면
그것이 원인이고, 아니라면 남은 것은 `NightStandardMaterial`의 생성자뿐이다.

## §55 — 부팅 실패는 없었다. 계측기가 네 번 더 틀렸고, 그중 하나가 아트 47의 전제였다

§54는 "하네스 부팅 실패"를 기록하고 다음 세션에 확인하라고 남겼다. 확인했다. **실패는 없었다.**
네 개의 서로 다른 계측 오류가 겹쳐 있었을 뿐이다.

| # | 증상 | 실제 원인 |
| - | ---- | --------- |
| 22 | 탐침 출력이 0줄 | 탐침을 `/tmp`에 둬서 `@playwright/test` 해석 실패. 내 `grep`이 그 오류를 삼킴 — 탐침은 아무것도 검사한 적이 없다 |
| 23 | `window.__game` 30초 타임아웃 | `vite preview`는 `base:'./'`라 dist를 루트에 마운트한다. `/bug-game/`로 접근하니 index만 SPA 폴백으로 200이고 **번들은 404**였다 |
| 24 | Chrome `ERR_CONNECTION_REFUSED` | Chrome이 루프백에 못 간다. LAN IP(`172.30.1.44`)로는 즉시 성공 — 게임과 무관 |
| 25 | 캔버스 평균 휘도 0, 아주 어두운 픽셀 100% | WebGL 캔버스는 `preserveDrawingBuffer: false`라 `drawImage` 판독이 빈 화면을 준다 |

**25번이 중요하다.** 실제 Playwright 스크린샷의 평균 휘도는 **0.4103**, 아주 어두운 픽셀 **0.56%**다.
4·5차 패널이 보고한 "프레임 평균 0.0105"와 "여섯 스포트라이트 영구 강도 0"은 같은 종류의 판독일
가능성이 높다. **아트 47의 근본 원인으로 §52~§53에 적어 둔 "환경 기여가 정확히 0 / 캄캄한 프레임"은
전제부터 재검사해야 한다.** 실제 화면의 문제는 어둠이 아니라 그 반대다 — 바닥이 허옇게 날아가 있고
재질이 평평하다.

증거: `artifacts/evidence/mcp-playwright-pass/01-playable-frame.png` (1200x833, 플레이 중, 한국어 HUD).

### 정찰병 크기 — 사용자 보고를 수치로 확정했다

사용자가 "바퀴벌레 크기가 너무 작다"고 지적했다. 쟀다: 몸통이 **약 24 px**, 1200 px 폭 화면의 **2%**다.
4배 확대하면(`02-scout-zoom-4x.png`) 다리·더듬이·무늬가 모두 살아 있고 바퀴벌레로 잘 읽힌다.
**모델의 문제가 아니라 화면상 크기의 문제다.**

`src/view/roach.ts:29`의 `REFERENCE_BODY_MM = 35`를 올리는 것과 카메라를 당기는 것 두 가지 지렛대가
있다. 전자는 §10의 "곤충 크기로 느껴질 것"을 해치고 주방을 작아 보이게 한다. 후자는 물리적 정직성을
지키지만 **카메라+가림+플레이어 가시성 결합군**이라 한 명의 소유자가 순차로 만져야 한다(§9).
같은 파일 :31~42의 주석이 "카메라 프레이밍이 바뀌면 재도출하라, 눈대중으로 조정하지 말 것"이라고
명시하므로, 카메라를 당기면 limb 두께도 함께 재도출해야 한다.

### 다음 세션의 순서
1. `capture.mjs`의 휘도 게이트가 캔버스 판독을 쓰는지 확인한다 — 쓴다면 25번과 같은 함정이고 스크린샷 기반으로 바꿔야 한다.
2. `BASE_URL`이 실제로 마운트되는 경로인지 고정한다(23번 재발 방지). 서빙은 `/tmp/bg-serve/bug-game -> dist` 심볼릭 링크 + `python3 -m http.server`로 재현했다.
3. 그 뒤에 아트를 다시 진단한다. **§52~§53의 결론을 그대로 신뢰하지 말 것** — 그 측정들이 25번과 같은 계측을 썼는지부터 확인한다.
4. 정찰병 크기는 카메라 지렛대로 접근하고, 결합군 규칙에 따라 순차로 처리한다.

**이 세션까지 계측기를 스물다섯 번 틀렸다.** 이번 네 건은 전부 "게임이 망가졌다"로 보였고 전부 도구였다.
소스가 초록인데 런타임만 죽어 보이면, 게임보다 하네스를 먼저 의심하는 규칙이 다시 한번 옳았다.

## §56 — 휘도 게이트를 고쳤고, 이번엔 검증했다. 패널의 "0.0105"는 유지될 수 없다

§55에서 25번 계측 함정(WebGL 캔버스 `drawImage` 판독)을 확인한 뒤, 그 함정이 `capture.mjs:184`에
그대로 박혀 있는 것을 발견했다. 지난 세션에 넣은 휘도 게이트는 **미검증이 아니라 틀렸다** — 완전히
밝은 방에서도 0.0000을 읽어 앞으로의 모든 캡처 실행을 거짓으로 막았을 것이다.

수정: 캔버스가 아니라 **스크린샷을 잰다**. `page.screenshot()`의 인코딩된 바이트는 GL 버퍼 밖에
이미 존재하므로 `HTMLImageElement`로 합성하면 정확히 읽힌다.

검증 (BASE_URL=http://127.0.0.1:4280/bug-game/, 깨끗한 HEAD 빌드):

```
frame luminance: 0.4186
console errors : 0 []      failed requests: 0 []
console warns  : 0 []      external reqs  : 0 []
missing props  : 0 []      restarts equal : true
draw calls     : 323       triangles: 156262
GPU objects restart 1 -> 20: textures 27->27, geometries 121->121, materials 52->52, meshes 357->357
```

0.4186은 같은 빌드를 ImageMagick으로 독립 측정한 0.4103과 일치한다(런 시점이 다르므로 이 정도
근접이 옳다). **유효한 계측기 두 개가 서로를 확인했고, 둘 다 방이 밝다고 말한다.**

따라서 4·5차 패널의 "프레임 평균 0.0105 · 여섯 스포트라이트 영구 강도 0"은 **더 이상 확립된 사실로
취급하지 않는다.** 아트 47의 근본 원인은 §52~§53이 아니라 처음부터 다시 진단해야 한다. 실제 화면이
말하는 문제는 어둠이 아니라 그 반대다 — 바닥이 허옇게 날아가고 재질이 평평하다.

부수 관측: `05-colony-working` 시점의 `scoutHidden: true`. 은신 기제의 정상 동작인지, §10이 금지한
"정찰병이 지속적으로 가려짐"인지 아직 구분하지 않았다. 다음 패스의 확인 항목이다.

증거: `artifacts/evidence/mcp-playwright-pass/runtime/` (9장).
