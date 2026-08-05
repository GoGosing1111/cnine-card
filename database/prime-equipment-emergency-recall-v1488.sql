-- EMERGENCY PRIME EQUIPMENT RECALL v1488
-- OWNER 보유분만 유지하며, 보상 없이 프라임 장비를 전량 회수한다.

CREATE TABLE IF NOT EXISTS prime_equipment_recall_audit_v1488(
  instance_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  equipment_id INTEGER NOT NULL,
  equipment_code TEXT NOT NULL DEFAULT '',
  equipment_name TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  request_id TEXT,
  was_equipped INTEGER NOT NULL DEFAULT 0,
  acquired_at TEXT,
  recalled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO prime_equipment_recall_audit_v1488(
  instance_id,user_id,equipment_id,equipment_code,equipment_name,
  source_type,source_id,request_id,was_equipped,acquired_at
)
SELECT x.id,x.user_id,x.equipment_id,i.code,i.name,
  x.source_type,x.source_id,x.request_id,
  CASE WHEN l.instance_id IS NULL THEN 0 ELSE 1 END,x.acquired_at
FROM user_equipment_instances x
JOIN character_equipment_items i ON i.id=x.equipment_id
JOIN users u ON u.id=x.user_id
LEFT JOIN user_equipment_loadout l ON l.instance_id=x.id
WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
  AND (
    UPPER(COALESCE(i.code,'')) LIKE 'PRIME%'
    OR REPLACE(COALESCE(i.name,''),' ','') LIKE '프라임%'
  );

UPDATE character_equipment_items
SET supply_enabled=0,supply_weight=0,updated_at=CURRENT_TIMESTAMP
WHERE UPPER(COALESCE(code,'')) LIKE 'PRIME%'
   OR REPLACE(COALESCE(name,''),' ','') LIKE '프라임%';

DELETE FROM user_equipment_loadout
WHERE instance_id IN (
  SELECT x.id
  FROM user_equipment_instances x
  JOIN character_equipment_items i ON i.id=x.equipment_id
  JOIN users u ON u.id=x.user_id
  WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
    AND (
      UPPER(COALESCE(i.code,'')) LIKE 'PRIME%'
      OR REPLACE(COALESCE(i.name,''),' ','') LIKE '프라임%'
    )
);

DELETE FROM user_equipment_instances
WHERE id IN (
  SELECT x.id
  FROM user_equipment_instances x
  JOIN character_equipment_items i ON i.id=x.equipment_id
  JOIN users u ON u.id=x.user_id
  WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
    AND (
      UPPER(COALESCE(i.code,'')) LIKE 'PRIME%'
      OR REPLACE(COALESCE(i.name,''),' ','') LIKE '프라임%'
    )
);

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1488_prime_equipment_recall','1',CURRENT_TIMESTAMP);

-- 실행 결과 확인
SELECT COUNT(*) AS recalled_instances,
       COUNT(DISTINCT user_id) AS affected_users
FROM prime_equipment_recall_audit_v1488;

SELECT COUNT(*) AS remaining_non_owner_prime
FROM user_equipment_instances x
JOIN character_equipment_items i ON i.id=x.equipment_id
JOIN users u ON u.id=x.user_id
WHERE UPPER(COALESCE(u.role,'USER'))<>'OWNER'
  AND (
    UPPER(COALESCE(i.code,'')) LIKE 'PRIME%'
    OR REPLACE(COALESCE(i.name,''),' ','') LIKE '프라임%'
  );
