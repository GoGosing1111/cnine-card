# 랭크 듀오 OFF 및 개편 준비

사용자 요청: `랭크 듀오 시즌 OFF 처리하고 개편준비`.

2026-10-20 11:29:50 KST 운영 DB에 반영했다. 기존 상태와 운영 설정을 사용한 변경으로 게임 런타임·UI 자산·일반 랭크전은 수정하거나 재배포하지 않았다.

## 적용 상태

- 시즌 4 ID: `587a5e01-65e3-4f20-ac6e-abfd08e2c344`.
- 당시 73명 모집 중, 팀 0개·접수 전투 0개·경기 시작 시각 없음. 시즌 상태를 `RECRUITING → CLOSED`, 공개를 `true → false`로 변경했다. 시즌 revision과 config revision은 각각 0 → 1이다.
- 독립 자동 운영 정책 `ranked_duo_weekly_policy_v3`의 `enabled`를 false, revision을 1 → 2로 변경했다. 기존 행동력·점수·티어·보상 값은 보존했다.
- 참가 신청 73건을 바이트 표현의 집계 해시로 전후 비교했다. 지난 시즌의 최종 순위·보상 영수증·트로피도 보존한다. 이번 시즌 지급·회수·전적 초기화는 없다.
- 일반 랭크전 설정 전후 SHA-256은 `5b10c2b39f57ea4dba0436b1b0f91537ac35d2e7cab7c16e1c90a5a23811ff9e`로 같다.

## 적용 및 검증

`scripts/ops/ranked-duo-off-20261020.mjs`는 먼저 rollback dry run으로 검증하고 같은 입력으로 한 번 적용했다. 현재 시즌 ID·모집 상태·revision·미시작·팀/전투/보상 없음 조건을 확인하며 달라지면 중단한다. 운영 설정과 시즌, 관리자 감사, 일회 영수증을 같은 트랜잭션으로 저장한다. 정책 → 현재 시즌 포인터 → 시즌 행 잠금과 revision 갱신으로 진행 중인 모집 요청과 충돌을 제어한다.

- 운영 키: `ops:ranked-duo-off:20261020:v1`; 실제 감사 ID: `48750`.
- 재실행은 같은 영수증을 반환하며 다시 적용하지 않는다. 이후 CMS 수정을 덮어쓰지 않는다.
- 운영 DB를 읽기 전용으로 연결한 기존 서버 경로 검사: 일반 사용자 상태는 `season:null`과 기존 준비 안내, 참가 요청은 `DUO_RECRUIT_CLOSED`, 매칭·신규 전투 요청은 `DUO_NOT_ACTIVE`.
- 공개 `/api/live-operations`는 HTTP 200이며 `RANKED_DUO` 항목 없음. 서버 콘텐츠 현황 조회도 null이다.
- 기존 회귀 검사 `no combat produces no rewards; disabling next recruitment does not reopen a closed season` 1개 통과. OFF 상태의 후속 스케줄러는 `WAITING_DUO_POLICY`로 머물고 새 시즌을 만들지 않는다.
- 근거: `inspection.json`, `dry-run.json`, `apply.json`, `verification.json`. dry run의 감사 번호는 롤백되었으며 실제 감사는 apply 기록만 따른다.

## 개편 준비 기준

재개 지시 전 OFF를 유지한다. 현재 시즌 참가 자료와 기존 기록은 후속 설계의 기준 자료이며 삭제하거나 다른 시즌으로 자동 이관하지 않는다. 팀 구성 방식, 매칭, 점수, 행동력, 보상, 새 일정은 아직 지정되지 않았다. 이 요청으로 새 경제 값이나 개편 내용을 확정하지 않았다.

후속 구현은 `functions/_ranked_duo.js`(참가·매칭·전투·운영), `functions/_ranked_duo_seasons.js`(자동 시즌), `shared/ranked-duo-weekly-v3.mjs`(독립 정책), `admin/ranked-duo-v1.mjs`(CMS), `js/ranked-duo-v1.mjs`(시즌 화면)를 기준으로 한다. 공개 재개 시 OFF 정책·사용자 진입·스케줄러의 일관성을 확인하고 별도 일정으로 시작한다. 과거 8일 자동 반복 규칙만 보고 ON으로 되돌리지 않는다.
