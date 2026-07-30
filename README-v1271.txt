숲켓몬 v1271 · LIMITED/FUR 퇴사 재뽑기권 점검·보강

점검 결과
- LIMITED 퇴사 확정: LIMITED_REROLL_TICKET 1개 지급 로직 존재
- FUR 퇴사 확정: FUR_REROLL_TICKET 1개 지급 로직 존재
- 인벤토리 노출, 재뽑기 실행, 등급 고정 추첨 로직 모두 존재

보강 내용
1. 기존 v1164 마이그레이션 완료 표시가 있어도 LIMITED/FUR 재뽑기권 메타데이터가 누락·비활성화된 경우 v1271 안전 마이그레이션으로 1회 복구
2. LIMITED/FUR 재뽑기권 매핑이 비정상적으로 사라진 경우 카드 퇴사 확정을 중단하여 카드만 퇴사되고 보상은 빠지는 상황 차단
3. 같은 카드 퇴사 건에 대해 사용자별 재뽑기권이 중복 지급되지 않도록 inventory_logs 기준 멱등성 검사 추가
4. 퇴사 확정 결과의 지급 인원은 예상 인원이 아니라 실제 지급 로그 기준으로 계산
5. 카드 조각 환급, 재뽑기권 지급, 카드 퇴사 상태 변경은 기존 D1 batch 원자 처리 유지

DB 정책
- 기존 테이블/컬럼/데이터 삭제·재생성 없음
- 신규 테이블·컬럼 없음
- app_meta 안전 마이그레이션 키 1개만 추가
  safe_runtime_upgrade_v1271_limited_fur_reroll_repair

포함 파일
- functions/api/[[path]].js
