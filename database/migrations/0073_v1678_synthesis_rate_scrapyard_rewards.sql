ALTER TABLE equipment_synthesis_recipes_v1677 ADD COLUMN success_rate REAL NOT NULL DEFAULT 100;
ALTER TABLE equipment_synthesis_logs_v1676 ADD COLUMN success INTEGER NOT NULL DEFAULT 1;

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1678_synthesis_rate_scrapyard_rewards','1',CURRENT_TIMESTAMP);
