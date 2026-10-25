import {PRIME_MATERIAL} from '../shared/mercenary-prime-material-v1.mjs';
import {ensureRuntimeFoundation} from './_runtime_foundation.js';
export const PRIME_MATERIAL_MARKER='mercenary_prime_depleted_catalog_20261025_v1';
export async function ensurePrimeMaterialCatalog(env){
 await ensureRuntimeFoundation(env,PRIME_MATERIAL_MARKER,[PRIME_MATERIAL_MARKER],async()=>{
  const x=PRIME_MATERIAL;
  await env.DB.batch([
   env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING').bind(x.code,x.name,x.subtitle,x.description,x.category,x.rarity,x.image,x.sortOrder),
   env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").bind(PRIME_MATERIAL_MARKER)
  ]);
 });
}
