-- v1674 D1 production stability hot-path indexes.
-- Applied while maintenance mode is active. Runtime installation uses the same
-- idempotent statements and marker for new/restored databases.
CREATE INDEX IF NOT EXISTS idx_tower_history_power_desc_v1674
  ON tower_clear_history(player_power DESC) WHERE player_power>0;

CREATE INDEX IF NOT EXISTS idx_raid_participants_power_desc_v1674
  ON raid_participants(total_power DESC) WHERE total_power>0;

CREATE INDEX IF NOT EXISTS idx_revoked_sessions_time_v1674
  ON revoked_player_sessions_v1533(revoked_at);

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1674_d1_stability_indexes','1',CURRENT_TIMESTAMP);
