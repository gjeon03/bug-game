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

**다음 차수 첫 항목 — 도출 방법**

풀이 전부 최대 크기로 채워진 상태의 geometry 수를 단위 테스트로 세운다. 알려진 조각:
부팅 121(20회 재시작에서 안정), 리본 풀 `createRouteView(maxRoutes = 24)`에서 최대 24.
121 + 24 = 145는 관측된 162보다 작으므로 **다른 지연 생성 뷰가 17개 이상을 더 만든다** —
그게 무엇인지가 답해야 할 질문이다. 세 번 시도한 브라우저 탐침이 세 번 다 잘못된 전역
필드를 읽어 실패했다(`__game.renderer.three`, `__game.step` 둘 다 없음). §13대로,
탐침을 먼저 검증하고 나서 잰다.
