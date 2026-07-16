-- v1000: freeze raid reward settings when an instance is created (additive-only)
CREATE TABLE IF NOT EXISTS raid_reward_snapshots (
  instance_id INTEGER PRIMARY KEY,
  participation_coin INTEGER NOT NULL DEFAULT 0,
  clear_coin INTEGER NOT NULL DEFAULT 0,
  reward_shards INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_raid_reward_snapshots_created ON raid_reward_snapshots(created_at);
INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1000_raid_reward_snapshot','1',CURRENT_TIMESTAMP);
