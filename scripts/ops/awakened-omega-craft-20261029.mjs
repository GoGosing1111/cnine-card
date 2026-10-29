// One-time user-authorized configuration only. Never imported by game handlers.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AWAKENED_OMEGA_CRAFT as C,awakenedOmegaCraftDraft,mercenaryCraftDefinition,validateMercenaryCraft} from '../../shared/mercenary-craft-v1.mjs';
export const OP='ops:awakened-omega-craft:20261029:v1';
const definition=mercenaryCraftDefinition(C.recipeCode);
export const draft=()=>({code:C.recipeCode,category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:definition.code,outputQuantity:1,paymentMode:'BOTH',craftRevision:0,...awakenedOmegaCraftDraft(),isActive:true,isPublic:true});
const policy=()=>validateMercenaryCraft({...draft(),revision:1},definition);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function inspect(c){return {
 recipes:await q(c,'SELECT * FROM workshop_recipes_v1668 WHERE code=$1',[C.recipeCode]),
 policies:await q(c,'SELECT key,value FROM app_meta WHERE key=$1',[C.key]),
 receipt:(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0]?.value??null
};}
export async function protectedState(c){return {
 recipes:await q(c,'SELECT * FROM workshop_recipes_v1668 WHERE code<>$1 ORDER BY id',[C.recipeCode]),
 materials:await q(c,'SELECT m.* FROM workshop_recipe_materials_v1668 m JOIN workshop_recipes_v1668 r ON r.id=m.recipe_id WHERE r.code<>$1 ORDER BY recipe_id,item_code',[C.recipeCode]),
 policies:await q(c,"SELECT key,value FROM app_meta WHERE (key LIKE 'mercenary%craft%' OR key LIKE 'WORKSHOP_EQUIPMENT_CRAFT_V1:%') AND key<>$1 ORDER BY key",[C.key])
};}
export async function verify(c){
 const state=await inspect(c);assert(state.receipt);const receipt=JSON.parse(state.receipt);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OP);
 assert.equal(state.recipes.length,1);assert.equal(state.policies.length,1);assert.deepEqual(JSON.parse(state.policies[0].value),policy());const r=state.recipes[0];
 for(const [k,v]of Object.entries({category:'MERCENARY_CRAFT',output_type:'MERCENARY',output_ref:definition.code,payment_mode:'BOTH'}))assert.equal(r[k],v);
 for(const [k,v]of Object.entries({output_quantity:1,coin_cost:C.coinCost,master_star_cost:0,success_rate:10,is_active:1,is_public:1,owner_test_only:0}))assert.equal(Number(r[k]),v);
 const materials=await q(c,'SELECT item_code,quantity FROM workshop_recipe_materials_v1668 WHERE recipe_id=$1',[r.id]);assert.equal(materials.length,1);assert.equal(materials[0].item_code,C.materialCode);assert.equal(Number(materials[0].quantity),50);
 assert.equal((await q(c,"SELECT id FROM admin_logs WHERE id=$1 AND action_type='OPS_AWAKENED_OMEGA_CRAFT_OPEN'",[receipt.auditId])).length,1);
 return {verified:true,receipt,recipes:state.recipes,materials,policy:policy()};
}
export async function apply(c,{expectedHash,releaseCommit,dryRun=true,failAfter=0}={}){
 const old=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0];if(old)return {replayed:true,receipt:JSON.parse(old.value)};
 assert(/^[a-f0-9]{40}$/.test(releaseCommit||''));assert.equal(typeof expectedHash,'string');
 await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await c.query("SET LOCAL lock_timeout='4s'");await c.query("SET LOCAL statement_timeout='15s'");
  await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[C.key]);
  const prior=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0];if(prior){await c.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(prior.value)};}
  const before=await inspect(c);assert.equal(hash(before),expectedHash,'Recipe/config changed; inspect again');assert.equal(before.recipes.length,0);assert.equal(before.policies.length,0);
  const protectedHash=hash(await protectedState(c)),next=policy();
  const recipe=(await q(c,"INSERT INTO workshop_recipes_v1668(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order) VALUES($1,'MERCENARY_CRAFT',$2,$3,'MERCENARY',$4,1,'BOTH',$5,0,10,1,1,1,0,$6) RETURNING *",[C.recipeCode,definition.name,definition.description,definition.code,C.coinCost,definition.sort]))[0];
  await q(c,'INSERT INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order) VALUES($1,$2,50,0)',[recipe.id,C.materialCode]);
  await q(c,'INSERT INTO app_meta(key,value) VALUES($1,$2)',[C.key,JSON.stringify(next)]);
  if(failAfter)throw Error('INJECTED_OMEGA_FAILURE');
  assert.equal(hash(await protectedState(c)),protectedHash);
  const owner=(await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"))[0];assert(owner);
  const receipt={status:'COMPLETED',operationKey:OP,releaseCommit,completedAt:new Date().toISOString(),authorization:'각성 오메가 용병제작 추가: 오메가 X 50장 + 100조, 10%, 10회 실패 후 11회째 확정',recipe,policy:next,protectedHash,accountWrites:0,messagesSent:0};
  const audit=(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_AWAKENED_OMEGA_CRAFT_OPEN','WORKSHOP_RECIPE',$2,$3,$4) RETURNING id",[owner.id,OP,JSON.stringify(before),JSON.stringify(receipt)]))[0];receipt.auditId=String(audit.id);
  await q(c,'INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);await verify(c);await c.query(dryRun?'ROLLBACK':'COMMIT');
  if(dryRun)assert.equal(hash(await inspect(c)),expectedHash);
  return {replayed:false,committed:!dryRun,rolledBack:dryRun,receipt};
 }catch(error){await c.query('ROLLBACK');throw error;}
}
