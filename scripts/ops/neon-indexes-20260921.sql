-- PIPE-0920: Neon 에 직접 만들어야 하는 인덱스 (호환 계층이 CREATE INDEX 를 건너뛰므로 코드로는 안 만들어진다)
-- CONCURRENTLY 는 트랜잭션 밖에서 한 문장씩 실행한다(Neon SQL Editor 는 문장 단위로 보내므로 그대로 실행 가능).
-- 근거: pg_stat_statements 30일 누적 (2026-08-22 ~ 09-21)

-- 1) CMS 대시보드 "24시간 뽑기 수" — created_at 단독 인덱스가 없어 906만 행 전체 스캔.
--    평균 15.7초 × 1,770회. 대시보드를 열 때마다 Hyperdrive 풀 자리를 15초씩 잡았다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_draw_logs_created_at ON draw_logs(created_at);

-- 2) 랭크전 티켓 만료 정리 — expires_at 인덱스가 없어 매번 순차 스캔. 평균 240ms × 494,000회(isolate 마다 5분 주기).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pvp_ranked_ticket_expires ON pvp_ranked_match_tickets_v1671(expires_at);

-- 3) (참고) 장비 보급상자 개봉의 보유 확인은 코드에서 EXISTS 로 바꿔 인덱스 추가가 필요 없어졌다.
--    idx_user_equipment_instances_user_item_v1676(user_id,equipment_id,id) 를 그대로 쓴다.

-- 적용 후 확인
-- SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_draw_logs_created_at','idx_pvp_ranked_ticket_expires');
