ALTER TABLE territory_war_v3_rewards ADD COLUMN premium_cube_quantity INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
VALUES('PREMIUM_CUBE','프리미엄 큐브','PREMIUM REWARD CUBE','MA·FUR·LIMITED 등급 카드가 등장하는 최고급 보상 큐브입니다.','CUBE','PREMIUM','assets/ui/packs/premium-cube.png',30,1);

INSERT OR REPLACE INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1475_territory_participation_cube_reward','1',CURRENT_TIMESTAMP);
