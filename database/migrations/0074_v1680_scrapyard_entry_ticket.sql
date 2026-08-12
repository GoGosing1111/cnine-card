-- V1680 dedicated scrapyard entry ticket and unified-drop registration.
ALTER TABLE scrapyard_run_receipts_v1676 ADD COLUMN ticket_consumed INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS scrapyard_ticket_reservations_v1680 (
  request_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  item_code TEXT NOT NULL DEFAULT 'SCRAPYARD_ENTRY_TICKET',
  status TEXT NOT NULL DEFAULT 'RESERVED',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(request_id,user_id)
);

INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
VALUES('SCRAPYARD_ENTRY_TICKET','폐차장 출입 허가증','SALVAGE ACCESS PASS','망각의 기계 폐차장에 1회 입장할 수 있는 금속 출입 허가증입니다. 입장 시 1장이 차감됩니다.','ENTRY_TICKET','EPIC','assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png',166700,1)
ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category=excluded.category,rarity=excluded.rarity,image_url=excluded.image_url,sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO unified_drop_pools_v1667(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only,config_version)
VALUES('SCRAPYARD_ENTRY_TICKET_DROP','폐차장 출입 허가증','PVE 승리 시 폐차장 출입 허가증을 독립 판정합니다. CMS 통합 드랍률에서 확률·수량·일일 제한·연결 콘텐츠를 변경할 수 있습니다.','INDEPENDENT',1,0,1,0,1);

INSERT OR IGNORE INTO unified_drop_entries_v1667(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,sort_order,is_enabled)
SELECT id,'INVENTORY_ITEM','SCRAPYARD_ENTRY_TICKET','폐차장 출입 허가증',2,0,1,1,5,10,1 FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_ENTRY_TICKET_DROP';

INSERT OR IGNORE INTO unified_drop_bindings_v1667(source_type,source_id,trigger_type,pool_id,priority,is_enabled)
SELECT 'PVE','*','WIN',id,80,1 FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_ENTRY_TICKET_DROP';
INSERT OR IGNORE INTO unified_drop_bindings_v1667(source_type,source_id,trigger_type,pool_id,priority,is_enabled)
SELECT 'PVE_AUTO','*','WIN',id,80,1 FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_ENTRY_TICKET_DROP';

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1680_scrapyard_ticket','1',CURRENT_TIMESTAMP);
INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1680_scrapyard_ticket_drop_pool','1',CURRENT_TIMESTAMP);
