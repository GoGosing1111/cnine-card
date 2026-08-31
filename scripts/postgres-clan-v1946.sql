BEGIN;

CREATE TABLE IF NOT EXISTS clan_reward_receipts (
  season_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  clan_id BIGINT NOT NULL,
  reward_tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  coin BIGINT NOT NULL DEFAULT 0,
  card_shards BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT sqlite_now(),
  updated_at TEXT NOT NULL DEFAULT sqlite_now(),
  completed_at TEXT,
  PRIMARY KEY (season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_clan_reward_receipts_status
  ON clan_reward_receipts(season_id, status, user_id);

COMMIT;
