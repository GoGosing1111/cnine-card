-- S1 Immortal King. Apply once through the normal migration transaction.
-- Feature is disabled until SEASON_S1_ENABLED=1 and per-mode dates are configured.
CREATE TABLE IF NOT EXISTS season_s1_accounts (
 user_id BIGINT PRIMARY KEY,
 revision BIGINT NOT NULL DEFAULT 0,
 state_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS season_s1_receipts (
 user_id BIGINT NOT NULL,
 receipt_key TEXT NOT NULL,
 input_hash TEXT NOT NULL,
 token TEXT NOT NULL UNIQUE,
 response_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,receipt_key)
);
INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
VALUES('PVE_S1_TITLE','불멸의 정복자','S1 불멸의 왕 PVE 50레벨 시즌 제작 칭호','불멸의 정복자','/assets/items/season-s1-immortal-king/immortal-seal-v3.webp',0,'MANUAL','{}','DEFAULT',1,1,950)
ON CONFLICT(code) DO NOTHING;
INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
VALUES('PVP_S1_TITLE','불멸의 승리자','S1 불멸의 왕 PVP 50레벨 시즌 제작 칭호','불멸의 승리자','/assets/items/season-s1-immortal-king/immortal-crest-v3.webp',0,'MANUAL','{}','DEFAULT',1,1,951)
ON CONFLICT(code) DO NOTHING;
