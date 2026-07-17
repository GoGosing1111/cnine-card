-- v1027 PvE automatic hunting, concurrency lock and idempotent receipts
CREATE TABLE IF NOT EXISTS pve_auto_runs (
  request_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  monster_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  response_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pve_auto_runs_user ON pve_auto_runs(user_id,created_at);
CREATE TABLE IF NOT EXISTS pve_auto_locks (
  user_id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DELETE FROM sessions WHERE rowid NOT IN (SELECT MAX(rowid) FROM sessions GROUP BY user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_single_user ON sessions(user_id);
