import {equipmentCraftPolicy,isEquipmentCraft} from '../shared/workshop-equipment-craft.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';
import {runJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';

const CONFIG='WORKSHOP_EQUIPMENT_CRAFT_V1:',PITY='WORKSHOP_EQUIPMENT_PITY_V1:',KIND='WORKSHOP_EQUIPMENT_CRAFT';
const RECIPES='workshop_recipes_v1668',MATERIALS='workshop_recipe_materials_v1668';
const parse=(raw,fallback=null)=>{try{return JSON.parse(raw)??fallback}catch{return fallback}};
const configKey=code=>CONFIG+code,pityKey=(uid,rid)=>`${PITY}${uid}:${rid}`;
const sameMeta=(key,raw)=>raw===null?['NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[key]]:['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,raw]];
const writeMeta=(DB,key,value)=>DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key,value);
const fail=(message,terminal=false)=>Object.assign(jointError('EQUIPMENT_CRAFT',message,409),{terminal});
const active=(recipe,user)=>Number(recipe?.is_active)===1&&Number(recipe?.is_public)===1&&(!Number(recipe.owner_test_only)||user.role==='OWNER');

export async function decorateEquipmentCraftRecipes(env,rows){
  const selected=rows.filter(isEquipmentCraft);if(!selected.length)return rows;
  const keys=selected.map(r=>configKey(r.code)),data=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
  const configs=new Map((data.results||[]).map(r=>[r.key,parse(r.value)]));
  return rows.map(r=>isEquipmentCraft(r)?{...r,equipmentCraft:configs.get(configKey(r.code))||null}:r);
}

export async function equipmentCraftAccountState(env,user,recipes){
  const selected=recipes.filter(r=>isEquipmentCraft(r)&&r.equipmentCraft&&active(r,user));
  if(!selected.length)return {instances:[],pity:{},capped:false};
  const equipmentIds=[...new Set(selected.map(r=>r.equipmentCraft.inputEquipmentId))],keys=selected.map(r=>pityKey(user.id,r.id));
  const [stock,progress]=await Promise.all([
    env.DB.prepare(`WITH growth AS MATERIALIZED (SELECT instance_id,user_id FROM equipment_forge_states_v1 WHERE user_id=? AND level=10) SELECT CAST(x.id AS TEXT) id,x.equipment_id FROM growth f JOIN user_equipment_instances x ON x.id=f.instance_id AND x.user_id=f.user_id JOIN character_equipment_items i ON i.id=x.equipment_id AND i.is_active=1 AND i.is_public=1 WHERE x.user_id=? AND x.equipment_id IN (${equipmentIds.map(()=>'?').join(',')}) AND NOT EXISTS(SELECT 1 FROM user_equipment_loadout l WHERE l.instance_id=x.id) ORDER BY x.id LIMIT 1001`).bind(user.id,user.id,...equipmentIds).all(),
    env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all()
  ]);
  const values=new Map((progress.results||[]).map(r=>[r.key,parse(r.value,{failures:0})]));
  return {instances:(stock.results||[]).slice(0,1000).map(r=>({id:String(r.id),equipmentId:Number(r.equipment_id),level:10})),capped:(stock.results||[]).length>1000,
    pity:Object.fromEntries(selected.map(r=>{const failures=Number(values.get(pityKey(user.id,r.id))?.failures||0);return [r.id,{failures,pityAfter:r.equipmentCraft.pityAfter,guaranteed:failures>=r.equipmentCraft.pityAfter}]}))};
}

