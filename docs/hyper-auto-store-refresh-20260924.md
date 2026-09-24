# 하이퍼팩 자동개봉 중간 중지 수정 — 2026-09-24

## 재현한 원인

- 개봉 완료 이벤트 `mercenary-pack:complete`를 받은 `js/app.js`가 `me/summary`로 잔액을 갱신한 후 `renderShell('buy')`를 호출했다.
- 같은 상점을 다시 그려도 셸은 `cleanupShellRoute()` → `cnine:route-will-change`를 발생시킨다. 자동개봉은 이 이벤트를 실제 화면 이탈로 판단해 중지했다. 잔액 응답 시점에 따라 첫 묶음 또는 뒤쪽 묶음에서 멈출 수 있었다.
- 기존 자동개봉 브라우저 검사는 별도 HTML에 하이퍼팩 화면과 개봉 모듈을 올렸기 때문에 실제 `app.js`의 잔액 갱신 리스너를 실행하지 않았다. 이번에는 실제 `index.html`·상점 라우터·공용 재화 UI·개봉 모듈을 함께 실행했다.
- 수정 전 새 단위 검사에서 상점 재이동 호출 1회가 검출됐고, 실제 상점 브라우저 재현에서 **37회 중 10회 완료 후 ‘화면 이탈로 자동 개봉을 중지했습니다.’**로 끝났다.

## 수정 범위

- 잔액 갱신 후 상점 전체 재렌더링을 제거했다. 기존 `saveUser`의 `cnine:player-updated` 이벤트로 공용 HUD만 갱신하며, 기존 뽑기 갱신 구분인 `{source:'draw'}`를 전달한다.
- 실제 메뉴 이동·화면 숨김·중지 버튼·계정 변경 시 중단은 유지한다. 다른 계정이나 이후 거래의 상태를 오래된 응답으로 덮지 않는 기존 account ID / mutation epoch 검사도 유지한다.
- `index.html`의 앱 캐시에 `hyperAuto=20260924-store-refresh`를 추가했다. 서버 거래·재시도 횟수·영수증·확률·개봉 단가·보상·CMS·기능 플래그는 변경하지 않는다.

## 관련 검증과 배포 기준

- 새 `tests/hyper-auto-store-refresh-20260924.test.mjs`: 상점 재이동 없는 잔액 저장, 다른 계정/새 거래 뒤 도착한 이전 응답 무시.
- 새 `tests/hyper-auto-store-refresh-20260924.browser.mjs`: 실제 게임 진입점, 모든 API는 로컬 모의 응답. PC 1440×1000 / 모바일 390×844 **29개 검사 통과**, JavaScript 예외 0건. 37회 요청을 10+10+10+7로 정확히 완료하고, 공용 HUD 981,500,000,000 코인과 마스터의 별 111개, 최근 결과 20개 제한을 확인했다. 중지 버튼·실제 다른 메뉴 이동·빈 개봉 응답의 동일 영수증 GET 복구도 검사했다. 운영 계정 재화는 소비하지 않았다.
- PC·모바일 캡처 직접 확인: `C:/Users/User/AppData/Local/Temp/hyper-auto-store-E5rn80/`.
- 작은 클라이언트 오류 수정으로 scoped 배포한다. 운영 목록에서 대조한 기준: Pages `71be1709-b9aa-42a7-acc8-590d22ed75d2`, 소스 `fced72f20da9aab470533b81180d8774ffe0a68f`.
- 배포 선택 검사: 위 신규 단위 회귀, `tests/hyper-opening-ui-v2097.test.mjs`, `tests/mercenary-response-recovery-20260924.test.mjs`. 같은 요청 복구·정확한 비용·이중 클릭·미확정 결과 보존·수동 개봉 계약을 함께 확인한다. 도감·다른 상점·전투 전체 검사는 반복하지 않는다.
- Windows Node 테스트 자식 프로세스 정지 이력을 고려하여 `NODE_OPTIONS=--test-isolation=none`으로 동일 검사를 실행한다. 지정 `npm run deploy:production -- --scoped`의 출시·캐시·Hyperdrive 검사는 우회하지 않는다.
- 배포 후에는 변경 앱 파일과 캐시 반영, 공개 개봉 상태만 확인한다. 실제 운영 개봉 POST를 테스트로 보내지 않는다.

## 운영 반영 완료

- 수정 커밋 `425b58f8`, 지정 scoped 배포의 관련 회귀 **19개 통과**, 출시·캐시·Hyperdrive 검사 통과.
- Pages `https://70c885b6.cnine-card.pages.dev`, 동반 clan-draft 버전 `28fd4c11-767d-49e3-9ebb-5f9baef120a5` (Worker 로직 변경 없음).
- 운영 `index.html`·`js/app.js`의 SHA-256이 로컬 배포본과 일치하고 새 `hyperAuto=20260924-store-refresh` 연결을 확인했다. 공개 개봉 상태 HTTP 200, ON, 1회 5억, 요청당 최대 10회가 유지된다.
- 운영 개봉·차감 시험은 하지 않았다. 이 완료 기록은 문서 전용 후속 커밋이며 재배포하지 않는다.
