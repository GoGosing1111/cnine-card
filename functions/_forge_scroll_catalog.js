import {ensureRuntimeFoundation} from './_runtime_foundation.js';
import {FORGE_SCROLL_ITEMS} from '../shared/equipment-forge-advanced-v1.mjs';
export {FORGE_SCROLL_ITEMS};
export const FORGE_SCROLL_CATALOG_MARKER='equipment_enhancement_scroll_catalog_20261011_v1';
export async function ensureForgeScrollCatalog(env){
 await ensureRuntimeFoundation(env,FORGE_SCROLL_CATALOG_MARKER,[FORGE_SCROLL_CATALOG_MARKER],async()=>{
  await env.DB.batch([
   ...FORGE_SCROLL_ITEMS.map((item,i)=>env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,'MATERIAL','SPECIAL',?,?,1) ON CONFLICT(code) DO NOTHING`).bind(item.code,item.name,item.subtitle,(i?'상의·하의·신발·장신구':'무기')+'의 +10→+11부터 +15까지 강화할 때 필요한 주문서입니다. 시도별 수량은 강화 센터에서 확인하며 성공·유지·파괴 결과와 관계없이 시도 시 소모합니다.',item.image,14+i)),
   env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").bind(FORGE_SCROLL_CATALOG_MARKER)
  ]);
 });
}
