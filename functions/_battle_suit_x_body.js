import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

export const X_BODY_UPGRADE_KEY='safe_runtime_upgrade_x_body_20260927';
export const X_BODY_ITEM=Object.freeze({
 code:'BATTLE_SUIT_X_BODY',name:'X-BODY',slot:'BATTLE_SUIT',coreCode:'SUIT_CORE_7',
 image:'/assets/ui/project-v/account-battle-suits/x-sword-v1/x-body.png',
 battleSprite:'/assets/ui/project-v/account-battle-suits/x-sword-v1/x-body.png',
 description:'백금 검사의 X-BODY. 청광 대시·일섬·천광 연섬과 천룡 강림 전용 연출을 사용하는 PVE 전용 배틀슈트입니다.',
 sortOrder:70
});

// Same catalog-only registration policy as H/S/Z. Operations choose power,
// rarity and acquisition in CMS; deployment never grants inventory or a recipe.
export async function ensureXBodyEquipment(env){
 if(readRuntimeData(env,X_BODY_UPGRADE_KEY))return true;
 const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(X_BODY_UPGRADE_KEY).first();
 if(marker?.value==='1')return cacheRuntimeData(env,X_BODY_UPGRADE_KEY,true,1800000);
 const item=X_BODY_ITEM;
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO character_equipment_items(
   code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight
  ) VALUES(?,?,?,?,'NORMAL',?,?,0,0,0,1,1,?,0,0)
  ON CONFLICT(code) DO UPDATE SET name=excluded.name,slot=excluded.slot,subtype=excluded.subtype,
   image_url=excluded.image_url,description=excluded.description,pvp_power=0,updated_at=CURRENT_TIMESTAMP`)
   .bind(item.code,item.name,item.slot,item.slot,item.image,item.description,item.sortOrder),
  env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(X_BODY_UPGRADE_KEY)
 ]);
 return cacheRuntimeData(env,X_BODY_UPGRADE_KEY,true,1800000);
}
