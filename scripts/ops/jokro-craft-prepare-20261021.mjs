import {JOKRO_RECIPE_CODE,JOKRO_CRAFT_KEY,JOKRO_CRAFT_LIMIT,jokroCraftDraft,mercenaryCraftDefinition} from '../../shared/mercenary-craft-v1.mjs';
export async function prepareJokroCraft(client,{apply=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows,definition=mercenaryCraftDefinition(JOKRO_RECIPE_CODE);
 await client.query('BEGIN');
 try{
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[JOKRO_CRAFT_KEY]);
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
  if(!owner)throw Error('Active audit owner required');
  const [before]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[JOKRO_CRAFT_KEY]);
  const [existing]=await q('SELECT id FROM workshop_recipes_v1668 WHERE code=$1',[JOKRO_RECIPE_CODE]);
  if(before){
   if(!existing)throw Error('Existing Jokro policy has no recipe; inspect before proceeding');
   await client.query('ROLLBACK');return {alreadyPrepared:true,dryRun:!apply,recipeId:String(existing.id),policy:JSON.parse(before.value),craftLimit:JOKRO_CRAFT_LIMIT,granted:0};
  }
  if(existing)throw Error('Existing Jokro recipe has no policy; inspect before proceeding');
  const policy={...jokroCraftDraft(),revision:1},at=new Date().toISOString(),material=policy.materials[0];
  const [item]=await q('SELECT code FROM inventory_items WHERE code=$1 AND is_active=1 FOR SHARE',[material.itemCode]);
  if(!item)throw Error('SSS mercenary card shard must already exist and be active');
  const [recipe]=await q(`INSERT INTO workshop_recipes_v1668(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order)
   VALUES($1,'MERCENARY_CRAFT',$2,$3,'MERCENARY',$4,1,'BOTH',$5,$6,$7,1,0,0,0,$8) RETURNING id`,[definition.recipeCode,definition.name,definition.description,definition.code,policy.coinCost,policy.masterStarCost,policy.successRate,definition.sort]);
  await q('INSERT INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order) VALUES($1,$2,$3,0)',[recipe.id,material.itemCode,material.quantity]);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[JOKRO_CRAFT_KEY,JSON.stringify(policy),at]);
  const result={recipeId:String(recipe.id),code:definition.code,policy,craftLimit:JOKRO_CRAFT_LIMIT,packStockChanges:0,granted:0,at};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'JOKRO_CRAFT_PREPARE','MERCENARY',definition.code,JSON.stringify({recipe:null,policy:null}),JSON.stringify({...result,actor:'CODEX_OPERATIONS',authorization:'용병 제작 족로 준비: 제작 2장, SSS 용병 조각 15개, 코인 1조, 마스터의 별 1000만개, 성공 1%. 준비 OFF·비공개.'})]);
  result.auditId=String(audit.id);await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
 }catch(e){await client.query('ROLLBACK');throw e;}
}
