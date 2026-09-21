# 세력전 회차 개편 운영 전환

- 사용자 후속 `반영하고 유저 공지용 설명본도 작성`에 따른 준비 보류 해제.
- 준비 커밋 `936305b8`과 현재 운영의 주간 레이드 커밋 `71779f40`을 통합했다. 기존 Downloads dirty 작업은 수정하지 않았다.
- 전환 기준 `2026-09-22T01:15:00+09:00`. `enabled:true`, `PARTICIPANTS / PAUSE / DEFER / KEEP` 유지. 전환 이전 시작 슬롯은 소급 개방·보상하지 않는다.
- `20260922-sessions-live`로 화면/CSS/동적 import 캐시 키를 함께 갱신했다.
- 기존 OFF 회귀 fixture는 OFF를 명시한다. 활성화 기본 정책은 별도 PostgreSQL 테스트로 검증한다. overview의 fallback도 호출자가 제공한 정책을 유지하도록 수정했다.

## 운영 사전 조회: 2026-09-22 00:52 KST

`scripts/ops/faction-sessions-audit-20260922.mjs`는 `BEGIN READ ONLY` 트랜잭션에서 조회하고 `ROLLBACK`한다. 연결 문자열은 환경변수로만 전달하며 출력하지 않는다.

- 운영 DB `cnine`, 역할 `cnine_migrator` 그대로. 계정·비밀번호 변경 없음.
- 기존 Hyperdrive origin과 조회한 Neon endpoint가 동일함을 확인했다. 쿼리 캐시 OFF, 연결 상한 300 보존.
- 보상 관련 7개 금액 열 모두 BIGINT. 메시지 `(user_id,campaign_key)` 유일 인덱스 존재.
- `user_messages`, `user_message_rewards` ID 시퀀스가 현재 최대 ID보다 뒤처지지 않았다.
- 클랜 공개 모드 ON, 시즌 2 / ID 5 / ACTIVE. 종료 `2026-09-28T13:00:00Z`.
- ACTIVE/PREPARING 영토전 없음. 세력전 진행 교전 0개.
- 당시 25개 점령지와 8개 클랜 편성·행동대장 조회 완료. 개편용 일정/보상 테이블은 아직 생성되지 않은 상태.
- 기존 예약 작업 마지막 실행 `2026-09-21T15:52:20.228Z`.

## 통합 후보 사전 검증

- `npm run test:clan`: 187 통과, 실패/스킵 0. 기본 ON·전환 이전 슬롯 제외·점령지 유지 검증 포함.
- `tests/clan-faction-sessions.browser.mjs`: 47 확인, 브라우저 예외 0. 1440/390/320px 및 일시중단·재개·순연·보상 화면 검사. 재개 대기 조건이 기존 `영토전 진행 중` 문구와 혼동하지 않도록 테스트를 정확히 수정했다.
- QA 이미지 `C:/Users/User/AppData/Local/Temp/faction-sessions-review-eUy9Yb`. 320px 중단, 390px 순연, 데스크톱 보상 화면 직접 확인.
- Node 호환 모드 API/예약 Worker 메모리 번들 검증 통과. 새 의존성이나 운영 연결 설정 변경 없음.

## 출시 및 확인 절차

1. 관련 테스트와 PC/모바일 검수 후 범위 커밋을 만들고 최신 origin/main과 충돌 없이 통합한다.
2. 깨끗한 HEAD = origin/main에서 `npm run release:gate`를 통과한다.
3. `npm run deploy:production`으로 Pages와 clan-draft Worker를 함께 올린다. 직접 Wrangler 배포나 assets-only 경로를 사용하지 않는다.
4. 운영 파일의 live 캐시 키, 배포 커밋, 예약 Worker 버전과 실행 로그를 확인한다.
5. 같은 읽기 전용 감사로 전환 뒤 일정 2개, 지도/편성 보존, 세금 중단 마커, 예약 작업 실행을 확인한다. 실제 유저 보상을 테스트 목적으로 지급하지 않는다.
6. 실제 회차 종료 전에는 운영 300억 메시지 지급 완료를 주장하지 않는다. 로컬 PostgreSQL에서 정산 및 실제 수령 함수의 중복 수령 방지는 별도 검증한다.

유저 공지: `docs/clan-faction-sessions-user-notice-20260922.md`.
상세 동작과 롤백 제한: `docs/clan-faction-sessions-preparation-20260921.md`. 해당 문서의 OFF 표기는 준비 시점의 기록이며 이번 운영 전환이 최신 기준이다.

Cloudflare·Workers·Wrangler 스킬의 배포·요청 수명·DB 연결 정리 기준을 사용했다. [Workers 공식 운영 지침](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)과 [Hyperdrive 쿼리 캐시 문서](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)를 재확인했다. 기존 브라우저 제어 도구는 커널 경로 오류로 사용할 수 없어 DB 검사는 로그인된 Neon CLI의 인증으로 읽기 전용 수행했다.
