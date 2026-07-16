-- v1001: allow CMS-configured multiple daily raid entries without modifying legacy records
CREATE TABLE IF NOT EXISTS raid_daily_entry_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  instance_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, entry_date, instance_id)
);
CREATE INDEX IF NOT EXISTS idx_raid_daily_entry_uses_date ON raid_daily_entry_uses(entry_date, user_id);
INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1001_raid_multi_entry','1',CURRENT_TIMESTAMP);