export async function saveEquipmentCraftRecipe(env,admin,raw){
  if(admin.role!=='OWNER')throw fail('OWNER만 장비 조합식을 저장할 수 있습니다.');
  const policy=equipmentCraftPolicy(raw),DB=env.DB,p=(s,...v)=>DB.prepare(s).bind(...v);
  const recipeId=Number(raw.id||0),code=String(raw.code||'').trim().toUpperCase(),name=String(raw.name||'').trim().slice(0,80),outputId=Number(raw.outputRef??raw.output_ref);
  if(!/^[A-Z0-9_:-]{1,80}$/.test(code)||!name||!Number.isSafeInteger(recipeId)||recipeId<0||!Number.isSafeInteger(outputId)||outputId<1)throw fail('레시피 코드·이름·결과 장비를 확인하세요.');
  const before=recipeId?await p(`SELECT * FROM ${RECIPES} WHERE id=?`,recipeId).first():null;
  if(recipeId&&!before)throw fail('수정할 조합식이 없습니다.');
  if(before&&!isEquipmentCraft(before))throw fail('기존 레시피의 종류를 바꾸지 말고 새 장비 조합식을 추가하세요.');
  const oldKey=configKey(before?.code||code),oldRaw=(await p('SELECT value FROM app_meta WHERE key=?',oldKey).first())?.value??null;
  if(policy.revision!==Number(parse(oldRaw)?.revision||0))throw fail('다른 창에서 설정이 변경됐습니다. 다시 불러오세요.');
  const input=await p('SELECT id,name,image_url,rarity,slot FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1',policy.inputEquipmentId).first();
  const output=await p('SELECT id,slot FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1',outputId).first();
  if(!input||!output)throw fail('활성·공개 상태의 투입 장비와 결과 장비를 선택하세요.');
  if(input.slot!==output.slot)throw fail('투입 장비와 결과 장비의 슬롯이 같아야 합니다.');
  const materials=(raw.materials||[]).map((m,i)=>({code:String(m.itemCode??m.item_code).trim().toUpperCase(),quantity:Number(m.quantity),sort:(i+1)*10}));
  if(!materials.length||materials.length>30||new Set(materials.map(m=>m.code)).size!==materials.length)throw fail('중복 없이 재료 1~30종을 등록하세요.');
  for(const m of materials){if(!/^[A-Z0-9_]{1,80}$/.test(m.code)||m.code==='MASTER_STAR'||!Number.isSafeInteger(m.quantity)||m.quantity<1||m.quantity>100000000||!await p("SELECT code FROM inventory_items WHERE code=? AND is_active=1 AND category='MATERIAL'",m.code).first())throw fail('활성 제작 재료와 정수 수량을 선택하세요. 마스터의 별은 전용 비용에 입력하세요.');}
  const coin=Number(raw.coinCost??raw.coin_cost),stars=Number(raw.masterStarCost??raw.master_star_cost);
  for(const value of [raw.coinCost??raw.coin_cost,raw.masterStarCost??raw.master_star_cost])if(value===null||value===undefined||String(value).trim()===''||!Number.isSafeInteger(Number(value))||Number(value)<1)throw fail('코인과 마스터의 별 비용을 양의 정수로 설정하세요.');
  if(stars>1000000||Number(raw.cardShardCost??raw.card_shard_cost??0)!==0)throw fail('마스터의 별은 최대 1,000,000개이며 카드 조각 비용은 사용하지 않습니다.');
  const next={...policy,revision:policy.revision+1,inputName:input.name,inputImage:input.image_url,inputRarity:input.rarity},encoded=JSON.stringify(next),token=crypto.randomUUID(),[predicate,values]=sameMeta(oldKey,oldRaw);
  const sortOrder=Number(raw.sortOrder??raw.sort_order??0);
  if(!Number.isSafeInteger(sortOrder)||Math.abs(sortOrder)>100000)throw fail('정렬 값은 -100,000~100,000 범위의 정수여야 합니다.');
  const fields=[code,'ITEM_SYNTHESIS',name,String(raw.description||'').slice(0,500),'EQUIPMENT',String(outputId),1,'BOTH',coin,stars,10,raw.isFeatured?1:0,raw.isActive?1:0,raw.isPublic?1:0,raw.ownerTestOnly?1:0,sortOrder];
  const statements=[];
  if(recipeId&&DB.dialect==='postgres')statements.push(p(`SELECT id FROM ${RECIPES} WHERE id=? FOR UPDATE`,recipeId));
  statements.push(jointGuard(DB,token,predicate,values));
  if(recipeId)statements.push(p(`UPDATE ${RECIPES} SET code=?,category=?,name=?,description=?,output_type=?,output_ref=?,output_quantity=?,payment_mode=?,coin_cost=?,master_star_cost=?,success_rate=?,is_featured=?,is_active=?,is_public=?,owner_test_only=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,...fields,recipeId));
  else statements.push(p(`INSERT INTO ${RECIPES}(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,...fields));
  statements.push(p(`DELETE FROM ${MATERIALS} WHERE recipe_id=(SELECT id FROM ${RECIPES} WHERE code=?)`,code));
  for(const m of materials)statements.push(p(`INSERT INTO ${MATERIALS}(recipe_id,item_code,quantity,sort_order) SELECT id,?,?,? FROM ${RECIPES} WHERE code=?`,m.code,m.quantity,m.sort,code));
  if(oldKey!==configKey(code))statements.push(p('DELETE FROM app_meta WHERE key=?',oldKey));
  statements.push(writeMeta(DB,configKey(code),encoded),p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',admin.id,'WORKSHOP_EQUIPMENT_RECIPE_SAVE','WORKSHOP_RECIPE',code,JSON.stringify({recipe:before,policy:parse(oldRaw)}),JSON.stringify({recipe:raw,policy:next})),jointGuardEnd(DB,token));
  await DB.batch(statements);
  return Number((await p(`SELECT id FROM ${RECIPES} WHERE code=?`,code).first()).id);
}

export async function executeEquipmentCraft(env,user,body,{randomInt=mercenaryRandomInt}={}){
  const DB=env.DB,p=(s,...v)=>DB.prepare(s).bind(...v),recipeId=Number(body.recipeId),instanceId=String(body.instanceId||'');
  if(!Number.isSafeInteger(recipeId)||recipeId<1||!/^\d{1,19}$/.test(instanceId)||BigInt(instanceId)<1n||BigInt(instanceId)>9223372036854775807n||Number(body.attempts??1)!==1)throw fail('조합식과 투입할 +10 장비 1개를 선택하세요.');
  const prepared=await runJointOperation(env,user,{requestId:body.requestId,kind:KIND,input:{recipeId,instanceId},prepare:async()=>{
    const recipe=await p(`SELECT r.*,e.name output_name,e.image_url output_image,e.rarity output_rarity FROM ${RECIPES} r JOIN character_equipment_items e ON CAST(e.id AS TEXT)=r.output_ref AND e.is_active=1 AND e.is_public=1 WHERE r.id=?`,recipeId).first();
    if(!isEquipmentCraft(recipe)||!active(recipe,user))throw fail('현재 제작할 수 없는 장비 조합식입니다.');
    const raw=(await p('SELECT value FROM app_meta WHERE key=?',configKey(recipe.code)).first())?.value??null,policy=parse(raw);
    if(!policy)throw fail('장비 조합식 설정이 완료되지 않았습니다.');
    Object.assign(policy,equipmentCraftPolicy({...recipe,equipmentCraft:policy}));
    const input=await p(`SELECT x.id,f.revision FROM user_equipment_instances x JOIN equipment_forge_states_v1 f ON f.instance_id=x.id AND f.user_id=x.user_id AND f.level=10 JOIN character_equipment_items e ON e.id=x.equipment_id AND e.is_active=1 AND e.is_public=1 WHERE x.id=? AND x.user_id=? AND x.equipment_id=? AND NOT EXISTS(SELECT 1 FROM user_equipment_loadout l WHERE l.instance_id=x.id)`,instanceId,user.id,policy.inputEquipmentId).first();
    if(!input)throw fail('장착하지 않은 내 +10 대상 장비가 필요합니다.');
    const progressRaw=(await p('SELECT value FROM app_meta WHERE key=?',pityKey(user.id,recipeId)).first())?.value??null,progress=parse(progressRaw,{failures:0,revision:0});
    if(!Number.isSafeInteger(progress.failures)||progress.failures<0||!Number.isSafeInteger(progress.revision)||progress.revision<0)throw fail('실패 누적 기록을 확인하지 못했습니다. 관리자에게 문의하세요.');
    const guaranteed=Number(progress.failures)>=policy.pityAfter,roll=guaranteed?null:randomInt(10000);
    if(roll!==null&&(!Number.isInteger(roll)||roll<0||roll>=10000))throw fail('제작 확률 판정에 실패했습니다.');
    const success=guaranteed||roll<1000,materials=(await p(`SELECT item_code,quantity FROM ${MATERIALS} WHERE recipe_id=? ORDER BY item_code`,recipeId).all()).results||[];
    const coin=Number(recipe.coin_cost),stars=Number(recipe.master_star_cost);
    if(!materials.length||materials.some(m=>m.item_code==='MASTER_STAR')||!Number.isSafeInteger(coin)||coin<1||!Number.isSafeInteger(stars)||stars<1)throw fail('장비 제작 재료·비용 설정을 확인하세요.');
    const wallet=await p("SELECT u.coin,COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=u.id AND item_code='MASTER_STAR'),0) stars FROM users u WHERE id=?",user.id).first();
    if(Number(wallet?.coin||0)<coin||Number(wallet?.stars||0)<stars)throw fail('코인 또는 마스터의 별이 부족합니다.');
    for(const m of materials){const owned=await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user.id,m.item_code).first();if(Number(owned?.quantity||0)<Number(m.quantity))throw fail('제작 재료가 부족합니다.');}
    const pity={failures:success?0:Number(progress.failures)+1,revision:Number(progress.revision)+1};
    const consumeInput=success||policy.failureInputPolicy==='CONSUME';
    const result={ok:true,requestId:body.requestId,recipeId,recipeName:recipe.name,category:recipe.category,equipmentCraft:true,success,successRate:10,effectiveSuccessRate:guaranteed?100:10,guaranteed,attempts:1,successCount:success?1:0,failureCount:success?0:1,coinSpent:coin,masterStarSpent:stars,failureInputPolicy:policy.failureInputPolicy,input:{instanceId,equipmentId:policy.inputEquipmentId,name:policy.inputName,image:policy.inputImage,level:10,preserved:!consumeInput,consumed:consumeInput},pity:{failures:pity.failures,pityAfter:policy.pityAfter,guaranteed:pity.failures>=policy.pityAfter},output:success?{type:'EQUIPMENT',ref:recipe.output_ref,name:recipe.output_name,image:recipe.output_image,rarity:recipe.output_rarity,quantity:1,level:0}:null};
    return {result,recipe,policy,configRaw:raw,progressRaw,pity,materials,revision:Number(input.revision)};
  },statements:async plan=>{
    const {result,recipe,policy,materials}=plan,key=pityKey(user.id,recipeId);
    const latest=(await p('SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
    if(latest!==plan.progressRaw)throw fail('다른 제작으로 실패 누적이 변경됐습니다. 최신 상태에서 다시 시도하세요.',true);
    const config=(await p('SELECT value FROM app_meta WHERE key=?',configKey(recipe.code)).first())?.value??null;
    if(config!==plan.configRaw)throw fail('조합식 설정이 변경됐습니다. 최신 설정을 확인하세요.',true);
    const token=crypto.randomUUID(),pityToken=crypto.randomUUID(),configToken=crypto.randomUUID(),[samePity,pityValues]=sameMeta(key,plan.progressRaw),[sameConfig,configValues]=sameMeta(configKey(recipe.code),plan.configRaw);
    const list=[];
    if(DB.dialect==='postgres')list.push(p(`SELECT id FROM ${RECIPES} WHERE id=? FOR UPDATE`,recipeId));
    if(DB.dialect==='postgres')list.push(p('SELECT id FROM user_equipment_instances WHERE id=? AND user_id=? FOR UPDATE',instanceId,user.id));
    list.push(jointGuard(DB,pityToken,samePity,pityValues),jointGuard(DB,configToken,sameConfig,configValues),jointGuard(DB,token,`EXISTS(SELECT 1 FROM user_equipment_instances x JOIN equipment_forge_states_v1 f ON f.instance_id=x.id AND f.user_id=x.user_id AND f.level=10 AND f.revision=? JOIN character_equipment_items e ON e.id=x.equipment_id AND e.is_active=1 AND e.is_public=1 WHERE x.id=? AND x.user_id=? AND x.equipment_id=? AND NOT EXISTS(SELECT 1 FROM user_equipment_loadout l WHERE l.instance_id=x.id)) AND EXISTS(SELECT 1 FROM ${RECIPES} WHERE id=? AND is_active=1 AND is_public=1 AND (owner_test_only=0 OR ?='OWNER')) AND EXISTS(SELECT 1 FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1) AND EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)`,[plan.revision,instanceId,user.id,policy.inputEquipmentId,recipeId,user.role,Number(recipe.output_ref),user.id,result.coinSpent]));
    list.push(p('UPDATE users SET coin=coin-? WHERE id=? AND coin>=?',result.coinSpent,user.id,result.coinSpent),p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',-result.coinSpent,KIND,user.id),...jointInventoryChange(DB,user.id,'MASTER_STAR',-result.masterStarSpent,KIND,body.requestId));
    for(const m of materials)list.push(...jointInventoryChange(DB,user.id,m.item_code,-Number(m.quantity),KIND,body.requestId));
    // Use the prepared receipt, including retries of pre-policy-change plans.
    if(result.success||result.input?.preserved===false){
      list.push(p('DELETE FROM equipment_forge_states_v1 WHERE instance_id=? AND user_id=? AND level=10 AND revision=?',instanceId,user.id,plan.revision),p('DELETE FROM user_equipment_instances WHERE id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM user_equipment_loadout l WHERE l.instance_id=user_equipment_instances.id)',instanceId,user.id));
      list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN NOT EXISTS(SELECT 1 FROM user_equipment_instances WHERE id=?) THEN 1 ELSE 0 END WHERE token=?',instanceId,token));
    }
    if(result.success){
      const grant="INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT ?,id,'WORKSHOP_EQUIPMENT',?,? FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1";
      const values=[user.id,String(recipeId),body.requestId,Number(recipe.output_ref)];
      if(DB.dialect==='postgres')list.push(p(`WITH granted AS (${grant} RETURNING id) UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN (SELECT COUNT(*) FROM granted)=1 THEN 1 ELSE 0 END WHERE token=?`,...values,token));
      else list.push(p(grant,...values),p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN changes()=1 THEN 1 ELSE 0 END WHERE token=?',token));
    }
    list.push(writeMeta(DB,key,JSON.stringify(plan.pity)),p("INSERT INTO workshop_craft_logs_v1668(request_id,user_id,recipe_id,recipe_name,category,output_type,output_ref,output_quantity,payment_type,coin_spent,master_star_spent,success) VALUES(?,?,?,?,'ITEM_SYNTHESIS','EQUIPMENT',?,?,'BOTH',?,?,?)",body.requestId,user.id,recipeId,recipe.name,recipe.output_ref,result.success?1:0,result.coinSpent,result.masterStarSpent,result.success?1:0));
    list.push(p("INSERT INTO workshop_craft_receipts_v1668(request_id,user_id,recipe_id,payment_type,status,result_json) VALUES(?,?,?,'BOTH','COMPLETED',?)",body.requestId,user.id,recipeId,JSON.stringify(result)),jointGuardEnd(DB,token),jointGuardEnd(DB,pityToken),jointGuardEnd(DB,configToken));
    return list;
  }});
  return {...prepared.plan.result,replayed:prepared.replayed};
}
