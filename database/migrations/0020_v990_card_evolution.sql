-- v990: SSR ★10 card evolution (additive-only D1 migration)
CREATE TABLE IF NOT EXISTS card_evolution_progress (
  user_id INTEGER NOT NULL,
  source_card_id TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  is_success INTEGER NOT NULL DEFAULT 0,
  reward_card_id TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, source_card_id)
);

CREATE TABLE IF NOT EXISTS card_evolution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_card_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  coin_cost INTEGER NOT NULL,
  shard_cost INTEGER NOT NULL,
  success_rate REAL NOT NULL,
  is_pity INTEGER NOT NULL DEFAULT 0,
  is_success INTEGER NOT NULL DEFAULT 0,
  reward_card_id TEXT,
  reward_duplicate INTEGER NOT NULL DEFAULT 0,
  reward_shards INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evolution_logs_user ON card_evolution_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_progress_success ON card_evolution_progress(is_success, updated_at);
INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v990_card_evolution','1',CURRENT_TIMESTAMP);
