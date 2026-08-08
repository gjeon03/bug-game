# 부엌을 점거하라

한밤중 한국 아파트 부엌에 숨어드는 **정찰 바퀴벌레**를 조작하는 3D 전략-액션 게임. 몸으로 직접 걸은
길만 페로몬 길이 되고, 일꾼은 명령이 아니라 그 길만 읽습니다. 보급로가 늘수록 군체는 강해지지만,
사람은 정확히 어디를 쳐야 하는지 배웁니다.

TypeScript · Vite · three.js(WebGL2). 결정론적 고정 스텝 시뮬레이션. 모든 아트는 밀리미터 단위로
작성된 절차적 three.js 지오메트리이고, 외부 에셋을 내려받지 않습니다. 한국어 전용 UI, 폰트는
NanumSquareNeo 로컬 번들.

## 실행

```bash
pnpm install
pnpm build && pnpm preview   # http://127.0.0.1:4273/
```

조작법과 첫 플레이 경로는 [`LOCAL_REVIEW.md`](LOCAL_REVIEW.md)에 있습니다.

## 검증

```bash
pnpm review    # format · lint · typecheck · test(108개, ~11초) · build · 실브라우저 캡처
```

`pnpm test`에는 게임 자체를 단언하는 전체 런 스위트(`tests/unit/run.test.ts`)가 포함됩니다 — 승리
여부, 페이싱, 45초 무의사결정 구간 부재, 박멸 생존, 빌드 간 분화, 재시작 결정성. 이 파일이 게이트
밖에 있던 동안 "테스트 통과"가 여러 번 잘못 보고됐기 때문에, 다시 빼지 않습니다.

## 문서

| 파일                                                         | 내용                                          |
| ------------------------------------------------------------ | --------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                     | 운영 규칙 — 저장소 경계, 게이트, 방법론       |
| [`.claude/gauntlet-state.md`](.claude/gauntlet-state.md)     | **현재 상태의 유일한 출처.** 결함 원장        |
| [`LOCAL_REVIEW.md`](LOCAL_REVIEW.md)                         | 로컬 실행, 조작법, 검증된 것과 아닌 것        |
| [`DECISIONS.md`](DECISIONS.md)                               | 중요한 이탈과 그 근거                         |
| [`ASSET_MANIFEST.md`](ASSET_MANIFEST.md)                     | 에셋 제작 방식과 완성도 분류                  |
| [`docs/COMPLETION_RECOVERY.md`](docs/COMPLETION_RECOVERY.md) | 동결된 세션 기록(§62까지). 읽되 덧붙이지 않음 |
| [`docs/superseded/`](docs/superseded/)                       | 폐기된 빌드의 문서. **다시 쓰지 않음**        |

## 배포

`main` 푸시 시 GitHub Pages로 자동 배포됩니다: <https://gjeon03.github.io/bug-game/>
