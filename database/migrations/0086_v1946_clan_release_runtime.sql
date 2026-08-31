-- V1946 clan-war release runtime (D1 fallback / local development)
-- Season/user receipts make economic rewards idempotent across settlement retries.

CREATE TABLE IF NOT EXISTS clan_reward_receipts (
  season_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  clan_id INTEGER NOT NULL,
  reward_tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  coin INTEGER NOT NULL DEFAULT 0,
  card_shards INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  PRIMARY KEY (season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_clan_reward_receipts_status
  ON clan_reward_receipts(season_id, status, user_id);
