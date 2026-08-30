# 코덱스 지시문 — 분담 규칙 (크로스 작업)

상태: 현재 작업 분담 기준. 완료된 단계는 아래 로드맵의 커밋 해시를 따른다.

---

지금부터 클로드와 나눠서 작업한다. **파일 소유권을 지켜라. 남의 구역 파일은 열어도 되지만 고치지 마라.**

## 너(코덱스)가 맡는 것

**저장소 운영 전부**
- 커밋, 브랜치, 테스트 실행, 배포
- `npm run release:gate`, `npm run deploy:production` (직접 `wrangler pages deploy` 호출 금지)
- 충돌 해결. 클로드가 넘긴 패치가 현재 트리와 안 맞으면 네가 맞춰라

**화면·UI 전부**
- `js/app.js`, `js/battle-v3-live.js`, `js/pve-command-v2-live.js`, 그 외 `js/*.js`
- `css/**`, `index.html`
- `admin/**`, `cms/**` (CMS 화면)
- `preview/**` 의 프리뷰 페이지

**서버 라우팅·저장·보상**
- `functions/api/[[path]].js` 중 **전투 계산이 아닌 부분** (인증, 보상 지급, 드랍, 로그, 스키마)

## 클로드가 맡는 것 — 손대지 마라

**전투 계산과 밸런스 수치**
- `functions/_battle_v2_preview.js`  ← 전투 엔진. 절대 직접 수정 금지
- `functions/_magic.js` 의 고유효과 부분
  (`buildCardUniqueDeckState`, `resolveUniqueBattleRuntime`, `scaleUniqueEffect`, `uniqueStat`, `withDominantUniqueStat`)
- `preview/project-v-v3/source/battle/BattleEngine.js` 의 전투 판정 부분
- `tools/balance-harness-v1903/**`  ← 검증 하네스
- `UNIQUE-TRAIT-V2-AND-AWAKENING-DESIGN.md`  ← 밸런스 설계서

이 파일들에 손댈 일이 생기면 **고치지 말고 보고해라.** 어디가 왜 문제인지 적어서 넘겨라.

## 경계가 겹치는 곳 — 규칙

`functions/api/[[path]].js` 는 둘 다 만진다. 이렇게 나눈다.

- 전투 카드 구성 / 전투력 계산 / 승패 판정 → **클로드**
  (`engineCards`, `cardPower`, `playerPower`, `uniqueRuntime`, `synergyMultiplier`, `createPveBattleV2` 호출부)
- 그 외 전부 → **너**

같은 파일을 동시에 고쳐야 하면 **먼저 말해라.** 한쪽이 끝나고 넘겨받는다.

## 지금 트리에 들어와 있는 것

두 건은 아래 해시로 각각 완료됐다. 관련 문서는 재실행 지시가 아니라 검증·커밋 이력이다.

- `CODEX-COMMIT-v1934.md` — V3 전장 로딩 무한 대기 수정 이력 (`f3ab1b47`)
- `CODEX-COMMIT-v1935.md` — 고유효과 이중 적용 제거 + 고배율 재클램프 이력 (`cac68678`)

두 건은 렌더링 버그와 밸런스 정합성의 롤백 단위를 분리해 별도 커밋으로 보존한다.

## 진행 중인 밸런스 개편 로드맵

설계서는 `UNIQUE-TRAIT-V2-AND-AWAKENING-DESIGN.md` 다. 순서는 이렇다.

| 단계 | 내용 | 담당 | 상태 |
|---|---|---|---|
| S0 | 고유효과 이중 적용 제거 | 클로드 | 완료 · `cac68678` |
| S2 | 스킬 이펙트 6종 결선 프리뷰 | **너** | 프리뷰 완료 · `6bbaa316` · 런타임 미연결 |
| S1 | 계열 규칙 개편 (공/방/속/힐) | 클로드 | 대기 |
| S3 | 전술 전직 4종 | 클로드 설계 + 너 UI | 대기 |

**S2 리소스는 독립 프리뷰까지만 준비됐다.** 사용자가 실제 연결 대상을 정하기 전에는 런타임에 연결하지 않는다. 리소스는
`preview/project-v-v3-live-style-event-fx-v2/` 에 있다 (12프레임 512x455, 4x3 아틀라스,
24fps, 충돌 프레임 6 = 250ms, blend screen, MP3 페어).

향후 사용자가 연결을 지시할 경우의 후보는 전부 **엔진에 이미 있는 판정**이다. 새 메커니즘을 만들지 마라.

| 이펙트 | 붙일 곳 |
|---|---|
| `critical` | 타임라인 `TURN` 이벤트의 `critical: true` |
| `dodge` | 타임라인 `TURN` 이벤트의 `dodge: true` |
| `counter` | `COUNTER` 이벤트 |
| `revive` | `SURVIVE` / `INDOMITABLE` / `MAGIC_CARD{revived:true}` |
| `ultimate` | 개전 플레이어 궁극기 |
| `boss-ultimate` | 개전 보스 궁극기 |

주의할 것
- 일반 공격 이벤트 타입은 `ATTACK` 이 아니라 **`TURN`** 이다. 필터에서 자주 틀린다.
- 동시 발생 우선순위: `boss-ultimate` > `revive` > `ultimate` > `counter` > `critical` > `dodge`
- 치명타·회피는 판정당 1회만. 연속 발생 시 마지막 것만 재생
- **CSS 대각선 광선·빛기둥 장식은 절대 쓰지 마라.** 마름모·원형 룬·별도 쓰지 마라
- 카드 위에 정보를 계속 덧붙이지 마라. 0.5초 이펙트 + 게이지 링까지만

## UI 문제 보고 형식

화면 문제를 발견하면 이 형식으로 적어라. 클로드가 이 형식으로 읽는다.

    [화면]     어느 화면 / 어느 모달
    [기기]     데스크톱 / 모바일, 뷰포트 폭
    [증상]     보이는 그대로
    [재현]     1) ... 2) ... 3) ...
    [콘솔]     에러 있으면 원문
    [원인]     찾았으면. 못 찾았으면 "미확인"
    [경계]     전투 계산에 닿는지 여부

`[경계]` 가 "닿음" 이면 고치지 말고 넘겨라.

## 하지 말 것

- 전투 엔진(`_battle_v2_preview.js`)을 "잠깐만" 고치는 것. 밸런스 측정이 통째로 무효가 된다
- 밸런스 수치를 임의로 조정하는 것. 설계서 값과 어긋나면 전부 다시 재야 한다
- 사용자 지시 없이 배포하는 것
