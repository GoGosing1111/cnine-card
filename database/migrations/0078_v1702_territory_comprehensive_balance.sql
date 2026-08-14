ALTER TABLE territory_war_v3_users ADD COLUMN formation_power INTEGER NOT NULL DEFAULT 0;
ALTER TABLE territory_war_v3_users ADD COLUMN formation_breakdown_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE territory_war_v3_users ADD COLUMN balance_history_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE territory_war_v3_users ADD COLUMN balance_history_active_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE territory_war_v3_users ADD COLUMN balance_history_participation_weight INTEGER NOT NULL DEFAULT 0;
ALTER TABLE territory_war_v3_users ADD COLUMN balance_history_weighted_attacks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE territory_war_v3_users ADD COLUMN balance_history_win_weight INTEGER NOT NULL DEFAULT 0;
ALTER TABLE territory_war_v3_users ADD COLUMN balance_history_loss_weight INTEGER NOT NULL DEFAULT 0;

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1702_territory_comprehensive_balance','1',CURRENT_TIMESTAMP);
