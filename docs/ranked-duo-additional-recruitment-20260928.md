# 랭크 듀오 시즌 중 추가모집

사용자 지시: 진행 중인 시즌에서 추가모집을 열고 CMS에서 모집 시간을 직접 설정한다. 기본값과 이번 운영 추가모집은 12시간이다.

## 동작

- CMS → 랭크 듀오 → 추가모집·자동 팀 편성에서 1~720시간을 입력한다. 시작과 시간 변경 모두 저장 시점부터 계산하며 실제 마감 시각을 한국시간으로 표시한다. 최초 시즌 모집은 기존 24시간이다.
- 진행 시즌은 ACTIVE를 유지한다. 추가모집의 RECRUITING → PAIRING → PUBLISHING → CLOSED는 기존 config_json의 별도 필드로 관리한다. 기존 팀·점수·전적·개인 행동력과 전투 종료 시각을 바꾸지 않는다.
- 모집이 끝나면 기존 스케줄러가 미편성자만 평가·편성한다. 1회 평가 12명, 공개 40팀의 기존 한도를 유지한다. 홀수의 마지막 신청자는 다음 추가모집까지 기다린다.
- 모집 마감은 현재 시즌 종료 전에만 지정할 수 있다. 기존 시즌 정산이 추가 편성보다 우선한다. 운영 설정·승리 보상·티어 지급 정책은 변경하지 않는다.
- 참가·취소는 서버에서 모집 시각을 검증한다. 편성된 참가자는 취소할 수 없다. 기존 전투는 추가모집 진행 버전 변경 때문에 실패하지 않으며 시즌 상태·경기 일정·설정 버전 및 기존 계정/티켓/행동력 보호를 검증한다.
- 추가모집 변경은 시즌 ID와 읽은 revision을 함께 보내 오래된 화면/중복 요청의 마감 연장을 차단한다. 팀 공개·참가자 연결·진행 상태는 기존 트랜잭션에 함께 기록한다.
- 로비·메인 진행 콘텐츠 알림에 추가모집과 마감을 표시하고, 기존 팀은 상대 찾기를 계속 이용한다. 앱·CMS·듀오 모듈·CSS·변경된 공통 설정 모듈의 캐시 쿼리를 갱신한다.

## 검수·배포 범위

- 단일 듀오 기능 확장으로 스키마·마이그레이션·공통 인증·DB 기반·의존성을 변경하지 않는다. scoped 배포를 사용한다.
- 직전 실제 운영 소스: `2bb09a750d1b6d8b32c0866e2b34b81ae940bcba`, Pages `b2677f4e-49e3-4f27-9eea-af61ac61ae3f`. Wrangler production 목록에서 확인했다. 병행 작업의 군단토벌 배포를 포함한 origin/main 위에 이번 변경을 통합한다.
- 직접 회귀: `tests/ranked-duo-additional-recruitment-20260928.test.mjs`. SQLite·PostgreSQL pipeline에서 시간 설정, 기존 팀 보존, 정상 전투, 참가/취소, 지연 편성, 홀수/빈 모집, 실패 롤백·재시도, 입장 중 추가모집 변경/시즌 종료, 운영 12시간 설정 영수증을 확인한다.
- UI: `tests/ranked-duo-additional-recruitment-browser-20260928.test.mjs`. 실제 CMS/로비 모듈과 격리 API fixture로 PC 1440px·모바일 390px의 12시간 기본값, 3시간 변경, 기존 팀 출전, 신규 신청·취소, 잘림·브라우저 오류를 확인한다. 사운드 OFF. 화면 증빙은 저장소 밖 `C:/Users/User/.codex/tmp/duo-additional-recruitment-20260928/qa/`에 둔다.
- 영향받는 기존 경로 검사: `ranked-duo-server`, `ranked-duo-seasons`, `ranked-duo-weekly`, `ranked-duo-live-operation`의 테스트 파일. 배포 과정의 Worker 컴파일·출시 플래그·캐시·Hyperdrive 검사는 유지한다. 무관한 전체 게이트는 실행하지 않는다.

## 이번 운영 설정

- 사전 읽기 결과: 시즌 `duo-weekly-20260925-134825`, ACTIVE, revision 24, 참가 139명·69팀·미편성 1명. 원래 전투 종료는 2026-10-03 22:48:25 KST.
- 배포 후 `scripts/ops/ranked-duo-additional-recruitment-20260928.mjs`가 실제 OWNER와 사전 확인한 시즌 ID/revision을 검증하고 기존 운영 핸들러로 12시간을 연다.
- 단일 작업 영수증 `ops_ranked_duo_additional_12h_20260928`을 같은 트랜잭션에 기록한다. 재시도는 최초 시간을 반환하며 다시 12시간을 연장하지 않는다.

## 운영 반영 결과

- 소스 커밋: `28a70675b78a3db484f3737384802931214145a4`. origin/main 동기화 후 지정 scoped 배포 완료.
- 직접·관련 회귀 **63/63 통과**, Worker 컴파일·출시 플래그·캐시·Hyperdrive query cache OFF 확인. PC·모바일 스크린샷을 직접 확인했다.
- Pages: https://95c66e41.cnine-card.pages.dev . 자동 편성 Worker 버전: `5105aa06-5b3a-46ca-83e8-fd3dbb81146e`.
- 실제 12시간 추가모집: **2026-09-28 11:02:31 ~ 23:02:31 KST**. 시즌 ACTIVE 유지, 추가모집 RECRUITING, revision 24 → 25. 사전/사후 참가 139명·69팀·미편성 1명이며 원래 전투 종료 시각은 그대로다.
- 영수증 `ops_ranked_duo_additional_12h_20260928` 및 추가모집 시작/마감을 읽기로 확인했다. 임시 운영 실행기는 종료했다.
- 운영 별칭에서 변경된 정적 파일 8개 HTTP 200·SHA-256 일치. 실제 `/api/live-operations`도 HTTP 200으로 `additionalRecruiting:true`, 정확한 마감과 기존 팀 대전 가능 안내를 반환했다.
- 배포/설정/확인 증빙: 저장소 밖 `C:/Users/User/.codex/tmp/duo-additional-recruitment-20260928/`의 `deploy.log`, `inspect.json`, `apply.json`, `verify.json`, `production-check.json`.
- 이 완료 기록은 문서만 커밋·원격 반영하며 운영 재배포와 게임 검사를 반복하지 않는다.
