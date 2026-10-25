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
- 조사 시작 시 운영은 `c9ec8977e` / Pages `7fec680e`였다(`production-before.json`). 병행 작업의 정규전 수·토·일 변경을 보존해 합쳤고, 해당 배포 완료 뒤 실제 직전 운영 소스 **`e5b302398bb1c4b4c314b79896ccfd0a2e5a0bc5`**, Pages **`017d2cac-634e-428f-b438-7401f1d632b9`**를 scoped 기준으로 사용했다(`production-base.json`).
- 작은 화면 유지 오류이므로 위 브라우저 회귀를 선택해 `npm run deploy:production -- --scoped`를 사용했다. 기능 출시·계정·경제·명단 변경은 없다.

## 운영 완료

- 배포 소스 **`ae9831fa0091e04b26d145cb1cd471425e37254d`**, Pages **`c21e5287-04a9-4a62-ba5f-ea402929eef4`**, 2026-10-25 **18:49:11 KST** 성공. Cloudflare canonical deployment의 소스·성공 상태를 확인했다(`production-after.json`).
- 최종 scoped 회귀 1개 통과: PC/모바일 정상·장애·복구 갱신 6회와 직접 닫기/탭 이동/재입장/Escape. 최신 일정 코드를 합친 결과는 `release-browser-verification.json`이다. 출시/메인-SW 캐시 일치·Hyperdrive 검사도 통과했다.
- 변경된 공개 파일 3개는 모두 HTTP 200·UTF-8 LF 정규화 SHA-256 일치(`public-files.json`).
- 공개 `js/clan-v1.js`를 내려받아 **바이트 변경 없이** 로컬 검수 서버에서 제공하고 모바일 390px에서 실제 20초 타이머를 실행했다. 같은 본부 iframe과 열린 세력전 창·선택 탭 유지, 페이지 오류/누락/쓰기 0건을 확인했다(`public-browser-verification.json`, `390-public-faction-after-poll.png`). 운영 로그인 계정/실제 전투 검증으로 확대 보고하지 않는다.
- 최초 공개 검수는 원격 classic script를 다른 origin에 바로 연결해 상대 동적 import의 기준 URL이 `about:blank`가 된 검수 환경 오류였다. 공개 스크립트를 같은 origin 경로에서 제공하도록 검수 도구만 보완했다. 이 보완은 게임 코드를 바꾸지 않으며 추가 운영 배포가 필요 없다.
- API runtime `838a6d3c-7767-41e3-bb61-776a80535d19`, clan-draft `c15560ef-fdb2-42c8-b8d5-ba880ee75940`. 운영 DB/계정/설정 쓰기 0건. 기존 일정 변경을 함께 보존했다.
- 배포 로그와 검수 원본: `C:/Users/User/.codex/visualizations/2026/10/25/01a17207-abdc-7271-abb4-6302f9e3a9bc/faction-window-polling-20261025/`. 기존 체크아웃/의존성을 재사용했으며 임시 배포 자산은 표준 도구의 `finally` 정리 경로를 사용했다.

안내 문구: “세력전을 켜 둔 상태에서 자동으로 클랜 대기로 이동하던 오류를 수정했습니다. 새로고침 후 다시 입장해 주세요.”
