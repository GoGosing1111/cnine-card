# 세력전 자동 종료 · 클랜 대기 복귀 수정 — 2026-10-25

## 원인과 수정

사용자 문의: 세력전을 켜 둔 상태에서 클랜 대기 화면으로 반복 복귀한다.

클랜 재개 API는 `restoration`을 제공하면서 `organizationPreparation:null`을 반환한다. 클랜 화면은 이 상태에서도 조직 본부 iframe을 표시하지만, 기존 `ClanV1.render()`의 iframe 유지 조건은 `organizationPreparation`만 검사했다. 실제 20초 자동 조회가 시작될 때 본부 iframe이 제거되면 그 iframe의 `pagehide` 정리가 자신이 연 세력전 창까지 닫았다.

`js/clan-v1.js`의 기존 유지 조건에 재개 후 `restoration` 상태를 포함했다. 본부 탭, 기존 iframe, 레거시 종료 상태가 모두 일치할 때만 유지한다. 자동 조회 주기·데이터 갱신과 명시적 탭 이동·창 닫기는 그대로다. 스크립트 URL과 메인/SW 캐시 버전을 함께 갱신했다.

## 재현·관련 검증

- 수정 전 실제 모듈과 재개 API fixture에서 20초 타이머를 실행하자 본부 iframe이 끊기고 세력전 창이 닫혔다. `reproduction-before.json` 참조.
- 관련 회귀: `node --test tests/clan-faction-window-polling-20261025.browser.mjs` 1개 통과. PC 1440×1000·모바일 390×844에서 정상 조회→503 일시 장애→정상 복구 시 같은 본부/세력전 iframe과 선택 탭을 유지했다.
- 세력전 직접 나가기, 본부 선택 탭 유지, 정규전 탭 이동, 본부 복귀·세력전 재입장, 실제 Escape 닫기 및 스크롤 복원을 확인했다. 페이지 오류·누락 리소스·브라우저 쓰기 요청 0건.
- Playwright 가상 시계로 실제 20초 타이머 콜백을 실행했다. 격리된 PostgreSQL 호환 fixture에서 실제 서버 핸들러를 호출했으며 운영 계정이나 DB를 사용하지 않았다. fixture의 128명은 재현 데이터이며 현재 운영 명단을 의미하지 않는다.
- 기존 본부/세력전 UI와 리소스를 사용했다. 대표 PC·모바일 화면을 직접 확인했다. 승인 원화나 배치를 새로 만들지 않았다.

## 배포 범위

- 변경 실행 파일: `js/clan-v1.js`, `index.html`, `service-worker.js`.
- 직전 운영 소스 `c9ec8977e4179c945c0303a3fc2d7328b790d380`, Pages `7fec680e-a250-4e8b-8c04-87ed35267873`; `production-before.json` 참조.
- 작은 화면 유지 오류이므로 위 브라우저 회귀를 선택해 `npm run deploy:production -- --scoped`를 사용한다. 기능 출시·계정·경제·명단 변경은 없다.
- 배포 및 공개 파일 검증 결과는 완료 후 이 문서에 추가한다.
