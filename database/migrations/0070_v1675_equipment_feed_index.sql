CREATE INDEX IF NOT EXISTS idx_user_equipment_instances_recent_v1674
  ON user_equipment_instances(id DESC,user_id,equipment_id,source_type,acquired_at);
