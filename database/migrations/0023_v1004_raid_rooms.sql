-- v1004: multi-room cancellation/refund records (additive-only)
CREATE TABLE IF NOT EXISTS raid_daily_entry_restores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  instance_id INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'MIN_PARTICIPANTS',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, entry_date, instance_id)
);
CREATE INDEX IF NOT EXISTS idx_raid_entry_restores_date ON raid_daily_entry_restores(entry_date, user_id);

CREATE TABLE IF NOT EXISTS raid_room_cancellations (
  instance_id INTEGER PRIMARY KEY,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  refund_user_id INTEGER,
  refund_coin INTEGER NOT NULL DEFAULT 0,
  restored_entries INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1004_raid_rooms','1',CURRENT_TIMESTAMP);
