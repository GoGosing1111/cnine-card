import {KAIRON_CODE} from '../shared/mercenary-kairon-v1.mjs';
import {KAIRON_CRAFT_KEY,KAIRON_RECIPE_CODE,kaironCraftDraft,validateKaironCraft,kaironCraftReady,kaironCraftRecipe,isMercenaryCraft} from '../shared/mercenary-craft-v1.mjs';
import {MERCENARY_ACCOUNTING_SCHEMA} from './_mercenary_draw_accounting.js';
export async function readKaironCraft(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KAIRON_CRAFT_KEY).first();
 const policy=validateKaironCraft(row?JSON.parse(row.value):kaironCraftDraft());return {policy,value:row?.value??null};
}
export async function decorateMercenaryCraft(env,rows,{admin=false}={}){
 const {policy}=await readKaironCraft(env),rest=rows.filter(r=>!isMercenaryCraft(r));
 let stored=rows.find(r=>r.code===KAIRON_RECIPE_CODE);
 if(!stored&&policy.isPublic)stored=await env.DB.prepare('SELECT * FROM workshop_recipes_v1668 WHERE code=?').bind(KAIRON_RECIPE_CODE).first();
 if(admin||policy.isPublic)rest.push(kaironCraftRecipe(policy,stored||{}));return rest;
}
async function ensureAccounting(env){
 if(env.DB.execSchema)await env.DB.execSchema(MERCENARY_ACCOUNTING_SCHEMA);
 else for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await env.DB.prepare(sql).run();
}
export async function saveKaironCraft(env,admin,raw,deps={}){
 if(admin.role!=='OWNER')throw Object.assign(Error('OWNER만 제작 조건을 저장할 수 있습니다.'),{status:403});
 if(raw.code!==KAIRON_RECIPE_CODE||raw.category!=='MERCENARY_CRAFT'||(raw.outputType??raw.output_type)!=='MERCENARY'||(raw.outputRef??raw.output_ref)!==KAIRON_CODE||Number(raw.outputQuantity??raw.output_quantity)!==1||(raw.paymentMode??raw.payment_mode)!=='BOTH'||Number(raw.cardShardCost??raw.card_shard_cost??0)!==0)throw Error('카이론 제작의 코드·결과·수량·결제 방식은 변경할 수 없습니다.');
 const next=validateKaironCraft({revision:raw.craftRevision,coinCost:raw.coinCost,masterStarCost:raw.masterStarCost,successRate:raw.successRate,materials:raw.materials,isActive:raw.isActive,isPublic:raw.isPublic});
 const before=await readKaironCraft(env);if(next.revision!==before.policy.revision)throw Error('제작 조건이 변경되었습니다. 새로고침 후 저장하세요.');
 for(const m of next.materials)if(!await env.DB.prepare('SELECT 1 FROM inventory_items WHERE code=? AND is_active=1').bind(m.itemCode).first())throw Error(`활성 재료를 선택하세요: ${m.itemCode}`);
 await ensureAccounting(env);
 const base=before.value??JSON.stringify(kaironCraftDraft());
 await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(KAIRON_CRAFT_KEY,base).run();
 const stmt=(sql,...args)=>env.DB.prepare(sql).bind(...args),guard=crypto.randomUUID(),list=[];next.revision++;
 if(env.DB.dialect==='postgres')list.push(stmt('SELECT key FROM app_meta WHERE key=? FOR UPDATE',KAIRON_CRAFT_KEY));
 list.push(stmt('INSERT INTO mercenary_card_atomic_guard_v1(id,verified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) THEN 1 ELSE 0 END',guard,KAIRON_CRAFT_KEY,base));
 if(kaironCraftReady(next)){
  list.push(stmt(`INSERT INTO workshop_recipes_v1668(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order)
   VALUES(?,'MERCENARY_CRAFT','카이론 · 흑탄의 집행관','제작 전용 · 팩 획득 불가','MERCENARY',?,1,'BOTH',?,?,?,1,?,?,0,988)
   ON CONFLICT(code) DO UPDATE SET coin_cost=excluded.coin_cost,master_star_cost=excluded.master_star_cost,success_rate=excluded.success_rate,is_active=excluded.is_active,is_public=excluded.is_public,updated_at=CURRENT_TIMESTAMP`,KAIRON_RECIPE_CODE,KAIRON_CODE,next.coinCost,next.masterStarCost,next.successRate,next.isActive?1:0,next.isPublic?1:0));
  list.push(stmt('DELETE FROM workshop_recipe_materials_v1668 WHERE recipe_id=(SELECT id FROM workshop_recipes_v1668 WHERE code=?)',KAIRON_RECIPE_CODE));
  for(const [index,m]of next.materials.entries())list.push(stmt('INSERT INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order) SELECT id,?,?,? FROM workshop_recipes_v1668 WHERE code=?',m.itemCode,m.quantity,index*10,KAIRON_RECIPE_CODE));
 }else list.push(stmt('UPDATE workshop_recipes_v1668 SET is_active=0,is_public=0 WHERE code=?',KAIRON_RECIPE_CODE));
 list.push(stmt('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(next),KAIRON_CRAFT_KEY),stmt('DELETE FROM mercenary_card_atomic_guard_v1 WHERE id=?',guard));
 await env.DB.batch(list);
 if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,'KAIRON_CRAFT_SAVE','MERCENARY',KAIRON_CODE,before.policy,next);
 return Number((await env.DB.prepare('SELECT id FROM workshop_recipes_v1668 WHERE code=?').bind(KAIRON_RECIPE_CODE).first())?.id||-988);
}
export async function requireKaironCraft(env,recipe){
 const {policy,value}=await readKaironCraft(env);
 if(!value||recipe.code!==KAIRON_RECIPE_CODE||recipe.output_ref!==KAIRON_CODE||recipe.output_quantity!==1||!kaironCraftReady(policy)||!policy.isActive||!policy.isPublic||recipe.craftLocked)throw Error('카이론 제작이 잠겨 있습니다. CMS 제작 조건과 운영 설정을 확인하세요.');
 await ensureAccounting(env);return value;
}
export function kaironCraftGrantStatements(DB,{userId,requestId,guardId}){
 const stmt=(sql,...args)=>DB.prepare(sql).bind(...args),acquisitionId=`KAIRON:${userId}:${requestId}`,at=new Date().toISOString();
 const verified='EXISTS(SELECT 1 FROM workshop_craft_guards_v1668 WHERE guard_id=? AND verified=1)';
 return [
  stmt(`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) SELECT ?,?,1,0,?,? WHERE ${verified} ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at`,userId,KAIRON_CODE,at,at,guardId),
  stmt(`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT ?,user_id,mercenary_code,CASE WHEN total_copies>1 THEN 1 ELSE 0 END,total_copies,duplicate_count,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND ${verified}`,acquisitionId,at,userId,KAIRON_CODE,guardId)
 ];
}
