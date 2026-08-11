-- V1668 extensible workshop: vehicle crafting now, equipment synthesis later.
CREATE TABLE IF NOT EXISTS workshop_recipes_v1668 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'VEHICLE',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  output_type TEXT NOT NULL DEFAULT 'VEHICLE',
  output_ref TEXT NOT NULL,
  output_quantity INTEGER NOT NULL DEFAULT 1,
  payment_mode TEXT NOT NULL DEFAULT 'COIN_OR_MASTER_STAR',
  coin_cost INTEGER NOT NULL DEFAULT 0,
  master_star_cost INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 100,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_public INTEGER NOT NULL DEFAULT 1,
  owner_test_only INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workshop_recipe_materials_v1668 (
  recipe_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(recipe_id,item_code)
);

CREATE TABLE IF NOT EXISTS workshop_craft_receipts_v1668 (
  request_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  payment_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  result_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(request_id,user_id)
);

CREATE TABLE IF NOT EXISTS workshop_craft_guards_v1668 (
  guard_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workshop_craft_logs_v1668 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  recipe_name TEXT NOT NULL,
  category TEXT NOT NULL,
  output_type TEXT NOT NULL,
  output_ref TEXT NOT NULL,
  output_quantity INTEGER NOT NULL DEFAULT 1,
  payment_type TEXT NOT NULL,
  coin_spent INTEGER NOT NULL DEFAULT 0,
  master_star_spent INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(request_id,user_id)
);

CREATE INDEX IF NOT EXISTS idx_workshop_recipes_public_v1668 ON workshop_recipes_v1668(category,is_active,is_public,sort_order,id);
CREATE INDEX IF NOT EXISTS idx_workshop_materials_recipe_v1668 ON workshop_recipe_materials_v1668(recipe_id,sort_order,item_code);
CREATE INDEX IF NOT EXISTS idx_workshop_logs_user_v1668 ON workshop_craft_logs_v1668(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_guards_created_v1668 ON workshop_craft_guards_v1668(created_at);

UPDATE inventory_items SET image_url='assets/ui/workshop/vehicle-part-tire-v1668.png',updated_at=CURRENT_TIMESTAMP WHERE code='VEHICLE_PART_TIRE';
UPDATE inventory_items SET image_url='assets/ui/workshop/vehicle-part-frame-v1668.png',updated_at=CURRENT_TIMESTAMP WHERE code='VEHICLE_PART_FRAME';
UPDATE inventory_items SET image_url='assets/ui/workshop/vehicle-part-engine-v1668.png',updated_at=CURRENT_TIMESTAMP WHERE code='VEHICLE_PART_ENGINE';

INSERT OR IGNORE INTO workshop_recipes_v1668(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order)
VALUES
 ('WORKSHOP_GOLD_MATIZ','VEHICLE','황금마티즈 조립','폐차장에서 회수한 기본 부품으로 완성하는 입문 차량입니다.','VEHICLE','11',1,'COIN_OR_MASTER_STAR',500000,2,100,1,1,1,0,10),
 ('WORKSHOP_SIEGE_TANK','VEHICLE','틀타 시즈탱크 조립','강화 차체와 고출력 엔진을 사용하는 중급 전투 차량입니다.','VEHICLE','2',1,'COIN_OR_MASTER_STAR',2000000,6,100,0,1,1,0,20),
 ('WORKSHOP_SKI1000C','VEHICLE','SKI1000C 조립','정밀 부품을 대량 투입해 완성하는 상급 제작 차량입니다.','VEHICLE','3',1,'COIN_OR_MASTER_STAR',6000000,18,100,0,1,1,0,30);

INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_TIRE',4,10 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_GOLD_MATIZ';
INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_FRAME',2,20 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_GOLD_MATIZ';
INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_ENGINE',1,30 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_GOLD_MATIZ';

INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_TIRE',8,10 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_SIEGE_TANK';
INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_FRAME',4,20 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_SIEGE_TANK';
INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_ENGINE',2,30 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_SIEGE_TANK';

INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_TIRE',14,10 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_SKI1000C';
INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_FRAME',8,20 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_SKI1000C';
INSERT OR IGNORE INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order)
SELECT id,'VEHICLE_PART_ENGINE',5,30 FROM workshop_recipes_v1668 WHERE code='WORKSHOP_SKI1000C';

INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v1668_workshop','1',CURRENT_TIMESTAMP);
