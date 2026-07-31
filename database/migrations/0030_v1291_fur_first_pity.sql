CREATE TABLE IF NOT EXISTS user_fur_first_pity (
  user_id INTEGER PRIMARY KEY,
  miss_count INTEGER NOT NULL DEFAULT 0,
  last_pack_id TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_meta(key,value,updated_at)
VALUES('fur_first_acquisition_settings_v1','{"enabled":true,"start":50,"hard":100,"startRate":2,"maxSoftRate":20}',CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1291_fur_first_pity','1',CURRENT_TIMESTAMP);
