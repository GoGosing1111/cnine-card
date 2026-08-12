-- V1676: wave-based scrapyard, exactly-once equipment synthesis, mythic duplicates.
CREATE TABLE IF NOT EXISTS scrapyard_run_receipts_v1676(
  request_id TEXT NOT NULL,user_id INTEGER NOT NULL,difficulty TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
  response_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(request_id,user_id)
);
CREATE TABLE IF NOT EXISTS scrapyard_runs_v1676(
  id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,user_id INTEGER NOT NULL,difficulty TEXT NOT NULL,
  deck_power INTEGER NOT NULL DEFAULT 0,waves_total INTEGER NOT NULL DEFAULT 0,waves_cleared INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 0,rewards_json TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(request_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_scrapyard_runs_user_day_v1676 ON scrapyard_runs_v1676(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrapyard_receipts_created_v1676 ON scrapyard_run_receipts_v1676(created_at);

CREATE TABLE IF NOT EXISTS equipment_synthesis_receipts_v1676(
  request_id TEXT NOT NULL,user_id INTEGER NOT NULL,equipment_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
  result_json TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(request_id,user_id)
);
CREATE TABLE IF NOT EXISTS equipment_synthesis_logs_v1676(
  id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL,user_id INTEGER NOT NULL,input_equipment_id INTEGER NOT NULL,
  output_equipment_id INTEGER NOT NULL,input_instance_ids TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(request_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_equipment_synthesis_logs_user_v1676 ON equipment_synthesis_logs_v1676(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_equipment_instances_user_item_v1676 ON user_equipment_instances(user_id,equipment_id,id);

DROP TRIGGER IF EXISTS trg_user_equipment_mythic_unique;
INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1676_mythic_equipment_duplicates','1',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES('scrapyard_settings_v1676','{"mode":"ON","dailyRuns":10,"difficulties":[{"id":"OUTER","name":"외곽 폐차장","waves":5,"requiredPowerStart":70000,"requiredPowerEnd":180000,"accent":"#58ddff"},{"id":"CORE","name":"압축 설비 구역","waves":6,"requiredPowerStart":170000,"requiredPowerEnd":390000,"accent":"#ffb85c"},{"id":"FURNACE","name":"용광로 심부","waves":7,"requiredPowerStart":360000,"requiredPowerEnd":760000,"accent":"#ff596f"}]}',CURRENT_TIMESTAMP);
INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1676_scrapyard','1',CURRENT_TIMESTAMP);
INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1676_workshop_synthesis','1',CURRENT_TIMESTAMP);
UPDATE unified_drop_pools_v1667 SET owner_test_only=0,is_enabled=1,updated_at=CURRENT_TIMESTAMP WHERE code='SCRAPYARD_PARTS';
UPDATE unified_drop_bindings_v1667 SET is_enabled=1 WHERE source_type='SCRAPYARD' AND trigger_type='WAVE_CLEAR';
