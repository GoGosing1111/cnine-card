-- v1210 PRESTIGE 저장 호환 패치
-- 운영 DB에서는 functions/api/[[path]].js의 safe_runtime_upgrade_v1210_prestige_storage가 1회 안전 적용합니다.
-- 기존 cards.rarity CHECK를 재생성하지 않고, PRESTIGE는 물리 rarity=FUR + rarity_override=PRESTIGE로 보관합니다.
ALTER TABLE cards ADD COLUMN rarity_override TEXT;
CREATE INDEX IF NOT EXISTS idx_cards_rarity_override ON cards(rarity_override,is_active,card_status);
CREATE VIEW IF NOT EXISTS cards_effective_v1210 AS
SELECT id,member_id,title,COALESCE(NULLIF(rarity_override,''),rarity) AS rarity,image_url,focus_x,focus_y,is_active,created_by,created_at,updated_at,
  power_type,base_power,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,rarity AS storage_rarity,rarity_override
FROM cards;
