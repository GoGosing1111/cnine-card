import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {Z_SWORD_IMAGE,Z_SWORD_DESCRIPTION} from './_battle_suit_z_sword.js';

export const SZ_BODY_UPGRADE_KEY='safe_runtime_upgrade_v2124_sz_body';
export const SZ_BODY_ITEMS=Object.freeze([
  Object.freeze({code:'BATTLE_SUIT_S_BODY',name:'S-BODY',slot:'BATTLE_SUIT',coreCode:'SUIT_CORE_5',
    image:'/assets/items/s-body-v2124.png',battleSprite:'/assets/ui/project-v/account-battle-suits/suits/s-body-v2124.png',
    description:'화이트·블루·레드의 S-BODY. 장착한 총기에 맞춰 전용 V3 외형이 적용되는 PVE 전용 배틀슈트입니다.',sortOrder:50}),
  Object.freeze({code:'BATTLE_SUIT_Z_BODY',name:'Z-BODY',slot:'BATTLE_SUIT',coreCode:'SUIT_CORE_6',
    image:Z_SWORD_IMAGE,battleSprite:Z_SWORD_IMAGE,
    description:Z_SWORD_DESCRIPTION,sortOrder:60})
]);
export const SZ_BODY_BY_CODE=Object.freeze(Object.fromEntries(SZ_BODY_ITEMS.map(item=>[item.code,item])));

// Match the approved H-BODY catalog release. Balance and acquisition stay in CMS.
export async function ensureSzBodyEquipment(env){
  if(readRuntimeData(env,SZ_BODY_UPGRADE_KEY))return true;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SZ_BODY_UPGRADE_KEY).first();
  if(marker?.value==='1')return cacheRuntimeData(env,SZ_BODY_UPGRADE_KEY,true,1800000);
  await env.DB.batch([
    ...SZ_BODY_ITEMS.map(item=>env.DB.prepare(`INSERT INTO character_equipment_items(
      code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight
    ) VALUES(?,?,?,?,'NORMAL',?,?,0,0,0,1,1,?,0,0)
    ON CONFLICT(code) DO UPDATE SET name=excluded.name,slot=excluded.slot,subtype=excluded.subtype,
      image_url=excluded.image_url,description=excluded.description,pvp_power=0,updated_at=CURRENT_TIMESTAMP`)
      .bind(item.code,item.name,item.slot,item.slot,item.image,item.description,item.sortOrder)),
    env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(SZ_BODY_UPGRADE_KEY)
  ]);
  return cacheRuntimeData(env,SZ_BODY_UPGRADE_KEY,true,1800000);
}
