# Localization spec — Korean (ko) as the default and only shipped language

**Status:** draft for owner review. Catalogs written, **not wired in**.
**Deliverables:** `src/i18n/ko.ts`, `src/i18n/en.ts` (349 keys each, verified identical and in the same order), this spec.
**Scope:** every player-facing string in `index.html`, `src/style.css`, `src/ui/*.ts`, `src/main.ts`, `src/sim/*.ts`, `src/render/renderer.ts`.

---

## 0. Headline numbers

| | |
|---|---|
| Player-facing string **sites** found in source | **352** |
| Unique **catalog keys** authored | **349** |
| — of which extracted from source | **335** |
| — of which newly authored (`error.*`, `a11y.hudRegion`, `.short` overflow variants) | **14** |
| Sites collapsed into an existing key (duplicates + English-only plural branches) | **17** |
| Strings that could **not** be classified as player-facing | **0** (12 candidates ruled out — see §6) |
| Slots measured against 1280×720 | 11 |
| Flagged overflow risks | **2 hard, 3 watch** |

Key parity is machine-checkable:

```
node -e "const f=p=>[...require('fs').readFileSync(p,'utf8').matchAll(/^  '([^']+)':/gm)].map(m=>m[1]);
const ko=f('src/i18n/ko.ts'),en=f('src/i18n/en.ts');
console.log(ko.length,en.length,ko.every((k,i)=>en[i]===k))"
# → 349 349 true
```

---

## 1. Glossary

Decided **in context**, for a cold, tense, observational strategy game whose antagonist is an ordinary Korean household that does not know you exist. HUD labels are held to 2–4 syllables. Native Korean is preferred over a Sino-Korean compound wherever it reads tighter or colder.

