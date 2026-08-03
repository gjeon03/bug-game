/**
 * Korean catalog — DRAFT. This is the shipped player-facing language.
 *
 * Rules this file follows:
 *   1. Keys are stable and descriptive of *purpose*, never of English wording. Rewriting the English
 *      must never require renaming a key.
 *   2. Interpolation is `{name}`. Every placeholder is named, never positional.
 *   3. Korean has no grammatical plural. Where English branched on count ("1 food line" /
 *      "2 food lines"), there is one key taking `{count}`.
 *   4. Korean has no letter case. The `sentence()` helper in `sim/operations.ts` and every
 *      `text-transform: uppercase` in `style.css` are no-ops here — see the localization spec.
 *   5. `.short` suffix = a variant authored for a slot that overflows at 1280×720. Never a synonym.
 *
 * Terminology is fixed by the glossary in
 * `artifacts/evidence/quality-reboot-baseline/audits/localization-spec.md`. Do not re-word a glossary
 * term locally — change it there and sweep.
 */
export const ko = {
  /* ── meta / a11y ─────────────────────────────────────────────────────────── */
  'meta.lang': 'ko',
  'meta.title': '걸레받이 제국',
  'meta.description':
    '걸레받이 제국 — 사람이 사는 주방 안에서 바퀴 군체를 키우는 탑다운 매크로 느와르 전략 게임.',
  'meta.noscript': '걸레받이 제국은 자바스크립트가 켜져 있어야 실행됩니다.',
  'a11y.canvas': '걸레받이 제국 게임 화면',
  'a11y.hudRegion': '상태 표시',

  /* ── shared units and cost fragments ─────────────────────────────────────── */
  'unit.food': '먹이 {amount}',
  'unit.water': '수분 {amount}',
  'unit.costBoth': '먹이 {food} · 수분 {water}',
  'unit.costBothProse': '먹이 {food}, 수분 {water}',
  'unit.roaches': '{count}마리',
  'unit.seconds': '{seconds}초',
  'unit.percent': '{percent}%',
  'unit.tiles': '{count}칸',
  'unit.foodNoun': '먹이',
  'unit.waterNoun': '수분',

  /* ── HUD: meters ─────────────────────────────────────────────────────────── */
  'hud.meter.food': '먹이',
  'hud.meter.water': '수분',
  'hud.meter.colony': '군체',
  'hud.meter.brood': '부화',
  'hud.meter.sprint': '질주',
  'hud.meter.pheromone': '페로몬',
  'hud.meter.critical': ' ⚠ 위험',

  /* ── HUD: scout status line ──────────────────────────────────────────────── */
  'hud.scout.ready': '정찰병 대기',
  'hud.scout.dead': '정찰병 사망 — {seconds}초 후 교대',
  'hud.scout.trapped': '붙잡힘 — SHIFT+방향 연타 · {percent}%',
  'hud.scout.trapped.short': '붙잡힘 · SHIFT+방향 {percent}%',
  'hud.scout.seen': '발각 — 엄폐하라',
  'hud.scout.exposed': '노출 — 불빛 속',
  'hud.scout.laying': '페로몬 놓는 중',

  /* ── HUD: interact prompt ────────────────────────────────────────────────── */
  'hud.prompt.inspect': '{label} 살피기',
  'hud.prompt.costSuffix': ' — {cost}',

  /* ── HUD: operation panel ────────────────────────────────────────────────── */
  'hud.next': '다음: {unlock}',
  'hud.theyAreComing': '그들이 온다.',
  'hud.evidence.none': '아직 남긴 흔적이 없다.',

  /* ── HUD: one-of-three choice ────────────────────────────────────────────── */
  'hud.choice.adaptation': '군체가 특화할 준비가 됐다 — 하나만 골라라',
  'hud.choice.adaptation.short': '특화할 준비가 됐다 — 하나 골라라',
  'hud.choice.fitOut': '{label} 꾸미기 — 하나만 골라라',

  /* ── Alert: tier names (escalating register) ─────────────────────────────── */
  'alert.tier.0': '조용함',
  'alert.tier.1': '낌새',
  'alert.tier.2': '바퀴 의심',
  'alert.tier.3': '방역 호출',
  'alert.tier.4': '박멸',

  /* ── Alert: what the household will do next ──────────────────────────────── */
  'alert.response.0': '아직 아무도 눈치채지 못했다.',
  'alert.response.1': '다음: 누군가 들어와 불을 켠다.',
  'alert.response.2': '다음: 제일 붐비는 길에 끈끈이가 깔린다.',
  'alert.response.3': '다음: 독먹이, 그리고 주방 전체를 도는 긴 순찰.',
  'alert.response.4': '다음: 살충제를 꺼내 둥지를 노린다.',

  /* ── Alert: named evidence (why suspicion moved) ─────────────────────────── */
  'alert.cause.seen': '불빛 속에서 바퀴를 봤다',
  'alert.cause.corpse': '훤한 데 널린 시체',
  'alert.cause.traffic': '맨바닥 위 잦은 이동',
  'alert.cause.depleted': '먹을 게 눈에 띄게 줄었다',
  'alert.cause.trap': '덫에 뭔가 걸렸다',
  'alert.cause.expansion': '새로 뚫린 구멍',
  'alert.cause.noise': '맨바닥에서 들린 부스럭 소리',
  'alert.cause.droppings': '맨 타일에 남은 자국',

  /* ── Alert: forecast line (three shapes, matching the three code branches) ─ */
  'alert.forecast.withPlace': '{tier} — {cause}, {place} 쪽이 제일 심하다. {next}',
  'alert.forecast.withPlace.short': '{tier} · {cause} · {place}. {next}',
  'alert.forecast.withCause': '{tier} — {cause}. {next}',
  'alert.forecast.bare': '{tier}. {next}',
  'alert.forecast.final': '박멸 — {seconds}초. 네 발길이 제일 잦았던 곳에 약을 치고 있다.',
  'alert.forecast.final.short': '박멸 — {seconds}초. 제일 붐빈 곳에 약을 친다.',

  /* ── Threat: what they will try next, by alert tier ──────────────────────── */
  'threat.next.unknown': '아직 어딘지는 못 짚었다.',
  'threat.next.0': '누가 한 번 둘러보러 나올 수 있다.',
  'threat.next.1': '사람 다닌 자리에 걸레질이 들어온다.',
  'threat.next.2': '눈치챈 길 위에 덫이 깔린다.',
  'threat.next.3': '독먹이, 더 나빠지면 살충제.',
  'threat.next.4': '박멸할 준비가 끝났다.',

  /* ── Threat: counterplay (shown once the player has met the threat) ──────── */
  'threat.counter.patrol': '수납장 밑으로 붙어라 — 불빛은 맨바닥의 바퀴만 찾아낸다.',
  'threat.counter.sweep': '걸레질은 바퀴가 아니라 냄새를 지운다. 지나가면 다시 놓아라.',
  'threat.counter.trap': '덫은 네가 다닌 자리에 깔린다. 길을 옮기면 덫은 헛것이 된다.',
  'threat.counter.bait': '독먹이는 느리다. 들어간 바퀴는 걸어 나올 시간이 있다.',
  'threat.counter.spray': '전부 차지한 틈 안으로. 살충제는 벽 안까지 못 닿는다.',
  'threat.counter.final': '차지한 틈이 곧 대피소다. 그 바깥은 전부 노출이다.',

  /* ── Threat: advice promoted into the objective line ─────────────────────── */
  'threat.advice.trapOnRoute': '끈끈이가 네 보급선 위에 앉았다 — 그 구간을 지우고 돌려라.',
  'threat.advice.baitOnRoute': '독먹이가 네 길 위에 놓였다 — 길을 그 옆으로 틀어라.',
  'threat.advice.sweepIncoming': '걸레질이 시작된다 — 지나가는 자리의 냄새는 사라진다.',
  'threat.advice.final': '군체를 차지한 틈 안으로 넣고 거기 붙들어 둬라.',

  /* ── Routines: the household's night behaviours ──────────────────────────── */
  'routine.snack.title': '야식',
  'routine.snack.warning': '복도에서 발소리. 누가 냉장고로 간다.',
  'routine.snack.counter': '갓 떨어진 부스러기, 그리고 쏟아지는 불빛. 문 닫히기 전에 챙겨라.',
  'routine.dishes.title': '설거지',
  'routine.dishes.warning': '물이 나온다. 싱크대 쪽이 곧 젖고 붐빈다.',
  'routine.dishes.counter': '고인 물은 공짜 수분이다 — 대신 걸레가 지나간 자리는 냄새가 죽는다.',
  'routine.trash.title': '쓰레기 배출',
  'routine.trash.warning': '쓰레기통 뚜껑이 열렸다. 문 옆 바닥에 진한 게 떨어졌다.',
  'routine.trash.counter': '주방에서 제일 기름진 먹이, 주방에서 제일 훤한 타일 위.',
  'routine.gone': '흘린 게 치워졌다 — 그 길도 같이 사라졌다.',

  /* ── Operations: titles, briefs, unlocks ─────────────────────────────────── */
  'op.title': '작전 {index} — {title}',
  'op.cardTitle': '작전 {index}',
  'op.complete': '작전 완료.',

  'op.1.title': '둥지를 세운다',
  'op.1.brief': '벽에서 나와라. 먹을 것과 마실 것을 하나씩 찾아 본거지로 이어라.',
  'op.1.unlock': '집이 밤 일과를 시작한다 — 그게 곧 기회다.',
  'op.2.title': '일과에 스며든다',
  'op.2.brief':
    '집은 띄엄띄엄 깨어난다. 부스러기가 떨어지는 자리에 서 있다가, 불빛보다 먼저 빠져라.',
  'op.2.unlock': '적응 — 군체가 특화되기 시작한다. 방향은 네가 고른다.',
  'op.3.title': '군체를 특화한다',
  'op.3.brief':
    '살아남는 군체는 하나에 거는 군체다. 네 바퀴가 무엇이 될지 골라라 — 전부는 못 가진다.',
  'op.3.unlock': '주방 그 자체 — 구역 세 곳을 쥐고, 집이 보내는 것을 버텨라.',
  'op.4.title': '주방을 차지한다',
  'op.4.brief': '구역 셋을 동시에, 그들이 오는 동안. 여기가 기억에 남는 대목이다.',
  'op.4.unlock': '주방은 네 것이 된다.',

  /* ── Operations: checklist labels (fixed-width slot) ─────────────────────── */
  'op.gate.foodLine': '먹이 길 {count}개',
  'op.gate.waterLine': '수분 길 {count}개',
  'op.gate.population': '바퀴 {count}마리',
  'op.gate.routines': '일과 {count}회 이용',
  'op.gate.foothold': '거점 {count}곳 확보',
  'op.gate.adaptations': '적응 {count}개 선택',
  'op.gate.functions': '거점 기능 {count}개',
  'op.gate.zones': '구역 {count}곳 장악',
  'op.gate.survive': '박멸에서 살아남기',

  /* ── Operations: gate actions ────────────────────────────────────────────── */
  'op.action.findSource': '{noun} 공급원을 찾아라 — 틈에서 멀어져라.',
  'op.action.layTrail': '{label}까지 걸어간 뒤, 놓기 키를 누른 채 돌아와 길을 남겨라.',
  'op.action.bringScentHome': '{label}까지 걸어가라 — 그리고 냄새를 본거지로 데려와라.',
  'op.action.keepBothFlowing': '두 창고를 다 돌려라 — 군체는 먹이와 수분이 같이 있어야 큰다.',
  'op.action.waitForRoutine': '집이 움직일 때까지 기다려라 — 떨어뜨리는 것에 길을 대라.',
  'op.action.routineIncoming': '{title} 들어온다 — {counter}',
  'op.action.routineOpen': '{title}, {seconds}초 열려 있다 — 지금 길을 대라.',
  'op.action.claimNest': '{label}까지 가서 E를 눌러 차지해라.',
  'op.action.scoutForCrack': '걸레받이를 훑어 틈을 찾아라.',
  'op.action.pickAdaptation': '적응을 골라라 — 1, 2, 3.',
  'op.action.growToMilestone': '바퀴 {count}마리까지 키우면 다음 적응이 열린다.',
  'op.action.keepGrowing': '군체를 계속 키워라.',
  'op.action.fitOutHere': '{label} 안에 서서 E를 눌러 꾸며라.',
  'op.action.claimThenFit': '{label}부터 차지하고, 그다음 꾸며라.',
  'op.action.claimAnother': '틈을 하나 더 차지해라.',
  'op.action.holdWhatYouHave': '쥔 것을 지켜라.',
  'op.action.holdInsurance': '버텨라. 저들은 할 수 있으면 구역을 깬다 — 네 번째가 보험이다.',
  'op.action.claimCrackInZone':
    '{label}을 차지해라 — 네 틈은 군체가 숨어 있는 동안에도 {zone}을 붙든다.',
  'op.action.routeZone': '{zone}으로 길을 통과시켜라 — 지금 장악 {percent}%.',
  'op.action.zoneEmpty': '{zone}에 길은 있는데 아무도 없다 ({percent}%).',
  'op.action.zoneStaff': '{zone}에 바퀴를 붙여 둬라 — 장악 {percent}%.',
  'op.action.shelterNow': '전부 차지한 틈 안으로 — {seconds}초 남았다.',
  'op.action.triggerFinal': '구역 셋을 쥐어 집의 마지막 대답을 끌어내라.',

  /* ── Operations: blockers (the real reason progress stopped) ─────────────── */
  'op.blocker.routesFull': '길 {max}개가 전부 쓰이는 중 — 하나 지우고 새로 놓아라.',
  'op.blocker.routesFullSpill': '길 {max}개가 전부 쓰이는 중 — 하나 지워야 흘린 것에 닿는다.',
  'op.blocker.trailUnfinished': '마지막 길이 공급원과 둥지 양쪽에 닿지 않았다 — 끝까지 걸어라.',
  'op.blocker.capacityFull':
    '둥지가 {capacity}에서 꽉 찼다. 거점을 차지하거나 번식 적응을 골라 늘려라.',
  'op.blocker.waterTooLow': '수분이 모자라 알을 못 기른다. 수분 길부터 돌려라.',
  'op.blocker.foodTooLow': '먹이가 모자라 알을 못 기른다. 먹이 길부터 돌려라.',
  'op.blocker.nestCostFood': '{label}에는 먹이 {need}이 든다 — 지금 {have}.',
  'op.blocker.nestCostWater': '{label}에는 수분 {need}이 든다 — 지금 {have}.',
  'op.blocker.adaptCostFood': '제일 싼 적응이 먹이 {need} — 지금 {have}.',
  'op.blocker.adaptCostWater': '제일 싼 적응이 수분 {need} — 지금 {have}.',
  'op.blocker.fitCostFood': '{label} 꾸미기에 먹이 {need} — 지금 {have}.',
  'op.blocker.fitCostWater': '{label} 꾸미기에 수분 {need} — 지금 {have}.',
  'op.blocker.zoneContested': '{zone}을 집이 훑고 있다 — 저기 있는 동안 장악이 깎인다.',
  'op.blocker.noShelter':
    '본거지 말고는 아무도 숨을 데가 없다 — 차지한 틈이 하나 더 있으면 위험이 갈린다.',
  'op.blocker.adaptationSaving': '{name}에 {shortfall}이 모자란다.',
  'op.blocker.shortfallFood': '먹이 {amount}',
  'op.blocker.shortfallWater': '수분 {amount}',

  /* ── Objective: the priority line (final response) ───────────────────────── */
  'objective.final.sprayOnZone': '{zone}에 약을 치고 있다 — 지나갈 때까지 틈 안으로 넣어라.',
  'objective.final.regain': '{held}/{need} 장악 — {zone}에 몸을 다시 넣어라. {seconds}초.',
  'objective.final.holding': '{held}/{need} 장악, {seconds}초 남았다.',
  'objective.final.slipping': '{need}곳 다 네 것이지만 {zone}이 밀린다 — {seconds}초.',
  'objective.final.stayHidden': '{seconds}초. 구역 {need}곳을 지키고 훤한 데로 나서지 마라.',

  /* ── Objective: priority lines above the current gate ────────────────────── */
  'objective.adaptation.choose': '적응을 골라라 — 1, 2, 3.',
  'objective.routine.incoming': '{title} {seconds}초 뒤 — {counter}',
  'objective.routine.active': '{title}: 길을 대기까지 {seconds}초.',
  'objective.routine.harvesting': '{title}이 값을 치르는 중 — {seconds}초 남았다.',
  'objective.shortage.food': '먹이가 바닥나 간다 — 먹이 길을 하나 더 돌려라.',
  'objective.shortage.water': '수분이 바닥나 간다 — 수분 길을 하나 더 돌려라.',
  'objective.shortage.noFoodLine': '먹이 길이 아예 하나도 안 이어져 있다.',
  'objective.shortage.noWaterLine': '수분 길이 아예 하나도 안 이어져 있다.',
  'objective.shortage.foodBehind': '먹이 길이 못 따라간다 — 공급원을 하나 더 붙여라.',
  'objective.shortage.waterBehind': '수분 길이 못 따라간다 — 공급원을 하나 더 붙여라.',
  'objective.saving.food': '먹이 {amount}이 더 필요하다 — 먹이 길을 하나 더 돌려라.',
  'objective.saving.water': '수분 {amount}이 더 필요하다 — 수분 길을 하나 더 돌려라.',
  'objective.saving.forAdaptFood': '{blocker} 먹이 길을 하나 더 돌려라.',
  'objective.saving.forAdaptWater': '{blocker} 수분 길을 하나 더 돌려라.',
  'objective.start': '틈에서 나와 먹을 것을 찾아라.',

  /* ── Objective: a capped reserve must always name a spend ────────────────── */
  'objective.capped.subjectBoth': '두 창고가 다',
  'objective.capped.subjectFood': '곳간이',
  'objective.capped.subjectWater': '수분이',
  'objective.capped.adaptation': '{subject} 찼다 — 써라: {name}, 먹이 {cost}.',
  'objective.capped.claim': '{subject} 찼다 — {label}을 차지해라 ({cost}). 한계가 올라간다.',
  'objective.capped.fit': '{subject} 찼다 — {label}을 꾸며라 ({cost}). 천장이 올라간다.',
  'objective.capped.repair': '{subject} 찼다 — {label}에서 E를 눌러 수분으로 메워라.',
  'objective.capped.capacity':
    '{subject} 찼고 둥지도 {capacity}에서 꽉 찼다. 병목은 수용력이다 — {label}에 {cost}이 든다.',
  'objective.capped.capacity.short': '{subject} 찼다. 병목은 수용력 — {label}에 {cost}.',
  'objective.capped.milestone':
    '{subject} 찼다 — 쌓아 두는 게 요점이다: 바퀴 {count}마리에서 그걸 쓸 선택이 열린다.',
  'objective.capped.milestone.short': '{subject} 찼다 — 바퀴 {count}마리에서 선택이 열린다.',
  'objective.capped.territory':
    '{subject} 찼다. 이제 병목은 창고가 아니라 땅이다. {zone}으로 길을 밀어 넣어라.',
  'objective.capped.hold': '{subject} 찼다 — 쥔 것을 지키고 대응을 버텨라.',

  /* ── Adaptations: brood family ───────────────────────────────────────────── */
  'adaptation.brood1.name': '밀집 부화실',
  'adaptation.brood1.blurb': '수용력 +10. 알이 35% 빨리 여문다.',
  'adaptation.brood1.downside': '유지비 +25%. 몸이 늘면 눈에 띌 발길도 는다.',
  'adaptation.brood2.name': '알집 군집',
  'adaptation.brood2.blurb': '수용력 +14. 죽은 뒤 20초 동안 두 배 속도로 채워진다.',
  'adaptation.brood2.downside': '유지비 +25%. 뭉쳐 있으면 찾기도 쉽다.',
  'adaptation.brood3.name': '2세대',
  'adaptation.brood3.blurb': '수용력 +18. 약충이 절반 시간에 자라 바로 나른다.',
  'adaptation.brood3.downside': '유지비 +30%. 훤한 데서 오간 흔적이 20% 더 무겁다.',

  /* ── Adaptations: forage family ──────────────────────────────────────────── */
  'adaptation.forage1.name': '벌어진 큰턱',
  'adaptation.forage1.blurb': '한 번에 45% 더 나른다.',
  'adaptation.forage1.downside': '공급원이 40% 빨리 마르고, 마른 자리는 눈에 띈다.',
  'adaptation.forage2.name': '빠른 섭식',
  'adaptation.forage2.blurb': '먹는 시간 절반. 공급원 하나에 넷 대신 여섯이 붙는다.',
  'adaptation.forage2.downside': '공급원이 40% 빨리 마른다. 붐비는 끝은 더 잘 보인다.',
  'adaptation.forage3.name': '기회주의자',
  'adaptation.forage3.blurb': '집이 흘린 것에서 두 배를 얻고 50% 더 오래 남는다.',
  'adaptation.forage3.downside': '훤한 데서 흘린 것을 먹으면 흔적이 두 배로 남는다.',

  /* ── Adaptations: shadow family ──────────────────────────────────────────── */
  'adaptation.shadow1.name': '벽 타는 냄새',
  'adaptation.shadow1.blurb': '엄폐 밑에 놓은 길이 두 배 오래가고 흔적을 40% 덜 남긴다.',
  'adaptation.shadow1.downside': '나르는 속도 12% 감소. 숨는 값은 공짜가 아니다.',
  'adaptation.shadow2.name': '경보 페로몬',
  'adaptation.shadow2.blurb': '위협을 0.5초 먼저 알아채고, 달아날 때 30% 빠르다.',
  'adaptation.shadow2.downside': '먹는 속도 15% 감소 — 예민한 군체는 덜 일한다.',
  'adaptation.shadow3.name': '대피소',
  'adaptation.shadow3.blurb': '차지한 틈이 두 배 먼 데까지 감싸고, 긴급 대피 2회를 얻는다.',
  'adaptation.shadow3.downside': '운반 속도 15% 감소. 시설은 처리량을 먹는다.',

  /* ── Foothold fit-outs ───────────────────────────────────────────────────── */
  'foothold.nursery.name': '부화실',
  'foothold.nursery.blurb': '수용력 +10, 알이 여기서 깬다.',
  'foothold.cache.name': '창고',
  'foothold.cache.blurb': '먹이 +90, 수분 +60 보관.',
  'foothold.bolthole.name': '대피소',
  'foothold.bolthole.blurb': '수용력 +2, 더 먼 데서도 바퀴가 여기로 숨는다.',

  /* ── Hints: contextual toasts ────────────────────────────────────────────── */
  'hint.nothingHere': '여기엔 살필 게 없다.',
  'hint.sealed': '{label}: 작전 {op}까지 막혀 있다. 먹이 {food}, 수분 {water}이 든다.',
  'hint.resource': '{label}: {noun} {amount} 남았다. 여기로 길을 놓아라.',
  'hint.repairCost': '틈을 메우는 데 수분 {amount}이 든다.',
  'hint.repaired': '{label}, {percent}%까지 메웠다.',
  'hint.fitCost': '{label} 꾸미기에 먹이 {food}, 수분 {water}이 든다.',
  'hint.fitChoose': '{label}: 무엇을 지을지 골라라 — 1 부화실, 2 창고, 3 대피소.',
  'hint.claimCost': '{label}에는 먹이 {food}, 수분 {water}이 든다.',
  'hint.adaptCost': '{name}에는 먹이 {food}, 수분 {water}이 든다.',
  'hint.tooPoorAdapt': '곳간이 아직 모자란다.',
  'hint.tooPoorFit': '곳간이 모자라 그걸 못 꾸민다.',
  'hint.routeEvicted': '길은 한 번에 {max}개뿐 — 제일 오래된 게 삭았다.',

  /* ── Interact prompt labels ──────────────────────────────────────────────── */
  'hud.target.sealed': '{label} — 작전 {op}에 열린다',
  'hud.target.claim': '{label} 차지',
  'hud.target.fit': '{label} 꾸미기',
  'hud.target.repair': '{label} 메우기 — {percent}%',
  'hud.target.resource': '{label} — {amount} 남음',

  /* ── World-space guide arrow ─────────────────────────────────────────────── */
  'hud.guide': '{label} · {tiles}칸',

  /* ── Places: kitchen regions (used mid-sentence, no capitalization) ──────── */
  'place.zone.sink': '싱크대 쪽',
  'place.zone.dishwasher': '식기세척기 쪽',
  'place.zone.pantry': '팬트리 쪽',
  'place.zone.stove': '레인지 쪽',
  'place.zone.fridge': '냉장고 쪽',
  'place.zone.island': '아일랜드 쪽',
  'place.zone.trash': '쓰레기통 쪽',
  'place.zone.doorway': '문간 쪽',

  /* ── Places: coarse region names used in the forecast ────────────────────── */
  'place.region.sink': '싱크대',
  'place.region.dishwasher': '식기세척기',
  'place.region.pantry': '팬트리',
  'place.region.stove': '레인지',
  'place.region.fridge': '냉장고',
  'place.region.trash': '쓰레기통',
  'place.region.door': '문 앞 바닥',
  'place.region.island': '아일랜드',

  /* ── Places: resource nodes ──────────────────────────────────────────────── */
  'place.resource.dishCrumbs': '세척기 부스러기',
  'place.resource.sinkDrip': '싱크대 물방울',
  'place.resource.stoveGrease': '레인지 기름때',
  'place.resource.islandDrop': '아일랜드 음식물',
  'place.resource.fridgeCondensation': '냉장고 물기',
  'place.resource.pantryGrain': '팬트리 곡물',
  'place.resource.trashSpill': '쓰레기통 음식물',
  'place.resource.petBowl': '물그릇',

  /* ── Places: cracks ──────────────────────────────────────────────────────── */
  'place.nest.home': '본거지',
  'place.nest.crackSink': '싱크대 틈',
  'place.nest.crackIsland': '아일랜드 틈',
  'place.nest.crackPantry': '팬트리 틈',
  'place.nest.crackStove': '레인지 옆 틈',
  'place.nest.crackBin': '쓰레기통 틈',

  /* ── Tutorial: first-run beats. Short, imperative, one action each. ──────── */
  'tutorial.move': 'WASD — 틈 밖으로.',
  'tutorial.cover': '벽에 붙어라. 맨바닥은 들킨다.',
  'tutorial.inspect': 'E — 부스러기를 살펴라.',
  'tutorial.lay': 'SPACE 누른 채 걸어라. 먹이 → 틈.',
  'tutorial.follow': '일꾼이 냄새를 따라온다. 첫 운반이다.',
  'tutorial.both': '먹이는 번식, 수분은 생존. 둘 다 이어라.',
  'tutorial.sprint': 'SHIFT는 질주. 시끄럽고, 맨바닥에선 들킨다.',
  'tutorial.erase': 'X로 길을 지운다. 톡 치면 전원 복귀.',

  /* ── Pause card ──────────────────────────────────────────────────────────── */
  'pause.heading': '일시정지',
  'pause.wordmark': '걸레받이 제국',
  'pause.lede': '{operation} · {tier} · 바퀴 {population}마리',
  'pause.controlsHeading': '조작',
  'pause.resume': '계속',
  'pause.restart': '처음부터',

  /* ── Controls ────────────────────────────────────────────────────────────── */
  'control.move': '정찰병 이동',
  'control.lay': '페로몬 길 놓기',
  'control.erase': '길 지우기 · 톡 치면 전원 복귀',
  'control.interact': '살피기 · 틈 차지하기',
  'control.sprint': '질주 (시끄럽고, 티가 난다)',
  'control.pause': '일시정지',
  'control.restart': '처음부터',

  /* ── Help card ───────────────────────────────────────────────────────────── */
  'pause.help.heading': '작동 방식',
  'pause.help.title': '너는 정찰병이지, 무리가 아니다',
  'pause.help.lede':
    '일꾼은 명령을 듣지 않는다. 네 몸에서 나온 페로몬을 읽을 뿐이다 — 그러니 일꾼이 쓸 수 있는 길은 네가 직접 걸은 길뿐이다.',
  'pause.help.linking':
    '한쪽 끝에 <strong>차지한 둥지</strong>를, 다른 쪽 끝에 <strong>먹이나 수분</strong>을 걸면 군체가 나르기 시작한다. 길이 살아 있으면 양쪽 끝이 따뜻하게 뛴다.',
  'pause.help.evidence':
    '훤한 바닥을 지나는 한 뼘 한 뼘이 전부 흔적이다. 흔적은 의심을 키우고, 의심은 발을, 덫을, 끝내 살충제를 부른다. 의심은 절대 0으로 돌아가지 않는다 — 갈아 없애는 게 아니라, 얼마만큼 지고 갈지 고르는 것이다.',
  'pause.help.back': '뒤로',

  /* ── Operation card ──────────────────────────────────────────────────────── */
  'op.card.continue': '일하러 간다',
  'op.card.stat.colony': '군체',
  'op.card.stat.food': '먹이',
  'op.card.stat.water': '수분',
  'op.card.stat.adaptations': '적응',
  'op.card.stat.deliveries': '운반',
  'op.card.stat.lost': '손실',

  /* ── Outcome: end card ───────────────────────────────────────────────────── */
  'outcome.win.heading': '승리',
  'outcome.lose.heading': '실패',
  'outcome.subheading': '{heading} · 작전 {operation}/4',
  'outcome.win.title': '주방은 네 것이다',
  'outcome.lose.collapse.title': '군체 붕괴',
  'outcome.lose.nestDestroyed.title': '둥지 파괴',
  'outcome.lose.exterminated.title': '박멸',
  'outcome.win.lede': '통은 비었고 너는 아직 여기 있다. {zones} 이제 저들은 절대 다 잡지 못한다.',
  'outcome.win.ledeZones': '{zones}을 쥐고 있다.',
  'outcome.lose.collapse.lede': '내보낼 몸이 없다. 마지막 알까지 어둠 속에서 죽었다.',
  'outcome.lose.nestDestroyed.lede': '본거지 틈을 찾아내 통 하나를 통째로 부어 넣었다.',
  'outcome.lose.exterminated.lede': '작업이 끝났고, 그 끝에 네가 있었다. 주방은 조용하다.',
  'outcome.killedBy': '<strong>무엇이 죽였나:</strong> {cause} — {count}마리.',
  'outcome.killedByNothing': '<strong>무엇이 죽였나:</strong> 아무것도 닿지 않았다 — 그냥 말랐다.',
  'outcome.topEvidence': ' <strong>제일 큰 흔적:</strong> {cause} (의심 {amount}).',
  'outcome.zoneLine': '{zone} 장악',
  'outcome.became': '<strong>이 군체가 된 것:</strong> {list}. 조합이 다르면 판이 달라진다.',
  'outcome.neverSpecialised':
    '이 군체는 끝내 특화하지 않았다. 적응은 바퀴 11, 17, 24, 30마리에서 열린다.',
  'outcome.best': '최고 기록: {result} · 바퀴 {population}마리 · {time}',
  'outcome.best.survived': '생존',
  'outcome.best.lost': '실패',
  'outcome.restart': '다시 한 판',
  'outcome.help': '작동 방식',

  /* ── Outcome: stats ──────────────────────────────────────────────────────── */
  'outcome.stat.runTime': '진행 시간',
  'outcome.stat.deliveries': '운반 횟수',
  'outcome.stat.hatched': '부화',
  'outcome.stat.lost': '손실',
  'outcome.stat.scoutDeaths': '정찰병 사망',
  'outcome.stat.peakSuspicion': '최고 의심도',
  'outcome.stat.trapsSprung': '덫 작동',
  'outcome.stat.peakColony': '최대 군체',

  /* ── Outcome: what killed them ───────────────────────────────────────────── */
  'outcome.death.foot': '발에 밟혔다',
  'outcome.death.trap': '끈끈이에 붙었다',
  'outcome.death.spray': '살충제에 죽었다',
  'outcome.death.bait': '독먹이에 중독됐다',
  'outcome.death.starve': '굶어 죽었다 — 곳간이 말랐다',
  'outcome.death.thirst': '말라 죽었다 — 수분이 닿지 않았다',

  /* ── Settings ────────────────────────────────────────────────────────────── */
  'settings.master': '전체 음량',
  'settings.music': '환경음',
  'settings.sfx': '효과음',
  'settings.muted': '전체 음소거',
  'settings.reducedShake': '화면 흔들림 줄이기',
  'settings.reducedFlash': '섬광 줄이기',
  'settings.highContrast': '주방 밝게 (가독성)',
  'settings.showPerf': '성능 표시',

  /* ── Errors ──────────────────────────────────────────────────────────────── */
  'error.saveFailed': '설정을 저장하지 못했다. 브라우저 저장소가 막혀 있을 수 있다.',
  'error.loadFailed': '저장된 설정을 읽지 못해 기본값으로 시작한다.',
  'error.audioBlocked': '소리는 화면을 한 번 누른 뒤에 나온다.',
  'error.runtime': '문제가 생겼다. R을 눌러 다시 시작해라.',
} as const;

export type KoKey = keyof typeof ko;
