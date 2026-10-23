import assert from 'node:assert/strict';

// One explicit catalog addition. Never run from startup or overwrite CMS edits.
export const OPERATION_KEY='ops:arden-armor-blueprint:20261024:v1';
export const AUTHORIZATION='아르덴 방어구 설계도 리소스 만들고 재료로 추가해';
export const MATERIAL=Object.freeze({
 code:'ARDEN_ARMOR_BLUEPRINT',name:'아르덴 방어구 설계도',subtitle:'ARDEN ARMOR BLUEPRINT',
 description:'백금과 금세공, 청록 보석으로 이루어진 아르덴 방어구의 도안이 담긴 제작 재료입니다. 인벤토리에서 직접 사용할 수 없습니다.',
 category:'MATERIAL',rarity:'SPECIAL',image:'assets/items/arden-armor-blueprint-v1.webp',source:'assets/items/arden-armor-blueprint-v1.png',sortOrder:215007,
 sourceHash:'b5ccecbac4ef9ea2ac91e00a73ed3ed4ebf40b7bb43db30a15b964e6c8aca22c',
 imageHash:'4f38a86a50750df49b9c649a045f6a8a491ef31fc08a8fb31d54137dbb30dc92'
});
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
export async function inspectMaterial(c){
 const items=await q(c,'SELECT * FROM inventory_items WHERE code=$1 OR name=$2 OR image_url=ANY($3::text[]) ORDER BY code',[MATERIAL.code,MATERIAL.name,[MATERIAL.image,MATERIAL.source,'/'+MATERIAL.image,'/'+MATERIAL.source]]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {items,receipt:saved?JSON.parse(saved.value):null};
}
function assertRecorded(state){
 assert.equal(state.receipt?.operationKey,OPERATION_KEY,'Invalid registration receipt');
 assert.equal(state.receipt.status,'COMPLETED','Invalid registration receipt');
 assert.equal(state.receipt.item?.code,MATERIAL.code,'Invalid recorded material');
 assert.equal(state.items.filter(row=>row.code===MATERIAL.code).length,1,'Recorded material missing');
}
function assertAssets(assets){
 assert.equal(assets?.length,2,'Both source and runtime live proofs required');
 assert.equal(new Set(assets.map(a=>a.url)).size,2,'Duplicate asset proof');
 for(const [file,hash] of [[MATERIAL.source,MATERIAL.sourceHash],[MATERIAL.image,MATERIAL.imageHash]]){
  const a=assets.find(a=>a.url==='https://cnine-card.pages.dev/'+file);
  assert.equal(a?.status,200,'Image must be live: '+file);
  assert.equal(a.sha256,hash,'Image hash mismatch: '+file);
 }
}
export async function registerMaterial(c,assets){
 assertAssets(assets);
 const [identity]=await q(c,'SELECT current_database() AS db, pg_is_in_recovery() AS recovery');
 assert.equal(identity?.db,'cnine','Wrong database');assert.equal(identity.recovery,false,'Primary database required');
 await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await c.query("SET LOCAL statement_timeout='15s'");await c.query("SET LOCAL lock_timeout='3s'");
  await c.query('LOCK TABLE inventory_items IN SHARE ROW EXCLUSIVE MODE');
  const state=await inspectMaterial(c);
  if(state.receipt){assertRecorded(state);await c.query('COMMIT');return {alreadyRegistered:true,...state};}
  assert.equal(state.items.length,0,'Matching code, name or image exists; nothing overwritten');
  const [owner]=await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");
  assert.ok(owner,'Active owner required');
  const before=await q(c,'SELECT * FROM inventory_items ORDER BY code');
  const [item]=await q(c,"INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,'MATERIAL','SPECIAL',$5,$6,1) RETURNING *",[MATERIAL.code,MATERIAL.name,MATERIAL.subtitle,MATERIAL.description,MATERIAL.image,MATERIAL.sortOrder]);
  assert.equal(item?.code,MATERIAL.code,'Material insert failed');
  assert.deepEqual(await q(c,'SELECT * FROM inventory_items WHERE code<>$1 ORDER BY code',[MATERIAL.code]),before,'Existing catalog changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,scope:'LIVE_MATERIAL_CATALOG',item,assets,
   directUse:false,grantedQuantity:0,recipesCreated:0,rewardPoolsModified:false,preservedCatalogCount:before.length,completedAt:new Date().toISOString()};
  const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'MATERIAL_CATALOG_REGISTER','INVENTORY_ITEM',$2,$3,$4,$5) RETURNING id",[owner.id,OPERATION_KEY,'[]',JSON.stringify(receipt),receipt.completedAt]);
  assert.ok(audit,'Registration audit missing');receipt.adminLogId=String(audit.id);
  assert.equal((await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1,'Registration receipt missing');
  await c.query('COMMIT');return {alreadyRegistered:false,items:[item],receipt};
 }catch(error){await c.query('ROLLBACK');throw error;}
}
export async function verifyMaterial(c){
 const state=await inspectMaterial(c);assertRecorded(state);
 const [audit]=await q(c,"SELECT id,after_data FROM admin_logs WHERE id=$1 AND action_type='MATERIAL_CATALOG_REGISTER' AND target_type='INVENTORY_ITEM' AND target_id=$2",[state.receipt.adminLogId,OPERATION_KEY]);
 assert.equal(JSON.parse(audit?.after_data||'{}').operationKey,OPERATION_KEY,'Registration audit mismatch');
 const catalog=await q(c,'SELECT code,name,category,rarity,image_url FROM inventory_items WHERE is_active=1 ORDER BY category,sort_order,name');
 const item=catalog.find(row=>row.code===MATERIAL.code);
 assert.equal(item?.category,'MATERIAL');assert.equal(item.name,MATERIAL.name);assert.equal(item.image_url,MATERIAL.image);
 return {verified:true,checkedAt:new Date().toISOString(),cmsVisible:true,directUse:false,...state};
}
