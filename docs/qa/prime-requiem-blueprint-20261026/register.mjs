import assert from 'node:assert/strict';

// One explicit catalog addition. Never run from startup or overwrite CMS edits.
export const OPERATION_KEY='ops:prime-requiem-blueprint:20261026:v1';
export const AUTHORIZATION='프라임 레퀴엠 설계도 SF지향적인 리소스로 만들고 재료로 추가해 그리고 용병제작에도 재료로 등록될수있게 해';
export const MATERIAL=Object.freeze({
 code:'PRIME_REQUIEM_BLUEPRINT',name:'프라임 레퀴엠 설계도',subtitle:'PRIME REQUIEM BLUEPRINT',
 description:'프라임 레퀴엠의 기체 구조와 에너지 코어, 블레이드 도면을 담은 SF 홀로그램 설계도입니다. 용병제작 조건에 등록할 수 있는 재료이며, 인벤토리에서 직접 사용할 수 없습니다.',
 category:'MATERIAL',rarity:'SPECIAL',image:'assets/items/prime-requiem-blueprint-v1.webp',source:'docs/qa/prime-requiem-blueprint-20261026/art/source.png',sortOrder:215008,
 sourceHash:"64af35ee2869a507ca5a68899bb16c5dca34385214897a1c9eae404401aa88af",
 imageHash:"6b9b32cb6c5d1a4151b8f589ab74dfb68e839b4bb625db5601f1947cc00c10c6"
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
 assert.equal(assets?.length,1,'Runtime live proof required; authoring original remains in the repository');
 assert.equal(new Set(assets.map(a=>a.url)).size,1,'Duplicate asset proof');
 for(const [file,hash] of [[MATERIAL.image,MATERIAL.imageHash]]){
  const a=assets.find(a=>a.url==='https://cnine-card.pages.dev/'+file);
  assert.equal(a?.status,200,'Image must be live: '+file);
  assert.equal(a.sha256,hash,'Image hash mismatch: '+file);
 }
}
export async function registerMaterial(c,assets,{dryRun=false}={}){
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
  const protectedBefore=await protectedState(c);
  const [item]=await q(c,"INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,'MATERIAL','SPECIAL',$5,$6,1) RETURNING *",[MATERIAL.code,MATERIAL.name,MATERIAL.subtitle,MATERIAL.description,MATERIAL.image,MATERIAL.sortOrder]);
  assert.equal(item?.code,MATERIAL.code,'Material insert failed');
  assert.deepEqual(await q(c,'SELECT * FROM inventory_items WHERE code<>$1 ORDER BY code',[MATERIAL.code]),before,'Existing catalog changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:AUTHORIZATION,scope:'LIVE_MATERIAL_CATALOG',item,assets,
   directUse:false,mercenaryCraftSelectable:true,grantedQuantity:0,recipesCreated:0,recipePoliciesModified:false,rewardPoolsModified:false,preservedCatalogCount:before.length,completedAt:new Date().toISOString()};
  const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'MATERIAL_CATALOG_REGISTER','INVENTORY_ITEM',$2,$3,$4,$5) RETURNING id",[owner.id,OPERATION_KEY,'[]',JSON.stringify(receipt),receipt.completedAt]);
  assert.ok(audit,'Registration audit missing');receipt.adminLogId=String(audit.id);
  assert.equal((await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1,'Registration receipt missing');
  assert.deepEqual(await protectedState(c),protectedBefore,'Existing recipe or policy changed');
  await c.query(dryRun?'ROLLBACK':'COMMIT');return {alreadyRegistered:false,rolledBack:dryRun,items:[item],receipt};
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

export async function protectedState(c){
 const result={};
 for(const table of ['workshop_recipes_v1668','workshop_recipe_materials_v1668'])result[table]=await q(c,'SELECT * FROM '+table+' ORDER BY 1,2');
 result.policies=await q(c,"SELECT key,value FROM app_meta WHERE key LIKE 'mercenary_%craft%' OR key='mercenary_bloodmoon_ss_pack_v1' ORDER BY key");
 return result;
}
