-- V1969 PROJECT V Battle Suit PVE power tiers (D1 + PostgreSQL)
-- User-approved fixed values: Suit 01 = 100,000, Suit 02 = 200,000,
-- Suit 03 = 300,000. Battle Suits remain excluded from PVP.

UPDATE character_equipment_items
SET total_power=CASE code
      WHEN 'BATTLE_SUIT_01' THEN 100000
      WHEN 'BATTLE_SUIT_02' THEN 200000
      WHEN 'BATTLE_SUIT_03' THEN 300000
      ELSE total_power
    END,
    pve_power=CASE code
      WHEN 'BATTLE_SUIT_01' THEN 100000
      WHEN 'BATTLE_SUIT_02' THEN 200000
      WHEN 'BATTLE_SUIT_03' THEN 300000
      ELSE pve_power
    END,
    pvp_power=0,
    supply_enabled=0,
    supply_weight=0,
    updated_at=CURRENT_TIMESTAMP
WHERE code IN ('BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03')
  AND slot='BATTLE_SUIT';

INSERT INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1969_battle_suit_power_tiers','1',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;
