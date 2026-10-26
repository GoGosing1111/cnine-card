import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PRIME_CRAFT_KEY,PRIME_RECIPE_CODE,mercenaryCraftDefinition,validateMercenaryCraft,mercenaryCraftRecipe} from '../../shared/mercenary-craft-v1.mjs';
import {PRIME_MATERIAL} from '../../shared/mercenary-prime-material-v1.mjs';
export const OP='ops:prime-craft-open:20261026:v1';
const definition=mercenaryCraftDefinition(PRIME_RECIPE_CODE),q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected one matching row'),rows[0]);
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export async function inspect(db){
 const raw=one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[PRIME_CRAFT_KEY])).value;
 const recipe=one(await q(db,'SELECT * FROM workshop_recipes_v1668 WHERE code=$1',[PRIME_RECIPE_CODE]));
 const materials=await q(db,'SELECT m.item_code,m.quantity FROM workshop_recipe_materials_v1668 m WHERE recipe_id=$1 ORDER BY item_code',[recipe.id]);
 const material=one(await q(db,'SELECT * FROM inventory_items WHERE code=$1',[PRIME_MATERIAL.code]));
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
 return {raw,policy:JSON.parse(raw),recipe,materials,material,receipt:saved.length?JSON.parse(saved[0].value):null};
}
export async function protectedState(db){
 return {
  policies:await q(db,"SELECT key,value FROM app_meta WHERE (key LIKE 'mercenary_%craft%' OR key IN ('mercenary_limited_pack_v1','mercenary_bloodmoon_ss_pack_v1','mercenary_halloween_ss_pack_v1')) AND key<>$1 ORDER BY key",[PRIME_CRAFT_KEY]),
  recipes:await q(db,'SELECT * FROM workshop_recipes_v1668 WHERE code<>$1 ORDER BY id',[PRIME_RECIPE_CODE]),
  materials:await q(db,'SELECT * FROM workshop_recipe_materials_v1668 ORDER BY recipe_id,item_code')
 };
}
export async function verify(db){
 const state=await inspect(db),r=state.receipt;assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);
 assert.equal(state.policy.isActive,true);assert.equal(Number(state.recipe.is_active),1);
 const view=mercenaryCraftRecipe(definition,validateMercenaryCraft(state.policy,definition),state.recipe);
 assert.equal(view.craftLocked,false);assert.equal(view.craftReleaseLocked,false);assert.equal(view.is_public,1);
 const audit=one(await q(db,"SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='OPS_PRIME_CRAFT_OPEN'",[r.auditId]));
 assert.equal(JSON.parse(audit.after_data).operationKey,OP);
 return {verified:true,policy:state.policy,recipeId:String(state.recipe.id),craftLocked:view.craftLocked,craftReleaseLocked:view.craftReleaseLocked,auditId:r.auditId,receipt:r};
}
export async function activate(db,{expectedRaw,dryRun=true}={}){
 const prior=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
 if(prior.length)return {replayed:true,committed:true,...await verify(db)};
 assert.equal(typeof expectedRaw,'string');assert.equal(definition.releaseEnabled,true);
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const replay=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
  if(replay.length){const result=await verify(db);await db.query('ROLLBACK');return {replayed:true,committed:true,...result};}
  await q(db,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[PRIME_CRAFT_KEY]);
  await q(db,'SELECT id FROM workshop_recipes_v1668 WHERE code=$1 FOR UPDATE',[PRIME_RECIPE_CODE]);
  await q(db,'SELECT code FROM inventory_items WHERE code=$1 FOR UPDATE',[PRIME_MATERIAL.code]);
  const before=await inspect(db),protectedBefore=hash(await protectedState(db));assert.equal(before.raw,expectedRaw,'Craft settings changed; read again');
  assert.equal(before.policy.isActive,false);assert.equal(before.policy.isPublic,true);
  const next={...before.policy,revision:before.policy.revision+1,isActive:true};validateMercenaryCraft(next,definition);
  assert.equal(before.recipe.output_ref,definition.code);assert.equal(Number(before.recipe.output_quantity),1);assert.equal(Number(before.recipe.is_active),0);
  for(const [column,key] of [['coin_cost','coinCost'],['master_star_cost','masterStarCost'],['success_rate','successRate']])assert.equal(Number(before.recipe[column]),next[key]);
  assert.deepEqual(before.materials.map(m=>({itemCode:m.item_code,quantity:Number(m.quantity)})),[...next.materials].sort((a,b)=>a.itemCode.localeCompare(b.itemCode)));
  const owner=one(await q(db,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
  const now=new Date().toISOString();
  one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(next),now,PRIME_CRAFT_KEY,before.raw]));
  one(await q(db,'UPDATE workshop_recipes_v1668 SET is_active=1,description=$1,updated_at=$2 WHERE id=$3 AND is_active=0 RETURNING id',[definition.description,now,before.recipe.id]));
  one(await q(db,'UPDATE inventory_items SET description=$1 WHERE code=$2 RETURNING code',[PRIME_MATERIAL.description,PRIME_MATERIAL.code]));
  const after=await inspect(db);assert.deepEqual(after.policy,next);assert.deepEqual(after.materials,before.materials);
  assert.deepEqual({...after.recipe,is_active:before.recipe.is_active,description:before.recipe.description,updated_at:before.recipe.updated_at},before.recipe);
  assert.deepEqual({...after.material,description:before.material.description},before.material);
  const protectedAfter=hash(await protectedState(db));assert.equal(protectedAfter,protectedBefore);
  const receipt={status:'COMPLETED',operationKey:OP,actor:'CODEX_OPERATIONS',authorization:'프라임레퀴엠 제작 가능하게 운영 박스 체크되게 변경해',completedAt:now,before:{policy:before.policy,recipe:before.recipe,materialDescription:before.material.description},after:{policy:next,recipe:after.recipe,materialDescription:after.material.description},protectedBefore,protectedAfter,accountWrites:0,grantedCards:0};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_PRIME_CRAFT_OPEN','MERCENARY_CRAFT',$2,$3,$4) RETURNING id",[owner.id,OP,JSON.stringify(receipt.before),JSON.stringify(receipt)]));receipt.auditId=String(audit.id);
  await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),now]);
  const verification=await verify(db);await db.query(dryRun?'ROLLBACK':'COMMIT');
  if(dryRun)assert.deepEqual(await inspect(db),before);
  return {replayed:false,committed:!dryRun,rolledBack:dryRun,receipt,verification};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
