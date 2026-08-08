/**
 * Korean catalog — the shipped player-facing language.
 *
 * Rules this file follows:
 *   1. Keys are stable and describe *purpose*, never English wording. Rewriting a line must never
 *      require renaming a key.
 *   2. Interpolation is `{name}`. Every placeholder is named, never positional.
 *   3. Korean has no grammatical plural. Where English would branch on count, one key takes
 *      `{count}`.
 *   4. A particle after an interpolated value is written `{x}{x?이/가}` and resolved by `t()` from
 *      the *sound* of the value. Never hardcode a particle after a placeholder.
 *   5. Terminology is fixed by the glossary below. Do not re-word a glossary term locally.
 *
 * Glossary: 먹이 · 수분 · 군체 · 번식 · 페로몬 길 · 노출 · 흔적 · 경계 단계 · 거점 · 적응 ·
 * 박멸 · 대피 · 정찰병 · 일꾼 · 통로
 */
export const ko = {
  /* ── meta / accessibility ─────────────────────────────────────────────── */
  'meta.lang': 'ko',
  'meta.title': '주방을 점거하라',
  'meta.description':
    '사람이 사는 아파트 주방에서, 싱크대 밑 틈 하나부터 조리대 위까지 바퀴 군체를 넓혀 가는 3D 전략 게임.',
  'meta.noscript': '이 게임은 자바스크립트가 켜져 있어야 실행된다.',
  'a11y.canvas': '게임 화면',
  'a11y.hud': '군체 상태',

  /* ── regions ──────────────────────────────────────────────────────────── */
  'region.kitchen': '주방',
  'region.hallway': '복도',
  'region.living': '거실',
  'region.bathroom': '욕실',
  'region.bedroom': '침실',

  /* ── surfaces ─────────────────────────────────────────────────────────── */
  'surface.kitchen.floor': '주방 바닥',
  'surface.kitchen.counter': '싱크대 상판',
  'surface.hallway.floor': '복도 바닥',
  'surface.hallway.shoetop': '신발장 위',
  'surface.living.floor': '거실 바닥',
  'surface.living.sofaseat': '소파 앉는 면',
  'surface.living.tabletop': '탁자 위',
  'surface.living.tvstand': 'TV장 위',
  'surface.bathroom.floor': '욕실 바닥',
  'surface.bathroom.basin': '세면대 위',
  'surface.bathroom.cistern': '물탱크 뚜껑',
  'surface.bathroom.shelf': '욕실 선반',
  'surface.bathroom.tray': '샤워 트레이',
  'surface.bathroom.pipevoid': '배관 공간',
  'surface.bedroom.floor': '침실 바닥',
  'surface.bedroom.bed': '매트리스 위',
  'surface.bedroom.bedside': '협탁 위',
  'surface.bedroom.sill': '창틀',

  /* ── resources ────────────────────────────────────────────────────────── */
  'resource.kitchen.crumbs': '걸레받이 밑 부스러기',
  'resource.kitchen.trap': '배수 트랩 물기',
  'resource.kitchen.fridgeseal': '냉장고 고무 패킹 때',
  'resource.kitchen.rice': '흘린 밥알',
  'resource.kitchen.sponge': '젖은 수세미',
  'resource.kitchen.bin': '음식물 쓰레기통',
  'resource.hallway.crumbtrail': '끌려 나온 부스러기',
  'resource.hallway.driptray': '우산 물받이',
  'resource.living.snackbag': '뜯어 놓은 과자 봉지',
  'resource.living.seamcrumbs': '소파 틈새 부스러기',
  'resource.living.glassring': '컵 자국 물기',
  'resource.living.ricegrain': '소파 밑 밥알',
  'resource.living.kibble': '흘린 사료',
  'resource.living.dogbowl': '개 물그릇',
  'resource.living.sodaspill': '음료 자국',
  'resource.bathroom.drain': '바닥 배수구',
  'resource.bathroom.drainscum': '배수구 찌꺼기',
  'resource.bathroom.basintrap': '세면대 트랩',
  'resource.bathroom.cisternsweat': '물탱크 결로',
  'resource.bathroom.traypool': '샤워 트레이 고인 물',
  'resource.bedroom.crumbs': '침대 밑 부스러기',
  'resource.bedroom.snack': '협탁 과자 부스러기',
  'resource.bedroom.glass': '머리맡 물컵',
  'resource.bedroom.condensation': '창틀 결로',

  /* ── footholds ────────────────────────────────────────────────────────── */
  'foothold.kitchen.undersink': '싱크대 밑 공간',
  'foothold.kitchen.undersink.desc': '어둡고, 젖어 있고, 아무도 열지 않는다. 여기서 시작한다.',
  'foothold.kitchen.fridgeback': '냉장고 뒤',
  'foothold.kitchen.fridgeback.desc': '모터 열기가 새어 나와 늘 따뜻하다. 번식에 좋다.',
  'foothold.kitchen.cornerseam': '모서리 이음매',
  'foothold.kitchen.cornerseam.desc': '두 수납장이 만나며 벌어진 틈. 상판으로 올라가는 중계점.',
  'foothold.hallway.shoeskirt': '신발장 굽도리 틈',
  'foothold.hallway.shoeskirt.desc': '복도를 건너기 전에 숨을 고를 수 있는 유일한 자리.',
  'foothold.hallway.architrave': '문틀 뒤 공간',
  'foothold.hallway.architrave.desc': '문틀과 벽 사이 1센티. 복도 반대편으로 이어지는 중계점.',
  'foothold.living.sofavoid': '소파 밑 어둠',
  'foothold.living.sofavoid.desc': '거실에서 가장 넓고 가장 어두운 공간. 사람 발이 닿지 않는다.',
  'foothold.living.tvback': 'TV장 뒤 배선 뭉치',
  'foothold.living.tvback.desc': '전선 사이가 따뜻하고, 청소기가 들어오지 못한다.',
  'foothold.living.tableunder': '탁자 밑면',
  'foothold.living.tableunder.desc': '상판 바로 아래. 먹이까지 거리가 가장 짧다.',
  'foothold.living.balconygap': '베란다 문턱 틈',
  'foothold.living.balconygap.desc': '문틀 아래 실리콘이 갈라져 있다. 바깥 공기가 들어온다.',
  'foothold.bathroom.pedestalvoid': '세면대 기둥 안',
  'foothold.bathroom.pedestalvoid.desc': '배관이 지나가는 빈 기둥. 주방까지 이어지는 통로의 입구.',
  'foothold.bathroom.traylip': '샤워 트레이 턱 밑',
  'foothold.bathroom.traylip.desc': '수분은 넘치지만 물을 쓸 때마다 쓸려 나간다.',
  'foothold.bedroom.wardrobeskirt': '장롱 밑 틈',
  'foothold.bedroom.wardrobeskirt.desc':
    '침실에서 가장 안전한 자리. 사람은 여기를 들여다보지 않는다.',
  'foothold.bedroom.bedhead': '침대 머리맡 벽 틈',
  'foothold.bedroom.bedhead.desc': '자는 사람 바로 옆. 위험한 만큼 집 전체 장악의 마지막 조각이다.',
  'foothold.bedroom.architrave': '침실 문틀 뒤',
  'foothold.bedroom.architrave.desc': '침실을 복도 쪽 보급선에 다시 이어 주는 중계점.',

  /* ── links (climbs) ───────────────────────────────────────────────────── */
  'link.kitchen.cable': '밥솥 전선',
  'link.kitchen.seam': '수납장 이음매',
  'link.kitchen.hallway': '벽 안 배관 통로',
  'link.hallway.interphoneCable': '인터폰 배선',
  'link.hallway.shoeDrop': '신발장 옆면',
  'link.hallway.living': '거실 문 아래 틈',
  'link.hallway.bathroom': '욕실 문 아래 틈',
  'link.hallway.bedroom': '침실 문 아래 틈',
  'link.living.tvcable': 'TV 전원선',
  'link.living.sofaleg': '소파 다리',
  'link.living.throw': '흘러내린 무릎담요',
  'link.living.tableleg': '탁자 다리',
  'link.bathroom.riser': '배관 수직관',
  'link.bathroom.trap': '세면대 배수관',
  'link.bathroom.grout': '타일 줄눈',
  'link.bathroom.cistern': '물탱크 급수관',
  'link.bathroom.traylip': '트레이 턱',
  'link.bathroom.kitchen': '주방으로 가는 배관',
  'link.bedroom.cable': '휴대폰 충전선',
  'link.bedroom.duvet': '늘어진 이불자락',
  'link.bedroom.bedsidestep': '협탁에서 침대로',
  'link.bedroom.curtain': '커튼 자락',

  /* ── gates (physical openings) ────────────────────────────────────────── */
  'gate.kitchen.hallway': '배관 구멍 실리콘',
  'gate.kitchen.hallway.desc':
    '싱크대 배수관이 벽을 뚫고 나가는 자리가 굳은 실리콘으로 막혀 있다. 이걸 갉아 내면 벽 속 배관 공간을 지나 복도로 나갈 수 있다.',
  'gate.hallway.living': '거실 문 문풍지',
  'gate.hallway.living.desc':
    '거실 문 아래 틈이 문풍지로 눌려 있다. 일꾼들이 계속 보급을 대 주는 동안 갉아 내야 한다.',
  'gate.hallway.bathroom': '욕실 배관 슬리브',
  'gate.hallway.bathroom.desc':
    '욕실 쪽 배관이 지나는 슬리브가 헐거워져 있다. 수분은 넘치지만 물을 쓸 때마다 길이 쓸려 나간다.',
  'gate.bathroom.kitchen': '수직 배관 지름길',
  'gate.bathroom.kitchen.desc':
    '욕실과 주방은 같은 배관을 나눠 쓴다. 주방 쪽 끝을 뚫으면 복도를 건너지 않고 오갈 수 있다.',
  'gate.hallway.bedroom': '침실 문 문풍지',
  'gate.hallway.bedroom.desc':
    '침실 문은 닫혀 있고 안에는 사람이 자고 있다. 문풍지를 갉는 동안 소리가 난다. 군체 전체가 이 작업을 뒷받침할 수 있어야 한다.',

  /* ── chapters and objectives ──────────────────────────────────────────── */
  'chapter.kitchen': '1장 · 주방에서 버티기',
  'chapter.hold': '2장 · 주방을 지켜내기',
  'chapter.hallway': '2장 · 드러난 복도를 건너기',
  'chapter.living': '3장 · 여러 갈래를 동시에 굴리기',
  'chapter.bedroom': '4장 · 사람이 있는 방으로',
  'chapter.final': '마지막 · 주방 전체',
  'objective.kitchen.title': '1장 · 주방에서 버티기',
  'objective.kitchen.secure': '먹이와 수분을 확보하고, 일꾼이 오갈 길을 만들어라.',
  'surface.kitchen.table': '식탁 위',
  'surface.kitchen.chair': '의자',
  'surface.kitchen.bin': '음식물 쓰레기통 안',
  'link.kitchen.chairleg': '의자 다리',
  'link.kitchen.chairedge': '의자에서 식탁으로',
  'link.kitchen.charger': '충전기 줄',
  'link.kitchen.binlid': '젖혀진 뚜껑',
  'resource.kitchen.tablecrumbs': '식탁 부스러기',
  'resource.kitchen.tablering': '컵 자국',
  'resource.kitchen.binfood': '음식물 쓰레기',
  'foothold.kitchen.tableleg': '식탁 다리 안쪽',
  'foothold.kitchen.splashseam': '조리대 뒤 실리콘 틈',
  'foothold.kitchen.splashseam.desc':
    '상판과 뒷벽이 만나는 자리의 실리콘이 갈라져 있다. 집안이 가장 자주 쓰는 면 위라 위험하지만, 여기를 잡지 않으면 상판은 영원히 남의 땅이다.',
  'foothold.kitchen.tablelip': '식탁 상판 가장자리 홈',
  'foothold.kitchen.tablelip.desc':
    '식탁 상판이 앞테와 만나는 홈. 부스러기가 모이고 사람 눈은 닿지 않는다.',
  'foothold.kitchen.chairjoint': '의자 등받이 이음매',
  'foothold.kitchen.chairjoint.desc':
    '좌판과 등받이가 물린 틈. 의자는 밀어 넣었다 빼는 물건이라, 여기는 자리를 옮기는 유일한 거점이다.',
  'foothold.kitchen.binrim': '쓰레기통 테두리 밑',
  'foothold.kitchen.binrim.desc':
    '뚜껑 테두리 안쪽의 빈 곳. 방에서 가장 좋은 먹이가 여기 있고, 누가 통을 비울 때 방에서 가장 나쁜 자리도 여기다.',
  'foothold.kitchen.tableleg.desc':
    '식탁 다리를 잇는 받침 안쪽 빈 곳. 방의 반대쪽 끝을 잡으려면 여기가 있어야 한다.',
  'objective.kitchen.firstHold': '싱크대 밑 틈을 거점으로 삼아라. E를 눌러 차지한다.',
  'objective.kitchen.firstRoute': '먹이까지 페로몬 길을 놓아라. 일꾼이 그 길을 따라 나른다.',
  /*
   * Both of these taught rules the game no longer has, and the player was reading them all run.
   *
   * `grow` said capacity comes from claiming a refuge. It comes from SUPPLYING one — a refuge with
   * no healthy route feeding it contributes nothing (`state.ts recomputeCapacity`). `expand` said
   * take the rest of them; holding now taxes how fast the room forgets you
   * (`household.ts`, 4 % per refuge), and victory needs a majority rather than all. So the two
   * lines were pushing the player toward the play the economy had just started charging for.
   */
  'objective.kitchen.grow': '군체를 불려라. 거점은 보급선이 닿아 있을 때만 식구를 늘려 준다.',
  'objective.kitchen.expand':
    '필요한 만큼만 차지해라. 거점을 늘릴수록 집이 너희를 더 오래 기억한다.',
  'objective.final.title': '주방을 지켜라',
  /*
   * This is the line the player reads for most of the run, and it described a different game.
   *
   * "통로는 모두 열렸다. 이제 네 구역을…" — all the passages are open, now hold four regions —
   * survived the reseal to one room. There are no passages and there are no four regions; the build
   * ships with `openGates: []` and one unlocked region, so the sentence was simply false, and it was
   * false on the very first frame of a new run because `kitchenStepKey` falls through to it.
   */
  /*
   * "하나도 잃지 않고" — without losing a single one — was false by the time it was read.
   *
   * The sweep now levels a share of what is held, up to three refuges at high severity, and victory
   * needs a majority rather than all of them. So the line asked the player for something the game
   * does not require and, at the same severities it actually produces, makes impossible. It is the
   * same failure as the passages-and-four-regions sentence above: a string that survived the change
   * it described.
   */
  'objective.final.body':
    '주방은 군체의 것이 됐다. 집안이 박멸에 나선다 — 거점을 잃더라도 다시 세워 방을 놓지 마라.',

  /* ── blockers: the single binding constraint, computed from live state ─── */
  'blocker.workers': '일꾼이 부족하다 — {have}/{need}',
  'blocker.food': '먹이가 부족하다 — {have}/{need}',
  'blocker.moisture': '수분이 부족하다 — {have}/{need}',
  'blocker.foothold': '{foothold}{foothold?을/를} 먼저 차지해야 한다',
  'blocker.supply': '{foothold}{foothold?으로/로} 들어가는 보급선이 끊겨 있다',
  'blocker.alert': '{region}{region?이/가} 아직 경계 중이다 — 조용해질 때까지 기다려라',
  'blocker.adaptation': '적응을 하나 정해야 한다',
  'blocker.goThere': '{gate} 앞으로 가서 E를 눌러라',
  'blocker.holdRegion': '아직 차지하지 않은 거점이 있다',
  'blocker.population': '군체가 더 커져야 한다 — 일꾼 12마리',
  'blocker.stores': '비축이 모자라다 — 먹이 30, 수분 20',
  'blocker.extermination': '준비는 끝났다. 집안이 움직이기 전에 자리를 잡아라',

  /* ── adaptations ──────────────────────────────────────────────────────── */
  'adaptation.cost': '적응 {points}점',
  'adaptation.brood.1': '번식 강화',
  'adaptation.brood.1.desc': '거점 수용력이 늘고 알이 더 빨리 깬다. 대신 먹이 소모가 커진다.',
  'adaptation.brood.2': '집단 번식',
  'adaptation.brood.2.desc': '수용력이 한 번 더 늘고 손실 회복이 빨라진다.',
  'adaptation.scavenging.1': '수집 강화',
  'adaptation.scavenging.1.desc': '일꾼이 더 빨리 움직이고 한 번에 더 많이 가져온다.',
  'adaptation.scavenging.2': '집단 수집',
  'adaptation.scavenging.2.desc': '채집 속도가 한 번 더 오른다. 대신 흔적이 더 크게 남는다.',
  'adaptation.shadow.1': '은신 배선',
  'adaptation.shadow.1.desc': '정찰병과 길이 눈에 덜 띈다. 통로 작업도 빨라진다.',
  'adaptation.shadow.2': '그림자 연결망',
  'adaptation.shadow.2.desc': '흔적이 크게 줄고, 길이 끊겨도 회복이 빠르다.',

  /* ── household routines ───────────────────────────────────────────────── */
  'routine.kitchen.dishes': '설거지',
  'routine.kitchen.dinner': '늦은 식사',
  'routine.kitchen.fridge': '냉장고 문 열기',
  'routine.kitchen.kettle': '물 끓이기',
  'routine.kitchen.bin': '음식물 쓰레기 비우기',
  'routine.kitchen.water': '물 마시러 나옴',
  'routine.living.tv': 'TV 시청',
  'routine.bathroom.use': '욕실 사용',
  'routine.bedroom.phone': '머리맡 휴대폰',
  'routine.hallway.pass': '복도 통행',
  'routine.hallway.door': '현관문 여닫기',
  'routine.bathroom.shower': '샤워',
  'routine.bedroom.sleep': '잠자리에 듦',
  'routine.bedroom.restless': '뒤척임',
  'routine.living.snack': '야식',
  'routine.incoming': '곧 시작된다',
  'routine.active': '진행 중',

  /* ── household responses ──────────────────────────────────────────────── */
  'threat.footsteps': '발소리',
  'threat.light': '불 켜기',
  'threat.wipe': '행주질',
  'threat.move': '물건 치우기',
  'threat.trap': '끈끈이 설치',
  'threat.vacuum': '로봇청소기 가동',
  'threat.spray': '살충제 살포',
  'threat.swat': '내리치는 손',

  /* ── alert levels ─────────────────────────────────────────────────────── */
  'alert.0': '조용함',
  'alert.1': '눈치챔',
  'alert.2': '의심',
  'alert.3': '경계',
  'alert.4': '박멸 시도',

  /* ── run log ──────────────────────────────────────────────────────────── */
  'log.route.laid': '{target}{target?으로/로} 가는 페로몬 길을 놓았다.',
  'log.route.faded': '아무도 지나지 않은 길이 지워졌다.',
  'log.route.washed': '{threat}에 길이 쓸려 나갔다.',
  'log.firstDelivery': '첫 먹이가 둥지에 들어왔다.',
  'log.found': '{site}{site?을/를} 찾았다.',
  'log.foothold.claimed': '{foothold}{foothold?을/를} 차지했다.',
  'log.foothold.lost': '{foothold}{foothold?이/가} 무너졌다.',
  'log.foothold.rebuilt': '{foothold}{foothold?을/를} 다시 세웠다.',
  'log.gate.opened': '{region}{region?으로/로} 가는 길이 열렸다.',
  'log.gate.interrupted': '{gate} 작업이 중단됐다.',
  'log.chapter': '{chapter}',
  'log.adaptation': '{adaptation}{adaptation?을/를} 택했다.',
  'log.sighting': '{region}에서 들켰다.',
  'log.alert.raised': '{region} 경계 단계가 {level}{level?으로/로} 올라갔다.',
  'log.routine.incoming': '{routine}{routine?이/가} 곧 시작된다.',
  'log.threat.incoming': '{region}에서 {threat}{threat?이/가} 시작된다.',
  'log.starved': '먹이가 떨어져 일꾼을 잃었다.',
  'log.extermination': '{region}에 박멸 시도가 들어왔다.',
  'log.won': '주방이 군체의 영역이 됐다.',
  'log.threat.swat': '봤다. 손이 내려온다.',
  'log.scout.stomped': '정찰병이 밟혔다. 일꾼 하나가 그 자리를 물려받는다.',
  /*
   * 싱크대, not 개수대 — and 일꾼, not 개체.
   *
   * Both are the same object under two names, and both were visible on screen at once: the help
   * card says 「싱크대 밑 틈」 while the revival log said 「개수대 밑에서 나왔다」, and the stomp
   * frame put 「일꾼 하나가 그 자리를 물려받는다」 in the log directly under 「다음 개체가 올라오는
   * 중」 in the centre banner. §4 governs terminology by glossary; a player reading two words for
   * one thing has to work out whether they are the same thing, and that work is the cost.
   */
  'log.scout.revived': '새 정찰병이 싱크대 밑에서 나왔다.',
  'log.lost.extinct': '군체가 전멸했다. 알을 깔 일꾼이 남지 않았다.',
  'log.lost.noScout': '정찰병이 밟혔고, 대신 나설 일꾼이 없다.',
  'log.lost': '군체가 무너졌다.',

  /* ── cue for state changes the HUD announces ──────────────────────────── */
  'adaptation.chosen': '적응 선택',

  /* ── HUD ──────────────────────────────────────────────────────────────── */
  'hud.food': '먹이',
  'hud.moisture': '수분',
  'hud.population': '군체',
  'hud.capacity': '수용력',
  'hud.routes': '페로몬 길',
  'hud.alert': '경계 단계',
  'hud.time': '경과',
  'hud.blocked': '막힌 이유',
  'hud.objective': '지금 할 일',
  'hud.adaptationPoints': '쓸 수 있는 적응 {count}',
  'hud.seen': '들킬 위험',
  'hud.caught': '밟히기까지',
  'hud.down': '정찰병을 잃었다 — 다음 일꾼이 올라오는 중',
  'hud.stores': '비축이 한계다 — 거점을 늘려라',
  'hud.routeHealth.ok': '정상',
  'hud.routeHealth.incomplete': '양 끝이 붙지 않았다',
  'hud.routeHealth.disconnected': '끊김',
  'hud.routeHealth.blocked': '먹이가 떨어졌다',
  'hud.routeHealth.congested': '통로가 막혔다',
  'hud.routeHealth.compromised': '들킨 길',
  'hud.routeHealth.washed': '쓸려 나갔다',
  'hud.press': '{key} 키',

  /* ── controls / onboarding ────────────────────────────────────────────── */
  'help.title': '조작',
  'help.move': 'WASD — 정찰병 이동',
  'help.sprint': 'Shift — 전력 질주 (숨이 찬다)',
  'log.route.started': '페로몬을 흘리기 시작했다. 먹이까지 걸어가라.',
  'log.route.cancelled': '흘리던 페로몬을 지웠다.',
  'log.route.needNest': '거점 위에서만 길을 시작할 수 있다.',
  'log.route.needSource': '먹이나 물가에 서서 F를 눌러 길을 끝내라.',
  'log.route.tooShort': '길이 너무 짧다.',
  'log.route.noneNear': '가까이에 지울 길이 없다.',
  'help.route': 'F — 거점에서 시작, 걸어가서 먹이 앞에서 다시 F',
  'help.erase': 'G — 가장 가까운 길 지우기',
  'help.interact': 'E — 거점 차지',
  /*
   * Contextual-prompt labels. The HUD draws the key as its own chip, so these must NOT repeat it —
   * reusing the help-card strings printed "EE — 거점 차지" on screen.
   */
  'prompt.claim': '거점 차지',
  'prompt.rebuild': '거점 다시 세우기',
  'prompt.working': '통로 작업 중',
  'prompt.climb': '타고 오르기',
  /*
   * The route keys had no contextual prompt at all, which meant the game's own differentiating
   * mechanic was reachable only from a help card that closes on the first keypress and can never be
   * reopened. A player who blinked never learned that F exists.
   */
  'prompt.startRoute': '여기서 페로몬 길 시작',
  'prompt.sealRoute': '길 잇기',
  /*
   * The escape hatch rides on the status line rather than on its own key chip.
   *
   * `prompt.cancelRoute` had zero references in `src/` — the player could start a route and had no
   * on-screen way to learn they could stop. Giving it a chip of its own does not work either: the
   * prompt slot shows one action at a time, and this state has no action, it has a status. So the
   * status says both things in one line.
   *
   * The old string was 'G — 그만두기', which would have rendered as 「GG — 그만두기」 next to the
   * key chip `hud.ts` draws. Kept as the bare verb for that reason.
   */
  'prompt.walkingRoute': '길을 놓는 중 — 먹이까지 걸어가라 · G로 그만두기',
  'prompt.cancelRoute': '그만두기',
  'help.traverse': 'Space — 전선·배관 타고 오르내리기',
  'help.adapt': '1 2 3 — 적응 선택',
  'help.pause': 'Esc — 잠시 멈춤',
  'log.broodHold.on': '번식 보류 — 잉여를 비축한다',
  'log.broodHold.off': '번식 재개',
  'help.broodHold': 'H — 번식 보류/재개',
  'log.recall.ordered': '긴급 소환 — 일꾼 {count}마리가 짐을 버리고 거점으로 뛴다',
  'log.recall.cooling': '아직 숨을 고르는 중이다 — 다시 부를 수 없다',
  'help.recall': 'Q — 긴급 소환 (짐을 버린다)',
  'log.bait.laid': '일부러 흔적을 남긴다 — 사람이 지금 온다. 더 세게 온다.',
  'log.bait.pointless': '지금은 남길 흔적이 없다',
  'help.bait': 'B — 미끼 (박멸을 앞당긴다)',
  'hud.broodHold': '번식 보류',
  'help.restart': 'R — 다시 시작',
  // Was 「아무 키나 눌러 시작」, which invited the player to destroy the card by reaching for W.
  'help.dismiss': 'Space를 눌러 시작 · Esc로 언제든 다시 열기',
  // The first prose a player ever reads. It promised a flat; the game is one kitchen.
  'help.intro':
    '너는 정찰병 바퀴다. 싱크대 밑 틈 하나에서 시작해, 이 주방을 통째로 군체의 영역으로 만들어라.',

  /* ── pause and results ────────────────────────────────────────────────── */
  'pause.title': '멈춤',
  'pause.resume': 'Esc — 계속',
  'pause.restart': 'R — 다시 시작',
  // Was '집 전체를 점거했다', directly contradicting its own body line one row below.
  'result.won.title': '주방을 점거했다',
  'result.won.body': '주방의 모든 거점이 군체의 것이 됐고, 박멸 시도를 견뎌 냈다.',
  'result.lost.title': '군체가 무너졌다',
  'result.lost.body': '남은 거점이 없다. 숨을 곳도, 알을 깔 자리도 없다.',
  'result.time': '걸린 시간 {minutes}분 {seconds}초',
  'result.deliveries': '배달 {count}회',
  'result.peak': '최대 군체 {count}마리',
  'result.sightings': '들킨 횟수 {count}회',
  'result.lost.workers': '잃은 일꾼 {count}마리',
  'result.scoutsLost': '밟힌 정찰병 {count}마리',
  'result.restart': 'R — 다시 시작',

  /* ── loading and recoverable errors ───────────────────────────────────── */
  'loading.title': '집이 잠들기를 기다리는 중',
  'loading.assets': '자리를 잡는 중…',
  'error.webgl': '이 브라우저에서는 3D 화면을 켤 수 없다. WebGL2를 켜고 다시 열어라.',
  'error.runtime': '문제가 생겼다. R을 눌러 다시 시작해라.',
  'error.audioBlocked': '소리는 화면을 한 번 누른 뒤에 나온다.',
} as const;

export type KoKey = keyof typeof ko;
