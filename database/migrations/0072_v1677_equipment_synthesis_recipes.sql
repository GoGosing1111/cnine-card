CREATE TABLE IF NOT EXISTS equipment_synthesis_recipes_v1677 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  input_equipment_id INTEGER NOT NULL,
  output_equipment_id INTEGER NOT NULL,
  input_quantity INTEGER NOT NULL DEFAULT 3,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_public INTEGER NOT NULL DEFAULT 1,
  owner_test_only INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_equipment_synthesis_recipes_public_v1677
  ON equipment_synthesis_recipes_v1677(is_active, is_public, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_equipment_synthesis_recipes_input_v1677
  ON equipment_synthesis_recipes_v1677(input_equipment_id);

INSERT OR IGNORE INTO equipment_synthesis_recipes_v1677
  (code,name,description,input_equipment_id,output_equipment_id,input_quantity,is_active,is_public,sort_order)
SELECT 'SYNTH_VALKYRIE_SUIT_PRIME','발키리 슈트 계보','발키리 슈트 3개를 프라임 배틀슈트 1개로 합성합니다.',i.id,o.id,3,1,1,10
FROM character_equipment_items i, character_equipment_items o
WHERE i.name='발키리 슈트' AND o.name='프라임 배틀슈트' LIMIT 1;

INSERT OR IGNORE INTO equipment_synthesis_recipes_v1677
  (code,name,description,input_equipment_id,output_equipment_id,input_quantity,is_active,is_public,sort_order)
SELECT 'SYNTH_ODIN_AK_INFINITY','오딘 AK 계보','오딘 AK 3개를 인피니티 AK 1개로 합성합니다.',i.id,o.id,3,1,1,20
FROM character_equipment_items i, character_equipment_items o
WHERE i.name='오딘 AK' AND o.name='인피니티 AK' LIMIT 1;

INSERT OR IGNORE INTO equipment_synthesis_recipes_v1677
  (code,name,description,input_equipment_id,output_equipment_id,input_quantity,is_active,is_public,sort_order)
SELECT 'SYNTH_VALKYRIE_LEGGINGS_PRIME','발키리 레깅스 계보','발키리 레깅스 3개를 프라임 배틀레깅스 1개로 합성합니다.',i.id,o.id,3,1,1,30
FROM character_equipment_items i, character_equipment_items o
WHERE i.name='발키리 레깅스' AND o.name='프라임 배틀레깅스' LIMIT 1;

INSERT OR IGNORE INTO equipment_synthesis_recipes_v1677
  (code,name,description,input_equipment_id,output_equipment_id,input_quantity,is_active,is_public,sort_order)
SELECT 'SYNTH_VALKYRIE_BOOTS_PRIME','발키리 부츠 계보','발키리 부츠 3개를 프라임 배틀슈즈 1개로 합성합니다.',i.id,o.id,3,1,1,40
FROM character_equipment_items i, character_equipment_items o
WHERE i.name='발키리 부츠' AND o.name='프라임 배틀슈즈' LIMIT 1;

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1677_equipment_synthesis_recipes','1',CURRENT_TIMESTAMP);
