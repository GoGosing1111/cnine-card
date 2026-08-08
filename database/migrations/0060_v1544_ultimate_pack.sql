BEGIN TRANSACTION;
UPDATE card_packs SET is_active=0 WHERE id='advanced';
UPDATE card_packs SET sort_order=1 WHERE id='basic';
UPDATE card_packs SET sort_order=2 WHERE id='premium';
UPDATE card_packs SET sort_order=3 WHERE id='pickup';
INSERT INTO card_packs(id,name,subtitle,description,theme,price,allowed_rarities,guarantee_10,guarantee_20,pickup_member_id,pickup_multiplier,is_active,sort_order)
VALUES('ultimate','얼티메이트 카드팩','ULTIMATE PACK','비싼 만큼 상위 등급 확률이 크게 상승한 최고급 카드팩','ultimate',300,'["R","SR","HR","UR","SSR","MA","FUR","LIMITED"]','HR','UR',NULL,1,1,4)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,theme=excluded.theme,price=excluded.price,allowed_rarities=excluded.allowed_rarities,guarantee_10=excluded.guarantee_10,guarantee_20=excluded.guarantee_20,is_active=1,sort_order=4;
INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES
('ultimate','C',0),('ultimate','U',0),('ultimate','R',24.647),('ultimate','SR',27),
('ultimate','HR',25),('ultimate','UR',18),('ultimate','SSR',5),('ultimate','MA',0.35),
('ultimate','FUR',0.003),('ultimate','LIMITED',0.03);
COMMIT;
