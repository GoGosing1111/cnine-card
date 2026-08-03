-- v1415 high-concurrency hot-path indexes.
-- Apply during deployment; these statements must not run inside player requests.
CREATE INDEX IF NOT EXISTS idx_sessions_expiry_v1415
  ON sessions(expires_at,user_id);

CREATE INDEX IF NOT EXISTS idx_user_cards_card_owned_v1415
  ON user_cards(card_id,user_id,quantity);

CREATE INDEX IF NOT EXISTS idx_draw_logs_user_recent_v1415
  ON draw_logs(user_id,id DESC);

CREATE INDEX IF NOT EXISTS idx_coin_logs_user_recent_v1415
  ON coin_logs(user_id,id DESC);

CREATE INDEX IF NOT EXISTS idx_raid_participants_user_active_v1415
  ON raid_participants(user_id,is_active,instance_id);

CREATE INDEX IF NOT EXISTS idx_raid_participants_rank_v1415
  ON raid_participants(instance_id,is_active,total_damage DESC,joined_at,id);

CREATE INDEX IF NOT EXISTS idx_raid_instances_status_recent_v1415
  ON raid_instances(status,id DESC);

CREATE INDEX IF NOT EXISTS idx_pvp_profiles_ranking_v1415
  ON pvp_profiles(season_score DESC,wins DESC,user_id);

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('migration_v1415_hotpath_indexes','1',CURRENT_TIMESTAMP);
