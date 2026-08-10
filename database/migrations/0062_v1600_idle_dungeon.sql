CREATE TABLE IF NOT EXISTS idle_dungeon_progress (
  user_id INTEGER PRIMARY KEY,
  difficulty TEXT NOT NULL DEFAULT 'NORMAL',
  unlocked_difficulty INTEGER NOT NULL DEFAULT 1,
  current_floor INTEGER NOT NULL DEFAULT 1,
  highest_floor INTEGER NOT NULL DEFAULT 0,
  run_started_at TEXT,
  last_settled_at TEXT,
  pending_coin INTEGER NOT NULL DEFAULT 0,
  daily_coin INTEGER NOT NULL DEFAULT 0,
  daily_key TEXT,
  total_coin INTEGER NOT NULL DEFAULT 0,
  total_resets INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS idle_dungeon_claim_receipts (
  request_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  reward_coin INTEGER NOT NULL DEFAULT 0,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_idle_dungeon_progress_rank ON idle_dungeon_progress(unlocked_difficulty DESC,highest_floor DESC);
INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(
  'idle_dungeon_settings_v1',
  '{"enabled":true,"maxOfflineHours":6,"floorSeconds":20,"difficulties":[{"id":"NORMAL","name":"일반","index":1,"maxFloor":100,"powerStart":0.18,"powerEnd":1.05,"dailyCap":1000000},{"id":"ABYSS","name":"심연","index":2,"maxFloor":120,"powerStart":0.72,"powerEnd":1.55,"dailyCap":1300000},{"id":"DOOM","name":"종말","index":3,"maxFloor":150,"powerStart":1.05,"powerEnd":2.35,"dailyCap":1500000}]}',
  CURRENT_TIMESTAMP
);
