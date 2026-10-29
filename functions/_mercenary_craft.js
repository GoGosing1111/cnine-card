import {AWAKENED_OMEGA_CRAFT,isAwakenedOmegaCraft,MERCENARY_CRAFTS,KAIRON_RECIPE_CODE,PRIME_RECIPE_CODE,mercenaryCraftDefinition,mercenaryCraftStock,mercenaryCraftDraft,validateMercenaryCraft,mercenaryCraftReady,mercenaryCraftRecipe,isMercenaryCraft} from '../shared/mercenary-craft-v1.mjs';
import {MERCENARY_ACCOUNTING_SCHEMA} from './_mercenary_draw_accounting.js';
import {LIMITED_CRAFT_SHARD,isLimitedShardCraft} from '../shared/mercenary-limited-shard-craft-v1.mjs';
// Successful committed outputs count against each mercenary's independent craft
// allowance. Pack issues, direct gifts, failed and pending attempts never count.
const CRAFTED_SQL="SELECT COALESCE(SUM(output_quantity),0) crafted FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=? AND success=1 AND recipe_id=(SELECT id FROM workshop_recipes_v1668 WHERE code=?)";
export async function readMercenaryCraftStock(env,definition,policy=null){
 if(isLimitedShardCraft(definition)&&!policy)policy=(await readMercenaryCraft(env,definition)).policy;
 const row=await env.DB.prepare(CRAFTED_SQL).bind(definition.code,definition.recipeCode).first();return mercenaryCraftStock({...definition,limit:policy?.stockLimit??definition.limit},row?.crafted);
}
export const readKaironCraftStock=env=>readMercenaryCraftStock(env,MERCENARY_CRAFTS[0]);
export function mercenaryCraftStockGuard(DB,guardId,definition){
 // Prime consumes its finite inventory materials; it has no separate craft-stock pool.
 // Preserve any failed cost/material/policy guard instead of resetting it to success.
 if(definition.recipeCode===PRIME_RECIPE_CODE&&definition.releaseEnabled===true&&definition.limit===null)return DB.prepare('UPDATE workshop_craft_guards_v1668 SET verified=verified WHERE guard_id=?').bind(guardId);
 if(definition.releaseEnabled===false||definition.limit===null)return DB.prepare('UPDATE workshop_craft_guards_v1668 SET verified=0 WHERE guard_id=?').bind(guardId);
 return DB.prepare(`UPDATE workshop_craft_guards_v1668 SET verified=0 WHERE guard_id=? AND (${CRAFTED_SQL})>=?`).bind(guardId,definition.code,definition.recipeCode,definition.limit);
}
export const kaironCraftStockGuard=(DB,guardId)=>mercenaryCraftStockGuard(DB,guardId,MERCENARY_CRAFTS[0]);
export async function readMercenaryCraft(env,definition){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(definition.key).first();
 const policy=validateMercenaryCraft(row?JSON.parse(row.value):mercenaryCraftDraft(definition),definition);return {policy,value:row?.value??null};
}
export const readKaironCraft=env=>readMercenaryCraft(env,MERCENARY_CRAFTS[0]);
export async function decorateMercenaryCraft(env,rows,{admin=false}={}){
 const rest=rows.filter(r=>!isMercenaryCraft(r));
 const keys=MERCENARY_CRAFTS.map(d=>d.key),marks=keys.map(()=>'?').join(',');
 const saved=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${marks})`).bind(...keys).all();
 const policies=new Map(saved.results.map(r=>[r.key,JSON.parse(r.value)]));
 const visible=MERCENARY_CRAFTS.filter(d=>admin||(policies.get(d.key)??mercenaryCraftDraft(d)).isPublic===true);
 if(!visible.length)return rest;
 const codes=visible.map(d=>d.recipeCode),codeMarks=codes.map(()=>'?').join(',');
 const [storedRows,counts]=await Promise.all([
  env.DB.prepare(`SELECT * FROM workshop_recipes_v1668 WHERE code IN (${codeMarks})`).bind(...codes).all(),
  env.DB.prepare(`SELECT r.code,COALESCE(SUM(l.output_quantity),0) crafted FROM workshop_recipes_v1668 r JOIN workshop_craft_logs_v1668 l ON l.recipe_id=r.id AND l.output_ref=r.output_ref AND l.output_type='MERCENARY' AND l.success=1 WHERE r.code IN (${codeMarks}) GROUP BY r.code`).bind(...codes).all()
 ]);
 const storedByCode=new Map(storedRows.results.map(r=>[r.code,r])),countByCode=new Map(counts.results.map(r=>[r.code,r.crafted]));
 for(const definition of visible){
  const policy=validateMercenaryCraft(policies.get(definition.key)||mercenaryCraftDraft(definition),definition);
  const stored=rows.find(r=>r.code===definition.recipeCode)||storedByCode.get(definition.recipeCode)||{};
  rest.push(mercenaryCraftRecipe(definition,policy,stored,mercenaryCraftStock({...definition,limit:policy.stockLimit??definition.limit},countByCode.get(definition.recipeCode)||0)));
 }
 return rest;
}
export async function ensureCraftAccounting(env){
 if(env.DB.execSchema)await env.DB.execSchema(MERCENARY_ACCOUNTING_SCHEMA);
 else for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await env.DB.prepare(sql).run();
}
export async function saveMercenaryCraft(env,admin,raw,deps={}){
 if(admin.role!=='OWNER')throw Object.assign(Error('OWNER만 제작 조건을 저장할 수 있습니다.'),{status:403});
 const definition=mercenaryCraftDefinition(raw);
 if(raw.category!=='MERCENARY_CRAFT'||(raw.outputType??raw.output_type)!=='MERCENARY'||(raw.outputRef??raw.output_ref)!==definition.code||Number(raw.outputQuantity??raw.output_quantity)!==1||(raw.paymentMode??raw.payment_mode)!=='BOTH'||Number(raw.cardShardCost??raw.card_shard_cost??0)!==0)throw Error(`${definition.art.name} 제작의 코드·결과·수량·결제 방식은 변경할 수 없습니다.`);
 const before=await readMercenaryCraft(env,definition);
 const next=validateMercenaryCraft({revision:raw.craftRevision,coinCost:raw.coinCost,masterStarCost:raw.masterStarCost,successRate:raw.successRate,materials:raw.materials,isActive:raw.isActive,isPublic:raw.isPublic,stockLimit:before.policy.stockLimit},definition);
 if(!isLimitedShardCraft(definition)&&next.materials.some(m=>m.itemCode===LIMITED_CRAFT_SHARD))throw Error('SSS 리미티드 조각은 별도 전용 제작식에서 설정하세요.');
 if(next.revision!==before.policy.revision)throw Error('제작 조건이 변경되었습니다. 새로고침 후 저장하세요.');
 for(const m of next.materials)if(!(isAwakenedOmegaCraft(definition)&&m.itemCode===AWAKENED_OMEGA_CRAFT.materialCode)&&!await env.DB.prepare('SELECT 1 FROM inventory_items WHERE code=? AND is_active=1').bind(m.itemCode).first())throw Error(`활성 재료를 선택하세요: ${m.itemCode}`);
 await ensureCraftAccounting(env);
 const base=before.value??JSON.stringify(mercenaryCraftDraft(definition));
 await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(definition.key,base).run();
 const stmt=(sql,...args)=>env.DB.prepare(sql).bind(...args),guard=crypto.randomUUID(),list=[];next.revision++;
 if(env.DB.dialect==='postgres')list.push(stmt('SELECT key FROM app_meta WHERE key=? FOR UPDATE',definition.key));
 list.push(stmt('INSERT INTO mercenary_card_atomic_guard_v1(id,verified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) THEN 1 ELSE 0 END',guard,definition.key,base));
 if(mercenaryCraftReady(next)){
  list.push(stmt(`INSERT INTO workshop_recipes_v1668(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order)
   VALUES(?,'MERCENARY_CRAFT',?,?,'MERCENARY',?,1,'BOTH',?,?,?,1,?,?,0,?)
   ON CONFLICT(code) DO UPDATE SET coin_cost=excluded.coin_cost,master_star_cost=excluded.master_star_cost,success_rate=excluded.success_rate,is_active=excluded.is_active,is_public=excluded.is_public,updated_at=CURRENT_TIMESTAMP`,definition.recipeCode,definition.name,definition.description,definition.code,next.coinCost,next.masterStarCost,next.successRate,next.isActive?1:0,next.isPublic?1:0,definition.sort));
  list.push(stmt('DELETE FROM workshop_recipe_materials_v1668 WHERE recipe_id=(SELECT id FROM workshop_recipes_v1668 WHERE code=?)',definition.recipeCode));
  for(const [index,m]of next.materials.entries())list.push(stmt('INSERT INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order) SELECT id,?,?,? FROM workshop_recipes_v1668 WHERE code=?',m.itemCode,m.quantity,index*10,definition.recipeCode));
 }else list.push(stmt('UPDATE workshop_recipes_v1668 SET is_active=0,is_public=0 WHERE code=?',definition.recipeCode));
 list.push(stmt('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(next),definition.key),stmt('DELETE FROM mercenary_card_atomic_guard_v1 WHERE id=?',guard));
 await env.DB.batch(list);
 if(deps.writeAdminLog)await deps.writeAdminLog(env,admin,definition.prefix+'_CRAFT_SAVE','MERCENARY',definition.code,before.policy,next);
 return Number((await env.DB.prepare('SELECT id FROM workshop_recipes_v1668 WHERE code=?').bind(definition.recipeCode).first())?.id||definition.draftId||-Number(definition.code.slice(2)));
}
export const saveKaironCraft=(env,admin,raw,deps={})=>{
 if(raw.code!==KAIRON_RECIPE_CODE)throw Error('카이론 제작 코드를 확인하세요.');return saveMercenaryCraft(env,admin,raw,deps);
};
export async function requireMercenaryCraft(env,recipe){
 const definition=mercenaryCraftDefinition(recipe),{policy,value}=await readMercenaryCraft(env,definition);
 if(definition.releaseEnabled===false||!value||recipe.output_ref!==definition.code||recipe.output_quantity!==1||!mercenaryCraftReady(policy)||!policy.isActive||!policy.isPublic||recipe.craftLocked)throw Error(`${definition.art.name} 제작이 잠겨 있습니다. CMS 제작 조건과 운영 설정을 확인하세요.`);
 if(!isLimitedShardCraft(definition)&&policy.materials.some(m=>m.itemCode===LIMITED_CRAFT_SHARD))throw Error('SSS 리미티드 조각 전용 제작식을 선택하세요.');
 await ensureCraftAccounting(env);return {definition:{...definition,limit:policy.stockLimit??definition.limit},value};
}
export const requireKaironCraft=async(env,recipe)=>{
 if(recipe.code!==KAIRON_RECIPE_CODE)throw Error('카이론 제작 코드를 확인하세요.');return (await requireMercenaryCraft(env,recipe)).value;
};
export function mercenaryCraftGrantStatements(DB,{userId,requestId,guardId},definition){
 if(definition.releaseEnabled===false)throw Error('프라임 레퀴엠 제작이 잠겨 있습니다.');
 const stmt=(sql,...args)=>DB.prepare(sql).bind(...args),acquisitionId=`${definition.prefix}:${userId}:${requestId}`,at=new Date().toISOString();
 const verified='EXISTS(SELECT 1 FROM workshop_craft_guards_v1668 WHERE guard_id=? AND verified=1)';
 return [
  stmt(`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) SELECT ?,?,1,0,?,? WHERE ${verified} ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at`,userId,definition.code,at,at,guardId),
  stmt(`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT ?,user_id,mercenary_code,CASE WHEN total_copies>1 THEN 1 ELSE 0 END,total_copies,duplicate_count,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND ${verified}`,acquisitionId,at,userId,definition.code,guardId)
 ];
}
export const kaironCraftGrantStatements=(DB,args)=>mercenaryCraftGrantStatements(DB,args,MERCENARY_CRAFTS[0]);
