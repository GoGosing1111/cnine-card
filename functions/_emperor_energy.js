import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

export const EMPEROR_ENERGY_CATALOG_KEY='safe_runtime_upgrade_emperor_energy_catalog_20260926';
export const EMPEROR_ENERGY_ITEM=Object.freeze({
  code:'EMPEROR_ENERGY',
  name:'엠퍼러 에너지',
  subtitle:'EMPEROR ENERGY',
  description:'미스틱 에너지의 상위 단계에 해당하는 황금빛 고밀도 결정 에너지입니다. 직접 사용할 수 없는 제작 재료입니다.',
  category:'MATERIAL',
  rarity:'EMPEROR',
  image:'assets/items/emperor-energy-v1.webp',
  sortOrder:174901
});

// Catalog registration only: no recipe, drop, price or player balance changes.
export async function ensureEmperorEnergyCatalog(env){
  if(readRuntimeData(env,EMPEROR_ENERGY_CATALOG_KEY))return true;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(EMPEROR_ENERGY_CATALOG_KEY).first();
  if(marker?.value!=='1'){
    const item=EMPEROR_ENERGY_ITEM;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
        VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING`)
        .bind(item.code,item.name,item.subtitle,item.description,item.category,item.rarity,item.image,item.sortOrder),
      env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(EMPEROR_ENERGY_CATALOG_KEY)
    ]);
  }
  return cacheRuntimeData(env,EMPEROR_ENERGY_CATALOG_KEY,true,1800000);
}
