-- v1005: preserve participant history while allowing pre-battle leave
ALTER TABLE raid_participants ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1005_raid_leave','1',CURRENT_TIMESTAMP);
