-- D1 SAFE: 기존 테이블과 데이터를 변경하지 않고 조회 인덱스만 추가합니다.
CREATE INDEX IF NOT EXISTS idx_draw_logs_rarity_id ON draw_logs(rarity,id DESC);
