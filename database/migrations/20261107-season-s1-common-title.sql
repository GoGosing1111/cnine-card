INSERT INTO character_titles(code,name,description,badge_text,image_url,pve_power,unlock_type,unlock_config_json,style_preset,is_active,is_public,sort_order)
VALUES('COMMON_S1_TITLE','불멸의 계승자','S1 불멸의 왕 공용 50레벨 시즌 제작 칭호','불멸의 계승자','/assets/ui/titles/immortal-heir-emblem-v1.webp',700000,'MANUAL','{}','IMMORTAL_HEIR',1,1,952)
ON CONFLICT(code) DO NOTHING;
