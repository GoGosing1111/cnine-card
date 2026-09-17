import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

export const Z_SWORD_APPEARANCE_KEY='safe_runtime_upgrade_z_sword_20260918';
export const Z_SWORD_IMAGE='/assets/ui/project-v/account-battle-suits/z-sword-v1/z-body.png';
export const Z_SWORD_DESCRIPTION='백색·진홍·황금 장갑과 푸른 대검의 Z-BODY. 돌진 검격과 뇌검 집행 모션을 사용하는 PVE 전용 배틀슈트입니다.';

// Appearance only: preserve every owned instance, CMS value, recipe and stat.
export async function ensureZBodySwordAppearance(env){
  if(readRuntimeData(env,Z_SWORD_APPEARANCE_KEY))return true;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(Z_SWORD_APPEARANCE_KEY).first();
  if(marker?.value==='1')return cacheRuntimeData(env,Z_SWORD_APPEARANCE_KEY,true,1800000);
  await env.DB.batch([
    env.DB.prepare("UPDATE character_equipment_items SET image_url=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE code='BATTLE_SUIT_Z_BODY' AND slot='BATTLE_SUIT'").bind(Z_SWORD_IMAGE,Z_SWORD_DESCRIPTION),
    env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) SELECT ?,'1',CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM character_equipment_items WHERE code='BATTLE_SUIT_Z_BODY' AND slot='BATTLE_SUIT') ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(Z_SWORD_APPEARANCE_KEY)
  ]);
  const applied=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(Z_SWORD_APPEARANCE_KEY).first();
  return applied?.value==='1'?cacheRuntimeData(env,Z_SWORD_APPEARANCE_KEY,true,1800000):false;
}
