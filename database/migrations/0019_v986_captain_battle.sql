-- Runtime upgrade safe_runtime_upgrade_v986_captain_battle creates only new captain_* tables and indexes.
-- No existing table, column, API response, or operating data is changed or deleted.
INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('captain_battle_schema_documented_v986','runtime-upgrade',CURRENT_TIMESTAMP);
