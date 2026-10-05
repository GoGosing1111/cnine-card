import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {OVERLORD_SUIT_CODE,OVERLORD_INITIAL_POWER} from '../shared/overlord-suit-v1.mjs';
export const OVERLORD_UPGRADE_KEY='safe_runtime_upgrade_overlord_20261005';
export const OVERLORD_ITEM=Object.freeze({
 code:OVERLORD_SUIT_CODE,name:'오버로드',slot:'BATTLE_SUIT',
 image:'/assets/ui/project-v/account-battle-suits/overlord-v1/overlord.png',
 battleSprite:'/assets/ui/project-v/account-battle-suits/overlord-v1/overlord.png',
 description:'진홍 불꽃과 전용 칭호를 두른 상위 배틀슈트. 단죄·왕의 삼연참·왕관의 처형과 백호멸진을 사용합니다. 백호멸진은 전투 시작 즉시, 이후 18초마다 생존 적 전체에 슈트 기본 피해 6배를 가합니다. PVE 전용.',
 sortOrder:80
});
// Register once; later CMS power, visibility and acquisition choices are retained.
// This does not grant ownership, seed a recipe, or add a supply-box drop.
export async function ensureOverlordEquipment(env){
 if(readRuntimeData(env,OVERLORD_UPGRADE_KEY))return true;
 const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(OVERLORD_UPGRADE_KEY).first();
 if(marker?.value==='1')return cacheRuntimeData(env,OVERLORD_UPGRADE_KEY,true,1800000);
 const item=OVERLORD_ITEM;
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO character_equipment_items(
   code,name,slot,subtype,rarity,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,sort_order,supply_enabled,supply_weight
  ) VALUES(?,?,?,?,'NORMAL',?,?,?, ?,0,1,1,?,0,0)
  ON CONFLICT(code) DO UPDATE SET name=excluded.name,slot=excluded.slot,subtype=excluded.subtype,
   image_url=excluded.image_url,description=excluded.description,pvp_power=0,updated_at=CURRENT_TIMESTAMP`)
   .bind(item.code,item.name,item.slot,item.slot,item.image,item.description,OVERLORD_INITIAL_POWER,OVERLORD_INITIAL_POWER,item.sortOrder),
  env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(OVERLORD_UPGRADE_KEY)
 ]);
 return cacheRuntimeData(env,OVERLORD_UPGRADE_KEY,true,1800000);
}

