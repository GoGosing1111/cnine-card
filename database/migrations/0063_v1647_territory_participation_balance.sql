ALTER TABLE territory_war_v3_users ADD COLUMN balance_previous_round_id INTEGER;
ALTER TABLE territory_war_v3_users ADD COLUMN balance_previous_side TEXT;
ALTER TABLE territory_war_v3_users ADD COLUMN balance_previous_result TEXT;
ALTER TABLE territory_war_v3_users ADD COLUMN balance_previous_attacks INTEGER NOT NULL DEFAULT 0;

ALTER TABLE territory_war_v3_rewards ADD COLUMN base_result_coin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE territory_war_v3_rewards ADD COLUMN attack_reward_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE territory_war_v3_rewards ADD COLUMN attack_adjusted_coin INTEGER NOT NULL DEFAULT 0;

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1647_territory_participation_balance','1',CURRENT_TIMESTAMP);
