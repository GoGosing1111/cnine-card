/* V2004 BATTLE SUIT CORE INVENTORY CATALOG */
export const BATTLE_SUIT_CORE_UPGRADE_KEY='safe_runtime_upgrade_v2004_battle_suit_core_catalog';

export const BATTLE_SUIT_CORE_CATALOG=Object.freeze([
  Object.freeze({code:'SUIT_CORE_1',name:'슈트 코어 1',subtitle:'BATTLE SUIT CORE I',description:'배틀슈트 01 제작에 사용하는 백금 동력 코어입니다. 직접 사용할 수 없는 제작 재료입니다.',rarity:'MYTHIC',image:'assets/items/suit-core-1-v2004.png',sortOrder:200401}),
  Object.freeze({code:'SUIT_CORE_2',name:'슈트 코어 2',subtitle:'BATTLE SUIT CORE II',description:'배틀슈트 02 제작에 사용하는 청색 전술 코어입니다. 직접 사용할 수 없는 제작 재료입니다.',rarity:'MYTHIC',image:'assets/items/suit-core-2-v2004.png',sortOrder:200402}),
  Object.freeze({code:'SUIT_CORE_3',name:'슈트 코어 3',subtitle:'BATTLE SUIT CORE III',description:'배틀슈트 03 제작에 사용하는 자수정 초월 코어입니다. 직접 사용할 수 없는 제작 재료입니다.',rarity:'MYTHIC',image:'assets/items/suit-core-3-v2004.png',sortOrder:200403})
]);

export const BATTLE_SUIT_CORE_CODES=Object.freeze(BATTLE_SUIT_CORE_CATALOG.map(item=>item.code));
export const VEHICLE_WORKSHOP_PART_CODES=Object.freeze(['VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE']);

export async function ensureBattleSuitCoreCatalog(env){
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(BATTLE_SUIT_CORE_UPGRADE_KEY).first();
  if(marker?.value==='1')return true;
  await env.DB.batch([
    ...BATTLE_SUIT_CORE_CATALOG.map(item=>env.DB.prepare(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,'MATERIAL',?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,subtitle=excluded.subtitle,description=excluded.description,category='MATERIAL',rarity=excluded.rarity,image_url=excluded.image_url,sort_order=excluded.sort_order,is_active=1,updated_at=CURRENT_TIMESTAMP`).bind(item.code,item.name,item.subtitle,item.description,item.rarity,item.image,item.sortOrder)),
    env.DB.prepare("UPDATE inventory_items SET category='MATERIAL',updated_at=CURRENT_TIMESTAMP WHERE code IN ('VEHICLE_PART_TIRE','VEHICLE_PART_FRAME','VEHICLE_PART_ENGINE') AND category<>'MATERIAL'"),
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?, '1', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(BATTLE_SUIT_CORE_UPGRADE_KEY)
  ]);
  return true;
}
