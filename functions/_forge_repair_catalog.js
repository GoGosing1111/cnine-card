import {ensureRuntimeFoundation} from './_runtime_foundation.js';

export const FORGE_REPAIR_ITEM=Object.freeze({
  code:'PINGDU_REPAIR_COUPON',
  name:'핑두 리페어 쿠폰',
  subtitle:'PINGDU REPAIR',
  description:'장비 강화로 파괴된 장비를 복구하는 전용 쿠폰입니다. 장비 강화 센터 → 파괴 기록에서 복구할 장비를 선택하세요. 쿠폰 소모 수량·반환 단계는 복구 화면에서 확인하며, 인벤토리에서 직접 사용하지 않습니다.',
  category:'MATERIAL',rarity:'SPECIAL',
  image:'assets/items/pingdu-repair-coupon-v1.webp',
  sortOrder:13,
});
export const FORGE_REPAIR_CATALOG_MARKER='pingdu_repair_catalog_20260922_v1';

export async function ensureForgeRepairCatalog(env){
  // A separate gate also runs on databases that already completed the legacy
  // runtime/protection gates. Registration never grants items or opens forge.
  await ensureRuntimeFoundation(env,FORGE_REPAIR_CATALOG_MARKER,[FORGE_REPAIR_CATALOG_MARKER],async()=>{
    const item=FORGE_REPAIR_ITEM;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
        VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING`)
        .bind(item.code,item.name,item.subtitle,item.description,item.category,item.rarity,item.image,item.sortOrder),
      env.DB.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=CURRENT_TIMESTAMP").bind(FORGE_REPAIR_CATALOG_MARKER),
    ]);
  });
}
