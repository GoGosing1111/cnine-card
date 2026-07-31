-- v1293: dual schedule, three-phase raid combat and fixed multi-reward plans (additive-only)
CREATE TABLE IF NOT EXISTS raid_instance_v1293 (
  instance_id INTEGER PRIMARY KEY,
  slot_id TEXT NOT NULL DEFAULT 'LEGACY',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS raid_participant_v1293 (
  instance_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  final_damage INTEGER NOT NULL DEFAULT 0,
  final_rank INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(instance_id,user_id)
);
CREATE TABLE IF NOT EXISTS raid_user_reward_v1293 (
  instance_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY',
  reward_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(instance_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_raid_participant_v1293_rank ON raid_participant_v1293(instance_id,final_rank,final_damage);
CREATE INDEX IF NOT EXISTS idx_raid_user_reward_v1293_status ON raid_user_reward_v1293(status,updated_at);
INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1293_raid_overhaul','1',CURRENT_TIMESTAMP);
