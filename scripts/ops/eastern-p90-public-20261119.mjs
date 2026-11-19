import assert from 'node:assert/strict';
import {P90_REQUIREMENTS as P} from './eastern-p90-requirements-20261119.mjs';
export const P90_PUBLIC_KEY='ops:eastern-p90:public:20261119:v1';
export async function publishEasternP90(db,{expected,dryRun=true,injectAfter=''}={}){
 const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[P90_PUBLIC_KEY])).rows[0];
 if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 const inject=stage=>{if(stage===injectAfter)throw Error('INJECTED_'+stage)};
 try{
  await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='4s'");
  assert.equal((await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) locked',['ops:eastern-p90:recipe-preparation:20261119:v1'])).rows[0].locked,true);
  const replay=(await db.query('SELECT value FROM app_meta WHERE key=$1',[P90_PUBLIC_KEY])).rows[0];
  if(replay){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(replay.value)}}
  const before=(await db.query('SELECT * FROM workshop_recipes_v1668 WHERE code=$1 FOR UPDATE',[P.code])).rows[0];assert.deepEqual(before,expected.recipe);
  assert.deepEqual([before.is_active,before.is_public,before.owner_test_only],['0','0','1']);
  assert.equal(before.output_ref,String(P.outputId));assert.equal(before.coin_cost,String(P.coinCost));assert.equal(before.master_star_cost,String(P.masterStarCost));assert.equal(before.success_rate,10);
  const policyRaw=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR SHARE',['WORKSHOP_EQUIPMENT_CRAFT_V1:'+P.code])).rows[0].value;assert.equal(policyRaw,expected.policyRaw);
  const policy=JSON.parse(policyRaw);for(const [key,value] of Object.entries(P.policy))assert.deepEqual(policy[key],value,key);
  const materials=(await db.query('SELECT * FROM workshop_recipe_materials_v1668 WHERE recipe_id=$1 ORDER BY item_code',[before.id])).rows;assert.deepEqual(materials,expected.materials);
  assert.deepEqual(materials.map(r=>[r.item_code,Number(r.quantity)]),P.materials.map(r=>[r.code,r.quantity]));
  const items=(await db.query('SELECT * FROM character_equipment_items WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[[40,41,53]])).rows;assert.deepEqual(items,expected.items);assert(items.every(r=>r.is_active==='1'&&r.is_public==='1'));
  assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[P.operationKey])).rows[0].value,expected.previousReceipt);
  assert(before.description.endsWith(' 공개 준비 중.'));
  const recipe=(await db.query('UPDATE workshop_recipes_v1668 SET is_active=1,is_public=1,owner_test_only=0,description=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *',[before.description.slice(0,-' 공개 준비 중.'.length),before.id])).rows[0];inject('recipe');
  const actor=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(actor);
  const receipt={operationKey:P90_PUBLIC_KEY,status:'PUBLIC_ON',recipe,policy,materials,accountWrites:0,messagesSent:0,completedAt:new Date().toISOString()};
  receipt.auditId=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_EASTERN_P90_PUBLIC','WORKSHOP_RECIPE',$2,$3,$4) RETURNING id::text",[actor.id,P90_PUBLIC_KEY,JSON.stringify({recipe:before}),JSON.stringify(receipt)])).rows[0].id;inject('audit');
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[P90_PUBLIC_KEY,JSON.stringify(receipt)]);inject('receipt');
  assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',['WORKSHOP_EQUIPMENT_CRAFT_V1:'+P.code])).rows[0].value,policyRaw);
  assert.deepEqual((await db.query('SELECT * FROM workshop_recipe_materials_v1668 WHERE recipe_id=$1 ORDER BY item_code',[before.id])).rows,materials);
  assert.deepEqual((await db.query("SELECT id,code,category,name,output_type,output_ref,is_active,is_public,owner_test_only FROM workshop_recipes_v1668 WHERE output_type='EQUIPMENT' AND output_ref=ANY($1::text[]) ORDER BY id",[['40','41']])).rows,expected.originalRecipes);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:false,dryRun,receipt};
 }catch(error){await db.query('ROLLBACK');throw error}
}
