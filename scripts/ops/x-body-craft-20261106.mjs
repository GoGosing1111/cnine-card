// Explicit, one-time CMS registration. Runtime never imports this module.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:x-body-craft:20261106:v1';
export const CODE='WORKSHOP_BATTLE_SUIT_X_BODY';
export const COST=25000000000000;
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
export async function inspect(c){return {
  equipment:await q(c,"SELECT * FROM character_equipment_items WHERE code IN ('BATTLE_SUIT_Z_BODY','BATTLE_SUIT_X_BODY') ORDER BY id"),
  material:await q(c,"SELECT * FROM inventory_items WHERE code IN ('SUIT_CORE_6','SUIT_CORE_7') ORDER BY code"),
  recipes:await q(c,'SELECT * FROM workshop_recipes_v1668 ORDER BY id'),
  materials:await q(c,'SELECT * FROM workshop_recipe_materials_v1668 ORDER BY recipe_id,item_code'),
  receipt:(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0]?.value??null
};}
export function plan(state){
  const x=one(state.equipment.filter(e=>e.code==='BATTLE_SUIT_X_BODY'));
  const z=one(state.equipment.filter(e=>e.code==='BATTLE_SUIT_Z_BODY'));
  const core=one(state.material.filter(e=>e.code==='SUIT_CORE_7'));
  assert.equal(core.category,'MATERIAL');assert.equal(Number(core.is_active),1);
  for(const e of [x,z]){assert.equal(e.slot,'BATTLE_SUIT');assert.equal(Number(e.is_active),1);assert.equal(Number(e.is_public),1);}
  assert.equal(x.image_url.replace(/^\//,''),'assets/ui/project-v/account-battle-suits/x-sword-v1/x-body.png');
  const zr=one(state.recipes.filter(r=>r.category==='BATTLE_SUIT_CRAFT'&&r.output_type==='EQUIPMENT'&&String(r.output_ref)===String(z.id)));
  const zm=one(state.materials.filter(m=>String(m.recipe_id)===String(zr.id)));
  assert.equal(zm.item_code,'SUIT_CORE_6');assert.equal(Number(zm.quantity),10);
  return {code:CODE,name:'X-BODY 제작',category:'BATTLE_SUIT_CRAFT',description:'슈트 코어 7 10개와 코인 25조로 X-BODY 제작을 시도합니다. 성공 확률 10%. 실패 시 투입 재료와 코인이 소모됩니다.',output_type:'EQUIPMENT',output_ref:String(x.id),output_quantity:1,payment_mode:'COIN_ONLY',coin_cost:COST,master_star_cost:0,success_rate:10,is_featured:0,is_active:1,is_public:1,owner_test_only:0,sort_order:Number(zr.sort_order)+1,material:{item_code:'SUIT_CORE_7',quantity:10,sort_order:10},referenceRecipeId:String(zr.id)};
}
export function protectedHash(state){return hash({...state,recipes:state.recipes.filter(r=>r.code!==CODE),materials:state.materials.filter(m=>!state.recipes.some(r=>r.code===CODE&&String(r.id)===String(m.recipe_id))),receipt:null});}
export async function verify(c){
  const state=await inspect(c),receipt=JSON.parse(state.receipt||'null');assert.equal(receipt?.status,'COMPLETED');assert.equal(receipt.operationKey,OP);
  const expected=receipt.recipe,r=one(state.recipes.filter(r=>r.code===CODE));
  for(const [key,value]of Object.entries(expected))if(!['material','referenceRecipeId'].includes(key))assert.equal(String(r[key]),String(value),key);
  const m=one(state.materials.filter(m=>String(m.recipe_id)===String(r.id)));
  assert.equal(m.item_code,'SUIT_CORE_7');assert.equal(Number(m.quantity),10);
  assert.equal((await q(c,"SELECT id FROM admin_logs WHERE id=$1 AND action_type='OPS_X_BODY_CRAFT_REGISTER' AND target_id=$2",[receipt.auditId,OP])).length,1);
  return {verified:true,recipe:r,material:m,receipt};
}
export async function apply(c,{expectedHash,releaseCommit,dryRun=true,failAt=''}={}){
  const prior=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0];
  if(prior)return {replayed:true,receipt:JSON.parse(prior.value)}; // SELECT only; preserve later CMS edits.
  assert.match(releaseCommit||'',/^[a-f0-9]{40}$/);assert.match(expectedHash||'',/^[a-f0-9]{64}$/);
  await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try{
    await c.query("SET LOCAL lock_timeout='4s'");await c.query("SET LOCAL statement_timeout='20s'");
    await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
    const duplicate=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0];
    if(duplicate){await c.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)};}
    // Existing craft reads remain available; CMS writes cannot race registration.
    await c.query('LOCK TABLE workshop_recipes_v1668,workshop_recipe_materials_v1668 IN SHARE ROW EXCLUSIVE MODE');
    await q(c,"SELECT id FROM character_equipment_items WHERE code IN ('BATTLE_SUIT_Z_BODY','BATTLE_SUIT_X_BODY') ORDER BY id FOR SHARE");
    await q(c,"SELECT code FROM inventory_items WHERE code IN ('SUIT_CORE_6','SUIT_CORE_7') ORDER BY code FOR SHARE");
    const before=await inspect(c);assert.equal(hash(before),expectedHash,'CMS changed: inspect again');assert.equal(before.receipt,null);
    const p=plan(before);assert.equal(before.recipes.filter(r=>r.code===CODE||r.output_type==='EQUIPMENT'&&String(r.output_ref)===p.output_ref).length,0,'X-BODY recipe already exists');
    const preserved=protectedHash(before),columns=Object.keys(p).filter(k=>!['material','referenceRecipeId'].includes(k));
    const r=one(await q(c,`INSERT INTO workshop_recipes_v1668(${columns.join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,columns.map(k=>p[k])));
    if(failAt==='recipe')throw Error('INJECTED_X_CRAFT_RECIPE');
    await q(c,"INSERT INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order) VALUES($1,'SUIT_CORE_7',10,10)",[r.id]);
    if(failAt==='material')throw Error('INJECTED_X_CRAFT_MATERIAL');
    assert.equal(protectedHash(await inspect(c)),preserved,'Unrequested CMS data changed');
    const owner=one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
    const receipt={status:'COMPLETED',operationKey:OP,completedAt:new Date().toISOString(),releaseCommit,authorization:'제작 연출까지 Z바디 확인해서 등록해. 슈트코어 7 10개, 코인 25조, 확률 10%',recipe:p,recipeId:String(r.id),protectedHash:preserved,accountWrites:0,messages:0};
    const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_X_BODY_CRAFT_REGISTER','WORKSHOP_RECIPE',$2,$3,$4) RETURNING id",[owner.id,OP,JSON.stringify({existingXRecipes:0,referenceRecipeId:p.referenceRecipeId,protectedHash:preserved}),JSON.stringify(receipt)]));
    receipt.auditId=String(audit.id);await q(c,'INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);
    await verify(c);await c.query(dryRun?'ROLLBACK':'COMMIT');
    if(dryRun)assert.equal(hash(await inspect(c)),expectedHash);
    return {committed:!dryRun,rolledBack:dryRun,receipt};
  }catch(e){await c.query('ROLLBACK');throw e;}
}
