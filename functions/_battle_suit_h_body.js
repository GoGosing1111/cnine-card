import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

export const H_BODY_UPGRADE_KEY='safe_runtime_upgrade_v2066_h_body';
export const H_BODY_ITEM=Object.freeze({
  code:'BATTLE_SUIT_H_BODY',name:'H-BODY',slot:'BATTLE_SUIT',
  image:'/assets/items/h-body-v2066.png',
  battleSprite:'/assets/ui/project-v/account-battle-suits/suits/h-body-v2066.png',
  description:'백색 판금과 엠버 코어를 갖춘 H-BODY. 장착한 총기에 맞춰 전용 V3 외형이 적용되는 PVE 전용 배틀슈트입니다.',
  pvePower:0,pvpPower:0,sortOrder:40
});

// Appearance/catalog release only. OWNER sets power and acquisition in CMS;
// never grant copies, create recipes or enable a random pool during migration.
export async function ensureHBodyEquipment(env){
  if(readRuntimeData(env,H_BODY_UPGRADE_KEY))return true;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(H_BODY_UPGRADE_KEY).first();
  if(marker?.value==='1')return cacheRuntimeData(env,H_BODY_UPGRADE_KEY,true,1800000);
  const item=H_BODY_ITEM;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO character_equipment_items(
      code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight
    ) VALUES(?,?,?,?,'NORMAL',?,?,?, ?,0,1,1,?,0,0)
    ON CONFLICT(code) DO UPDATE SET name=excluded.name,slot=excluded.slot,subtype=excluded.subtype,
      image_url=excluded.image_url,description=excluded.description,pvp_power=0,updated_at=CURRENT_TIMESTAMP`)
      .bind(item.code,item.name,item.slot,item.slot,item.image,item.description,item.pvePower,item.pvePower,item.sortOrder),
    env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(H_BODY_UPGRADE_KEY)
  ]);
  return cacheRuntimeData(env,H_BODY_UPGRADE_KEY,true,1800000);
}
