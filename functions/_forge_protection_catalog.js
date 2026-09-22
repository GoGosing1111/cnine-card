import {ensureRuntimeFoundation} from './_runtime_foundation.js';

export const FORGE_PROTECTION_ITEM=Object.freeze({
  code:'EQUIPMENT_PROTECTION_TICKET',
  name:'장비 보호권',
  subtitle:'EQUIPMENT PROTECTION',
  description:'장비 강화에서 보호권 사용을 선택하면 파괴 판정을 막아 장비를 보존합니다. 성공 확률은 오르지 않으며, 소모 시점과 수량은 강화 정책을 따릅니다. 인벤토리에서 직접 사용하지 않습니다.',
  category:'MATERIAL',rarity:'SPECIAL',
  image:'assets/items/equipment-protection-ticket-v1.webp',
  sortOrder:12,
});
export const FORGE_PROTECTION_CATALOG_MARKER='equipment_protection_catalog_20260922_v1';

export async function ensureForgeProtectionCatalog(env){
  // Independent of the legacy runtime fast gate; catalog only, never a grant,
  // loot-pool change, draft selection or forge release/consumption policy.
  await ensureRuntimeFoundation(env,FORGE_PROTECTION_CATALOG_MARKER,[FORGE_PROTECTION_CATALOG_MARKER],async()=>{
    const item=FORGE_PROTECTION_ITEM;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
        VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING`)
        .bind(item.code,item.name,item.subtitle,item.description,item.category,item.rarity,item.image,item.sortOrder),
      env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").bind(FORGE_PROTECTION_CATALOG_MARKER),
    ]);
  });
}
