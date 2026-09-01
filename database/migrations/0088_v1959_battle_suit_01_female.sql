-- V1959 Battle Suit 01 female redesign.
-- PVE power and user ownership/loadout rows are intentionally preserved.

UPDATE character_equipment_items
SET image_url='/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-01-white-gold-female-v2.png',
    description='백금 날개 여성형 PROJECT V V3 PVE 전용 배틀슈트 외형.',
    updated_at=CURRENT_TIMESTAMP
WHERE code='BATTLE_SUIT_01';

INSERT INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1959_battle_suit_01_female','1',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;
