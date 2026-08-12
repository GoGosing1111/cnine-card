-- V1682: move scrapyard part probabilities into three difficulty-specific unified drop pools.
INSERT OR IGNORE INTO unified_drop_pools_v1667(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only,config_version)
SELECT 'SCRAPYARD_PARTS_OUTER','폐차장 · 외곽 부품','OUTER 난이도 완주 시 차량 부품을 한 번 판정합니다.','WEIGHTED_ONE',1,no_drop_weight,1,0,1
FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_PARTS';

INSERT OR IGNORE INTO unified_drop_pools_v1667(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only,config_version)
SELECT 'SCRAPYARD_PARTS_CORE','폐차장 · 압축 설비 부품','CORE 난이도 완주 시 차량 부품을 한 번 판정합니다.','WEIGHTED_ONE',1,no_drop_weight,1,0,1
FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_PARTS';

INSERT OR IGNORE INTO unified_drop_pools_v1667(code,name,description,roll_mode,rolls,no_drop_weight,is_enabled,owner_test_only,config_version)
SELECT 'SCRAPYARD_PARTS_FURNACE','폐차장 · 용광로 부품','FURNACE 난이도 완주 시 차량 부품을 한 번 판정합니다.','WEIGHTED_ONE',1,no_drop_weight,1,0,1
FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_PARTS';

INSERT OR IGNORE INTO unified_drop_entries_v1667(pool_id,reward_type,reward_ref,reward_name,chance_percent,weight,min_quantity,max_quantity,daily_limit,conditions_json,sort_order,is_enabled)
SELECT target.id,source.reward_type,source.reward_ref,source.reward_name,source.chance_percent,source.weight,source.min_quantity,source.max_quantity,source.daily_limit,source.conditions_json,source.sort_order,source.is_enabled
FROM unified_drop_entries_v1667 source
JOIN unified_drop_pools_v1667 legacy ON legacy.id=source.pool_id AND legacy.code='SCRAPYARD_PARTS'
JOIN unified_drop_pools_v1667 target ON target.code IN ('SCRAPYARD_PARTS_OUTER','SCRAPYARD_PARTS_CORE','SCRAPYARD_PARTS_FURNACE');

INSERT OR IGNORE INTO unified_drop_bindings_v1667(source_type,source_id,trigger_type,pool_id,priority,is_enabled)
SELECT 'SCRAPYARD','OUTER','CLEAR',id,100,1 FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_PARTS_OUTER';
INSERT OR IGNORE INTO unified_drop_bindings_v1667(source_type,source_id,trigger_type,pool_id,priority,is_enabled)
SELECT 'SCRAPYARD','CORE','CLEAR',id,100,1 FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_PARTS_CORE';
INSERT OR IGNORE INTO unified_drop_bindings_v1667(source_type,source_id,trigger_type,pool_id,priority,is_enabled)
SELECT 'SCRAPYARD','FURNACE','CLEAR',id,100,1 FROM unified_drop_pools_v1667 WHERE code='SCRAPYARD_PARTS_FURNACE';

UPDATE unified_drop_bindings_v1667 SET is_enabled=0 WHERE source_type='SCRAPYARD' AND source_id='*';
UPDATE unified_drop_pools_v1667 SET is_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE code='SCRAPYARD_PARTS';
INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1682_scrapyard_difficulty_drop_pools','1',CURRENT_TIMESTAMP);
