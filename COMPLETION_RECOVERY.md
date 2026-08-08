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
