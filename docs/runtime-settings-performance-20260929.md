# 공통 설정 대기 격리·호송 초기화 최적화 — 2026-09-29

사용자 요청: 새벽 최적화 후에도 전체적으로 느리므로 실제 병목을 더 줄인다. 미라클 버닝은 이전 점검에서 추가 설정 왕복을 제거했지만, 드랍이 없는 API에도 수초 지연이 있었다. 이번 범위는 공통 설정 캐시의 대기 전파와 반복 호송 DDL이다.

## 근거

- 이전 자연 트래픽의 서버 처리: PVP 전투 8,359ms, PVE 6,896ms, 듀오 매칭 12,379ms. PVP config의 settings/state 각각 약 3,200ms 지연도 있었다. 원본은 `docs/miracle-burning-performance-20260929.md`에 기록했다.
- 19:00–19:39 KST Hyperdrive 분 단위 지표: SIN 풀 waitingClients 평균/최대 모두 0, DB 방향 queryLatency 평균 3–8ms. 현재 설정은 origin_connection_limit=300, query cache OFF다. 이 시점의 연결 수 부족이 주원인이라는 근거는 없다. 분 단위 지표로 개별 순간 지연까지 배제하지 않는다.
- 공통 `metaSnapshotCache`와 `runtimeSettingsCache`가 아직 완료되지 않은 Promise를 전역 공유했다. Promise는 최초 요청의 DB FIFO에 속하므로, 다른 요청도 그 요청의 앞선 작업을 기다린다. 기존 코드에 350ms 대기를 주입했을 때 별도 요청이 358ms 대기했고 자체 조회는 0회였다. 이는 대기 전파의 재현이며 운영 지연 전체의 원인을 단독으로 확정하는 결과는 아니다.
- 호송의 isolate 최초 접근은 준비된 운영 DB에서도 CREATE/ALTER 7문장과 BEGIN/COMMIT을 재실행했다. 앞선 PostgreSQL 통계에서도 36초에 관련 CREATE INDEX 27회, ALTER 24회를 확인했다. 특히 ALTER는 테이블 잠금과 어댑터 카탈로그 캐시 무효화를 일으킨다.

## 수정

- 설정은 완료된 값만 DB별로 공유하고 진행 중 읽기는 같은 요청 안에서만 합친다. 기존 5초 메타 스냅샷과 각 설정 TTL은 늘리지 않는다. 저장·삭제·전체 무효화 이후 늦게 끝난 옛 조회가 최신 설정을 덮지 못하게 세대를 확인한다. 실패한 옛 요청이 다른 요청의 성공 캐시를 지우지도 않는다.
- 전투 설정 CMS 저장의 즉시 캐시 반영도 완료된 값으로 통일했다. 인증·세션·점검 게이트, DB 어댑터와 거래 순서는 변경하지 않는다.
- 호송은 기존 테이블 3개·유효 인덱스 3개·reward_tickets 컬럼을 한 번 읽어 확인한다. 준비돼 있으면 DDL 0회, 누락된 경우에만 기존 복구를 실행한다. 준비 결과는 30분 동안 DB별로 공유하고 진행 중 작업은 요청별로만 보관한다. 스키마 정의·보상·영수증은 변경하지 않는다.
- 2초 이상 요청에는 느린 DB 작업 상위 5개를 추가 기록한다. SQL 전문·인자·토큰·사용자 ID 대신 동작 종류와 테이블 이름만 남긴다. 합산 DB 시간에는 겹친 대기가 포함되므로 전체 응답 시간과 구분한다.

## 검증·배포 범위

- 신규 회귀 7/7 통과: 독립 요청 대기 격리, 같은 요청 중복 제거, TTL·DB 구분·실패 재시도, CMS 무효화/저장과 늦은 조회 경쟁, 실제 API 연결, 진단 로그 비밀값 제외, 실제 PostgreSQL(PGlite) 호송 준비/누락 컬럼·인덱스 복구.
- 관련 전투 검사는 지정 scoped 배포 안에서 한 번 실행한다: 버닝 OWNER/타이머·미라클, 랭크전 전투 결과·재시도, 아포칼립스 CMS 저장 회귀. 신규 회귀는 같은 실행 코드에서 이미 통과했으므로 반복하지 않는다.
- 직전 운영 배포를 다시 조회했으며 다른 작업의 장비 강화 UI 복구가 먼저 배포됐다. 기준은 `8054a5ec9b2ae6c21e756d2a735eead68cc8ad5c` / `5bf3c8c7-23fa-4ee4-b3a0-3c26679c7ef9`다. 최신 main을 포함해 해당 복구를 보존한다.
- 국소적인 설정 캐시와 호송 준비 확인 수정이며 DB/트랜잭션 기반·인증·마이그레이션·의존성·UI 변경은 없다. `npm run deploy:production -- --scoped`를 사용하고 Worker 컴파일, 출시 플래그·깨끗한 커밋·원격 일치·캐시·Hyperdrive 가드는 유지한다.
- 운영 이벤트 변경, 실계정 전투나 보상 지급은 수행하지 않는다. 배포 후 자연 트래픽의 변경 경로와 오류만 확인한다.

지표 원본: `C:/Users/User/.codex/tmp/miracle-perf-20260929/hyperdrive-metrics.json`, `runtime-cache-before.json`.
지표 해석 기준: [Cloudflare Hyperdrive metrics](https://developers.cloudflare.com/hyperdrive/observability/metrics/).
