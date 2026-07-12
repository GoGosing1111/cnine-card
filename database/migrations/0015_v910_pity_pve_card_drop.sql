-- v9.1.1 SSR 천장 + PvE 등급 랜덤 카드 드롭
-- D1 SAFE: 신규 테이블/인덱스만 추가. 기존 테이블 변경·삭제 없음.
CREATE TABLE IF NOT EXISTS user_pack_pity (
  user_id INTEGER NOT NULL,
  pack_id TEXT NOT NULL,
  miss_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, pack_id)
);
CREATE INDEX IF NOT EXISTS idx_user_pack_pity_user ON user_pack_pity(user_id);
