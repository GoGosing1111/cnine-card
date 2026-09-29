# 영토전 승리 클랜 승점 — 2026-09-30

- 클랜 4 대 4 영토전(`warfare_version=4`)에서 A·B 진영이 승리하면 해당 진영에 고정된 4개 클랜의 시즌 승점(`clan_season_teams.score`)을 **각각 2점** 올린다. 클랜전 자체의 승패 횟수(`wins`/`losses`)는 변경하지 않는다. 무승부와 클랜 개편 이전 회차에는 지급하지 않는다.
- 자동 전선 승리·제한시간 판정과 운영자의 A·B팀 수동 종료(판정승)가 모두 `settleRound`에서 같은 정산 함수를 호출한다. 공격 횟수나 개인 보상 자격은 클랜 승점 대상에 영향을 주지 않는다.
- 회차 종료·4개 클랜 승점 증가·회차별 `app_meta` 완료 영수증을 한 DB 트랜잭션으로 처리한다. 고정된 시즌·진영·클랜 명단을 재검증하며, 누락/동시 변경/기록 실패 시 전체 롤백하고 재시도할 수 있다. 이미 종료된 회차 재호출은 승점을 중복 지급하지 않는다.
- 기존 종료 회차를 소급 변경하지 않는다. 현재 미종료 회차부터 정산 시 적용한다.

## 범위와 검증

- `functions/_territory_clan_warfare.js`, `functions/_territory_war.js`의 국소 정산 변경이다. 스키마·공통 DB 기반·인증·클랜전 점수 정책은 변경하지 않는다.
- 관련 회귀: `tests/territory-clan-win-points-20260930.test.mjs` — SQLite/PostgreSQL에서 자동 A승, 운영자 B판정승, 무승부, 재시도, 기록 실패 전체 롤백, 불완전/오래된 클랜 명단 차단 8개 통과. 기존 `tests/territory-clan-warfare-20260923.test.mjs` 27개 통과.
- 직전 운영 배포 소스는 `592f7d67f5baeda59b39eeecf64e35f5d17bc991` (`docs/workshop-s-body-payment-20260930.md`의 Pages 배포 기록). 그 이후 문서·일회성 운영 지급 커밋만 있어, 국소 기능 회귀와 Worker 컴파일을 선택한 `npm run deploy:production -- --scoped`로 반영한다.
