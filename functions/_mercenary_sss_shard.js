import {ensureRuntimeFoundation} from './_runtime_foundation.js';
export const MERCENARY_SSS_SHARD_ITEM=Object.freeze({code:'MERCENARY_SSS_CARD_SHARD',name:'SSS 용병 카드 조각',subtitle:'SSS MERCENARY CARD SHARD',description:'SSS 용병 카드 조각입니다. 보관용 재료이며 교환 방법과 필요 수량은 추후 안내됩니다.',category:'MATERIAL',rarity:'SSS',image:'assets/items/mercenary-sss-card-shard-v1.png',sortOrder:174902});
export const MERCENARY_SSS_SHARD_MARKER='mercenary_sss_card_shard_catalog_20261014_v1';
export async function ensureMercenarySssShardCatalog(env){
 await ensureRuntimeFoundation(env,MERCENARY_SSS_SHARD_MARKER,[MERCENARY_SSS_SHARD_MARKER],async()=>{
  const x=MERCENARY_SSS_SHARD_ITEM;
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING`).bind(x.code,x.name,x.subtitle,x.description,x.category,x.rarity,x.image,x.sortOrder),
   env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").bind(MERCENARY_SSS_SHARD_MARKER)
  ]);
 });
}
