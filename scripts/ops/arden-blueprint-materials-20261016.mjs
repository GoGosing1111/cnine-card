import assert from 'node:assert/strict';

// Explicit catalog operation only; never called by startup or a migration.
export const OPERATION_KEY='ops:arden-blueprint-materials:20261016:v1';
export const AUTHORIZATION='다 라이브에 반영해서 재료아이템으로 등록해';
export const MATERIALS=Object.freeze([
 {code:'ARDEN_ENERGY',name:'아르덴 에너지',subtitle:'ARDEN ENERGY',stem:'arden-energy-v1',description:'청록빛 결정과 백금·금세공으로 이루어진 아르덴 장비용 제작 재료입니다. 직접 사용할 수 없습니다.',sourceHash:'406e959495ada5973f751ab73b2117cb829984799dbaf595df69beec30608af4',imageHash:'8d75f48ab37e8f785e1293a00cb1c6d4d4aad818795f43f27ee7f21fe05a4ded'},
 {code:'SECRET_WEAPON_BLUEPRINT_CHAPTER_1',name:'비밀무기 설계도 1장',subtitle:'SECRET WEAPON BLUEPRINT I',stem:'secret-weapon-blueprint-chapter-1-v1',description:'동방무기 상위 버전용 첫 번째 설계도. 금룡 총기의 외형 도안이 담긴 제작 재료입니다. 직접 사용할 수 없습니다.',sourceHash:'52131905ee5ab3305a9773ea4983730249851ac3b1b46cc47d32e0d5bdc17b5b',imageHash:'3c10e26bd2383954bf1a302bb0cd34e20401adb3559c640d54c9e73e876dddbf'},
 {code:'SECRET_WEAPON_BLUEPRINT_CHAPTER_2',name:'비밀무기 설계도 2장',subtitle:'SECRET WEAPON BLUEPRINT II',stem:'secret-weapon-blueprint-chapter-2-v1',description:'동방무기 상위 버전용 두 번째 설계도. 쌍룡과 여의주의 동력 문양이 담긴 제작 재료입니다. 직접 사용할 수 없습니다.',sourceHash:'955299ac1b773a09871f8164e74b1461dc5f5a868e3b19287c40bcd9f27f5315',imageHash:'0198d6936d6c5f8c276ce668e91f3c2697c65f05b97d77a44568f4549ef28831'},
 {code:'SECRET_WEAPON_BLUEPRINT_CHAPTER_3',name:'비밀무기 설계도 3장',subtitle:'SECRET WEAPON BLUEPRINT III',stem:'secret-weapon-blueprint-chapter-3-v1',description:'동방무기 상위 버전용 세 번째 설계도. 금룡의 최종 봉인 문양이 담긴 제작 재료입니다. 직접 사용할 수 없습니다.',sourceHash:'ee1d59537cbde02f46dee5e2839e32ce4de32bfc6c26ffc6c745ede23fe6a86d',imageHash:'5d808365ecfa0b3140bc51344bcb83267f70c7dea9ce5baa774125c1f7befcb5'}
].map((item,index)=>Object.freeze({...item,image:'assets/items/'+item.stem+'.webp',source:'assets/items/'+item.stem+'.png',sortOrder:215003+index})));
const codes=MATERIALS.map(item=>item.code);
const identitySql='SELECT current_database() AS db, pg_is_in_recovery() AS recovery';
export async function inspectMaterials(client){
 const items=(await client.query('SELECT * FROM inventory_items WHERE code=ANY($1::text[]) OR name=ANY($2::text[]) OR image_url=ANY($3::text[]) ORDER BY code',
  [codes,MATERIALS.map(item=>item.name),MATERIALS.flatMap(item=>[item.image,item.source,'/'+item.image,'/'+item.source])])).rows;
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 return {items,receipt:saved?JSON.parse(saved.value):null};
}
function assertRecorded(state){
 assert.equal(state.receipt?.operationKey,OPERATION_KEY,'Invalid registration receipt');
 assert.equal(state.receipt?.status,'COMPLETED','Invalid registration receipt');
 assert.deepEqual(state.receipt.items?.map(item=>item.code).sort(),[...codes].sort(),'Invalid recorded material set');
 for(const code of codes)assert.ok(state.items.some(item=>item.code===code),'Recorded material missing: '+code);
}
function assertAssets(assets){
 assert.equal(assets?.length,8,'Eight source/runtime image proofs required');
 assert.equal(new Set(assets.map(asset=>asset.url)).size,8,'Duplicate image proof');
 for(const item of MATERIALS)for(const [file,hash] of [[item.source,item.sourceHash],[item.image,item.imageHash]]){
  const asset=assets.find(asset=>asset.url==='https://cnine-card.pages.dev/'+file);
  assert.equal(asset?.status,200,'Image must be live: '+file);assert.equal(asset.sha256,hash,'Image hash mismatch: '+file);
 }
}
export async function registerMaterials(client,assets){
 assertAssets(assets);
 const identity=(await client.query(identitySql)).rows[0];
 assert.equal(identity?.db,'cnine','Wrong database');assert.equal(identity.recovery,false,'Primary database required');
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await client.query("SET LOCAL statement_timeout='15s'");await client.query("SET LOCAL lock_timeout='3s'");
  // Short catalog lock prevents duplicate names/images from a simultaneous CMS edit.
  await client.query('LOCK TABLE inventory_items IN SHARE ROW EXCLUSIVE MODE');
  const state=await inspectMaterials(client);
  if(state.receipt){assertRecorded(state);await client.query('COMMIT');return {alreadyRegistered:true,...state};}
  assert.equal(state.items.length,0,'Matching code, name or image exists; nothing overwritten');
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(owner,'Active owner required');
  const before=(await client.query('SELECT * FROM inventory_items ORDER BY code')).rows,items=[];
  for(const item of MATERIALS){
   const inserted=await client.query("INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,'MATERIAL','SPECIAL',$5,$6,1) RETURNING *",[item.code,item.name,item.subtitle,item.description,item.image,item.sortOrder]);
   assert.equal(inserted.rows.length,1,'Material insert failed');items.push(inserted.rows[0]);
  }
  const preserved=(await client.query('SELECT * FROM inventory_items WHERE NOT(code=ANY($1::text[])) ORDER BY code',[codes])).rows;
  assert.deepEqual(preserved,before,'Existing catalog changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,scope:'LIVE_MATERIAL_CATALOG',items,assets,
   raritySource:'Existing inventory catalog SPECIAL default; no combat stats',directUse:false,grantedQuantity:0,recipesCreated:0,rewardPoolsModified:false,
   preservedCatalogCount:before.length,completedAt:new Date().toISOString()};
  const audit=(await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'MATERIAL_CATALOG_REGISTER','INVENTORY_ITEM',$2,$3,$4,$5) RETURNING id",[owner.id,OPERATION_KEY,'[]',JSON.stringify(receipt),receipt.completedAt])).rows[0];
  assert.ok(audit,'Registration audit missing');receipt.adminLogId=String(audit.id);
  assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).rows.length,1,'Registration receipt missing');
  await client.query('COMMIT');return {alreadyRegistered:false,items,receipt};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
export async function verifyMaterials(client){
 const state=await inspectMaterials(client);assertRecorded(state);
 const audit=(await client.query("SELECT id,after_data FROM admin_logs WHERE id=$1 AND action_type='MATERIAL_CATALOG_REGISTER' AND target_type='INVENTORY_ITEM' AND target_id=$2",[state.receipt.adminLogId,OPERATION_KEY])).rows[0];
 assert.equal(JSON.parse(audit?.after_data||'{}').operationKey,OPERATION_KEY,'Registration audit mismatch');
 // Same active catalog selection used by the existing workshop CMS.
 const catalog=(await client.query('SELECT code,name,category,rarity,image_url FROM inventory_items WHERE is_active=1 ORDER BY category,sort_order,name')).rows;
 const selected=catalog.filter(item=>codes.includes(item.code));
 assert.equal(selected.length,4);assert.ok(selected.every(item=>item.category==='MATERIAL'));
 return {verified:true,checkedAt:new Date().toISOString(),cmsVisible:true,materialSelectorCodes:selected.map(item=>item.code),...state};
}
