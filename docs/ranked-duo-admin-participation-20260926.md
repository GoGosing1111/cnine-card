# ADMIN 랭크 듀오 참가 — 2026-09-26

사용자 요청: admin 계정도 랭크 듀오에 참여할 수 있게 수정한다.

- `ADMIN` 역할을 듀오 참가 제외 조건에서 제거한다. 참가 신청, 전력 평가, 자동 팀 편성, 실시간 순위와 최종 정산에 동일하게 적용한다.
- 개인 행동력, 정상 계정/차단 여부, 공격·방어 덱, 모집 마감, 정원, 보상·트로피 조건은 일반 참가자와 동일하다.
- `OWNER` 참가 제외와 OWNER 전용 CMS 권한은 유지한다. 계정 역할 변경, 운영 계정 대리 참가, 과거 정산 재처리, 기존 시즌·팀·일정·설정 변경은 하지 않는다.
- 기존 다섯 조건만 수정한다. DB 스키마·공통 인증/권한 기반·거래 구현·UI·자산·의존성 변경은 없다. 쿼리 수와 조회 범위/상한을 추가하지 않는다.

## 재현과 관련 검사

- 수정 전 ADMIN 참가 요청이 403으로 거절되는 회귀를 재현했다.
- `node --test tests/ranked-duo-admin-participation-20260926.test.mjs`: 수정 후 4개 통과.
- SQLite와 PostgreSQL pipeline에서 참가/중복/취소, 자동 팀 편성, 순위 포함, 전력 평가, 대전 및 행동력 1회 소모, 재시도 중복 처리 방지, 최종 순위·티어 보상·트로피 1회 기록을 확인했다.
- 정지·미래 차단·유효하지 않은 덱·모집 마감과 OWNER 참가 제외, ADMIN의 CMS 접근 차단도 확인했다.
- UI 변경은 없으므로 불필요한 화면 재검수는 추가하지 않는다.

## 범위 배포

- 직전 운영 Pages: `8d02e845-4226-445d-a1ba-7c321ca3b970`, 커밋 `307630de2f1a32e31657419657fa5616631383ef`. Cloudflare production deployment 목록에서 확인했다.
- 작업 기준 `origin/main`: `c8c16fcc`. 직전 배포 이후 선행 변경은 군단 토벌 결과 문서 1개뿐이다.
- 작은 변경으로 `npm run deploy:production -- --scoped`를 사용한다.
- `SCOPED_DEPLOY_BASE=307630de2f1a32e31657419657fa5616631383ef`.
- 배포 과정의 `SCOPED_DEPLOY_TESTS`: `["tests/ranked-duo-server.test.mjs","tests/ranked-duo-seasons.test.mjs","tests/ranked-duo-weekly.test.mjs"]`.
- `SCOPED_DEPLOY_CHECKS`: `["check:worker"]`.
- 새 ADMIN 회귀 4개는 같은 게임 코드에서 이미 통과했으므로 중복 실행하지 않는다. 배포 중 기존 듀오 참가·매칭·편성·정산/보상 회귀와 Worker 컴파일, 출시 게이트, 깨끗한 커밋·origin/main, Hyperdrive 캐시 OFF를 확인한다.

## 운영 반영 결과

- 게임 코드 커밋: `3ce82347` (`origin/main` 반영 후 배포).
- 새 ADMIN 회귀 4개와 기존 듀오 회귀 49개, 총 53개 통과. Worker 구문·컴파일, 운영 출시 가드와 Hyperdrive 캐시 OFF/바인딩 일치 검사도 통과했다.
- Pages production: `094931c5-0227-400e-94d8-7c782383519d`, https://094931c5.cnine-card.pages.dev. 배포 목록에서 `main` / `3ce8234`를 확인했다.
- `cnine-card-clan-draft` Worker 버전: `cd2849bd-29ec-4cf4-a6a4-ab109232f34d`. 분 단위 스케줄 배포까지 정상 완료했다.
- 2026-09-26 19:08 KST 운영 확인: `/api/live-operations` 200, 기존 랭크 듀오 시즌 1 모집 상태와 마감 유지. 비로그인 `/api/ranked-duo/status` 401로 인증 요구 유지.
- ADMIN 참가부터 정산까지의 검증은 격리된 실제 라우트/DB 회귀에서 수행했다. 운영 계정 참가·취소나 재화 변경은 실행하지 않았다.
- 이 결과 기록은 문서만 추가 커밋하며 게임을 다시 배포하지 않는다.
