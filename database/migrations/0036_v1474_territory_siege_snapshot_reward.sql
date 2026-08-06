ALTER TABLE territory_war_v3_rewards ADD COLUMN siege_snapshot_bonus_coin INTEGER NOT NULL DEFAULT 0;

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1474_territory_siege_snapshot_reward','1',CURRENT_TIMESTAMP);