| English | **Korean (chosen)** | Rejected | Rationale |
|---|---|---|---|
| colony | **군체** | 식민지 (reads as colonisation), 집단 (generic), 무리 (animal pack) | 군체 is the real biological term for a social-insect colony and is the one word that treats the roaches as a single organism — which is the whole premise. 2 syllables, fits the HUD. |
| brood | **부화** | 알 (the objects, not the process), 유충 (larva — taxonomically wrong for roaches), 산란 (the laying, not the maturing) | The meter is a 0–100 % progress bar toward the next hatch, so name the *process*. Family label stays 번식 (breeding). |
| moisture | **수분** | 물 (the game deliberately never says "water" — it means condensation, drips, damp), 습기 (atmospheric humidity, not a carryable resource) | 수분 is moisture *as substance you can gather*. 2 syllables and pairs cleanly with 먹이. |
| exposure | **노출** | 발각 (that is *being spotted*, a different state the HUD already has), 노출도 (3 syllables, adds nothing) | Exposure is the continuous risk quantity; 발각 is the discrete event. Keeping them separate keeps the status line honest. |
| suspicion | **의심** | 경계 (alert/vigilance — describes the household's posture, not what they believe), 눈치 (too colloquial for a stat) | 의심 is what they *think*; the tier names carry the escalation. Prose and the `최고 의심도` stat only — the gauge itself shows a tier name, never the word. |
| evidence | **흔적** | 증거 (courtroom/forensic register — far too formal for crumbs and droppings), 자국 (one physical mark, too narrow) | 흔적 = the traces you leave behind. Native, cold, and it is literally what the game models: droppings, traffic, corpses. |
| pheromone trail | **페로몬 길** (short: **길**) | 페로몬 흔적 (collides with evidence), 경로 (navigational/sterile), 동선 (corporate), 자취 (literary) | 길 is one syllable and grammatically frictionless in every sentence the game needs: 길을 놓다 / 지우다 / 길 3개. |
| foothold | **거점** | 발판 (a literal step, physical not strategic), 교두보 (beachhead — 4 syllables, too grand for a crack) | 거점 is the standard strategic term for a held forward position. Exactly what a claimed, fitted-out crack is. |
| adaptation | **적응** | 진화 (overclaims — these are within-run), 변이 (implies randomness; these are chosen), 특화 (that is the *act*, used in the choice header) | Literal, correct, 2 syllables, and it keeps 특화 free for "the colony is specialising". |
| extermination | **박멸** | 방역 (professional/clinical — right for the *company*, too soft for the event), 소독, 퇴치 (too mild) | 박멸 is the word Korean pest-control marketing actually uses about roaches. Terminal, 2 syllables, and it is the top tier *and* the final operation. |
| household routine | **집안 일과** (short: **일과**) | 루틴 (loanword, reads gym/self-help), 생활 습관 (clinical), 집안일 (chores only — a midnight snack is not a chore) | 일과 is the daily round of a household. 2 syllables short-form fits the checklist slot. The household itself is **집** (metonymy, as in the English "the house is awake"). |
| scout | **정찰병** | 척후병 (archaic, players may not parse), 탐색자 (translationese), 정찰 (the act, not the actor) | The colony is framed as an army throughout (군체 / 거점 / 작전 / 박멸). 정찰병 is the one soldier you actually control. |
| worker | **일꾼** | 일개미 (worker *ant* — wrong species), 일벌 (worker bee), 노동자 (sociopolitical), 일벌레 (means "workaholic") | Native, 2 syllables, warm and concrete against the cold system words. |
| nymph | **약충** | 유충 (larva — roaches are hemimetabolous, they have no larval stage), 새끼 (too soft for this voice) | 약충 is the correct Korean entomological term. Fallback if playtest shows confusion: 새끼. |
| nest | **둥지** | 소굴 (den/lair — pejorative, and it is the *household's* word; reserved for their voice), 서식지 (clinical), 보금자리 (cosy) | 둥지 is the readable, standard game term for the thing that has capacity and can be destroyed. |
| crack | **틈** | 균열 (structural fissure, Sino, colder than needed), 갈라진 틈 (redundant) | 1 syllable, native, and the physical object the player claims. The home nest is labelled **본거지** rather than "본거지 틈" — shorter and it *is* the home. |
| region / territory | region **구역** / territory **영역** | 지역 (broad geographic), 영토 (nation-state scale) | 구역 is a demarcated part of one room — exactly the eight kitchen zones. 영역 stays for the abstract system so the two never collide in one sentence. |
| hold | **장악** | 점령 (implies a completed capture event; hold is continuous and reversible), 확보 (bland), 유지 (only the maintaining half) | 장악 = holding control over. Reads correctly as a live percentage: 장악 82%. |
| capacity | **수용력** | 정원 (administrative/school register), 한계 (bare "limit") | 수용력 is how many bodies the nests can hold. Only ever appears in prose, never as a HUD label. |
| upkeep | **유지비** | 소모 (consumption), 유지 비용 (spaced-out, longer) | Reads instantly on an adaptation downside: 유지비 +25%. |
| sprint | **질주** | 전력질주 (4 syllables — overflows the meter label), 대시 (loanword) | 2 syllables, and 질주 already means running flat out, so the intensifier is wasted. |
| stamina | **체력** | 스태미나 (4-syllable loanword), 지구력 (endurance, not burst) | Standard Korean game term. Note: the meter is labelled **질주** (what the bar is *for*), not 체력 — the player spends it to sprint. |
| delivery | **운반** | 배달 (unavoidably reads as food-delivery apps — comic in this register), 수송 (military logistics, too heavy for one roach and a crumb) | 운반 is hauling something from A to B. The counter is 운반 횟수. |
| source | **공급원** | 자원지 (translationese), 채집지 (textbook) | Covers both 먹이 공급원 and 수분 공급원 with one word. |
| cache | **창고** | 저장고 (3 syllables, no gain), 캐시 (loanword — means CPU cache in Korean tech usage) | 2 syllables, unambiguous, and a store-room in a wall reads perfectly. |
| nursery | **부화실** | 육아실/육아방 (human daycare register), 산란실 (fish-hatchery register), 알방 (cute — undercuts the tone) | A hatching chamber. Matches the brood meter (부화) so the causal link is visible in the words. |
| bolt-hole | **대피소** | 은신처 (would collide with the 은신 adaptation family), 도피처 (flight, not shelter) | 대피소 is where you go when something lethal is passing overhead — which is exactly the mechanic during the spray. Its air-raid connotation is a feature here. |
| operation | **작전** | 임무 (mission — too close to "objective"), 단계 (phase — loses the deliberateness), 오퍼레이션 | 2 syllables, military, and it frames a run as four planned pushes rather than four chapters. |
| objective | **목표** | 임무 (collides with 작전), 목적 (purpose, not target), 할 일 (to-do list, too casual) | The one thing to do right now. |
| trap | **덫** (sticky trap: **끈끈이**) | 트랩 (loanword), 함정 (a pit/ruse, not a device) | 덫 is the mechanical noun, 1 syllable. 끈끈이 is the actual product Korean households buy for roaches — used wherever the fiction is showing. |
| spray | **살충제** | 스프레이 (generic loanword — could be any aerosol), 약 (real Korean idiom "약을 친다", kept for flavour lines only) | 살충제 names the thing in the can, coldly. The idiom 약을 친다 is used once, in the extermination forecast, where the register should drop. |
| cleaning / wipe-down | **걸레질** | 청소 (too generic — the household does several kinds), 물청소 (longer, no gain), 대청소 | 걸레질 is a wet rag going across a floor. Native, concrete, and every Korean player knows it takes everything on the tile with it — which is precisely what the sweep does to pheromone. |

### Supporting terms decided at the same time

| English | Korean | Note |
|---|---|---|
| cockroach / roaches | **바퀴** (first mention 바퀴벌레) | Counts drop the noun entirely: `24마리`. |
| bait | **독먹이** | Distinguishes it from 먹이 (your food) in one glyph. |
| patrol | **순찰** | Standard. |
| cover (verb/mechanic) | **엄폐** | Military; pairs with 노출 as its opposite. |
| spotted / seen | **발각** | Discrete event, 2 syllables, cold. |
| larder / reserve | **곳간** / **창고** | 곳간 for the food store in prose ("The larder is full"), 창고 for the cache building. |
| game title | **걸레받이 제국** | Faithful — 걸레받이 is the real, faintly grimy word for a skirting board. Alternatives if the owner wants a punchier wordmark: **틈새 제국** ("empire of the cracks"), **벽 밑 제국**. Flagged as a branding decision, not a translation one. |

---

## 2. Length budget

Measured with a width model calibrated to the shipped stack (`ui-sans-serif` / system Korean fallback): Hangul syllable = **1.00 em**, Latin lowercase 0.55, uppercase 0.68, digit 0.56, space 0.28, em-dash 1.00, other punctuation 0.42. Budgets below are **em at that slot's own font-size**, so they can be compared directly to the numbers in the last column.

### Fixed-width HUD slots

| Slot | CSS | Usable width | Font | Budget | Worst measured | Verdict |
|---|---|---|---|---|---|---|
| Meter label | `.meter .label`, `min-width:208px` grid | 182 px | 10.5 px + 0.09em | **15.9 em** | 3.0 em (`페로몬`) | ✅ huge headroom |
| Meter numerals | `.meter .num`, `min-width:62px` | 62 px | 12 px mono | n/a | numeric only | ✅ not localized |
| Scout status line | `.statusline` in `.bl` panel | 208 px | 11 px | **18.9 em** | 15.7 em (`hud.scout.trapped`) | ⚠️ watch (§3-C) |
| Alert tier name | `#suspicion .tier-name` | ~162 px after icon + pips + `· 100` | 12 px + 0.05em | **13.5 em** | 4.3 em (`바퀴 의심`) | ✅ |
| Evidence row / forecast row | `#suspicion .cause`, `.next`, `width:252px` | 234 px text column | 11 px | **21.3 em/line**, 2 lines = 42.5 | **45.6 em composed** | 🚩 **overflow (§3-A)** |
| Counterplay row | `#suspicion .counter` | 234 px | 11.5 px | 20.3 em/line, 2 lines = 40.7 | 27.8 em | ✅ 2 lines |
| Operation title | `#phase .op` | panel grows; keep ≤ 300 px | 12 px + 0.12em | **22.3 em** | 7.3 em | ✅ |
| Checklist label | `#phase .checklist li` (label column) | 144 px | 12 px | **12.0 em** | 8.3 em (`박멸에서 살아남기`) | ✅ |
| Next-unlock line | `#phase .unlock`, `max-width:280px` | 280 px | 11 px | **25.4 em/line**, 2 lines = 50.9 | 26.9 em → 2 lines | ✅ |
| Blocker line | `#blocker` in `.bc` | 620 px | 12.5 px | **49.6 em/line** | 37.1 em | ✅ 1 line |
| Objective line | `#objective` in `.bc`, `max-width:min(620px,70vw)` | 620 px @1280 | 14 px | **44.3 em/line** | **46.4 em composed** | 🚩 **overflow (§3-B)** |
| Interact prompt pill | `#prompt` in `.bc` | 620 px | 13 px | 47.7 em | 16.9 em | ✅ |
| Toast / hint | `#toast` in `.bc` | 620 px | 12.5 px | 49.6 em | 29.4 em | ✅ |
| Tutorial pill | `#tutorial` in `.bc` | 592 px | 13.5 px | 43.8 em | 20.8 em | ✅ (all beats ≤ 21 em by design) |
| Choice card name | `.choice .opt .name`, `width:224px` | 196 px | 14 px bold | **14.0 em** | 5.6 em | ✅ |
| Choice card cost | `.choice .opt .cost` | 196 px | 11 px mono | 17.8 em | ~10 em | ✅ |
| Choice card blurb / downside | `.choice .opt .blurb`, `.down` | 196 px | 12 px | **16.3 em/line**, 3 lines = 49 | 27.2 em → 2 lines | ✅ |
| Choice header | `.choice-head` | ≤ 696 px (3 cards + gaps) | 13 px + 0.12em | 53.5 em | 22.0 em | ✅ |
| World-space guide label | canvas `fillText` | grows to fit, clamped to viewport | 11 px | soft | 10.9 em | ✅ |
| End-card stat key | `.stats .k` inside `.card` (680 px) | auto-fit grid | small | soft | 6 em (`최고 의심도`) | ✅ |

### Slots that are *not* clipped but grow their container

`.statusline`, `#phase .op` and `#suspicion .tier-name` have no `max-width`. Korean text longer than the budget will **widen the corner panel** rather than clip. At 1280×720 the bottom-centre objective occupies x ∈ [330, 950]; the bottom-right panel starts at `1280 − 14 − width`. A `.br` panel wider than **316 px** begins to collide with the objective. All Korean values are well under that; the budget above is what keeps it true.

---

## 3. Flagged overflow risks

### 🚩 A. Household forecast — `alert.forecast.withPlace` (HARD)

Composed at runtime by `src/sim/director.ts:366` from four catalog strings. Worst realistic combination:

```
바퀴 의심 — 맨바닥에서 들린 부스럭 소리, 식기세척기 쪽이 제일 심하다. 독먹이, 더 나빠지면 살충제.
```

**45.6 em against a 21.3 em line → 3 rendered lines** in a 252 px fixed-width row. The English original is also long, but Korean has no short function words to absorb the pressure, and the row is the one the player reads under threat. Three lines pushes the top-right panel down over the alert bar.

**Shorter variant shipped:** `alert.forecast.withPlace.short` — 37.5 em → 2 lines.

```
바퀴 의심 · 맨바닥에서 들린 부스럭 소리 · 식기세척기. 독먹이, 더 나빠지면 살충제.
```

Recommended rule for the integrator: use `.short` whenever `place` is non-null **and** `cause` is one of `noise` / `depleted` / `seen` (the three longest cause strings). Everything else fits the long form in 2 lines.

### 🚩 B. Capped-reserve objective — `objective.capped.capacity` (HARD)

`src/sim/operations.ts:758`. Composed worst case:

```
두 창고가 다 찼고 둥지도 24에서 꽉 찼다. 병목은 수용력이다 — 아일랜드 틈에 먹이 38, 수분 24이 든다.
```

**46.4 em against 44.3 em** → wraps to 2 lines. The objective is designed as a single-line instruction; a two-line objective visibly shoves the tutorial/toast stack. It also degrades further below 900 px viewport width, where `.bc` is `70vw` (at 800 px wide the budget drops to ~40 em and three more strings join this list).

**Shorter variant shipped:** `objective.capped.capacity.short` — 30.9 em, comfortably one line.

Same treatment applied pre-emptively to `objective.capped.milestone` (37.9 em, 0.86 lines — fits at 1280, overflows at 900) → `objective.capped.milestone.short` at 20.5 em.

### ⚠️ C. Scout status line — `hud.scout.trapped` (WATCH)

15.7 em against an 18.9 em budget: it fits, but it is the only status line carrying two Latin tokens (`SHIFT`, a percentage) plus Korean, and it renders at the exact moment the player is panicking. If the Korean font falls back to a wider face it will widen the bottom-left panel.
**Shorter variant shipped:** `hud.scout.trapped.short` at 12.2 em.

### ⚠️ D. Routine objective concatenation (WATCH)

`op.action.routineIncoming` and `objective.routine.incoming` splice a routine **title** and its full **counterplay** into one objective line: worst case 40.1 em of a 44.3 em budget. No headroom for a longer counterplay rewrite later. Do not lengthen `routine.*.counter` without re-measuring.

### ⚠️ E. Viewport below 900 px (WATCH)

`@media (max-width: 900px)` already shrinks `#hud` to 12 px and the meters to 168 px, but `#objective` is pinned at 14 px and `.bc` becomes `70vw`. Recommend adding `#objective { font-size: 13px }` to that block for Korean, which restores ~7 % of the line budget.

---

## 4. Required CSS changes for Korean (non-optional)

These are not cosmetic — without them the Korean copy renders badly regardless of catalog quality.

1. **`word-break: keep-all; line-break: strict;`** on `#objective`, `#tutorial`, `#toast`, `#blocker`, `#suspicion .cause`, `#suspicion .next`, `#phase .unlock`, `.choice .opt .blurb`, `.choice .opt .down`, `.card p`, `.criteria li`.
   Browsers break Korean **mid-word** by default (CJK line-breaking). `keep-all` breaks at spaces instead. This is the single highest-impact change in the whole port.
2. **Drop `letter-spacing`** on `.meter .label` (0.09em), `#suspicion .tier-name` (0.05em), `#phase .op` (0.12em) and `.choice-head` (0.12em) — or cut it to ~0.02em. Latin tracking is there to make small-caps legible; Hangul syllables are already wide and tracking makes them read as unrelated glyphs.
3. **`text-transform: uppercase` is a no-op** on Hangul (`.meter .label`, `#suspicion .tier-name`, `#phase .op`, `.choice-head`). Harmless, but the emphasis it used to carry is gone — those four slots lose their "this is a label" signal. Compensate with weight (`font-weight: 650`) rather than tracking.
4. **Add a Korean font stack**: `'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', …` ahead of the current `--sans` fallbacks. The current stack resolves to a system Korean face on every target OS, but unpredictably — and the width budget above assumes ~1.0 em per syllable, which a wider fallback breaks.
5. **`html lang`** must become `ko` (`index.html:2`) so the browser picks Korean line-breaking and font hinting.

---

## 5. Code-shape changes the Korean catalog makes possible

Not required, but the catalog is already shaped for them and they remove three classes of English-only branching:

| Site | English-only construct | Korean equivalent |
|---|---|---|
| `sim/operations.ts:175` | `food line${need > 1 ? 's' : ''}` | `op.gate.foodLine` takes `{count}`; no branch |
| `sim/operations.ts:201` | `${need} roaches` | `op.gate.population` / `unit.roaches` |
| `ui/overlays.ts:213` | `roach${count === 1 ? '' : 'es'}` | `outcome.killedBy` takes `{count}` |
| `render/renderer.ts:1467` | `tile${tiles === 1 ? '' : 's'}` | `hud.guide` takes `{tiles}` |
| `sim/operations.ts:153` | `sentence()` uppercases a zone name | **delete** — Hangul has no case; the helper is a no-op and its two call sites (`:392`, `:398`) can pass the name straight through |
| `sim/operations.ts:637–641`, `:658`, `:702` | `kind === 'food' ? 'Food' : 'Moisture'` string-building | dedicated keys per branch (`objective.shortage.food` / `.water` etc.) — the Korean particles differ, so the noun cannot be interpolated |

**Particle warning for the integrator:** Korean object/subject particles (을/를, 이/가, 은/는, 와/과) depend on whether the preceding syllable ends in a consonant. Any key that interpolates a *place or item name* mid-sentence has the particle baked into the template, chosen to fit the actual label set (all six crack labels end in 틈, all eight zone labels end in 쪽). **If a new nest/zone/resource label is added, re-check every template that interpolates it.** The affected keys are: `op.action.claimCrackInZone`, `op.action.routeZone`, `op.blocker.zoneContested`, `objective.capped.territory`, `objective.final.sprayOnZone`, `objective.final.regain`, `hud.target.claim`, `hud.target.fit`.

---

## 6. Extraction inventory (`file:line → key`)

352 sites. Grouped by file, in source order.

### `index.html` (5)

| Line | Key |
|---|---|
| 2 | `meta.lang` (attribute `lang="en"` → `ko`) |
| 9 | `meta.description` |
| 11 | `meta.title` |
| 19 | `a11y.canvas` |
| 23 | `meta.noscript` |

### `src/style.css` (1)

| Line | Key |
|---|---|
| 185 | `hud.meter.critical` (`content: ' ⚠ CRITICAL'`) |

`:721` `content:'✓'` and `:727` `content:'✕'` are locale-neutral glyphs — **not** localized.

### `src/ui/hud.ts` (28)

| Line | Key |
|---|---|
| 33 | `hud.meter.food` |
| 34 | `hud.meter.water` |
| 35 | `hud.meter.colony` |
| 36 | `hud.meter.brood` |
| 44 | `alert.tier.0` *(static markup, duplicate)* |
| 57 | `hud.evidence.none` *(static markup, duplicate of :181)* |
| 58 | `alert.response.0` *(static markup, duplicate)* |
| 65 | `hud.meter.sprint` |
| 66 | `hud.meter.pheromone` |
| 67 | `hud.scout.ready` *(static markup, duplicate of :151)* |
| 83 | `op.title` + `op.1.title` *(static markup, duplicate)* |
| 151 | `hud.scout.ready` |
| 152 | `hud.scout.dead` |
| 154 | `hud.scout.trapped` |
| 155 | `hud.scout.seen` |
| 156 | `hud.scout.exposed` |
| 157 | `hud.scout.laying` |
| 181 | `hud.evidence.none` |
| 213 | `unit.food` |
| 215 | `unit.water` |
| 213–216 | `hud.prompt.costSuffix` |
| 222 | `hud.prompt.inspect` |
| 240 | `hud.theyAreComing` |
| 240 | `hud.next` |
| 289 | `unit.costBoth` |
| 295 | `hud.choice.adaptation` |
| 309 | `unit.costBoth` *(same key)* |
| 314 | `hud.choice.fitOut` |

`:76` `'…'` is a placeholder glyph — not localized.

### `src/ui/overlays.ts` (60)

| Line | Key |
|---|---|
| 9–14 | `outcome.death.foot` / `.trap` / `.spray` / `.bait` / `.starve` / `.thirst` |
| 29–35 | `control.move` / `control.lay` / `control.erase` / `control.interact` / `control.sprint` / `control.pause` / `control.restart` |
| 104 | `pause.heading` |
| 105 | `pause.wordmark` |
| 106 | `pause.lede` |
| 108 | `pause.controlsHeading` |
| 111 | `pause.resume` |
| 112 | `pause.restart` |
| 120 | `pause.help.heading` |
| 122 | `pause.help.title` |
| 124 | `pause.help.lede` |
| 125 | `pause.help.linking` |
| 126 | `pause.help.evidence` |
| 128 | `pause.help.back` |
| 146 | `op.cardTitle` |
| 154 | `op.card.stat.colony` |
| 155 | `op.card.stat.food` |
| 156 | `op.card.stat.water` |
| 157 | `op.card.stat.adaptations` |
| 158 | `op.card.stat.deliveries` |
| 159 | `op.card.stat.lost` |
| 161 | `op.card.continue` |
| 173 | `outcome.win.title` |
| 175 | `outcome.lose.collapse.title` |
| 177 | `outcome.lose.nestDestroyed.title` |
| 177 | `outcome.lose.exterminated.title` |
| 180 | `outcome.win.lede`, `outcome.win.ledeZones` |
| 182 | `outcome.lose.collapse.lede` |
| 184 | `outcome.lose.nestDestroyed.lede` |
| 185 | `outcome.lose.exterminated.lede` |
| 206 | `outcome.win.heading`, `outcome.lose.heading` |
| 206 | `outcome.subheading` |
| 213 | `outcome.killedBy` |
| 214 | `outcome.killedByNothing` |
| 217 | `outcome.topEvidence` |
| 229 | `outcome.zoneLine` |
| 235 | `outcome.became` |
| 238 | `outcome.neverSpecialised` |
| 241 | `outcome.stat.runTime` |
| 242 | `outcome.stat.deliveries` |
| 243 | `outcome.stat.hatched` |
| 244 | `outcome.stat.lost` |
| 245 | `outcome.stat.scoutDeaths` |
| 246 | `outcome.stat.peakSuspicion` |
| 247 | `outcome.stat.trapsSprung` |
| 248 | `outcome.stat.peakColony` |
| 250 | `outcome.best`, `outcome.best.survived`, `outcome.best.lost` |
| 252 | `outcome.restart` |
| 253 | `outcome.help` |
| 268 | `settings.master` |
| 269 | `settings.music` |
| 270 | `settings.sfx` |
| 271 | `settings.muted` |
| 272 | `settings.reducedShake` |
| 273 | `settings.reducedFlash` |
| 274 | `settings.highContrast` |
| 275 | `settings.showPerf` |

### `src/main.ts` (3)

| Line | Key |
|---|---|
| 194 | `hint.adaptCost` |
| 195 | `hint.tooPoorAdapt` |
| 201 | `hint.tooPoorFit` |

### `src/sim/suspicion.ts` (18)

| Line | Key |
|---|---|
| 78–82 | `alert.tier.0` … `alert.tier.4` |
| 86–90 | `alert.response.0` … `alert.response.4` |
| 94 | `alert.cause.seen` |
| 95 | `alert.cause.corpse` |
| 96 | `alert.cause.traffic` |
| 97 | `alert.cause.depleted` |
| 98 | `alert.cause.trap` |
| 99 | `alert.cause.expansion` |
| 100 | `alert.cause.noise` |
| 101 | `alert.cause.droppings` |

### `src/sim/adaptations.ts` (27)

| Lines | Keys |
|---|---|
| 39–41 | `adaptation.brood1.name` / `.blurb` / `.downside` |
| 49–51 | `adaptation.brood2.*` |
| 59–61 | `adaptation.brood3.*` |
| 71–73 | `adaptation.forage1.*` |
| 81–83 | `adaptation.forage2.*` |
| 91–93 | `adaptation.forage3.*` |
| 103–105 | `adaptation.shadow1.*` |
| 113–115 | `adaptation.shadow2.*` |
| 123–125 | `adaptation.shadow3.*` |

### `src/sim/colony.ts` (19)

| Line | Key |
|---|---|
| 225 | `hud.target.sealed` |
| 237 | `hud.target.claim` |
| 249 | `hud.target.fit` |
| 261 | `hud.target.repair` |
| 280 | `hud.target.resource` |
| 300 | `hint.nothingHere` |
| 308 | `hint.sealed` |
| 317 | `hint.resource` (+ `unit.foodNoun` / `unit.waterNoun`) |
| 329 | `hint.repairCost` |
| 336 | `hint.repaired` |
| 343 | `hint.fitCost` |
| 350 | `hint.fitChoose` |
| 358 | `hint.claimCost` |
| 402 | `foothold.nursery.name`, `foothold.nursery.blurb` |
| 403 | `foothold.cache.name`, `foothold.cache.blurb` |
| 405–406 | `foothold.bolthole.name`, `foothold.bolthole.blurb` |

### `src/sim/operations.ts` (87)

| Line | Key |
|---|---|
| 175 | `op.gate.foodLine`, `op.gate.waterLine` |
| 180 | `op.action.findSource` |
| 185 | `op.action.layTrail` |
| 186 | `op.action.bringScentHome` |
| 190 | `op.blocker.routesFull` |
| 193 | `op.blocker.trailUnfinished` |
| 201 | `op.gate.population` |
| 203 | `op.action.keepBothFlowing` |
| 207 | `op.blocker.capacityFull` |
| 209 | `op.blocker.waterTooLow` |
| 210 | `op.blocker.foodTooLow` |
| 223 | `op.1.title` |
| 225 | `op.1.brief` |
| 226 | `op.1.unlock` |
| 232 | `op.2.title` |
| 234 | `op.2.brief` |
| 236 | `op.2.unlock` |
| 240 | `op.gate.routines` |
| 244 | `op.action.waitForRoutine` |
| 246 | `op.action.routineIncoming` |
| 247 | `op.action.routineOpen` |
| 252 | `op.blocker.routesFullSpill` |
| 264 | `op.gate.foothold` |
| 269 | `op.action.claimNest` |
| 270 | `op.action.scoutForCrack` |
| 276 | `op.blocker.nestCostFood` |
| 279 | `op.blocker.nestCostWater` |
| 298 | `op.3.title` |
| 300 | `op.3.brief` |
| 301 | `op.3.unlock` |
| 306 | `op.gate.adaptations` |
| 309 | `op.action.pickAdaptation` |
| 312 | `op.action.growToMilestone` |
| 313 | `op.action.keepGrowing` |
| 318 | `op.blocker.adaptCostFood` |
| 321 | `op.blocker.adaptCostWater` |
| 329 | `op.gate.functions` |
| 333 | `op.action.fitOutHere` |
| 335 | `op.action.claimThenFit`, `op.action.claimAnother` |
| 341 | `op.blocker.fitCostFood` |
| 343 | `op.blocker.fitCostWater` |
| 366 | `op.4.title` |
| 367 | `op.4.brief` |
| 368 | `op.4.unlock` |
| 373 | `op.gate.zones` |
| 377 | `op.action.holdWhatYouHave` |
| 379 | `op.action.holdInsurance` |
| 387 | `op.action.claimCrackInZone` |
| 390 | `op.action.routeZone` |
| 392 | `op.action.zoneEmpty` |
| 393 | `op.action.zoneStaff` |
| 398 | `op.blocker.zoneContested` |
| 429 | `op.gate.survive` |
| 436 | `op.action.shelterNow` |
| 437 | `op.action.triggerFinal` |
| 440 | `op.blocker.noShelter` |
| 524 | `op.title` |
| 525 | `op.complete` |
| 559 | `objective.final.sprayOnZone` |
| 564 | `objective.final.regain` |
| 565 | `objective.final.holding` |
| 571 | `objective.final.slipping` |
| 576 | `objective.final.stayHidden` |
| 592 | `objective.adaptation.choose` |
| 597 | `op.blocker.adaptationSaving` |
| 599 | `op.blocker.shortfallFood` |
| 600 | `op.blocker.shortfallWater` |
| 619 | `objective.routine.incoming` |
| 622 | `objective.routine.active` |
| 625 | `objective.routine.harvesting` |
| 637 | `objective.shortage.food`, `objective.shortage.water` |
| 640 | `objective.shortage.noFoodLine`, `objective.shortage.noWaterLine` |
| 641 | `objective.shortage.foodBehind`, `objective.shortage.waterBehind` |
| 659 | `objective.saving.food`, `objective.saving.water` |
| 671 | `objective.saving.forAdaptFood`, `objective.saving.forAdaptWater` |
| 702 | `objective.capped.subjectBoth`, `.subjectFood`, `.subjectWater` |
| 708 | `objective.capped.adaptation` |
| 719 | `objective.capped.claim` (+ `unit.costBothProse`) |
| 729 | `objective.capped.fit` |
| 737 | `objective.capped.repair` |
| 754 | `unit.costBothProse` |
| 758 | `objective.capped.capacity` |
| 766 | `objective.capped.milestone` |
| 774 | `objective.capped.territory` |
| 784 | `objective.capped.hold` |

### `src/sim/routines.ts` (10)

| Line | Key |
|---|---|
| 73 | `routine.snack.title` |
| 74 | `routine.snack.warning` |
| 76 | `routine.snack.counter` |
| 97 | `routine.dishes.title` |
| 98 | `routine.dishes.warning` |
| 100 | `routine.dishes.counter` |
| 114 | `routine.trash.title` |
| 115 | `routine.trash.warning` |
| 116 | `routine.trash.counter` |
| 217 | `routine.gone` |

### `src/sim/director.ts` (27)

| Line | Key |
|---|---|
| 251 | `threat.counter.patrol` |
| 258 | `threat.counter.sweep` |
| 264 | `threat.counter.trap` |
| 269 | `threat.counter.bait` |
| 276 | `threat.counter.spray` |
| 318 | `threat.counter.final` |
| 357 | `alert.forecast.final` |
| 358 | `threat.advice.final` |
| 366 | `alert.forecast.withPlace`, `alert.forecast.withCause` |
| 367 | `alert.forecast.bare` |
| 381 | `threat.advice.trapOnRoute` |
| 382 | `threat.advice.baitOnRoute` |
| 390 | `threat.advice.sweepIncoming` |
| 397 | `threat.next.unknown` |
| 400 | `threat.next.0` |
| 402 | `threat.next.1` |
| 404 | `threat.next.2` |
| 406 | `threat.next.3` |
| 408 | `threat.next.4` |
| 414 | `place.region.sink` |
| 415 | `place.region.dishwasher` |
| 416 | `place.region.pantry` |
| 417 | `place.region.stove` |
| 418 | `place.region.fridge` |
| 419 | `place.region.trash` |
| 420 | `place.region.door` |
| 421 | `place.region.island` |

### `src/sim/territory.ts` (8)

| Line | Key |
|---|---|
| 30 | `place.zone.sink` |
| 31 | `place.zone.dishwasher` |
| 32 | `place.zone.pantry` |
| 33 | `place.zone.stove` |
| 34 | `place.zone.fridge` |
| 35 | `place.zone.island` |
| 36 | `place.zone.trash` |
| 37 | `place.zone.doorway` |

### `src/sim/kitchen.ts` (14)

| Line | Key |
|---|---|
| 324 | `place.resource.dishCrumbs` |
| 326 | `place.resource.sinkDrip` |
| 334 | `place.resource.stoveGrease` |
| 345 | `place.resource.islandDrop` |
| 354 | `place.resource.fridgeCondensation` |
| 363 | `place.resource.pantryGrain` |
| 374 | `place.resource.trashSpill` |
| 376 | `place.resource.petBowl` |
| 407 | `place.nest.home` |
| 419 | `place.nest.crackSink` |
| 431 | `place.nest.crackIsland` |
| 443 | `place.nest.crackPantry` |
| 455 | `place.nest.crackStove` |
| 467 | `place.nest.crackBin` |

### `src/sim/onboarding.ts` (8)

| Line | Key |
|---|---|
| 20 | `tutorial.move` |
| 26 | `tutorial.cover` |
| 32 | `tutorial.inspect` |
| 38 | `tutorial.lay` |
| 44 | `tutorial.follow` |
| 50 | `tutorial.both` |
| 56 | `tutorial.sprint` |
| 62 | `tutorial.erase` |

### `src/sim/pheromone.ts` (1)

| Line | Key |
|---|---|
| 55 | `hint.routeEvicted` |

### `src/sim/world.ts` (4 — all duplicates of keys above)

| Line | Key |
|---|---|
| 416 | `alert.response.0` |
| 549 | `objective.start` |
| 552 | `objective.start` |
| 554 | `op.1.unlock` |
| 555 | `alert.response.0` |

### `src/render/renderer.ts` (1)

| Line | Key |
|---|---|
| 1467 | `hud.guide` |

### Newly authored (not extracted — 14)

`error.saveFailed`, `error.loadFailed`, `error.audioBlocked`, `error.runtime` (the brief requires an `error.*` namespace; the codebase currently has **no** user-facing error copy — `main.ts:44` captures errors into a test-only array and shows the player nothing), `a11y.hudRegion`, and nine `.short` overflow variants plus `unit.*` fragments introduced to keep cost/count formatting DRY.

---

## 7. Strings deliberately **not** localized

Everything below was inspected and ruled out. **Nothing was left unclassified.**

| Site | Content | Why not |
|---|---|---|
| `sim/kitchen.ts:42,54,66,78,92,104,116,130,142,154,167,169` | `'counter'`, `'stove'`, `'sink'`, `'fridge'`, `'dishwasher'`, `'pantry'`, `'island'`, `'radiator'`, `'bin'`, `'box'`, `'pipe'` | Solid-body debug labels. Grepped every consumer (`render/solids.ts`, `render/props.ts`, `render/renderer.ts`) — **never read into any drawn or DOM output.** Internal identifiers only. |
| `style.css:721,727` | `content:'✓'` / `content:'✕'` | Locale-neutral glyphs. |
| `ui/hud.ts:76` | `'…'` | Pre-first-frame placeholder, replaced on step 1. |
| `ui/hud.ts:180,185,190,236` | `'◂'`, `'▸'`, `'✽'` | Row icons. |
| `ui/icons.ts` (whole file) | inline SVG | `aria-hidden="true"`; no text. |
| `ui/overlays.ts:29–35` (first tuple element) | `'W A S D'`, `'SHIFT'`, `'ESC / P'`, `'R'`, `'E'`, `'Hold LMB / SPACE'`, `'Hold RMB / X'` | Physical keycaps. Korean keyboards carry the same legends. **Exception:** `'Hold LMB / SPACE'` and `'Hold RMB / X'` mix a keycap with the English verb "Hold" — recommend re-shaping these two into `keycap + control.*` so the verb comes from the catalog. Flagged for the integrator; not a translation gap. |
| `main.ts:44–52` | `${e.message} @ ${e.filename}:${e.lineno}` | Developer diagnostics into a test-only array. |
| `main.ts:770` | `'{n} draws · {n} fx · {n} voices'` | Perf readout, gated behind `settings.showPerf`; deliberately left in developer English (mirrors `#perf { font-family: var(--mono) }`). Owner may override — no key authored. |
| `sim/*.ts` state/enum literals | `'idle'`, `'panic'`, `'outbound'`, `'trapped'`, `'tooPoor'`, `'notOffered'`, … | Union-type discriminants, never rendered. |
| `sim/world.ts` `hintKey` values | `'evicted'`, `'nothing'`, `` `sealed:${id}` `` … | Dedup keys for the toast system, never displayed. |
| `testapi.ts` | all | Test seam. |

---

## 8. Tone and copy review

### The voice

Cold, observational, second-person imperative. The colony narrates; the household is weather. Three rules kept throughout:

1. **The household is never a character with feelings** — it *moves*, *notices*, *comes*. `집이 움직인다`, `누군가 들어와 불을 켠다`. Never `그들은 화가 났다`.
2. **Speech level is 해라체 throughout** (`골라라`, `붙어라`, `버텨라`). Not 해요체 (too polite — breaks the register), not 하십시오체 (manual-speak), not bare 해체 (too chummy). 해라체 is the imperative of orders and of interior monologue, which is exactly what an objective line is.
3. **The alert ladder escalates by register, not by adjective**, matching the English:

| Tier | Korean | Register |
|---|---|---|
| 0 | 조용함 | neutral state |
| 1 | 낌새 | native, vague, unsettling — "a hint of something" |
| 2 | 바퀴 의심 | the moment they name you |
| 3 | 방역 호출 | institutional — they have picked up the phone |
| 4 | 박멸 | product-label finality |

The same drop happens inside `alert.forecast.final`, which switches from the clinical 살충제 to the household's own idiom **약을 치고 있다** — the only place in the catalog where the colony reports the humans in the humans' words.

### Copy-review findings on the Korean

| Finding | Action |
|---|---|
| `op.2.brief` and `op.3.brief` carried the English's two-clause em-dash rhythm, which stacks nouns in Korean | Rewritten as two sentences each; no 명사 나열 survives. |
| `threat.counter.*` all began "…해라" and read as a list | Alternated: two state the fact then the order (`걸레질은 …를 지운다. 다시 놓아라.`), three lead with the order. |
| `outcome.win.lede` interpolates a comma-joined zone list; Korean list-joins want `·` not `,` | Zone joining should use `' · '` at the call site. Flagged for the integrator. |
| Adaptation `downside` strings must never read softer than the `blurb` (contract rule: the cost cannot be smaller or dimmer than the benefit) | Every downside ends on a flat declarative — `공짜가 아니다`, `덜 일한다`, `처리량을 먹는다`. None hedges. |

---

## 9. First-run tutorial beat script

**Constraints:** first player input by ~10 s, first delivery by ~45 s. Every beat is one clause and one action. No beat explains a system; each names a key or a destination.

The existing gate structure in `sim/onboarding.ts` already enforces "advance by doing, not by clicking next" — the copy below fits that structure unchanged. Times are the earliest a beat can be satisfied, given each step's `minTime` and `done()` predicate.

| # | Key | Korean | Chars | Target time | Satisfied by |
|---|---|---|---|---|---|
| 1 | `tutorial.move` | **WASD — 틈 밖으로.** | 9 | **t ≈ 0 → input by 1.5 s** | `firstMoveAt >= 0` |
| 2 | `tutorial.cover` | **벽에 붙어라. 맨바닥은 들킨다.** | 14 | t ≈ 2–9 s | `time > 9` |
| 3 | `tutorial.inspect` | **E — 부스러기를 살펴라.** | 11 | t ≈ 9–14 s | `hintKey` starts with `inspect:` |
| 4 | `tutorial.lay` | **SPACE 누른 채 걸어라. 먹이 → 틈.** | 15 | t ≈ 14–32 s | any route `linked` |
| 5 | `tutorial.follow` | **일꾼이 냄새를 따라온다. 첫 운반이다.** | 17 | **t ≈ 32–45 s → first delivery** | `deliveries >= 1` |
| 6 | `tutorial.both` | **먹이는 번식, 수분은 생존. 둘 다 이어라.** | 18 | t ≈ 45–70 s | `totalFood > 0 && totalWater > 0` |
| 7 | `tutorial.sprint` | **SHIFT는 질주. 시끄럽고, 맨바닥에선 들킨다.** | 21 | t > 60 s | `time > 60` |
| 8 | `tutorial.erase` | **X로 길을 지운다. 톡 치면 전원 복귀.** | 16 | t > 78 s | `time > 78` |

**Why this hits the timing gates.**

- Beat 1 is 9 characters and names the keys first. It is readable in under a second, so the 10-second input gate has ~9 s of slack even for a player reading slowly.
- Beat 4 replaces the English's 96-character sentence ("Hold LEFT MOUSE (or SPACE) while walking to lay pheromone. Run a trail from the nest to the food.") with **15 characters plus an arrow**. `먹이 → 틈` states the whole route topology as a diagram — no clause explaining what "link" means. This is the single largest cut in the port and it is what protects the 45-second delivery gate: the old copy took roughly as long to read as the walk itself.
- Beat 5 does not teach anything. It *names what just happened* (`첫 운반이다`) so the player attributes the food arriving to their own trail. The English's "Follow one home" asked for a second action inside the delivery window; that has been removed.
- Beats 6–8 sit past the 45-second gate and are allowed to be explanatory, but are still ≤ 21 characters.
- All eight fit on one line in the `#tutorial` pill (budget 43.8 em; worst beat 20.8 em) at 1280×720 **and** at 800 px width.

**Copy notes.**

- `맨바닥` (bare floor) is used in beats 2, 7 and in the evidence causes — one word, taught once, reused as the game's name for the risk surface. The English used three ("bare tile", "open floor", "in the open"); collapsing them is a net comprehension gain, not a loss.
- Beat 3 says `부스러기` (crumbs) rather than the English's "the crumbs or the sink drip". The nearest interactable at that moment is always the dishwasher crumbs; naming one thing gives one destination.
- No beat uses a term that has not appeared on screen. `틈` is the object the player starts inside; `먹이` and `수분` are the meter labels they have been staring at since frame 1; `일꾼` is introduced at the exact moment the first one appears.

---

## 10. Integration checklist (for the owner)

1. Add a `t(key, vars?)` helper: `{name}` substitution, `ko` as the only default, `en` reachable only behind a dev flag.
2. Apply the CSS changes in §4 — **`word-break: keep-all` first**; it is the difference between readable and broken.
3. Set `index.html` `lang="ko"`.
4. Replace the string sites in §6, file by file. The `op.*` / `objective.*` block in `sim/operations.ts` is 87 of the 352 sites — do it last, when the pattern is settled.
5. Delete `sentence()` (`sim/operations.ts:153`) and its two call sites.
6. Collapse the four English plural branches listed in §5.
7. Re-measure §3 A and B against a real 1280×720 build before shipping; both `.short` variants exist and are ready.
8. Re-check the eight particle-bearing templates in §5 if any place label ever changes.
