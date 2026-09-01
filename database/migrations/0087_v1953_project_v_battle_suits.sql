-- V1953 PROJECT V Battle Suits (D1 + PostgreSQL)
-- Battle suits are a separate PVE-only equipment slot. Their initial power is
-- intentionally 0 until balance is configured through the equipment CMS.

INSERT INTO character_equipment_items(
  code,name,slot,subtype,rarity,image_url,description,
  total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight
) VALUES(
  'BATTLE_SUIT_01','배틀슈트 01','BATTLE_SUIT','BATTLE_SUIT','NORMAL',
  '/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-01-white-gold-wing-v1.png',
  '백금 날개형 PROJECT V V3 PVE 전용 배틀슈트 외형.',
  0,0,0,1,1,10,0,0
)
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,slot=excluded.slot,subtype=excluded.subtype,
  image_url=excluded.image_url,description=excluded.description,
  pvp_power=0,supply_enabled=0,supply_weight=0,sort_order=excluded.sort_order,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO character_equipment_items(
  code,name,slot,subtype,rarity,image_url,description,
  total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight
) VALUES(
  'BATTLE_SUIT_02','배틀슈트 02','BATTLE_SUIT','BATTLE_SUIT','NORMAL',
  '/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-02-orange-tactical-v1.png',
  '주황색 전술형 PROJECT V V3 PVE 전용 배틀슈트 외형.',
  0,0,0,1,1,20,0,0
)
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,slot=excluded.slot,subtype=excluded.subtype,
  image_url=excluded.image_url,description=excluded.description,
  pvp_power=0,supply_enabled=0,supply_weight=0,sort_order=excluded.sort_order,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO character_equipment_items(
  code,name,slot,subtype,rarity,image_url,description,
  total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight
) VALUES(
  'BATTLE_SUIT_03','배틀슈트 03','BATTLE_SUIT','BATTLE_SUIT','NORMAL',
  '/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-03-amethyst-exosuit-v1.png',
  '자수정 기계갑주형 PROJECT V V3 PVE 전용 배틀슈트 외형.',
  0,0,0,1,1,30,0,0
)
ON CONFLICT(code) DO UPDATE SET
  name=excluded.name,slot=excluded.slot,subtype=excluded.subtype,
  image_url=excluded.image_url,description=excluded.description,
  pvp_power=0,supply_enabled=0,supply_weight=0,sort_order=excluded.sort_order,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO app_meta(key,value,updated_at)
VALUES('safe_runtime_upgrade_v1953_project_v_battle_suits','1',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;
