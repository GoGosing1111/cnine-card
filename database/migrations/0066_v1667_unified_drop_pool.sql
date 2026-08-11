-- V1667 unified content drop-pool foundation.
CREATE TABLE IF NOT EXISTS unified_drop_pools_v1667 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  roll_mode TEXT NOT NULL DEFAULT 'INDEPENDENT',
  rolls INTEGER NOT NULL DEFAULT 1,
  no_drop_weight REAL NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  owner_test_only INTEGER NOT NULL DEFAULT 0,
  config_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unified_drop_entries_v1667 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_id INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_ref TEXT NOT NULL DEFAULT '',
  reward_name TEXT NOT NULL DEFAULT '',
  chance_percent REAL NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  max_quantity INTEGER NOT NULL DEFAULT 1,
  daily_limit INTEGER NOT NULL DEFAULT 0,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pool_id,reward_type,reward_ref,sort_order)
);

CREATE TABLE IF NOT EXISTS unified_drop_bindings_v1667 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '*',
  trigger_type TEXT NOT NULL DEFAULT 'WIN',
  pool_id INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type,source_id,trigger_type,pool_id)
);

CREATE TABLE IF NOT EXISTS unified_drop_receipts_v1667 (
  request_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '*',
  trigger_type TEXT NOT NULL DEFAULT 'WIN',
  status TEXT NOT NULL DEFAULT 'PENDING',
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(request_id,user_id)
);

CREATE TABLE IF NOT EXISTS unified_drop_ledger_v1667 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  pool_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '*',
  reward_type TEXT NOT NULL,
  reward_ref TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL,
  balance_after INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unified_drop_entries_pool_v1667 ON unified_drop_entries_v1667(pool_id,is_enabled,sort_order,id);
CREATE INDEX IF NOT EXISTS idx_unified_drop_bindings_source_v1667 ON unified_drop_bindings_v1667(source_type,source_id,trigger_type,is_enabled,priority);
CREATE INDEX IF NOT EXISTS idx_unified_drop_receipts_user_v1667 ON unified_drop_receipts_v1667(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_drop_ledger_daily_v1667 ON unified_drop_ledger_v1667(user_id,entry_id,created_at DESC);

INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
VALUES
  ('VEHICLE_PART_TIRE','고성능 타이어','SCRAPYARD PART','폐차장 던전에서 획득하는 차량 제작용 타이어입니다.','VEHICLE_PART','RARE','assets/ui/scrapyard/vehicle-part-tire-v1667.svg',166701,1),
  ('VEHICLE_PART_FRAME','강화 차체 프레임','SCRAPYARD PART','폐차장 던전에서 획득하는 차량 제작용 차체 프레임입니다.','VEHICLE_PART','EPIC','assets/ui/scrapyard/vehicle-part-frame-v1667.svg',166702,1),
  ('VEHICLE_PART_ENGINE','고출력 엔진','SCRAPYARD PART','폐차장 던전에서 획득하는 차량 제작용 엔진입니다.','VEHICLE_PART','LEGENDARY','assets/ui/scrapyard/vehicle-part-engine-v1667.svg',166703,1);

INSERT OR IGNORE INTO unified_drop_pools_v1667(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only,config_version)
VALUES('SCRAPYARD_PARTS','폐차장 차량 부품','폐차장 웨이브·보스가 공용으로 사용하는 차량 제작 부품 풀입니다.','WEIGHTED_ONE',1,50,1,1,1);

INSERT OR IGNORE INTO unified_drop_entries_v1667(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,sort_order,is_enabled)
SELECT p.id,'INVENTORY_ITEM','VEHICLE_PART_TIRE','고성능 타이어',0,60,1,2,0,10,1 FROM unified_drop_pools_v1667 p WHERE p.code='SCRAPYARD_PARTS';
INSERT OR IGNORE INTO unified_drop_entries_v1667(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,sort_order,is_enabled)
SELECT p.id,'INVENTORY_ITEM','VEHICLE_PART_FRAME','강화 차체 프레임',0,28,1,1,0,20,1 FROM unified_drop_pools_v1667 p WHERE p.code='SCRAPYARD_PARTS';
INSERT OR IGNORE INTO unified_drop_entries_v1667(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,sort_order,is_enabled)
SELECT p.id,'INVENTORY_ITEM','VEHICLE_PART_ENGINE','고출력 엔진',0,12,1,1,0,30,1 FROM unified_drop_pools_v1667 p WHERE p.code='SCRAPYARD_PARTS';

INSERT OR IGNORE INTO unified_drop_bindings_v1667(source_type,source_id,trigger_type,pool_id,priority,is_enabled)
SELECT 'SCRAPYARD','*','WAVE_CLEAR',id,100,1 FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_PARTS';

INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1667_unified_drop_pool','1',CURRENT_TIMESTAMP);
