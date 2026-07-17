-- v1026 CNINE inventory isolation and reward cubes. Additive only.
-- A unique table name avoids modifying any legacy table named user_inventory.
CREATE TABLE IF NOT EXISTS cnine_user_inventory (
  user_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unseen_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,item_code)
);

CREATE INDEX IF NOT EXISTS idx_cnine_user_inventory_user
ON cnine_user_inventory(user_id,quantity);

INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
VALUES('NORMAL_CUBE','일반 큐브','STANDARD REWARD CUBE','몬스터 사냥과 이벤트에서 획득하는 C~SR 등급 보상 큐브입니다.','CUBE','NORMAL','assets/ui/packs/normal-cube.png',10,1);

INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
VALUES('ADVANCED_CUBE','고급 큐브','ADVANCED REWARD CUBE','HR~SSR 등급 카드가 등장하는 고급 보상 큐브입니다.','CUBE','ADVANCED','assets/ui/packs/advanced-cube.png',20,1);

INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
VALUES('PREMIUM_CUBE','프리미엄 큐브','PREMIUM REWARD CUBE','MA·FUR·LIMITED 등급 카드가 등장하는 최고급 보상 큐브입니다.','CUBE','PREMIUM','assets/ui/packs/premium-cube.png',30,1);

INSERT OR IGNORE INTO app_meta(key,value,updated_at)
VALUES('inventory_cube_settings_v1','{"NORMAL_CUBE":{"C":45,"U":30,"R":18,"SR":7},"ADVANCED_CUBE":{"HR":55,"UR":30,"SSR":15},"PREMIUM_CUBE":{"MA":70,"FUR":20,"LIMITED":10}}',CURRENT_TIMESTAMP);
