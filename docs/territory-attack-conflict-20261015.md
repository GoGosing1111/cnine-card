# 영토전 점령 직후 교전 상태 변경 처리 — 2026-10-15

## 운영 재현

- 사용자 화면에 PostgreSQL territory_war_mutation_guards_ok_check 원문이 alert으로 노출됐다.
- 읽기 전용 조사에서 73회차 북동 요새(front 533)가 2026-10-15 18:25:01 KST에 점령 완료되고 새 front 542로 바뀐 시점에 교전 검증 실패 4건(18:25:00~18:25:05)을 확인했다. 앞선 10월 13일 회차 종료 시점에도 같은 종류가 2건 있었다.
- guard는 오래된 전장·끊긴 진입 경로·회차 종료 등 현재 상태와 맞지 않는 요청의 차감·보상·피해를 단일 거래에서 막는 정상 보호다. 공격 계산 전 조회와 결과 저장 사이에 점령이 일어날 수 있다.
- 기존 공격 catch와 FAILED 영수증 조회는 DB 오류 원문을 그대로 반환했고 화면은 이전 전황을 유지한 채 alert을 표시했다. 단순한 회차 version 증가를 오류 원인으로 단정하거나 보호 제약을 해제하지 않는다.

## 수정 범위

- 영토전 공격·결과 조회에 한정해 상태 변경을 TERRITORY_STATE_CHANGED로 전달한다. refreshState=true, retryable=false로 이전 전황 요청을 자동 재전송하지 않는다.
- 이미 APPLIED/COMPLETED인 요청은 확정 영수증을 먼저 회복한다. 결과 확인 실패를 미차감 실패로 잘못 안내하거나 재지급하지 않는다.
- 화면은 오래된 pending 요청을 정리하고 현재 선택 지역의 최신 전황을 조회한다. 서버가 반환한 행동력·코인만 반영한다.
- 원자성 검증, 접근 경로·회차·휴전·보급 조건, 요청 소유자 확인, 기존 비용·보상·스키마·조직 시스템은 유지한다. 운영 신청·전투·승패를 직접 변경하지 않았다.

## 검수·배포

점령 경쟁과 실패 롤백, 같은 영수증 재시도, 이미 확정된 결과 회복, 과거 실패 조회 및 화면 갱신의 관련 회귀와 Worker 컴파일만 실행한다. 국소 오류 처리 수정이므로 npm run deploy:production -- --scoped를 사용한다. 실제 결과와 배포 ID는 완료 후 기록한다.

### 수정 검수 완료

- 서버 회귀: tests/territory-attack-conflict-20261015.test.mjs, SQLite/PostgreSQL 18사례 통과. 사전 접근 차단·계산 중 점령/경로 상실/회차 종료/보급 완료·배치 후반 실패 전액 롤백·동일 요청 재전송 차단·과거 실패 원문 변환·APPLIED/COMPLETED 결과 회복을 확인했다.
- 화면 회귀: tests/territory-state-change-ui-20261015.test.mjs, 7/7 통과. 실제 공격/조회 함수와 공통 apiRequest의 오류 필드 전파를 VM에서 실행했다. 자동 POST 재전송 없이 선택 지역의 새 front로 갱신하며 조회 실패 시 오래된 공격 버튼을 닫는다. 성공 결과와 누락된 잔액을 임의 변경하지 않는다.
- 해당 JS에만 stateRecovery=20261015-v1 캐시 키를 추가했다. 전역 앱 캐시 및 조직 모집 시각은 변경하지 않는다.
- 최종 scoped 배포 검사는 위 2개 파일, 기존 tests/territory-network-v6.test.mjs 및 check:worker로 한정한다.

### 운영 반영 완료

- 소스: 95ae9437b93b853d314a790d29d4877b6e892c22. 지정 3개 회귀 파일 46/46 PASS, check:worker, production guard, Hyperdrive SQL cache OFF 검사 통과. scoped 배포 exit 0.
- Pages: 93767305-77f2-410e-879a-e18a789ef361, production success, 2026-10-15T09:41:09.815824Z(18:41:09 KST), https://93767305.cnine-card.pages.dev.
- API Worker: c2f42440-7b31-47b5-a643-ae7c60b2024c. 스케줄러: f38d0dd1-13d6-48dc-91e7-dfd57516b927. 기존 분당 스케줄 유지.
- 18:41:42 KST 운영 GET 확인: index/영토전 JS HTTP 200, index의 stateRecovery=20261015-v1 연결과 배포 JS의 로컬 소스 해시 일치. SHA-256 a8159a3a59c129e9466f891654f777be8bddcc25ea47c4e9a832fb87a7a8a143. 실제 계정 공격을 추가 실행하지 않았다.
- 로그: 작업트리 상위 territory-attack-conflict-deploy-20261015.log. 이 결과 기록은 문서만 후속 커밋하며 재검사·재배포하지 않는다.
