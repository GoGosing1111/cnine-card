# 격전지 보유 용병·카드 목록 조회 오류 — 2026-10-12

## 재현과 원인

운영 계정으로 PVE → 격전지 진입 시 “ICON 카드는 덱에 최대 2장까지만 편성할 수 있습니다. 덱을 다시 저장해주세요.”가 표시됐다. `GET coop/options`에서 보유 카드 전체를 하나의 출전 덱으로 `cardUniqueDeckState`에 전달해 ICON을 3장 이상 보유한 계정의 목록 조회가 실패했다. 용병 목록도 같은 응답으로 받으므로 함께 표시되지 않았다.

## 수정 범위

- `loadCoopOwnedCards`의 보유 전체 조회는 카드별 고유효과·전직·ICON 역할 정보를 독립 평가한다. 75장 단위의 기존 배치 평가 API를 사용해 조회 폭과 전직 배치 한도(120장)를 지킨다.
- 실제 선택한 카드 조회는 기존 덱 검사 경로를 유지한다. 2장 편성·소유권·슈퍼스타 제한·공통 ICON 제한·보상 및 운영 설정을 변경하지 않는다.
- 원래 카드 전투력과 목록 순서를 보존하며 고유효과를 전투력에 중복 반영하지 않는다.
- API 의존성 연결과 기존 협동전 테스트 하네스에 배치 함수를 연결한다. UI·캐시·공용 고유효과 함수는 변경하지 않는다.

## 검증

- 신규 `tests/cooperative-inventory-20261012.test.mjs` 4개 통과. 실제 고유효과/ICON 처리 함수를 사용해 3 ICON 보유, 250장 대량 목록, 소유하지 않은/수량 0 카드 제외, 카드별 효과 보존, 선택 시 제한 유지, 빈 목록을 검증했다.
- 수정 전에는 동일 3 ICON 보유 입력에서 운영과 같은 `ICON_DECK_LIMIT`가 발생했다.
- 기존 `tests/cooperative-websocket.test.mjs`에 허용 계정의 options 응답이 카드·용병 목록을 함께 반환하는 검사를 추가했다. 배포 단계에서 이 API/선택·소유권 회귀와 Worker 컴파일을 실행한다. 이미 통과한 신규 4개 검사를 배포 단계에서 반복하지 않는다.

## 배포 계획

- 직전 운영 Pages: `07941352-2860-497a-b0a6-b29dd966638e`, Source `cc3fa74`.
- 명령: `npm run deploy:production -- --scoped`.
- 선정 검사: `tests/cooperative-websocket.test.mjs`, `check:worker`.
- 작은 격전지 조회 오류 수정이다. 공통 인증·DB/트랜잭션·스키마·의존성·전투 계산을 변경하지 않으므로 전체 게이트를 실행하지 않는다.
- 기존 미배포 범위는 지급 실행 도구/기록과 이미지 검수 자산뿐이며 게임 실행 코드 추가 변경은 없다.
- 운영 반영 후 실제 두 보유 목록을 짧게 확인하고 재현/확인 화면과 배포 결과를 기록한다.

## 운영 반영 결과

- 2026-10-12 코드 커밋 `41c767f459d9391159b0375b2d8016ae5c40b8a2`을 `origin/main`에 반영하고 지정 scoped 명령으로 운영 배포 완료(exit 0).
- 배포 단계의 협동전 API/WebSocket 회귀 1개와 `check:worker` 통과. 신규 목록 회귀 4개를 포함해 관련 테스트 총 5개 통과. 출시 플래그·캐시·Hyperdrive 쿼리 캐시 OFF 검사도 통과했다.
- Pages: `https://ea53e299.cnine-card.pages.dev`.
- API runtime Worker: `0e14451e-696a-485a-bbfb-b78e6ee26eba`.
- Scheduler Worker: `de61379c-3e8b-412f-ab4b-4f65a790ce49`.
- 실제 운영 도메인 `https://cnine-card.pages.dev/`에서 같은 계정으로 새로고침 후 PVE → 격전지 → 일반 대기방에 진입했다. 기존 ICON 제한 오류가 사라졌고 **용병 41종·카드 387종**이 각 탭에 정상 표시됐다. 카드 목록에 ICON 5종과 강화·고유효과 정보도 표시됐다.
- 검증용 대기방은 확인 후 나갔으며 모집 목록 0개로 종료됨을 확인했다. 편성·출전·보상 수령은 실행하지 않았다.
- 로컬 검수 자료: `C:/Users/User/.codex/tmp/cooperative-roster-fix-20261012/`의 `before.png`, `after-mercenaries.png`, `after-cards.png`, `deploy.log`.
- 이 결과 기록은 문서만 변경하므로 범위 커밋·원격 반영으로 마치고 게임 검사·운영 배포를 반복하지 않는다.

