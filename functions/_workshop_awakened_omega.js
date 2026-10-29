import {AWAKENED_OMEGA_CRAFT as C,isAwakenedOmegaCraft,mercenaryCraftDefinition} from '../shared/mercenary-craft-v1.mjs';
import {readMercenaryCraft,mercenaryCraftGrantStatements} from './_mercenary_craft.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';
import {runJointOperation,jointCoinDebit} from './_joint_transactions.js';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';
import {readMercenaryModes,mercenaryModeGuard} from './_mercenary_loadout_modes.js';
import {dualMercenaryGuard} from './_mercenary_dual_loadout.js';

const KIND='WORKSHOP_AWAKENED_OMEGA',RECIPES='workshop_recipes_v1668';
export const awakenedOmegaPityKey=uid=>`WORKSHOP_AWAKENED_OMEGA_PITY_V1:${uid}`;
const fail=(message,terminal=false)=>Object.assign(jointError('AWAKENED_OMEGA_CRAFT',message,409),{terminal});
function progress(raw){
 let value;try{value=raw===null?{failures:0,revision:0}:JSON.parse(raw);}catch{throw fail('각성 오메가 실패 누적 기록을 확인하세요.');}
 if(!value||!Number.isSafeInteger(value.failures)||value.failures<0||value.failures>C.pityAfter||!Number.isSafeInteger(value.revision)||value.revision<0||value.revision>=Number.MAX_SAFE_INTEGER)throw fail('각성 오메가 실패 누적 기록을 확인하세요.');
 return value;
}
const usesOmega=record=>Object.values(record.loadouts).some(r=>(r.mercenaryCodes||[r.mercenaryCode]).includes(C.inputCode));
const modeSnapshot=record=>JSON.stringify({legacy:record.legacy||record,dualRaw:record.dualRaw});
const enabled=(recipe,policy)=>isAwakenedOmegaCraft(recipe)&&recipe.category==='MERCENARY_CRAFT'&&recipe.output_type==='MERCENARY'&&recipe.output_ref==='V-972'&&Number(recipe.output_quantity)===1&&Number(recipe.is_active)===1&&Number(recipe.is_public)===1&&!Number(recipe.owner_test_only)&&policy.isActive&&policy.isPublic&&recipe.payment_mode==='BOTH'&&Number(recipe.coin_cost)===C.coinCost&&Number(recipe.master_star_cost)===0&&Number(recipe.success_rate)===C.successRate;

export async function awakenedOmegaCraftAccountState(env,user,recipes){
 if(!recipes.some(r=>isAwakenedOmegaCraft(r)&&Number(r.is_active)===1&&Number(r.is_public)===1))return null;
 const [owned,saved]=await Promise.all([
  env.DB.prepare('SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,C.inputCode).first(),
  env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(awakenedOmegaPityKey(user.id)).first()
 ]);
 const pity=progress(saved?.value??null),quantity=Number(owned?.total_copies||0);
 let blockedReason='';
 if(quantity===C.quantity&&usesOmega((await readMercenaryModes(env,[user.id])).get(Number(user.id))))blockedReason='마지막 오메가-X까지 소모됩니다. PVE·PVP 편성에서 오메가-X를 먼저 해제하세요.';
 return {quantity,failures:pity.failures,pityAfter:C.pityAfter,guaranteed:pity.failures>=C.pityAfter,blockedReason};
}

export async function executeAwakenedOmegaCraft(env,user,body,{randomInt=mercenaryRandomInt}={}){
 const DB=env.DB,p=(s,...v)=>DB.prepare(s).bind(...v),recipeId=Number(body.recipeId),definition=mercenaryCraftDefinition(C.recipeCode);
 if(!Number.isSafeInteger(recipeId)||recipeId<1||Number(body.attempts??1)!==1||body.paymentType!==undefined&&body.paymentType!=='BOTH')throw fail('각성 오메가는 한 번에 1회 제작할 수 있습니다.');
 const operation=await runJointOperation(env,user,{requestId:body.requestId,kind:KIND,input:{recipeId,attempts:1,paymentType:'BOTH'},prepare:async()=>{
  const recipe=await p(`SELECT * FROM ${RECIPES} WHERE id=?`,recipeId).first(),config=await readMercenaryCraft(env,definition);
  if(!config.value||!enabled(recipe,config.policy))throw fail('현재 각성 오메가 제작이 잠겨 있습니다.');
  const materials=(await p('SELECT item_code,quantity FROM workshop_recipe_materials_v1668 WHERE recipe_id=?',recipeId).all()).results;
  if(materials.length!==1||materials[0].item_code!==C.materialCode||Number(materials[0].quantity)!==C.quantity)throw fail('각성 오메가 제작 재료 설정을 확인하세요.');
  const owned=await p('SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',user.id,C.inputCode).first();
  const total=Number(owned?.total_copies),duplicates=Number(owned?.duplicate_count);
  if(!Number.isSafeInteger(total)||!Number.isSafeInteger(duplicates)||total!==duplicates+1||total<C.quantity)throw fail('오메가-X 50장이 필요합니다.');
  const modes=total===C.quantity?(await readMercenaryModes(env,[user.id])).get(Number(user.id)):null;
  if(modes&&usesOmega(modes))throw fail('마지막 오메가-X까지 소모됩니다. PVE·PVP 편성에서 오메가-X를 먼저 해제하세요.');
  const wallet=await p('SELECT coin FROM users WHERE id=?',user.id).first();
  if(!wallet||BigInt(wallet.coin)<BigInt(C.coinCost))throw fail('100조 코인이 필요합니다.');
  const raw=(await p('SELECT value FROM app_meta WHERE key=?',awakenedOmegaPityKey(user.id)).first())?.value??null,pity=progress(raw);
  const guaranteed=pity.failures>=C.pityAfter,roll=guaranteed?null:randomInt(10000);
  if(roll!==null&&(!Number.isInteger(roll)||roll<0||roll>=10000))throw fail('제작 확률 판정에 실패했습니다.');
  const success=guaranteed||roll<1000,nextPity={failures:success?0:pity.failures+1,revision:pity.revision+1};
  const outputBefore=Number((await p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',user.id,definition.code).first())?.total_copies||0);
  const result={ok:true,requestId:body.requestId,recipeId,recipeName:definition.name,category:'MERCENARY_CRAFT',awakenedOmegaCraft:true,success,successRate:10,effectiveSuccessRate:guaranteed?100:10,guaranteed,attempts:1,successCount:success?1:0,failureCount:success?0:1,coinSpent:C.coinCost,masterStarSpent:0,consumed:[{code:C.inputCode,name:C.inputName,quantity:C.quantity,remaining:total-C.quantity}],pity:{failures:nextPity.failures,pityAfter:C.pityAfter,guaranteed:nextPity.failures>=C.pityAfter},output:success?{type:'MERCENARY',ref:definition.code,name:definition.art.name,image:definition.art.sourceArt,rarity:'SSS LIMITED',quantity:1}:null};
  return {result,configRaw:config.value,progressRaw:raw,pity:nextPity,total,duplicates,modes,outputBefore,roll};
 },statements:async plan=>{
  const key=awakenedOmegaPityKey(user.id),current=await readMercenaryCraft(env,definition);
  if(current.value!==plan.configRaw)throw fail('제작 설정이 변경되었습니다. 최신 설정을 확인하세요.',true);
  if(((await p('SELECT value FROM app_meta WHERE key=?',key).first())?.value??null)!==plan.progressRaw)throw fail('실패 누적이 변경되었습니다. 최신 상태에서 다시 시도하세요.',true);
  const owned=await p('SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',user.id,C.inputCode).first();
  if(Number(owned?.total_copies)!==plan.total||Number(owned?.duplicate_count)!==plan.duplicates)throw fail('오메가-X 보유 수량이 변경되었습니다. 최신 상태에서 다시 시도하세요.',true);
  if(plan.result.success&&Number((await p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',user.id,definition.code).first())?.total_copies||0)!==plan.outputBefore)throw fail('각성 오메가 보유 수량이 변경되었습니다. 최신 상태에서 다시 시도하세요.',true);
  if(plan.modes&&modeSnapshot((await readMercenaryModes(env,[user.id])).get(Number(user.id)))!==modeSnapshot(plan.modes))throw fail('용병 편성이 변경되었습니다. 최신 상태에서 다시 시도하세요.',true);
  const token=crypto.randomUUID(),configToken=crypto.randomUUID(),pityToken=crypto.randomUUID(),list=[];
  if(DB.dialect==='postgres')list.push(p('SELECT key FROM app_meta WHERE key=? FOR SHARE',C.key),p(`SELECT id FROM ${RECIPES} WHERE id=? FOR SHARE`,recipeId),p('SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN (?,?) FOR UPDATE',user.id,C.inputCode,definition.code));
  list.push(jointGuard(DB,configToken,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[C.key,plan.configRaw]),jointGuard(DB,pityToken,plan.progressRaw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',plan.progressRaw===null?[key]:[key,plan.progressRaw]));
  list.push(jointGuard(DB,token,`EXISTS(SELECT 1 FROM ${RECIPES} WHERE id=? AND code=? AND category='MERCENARY_CRAFT' AND output_type='MERCENARY' AND output_ref=? AND output_quantity=1 AND payment_mode='BOTH' AND coin_cost=? AND master_star_cost=0 AND success_rate=10 AND is_active=1 AND is_public=1 AND owner_test_only=0) AND (SELECT COUNT(*) FROM workshop_recipe_materials_v1668 WHERE recipe_id=?)=1 AND EXISTS(SELECT 1 FROM workshop_recipe_materials_v1668 WHERE recipe_id=? AND item_code=? AND quantity=?) AND EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?)`,[recipeId,C.recipeCode,definition.code,C.coinCost,recipeId,recipeId,C.materialCode,C.quantity,user.id,C.inputCode,plan.total,plan.duplicates]));
  const modeTokens=[];
  if(plan.modes){const legacy=plan.modes.legacy||plan.modes,modeToken=crypto.randomUUID();modeTokens.push(modeToken);list.push(mercenaryModeGuard(DB,modeToken,user.id,legacy));if(plan.modes.dualKey){const dualToken=crypto.randomUUID();modeTokens.push(dualToken);list.push(dualMercenaryGuard(DB,dualToken,plan.modes));}}
  list.push(...jointCoinDebit(DB,user.id,C.coinCost,KIND));
  // Exactly 50 total copies. Removing the final ownership row leaves saved growth
  // and equipment untouched; the final card must be absent from both formations.
  if(plan.total===C.quantity)list.push(p('DELETE FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?',user.id,C.inputCode,plan.total,plan.duplicates));
  else list.push(p('UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-?,duplicate_count=duplicate_count-? WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?',C.quantity,C.quantity,user.id,C.inputCode,plan.total,plan.duplicates));
  list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN COALESCE((SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?),0)=? THEN 1 ELSE 0 END WHERE token=?',user.id,C.inputCode,plan.total-C.quantity,token));
  if(plan.result.success){
   const grant=crypto.randomUUID(),acquisitionId=`${definition.prefix}:${user.id}:${body.requestId}`;
   list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN COALESCE((SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?),0)=? AND NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?) THEN 1 ELSE 0 END WHERE token=?',user.id,definition.code,plan.outputBefore,acquisitionId,token));
   list.push(p('INSERT INTO workshop_craft_guards_v1668(guard_id,user_id,recipe_id,verified) VALUES(?,?,?,1)',grant,user.id,recipeId),...mercenaryCraftGrantStatements(DB,{userId:Number(user.id),requestId:body.requestId,guardId:grant},definition));
   list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=? AND user_id=? AND mercenary_code=? AND total_copies_after=?) AND EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=?) THEN 1 ELSE 0 END WHERE token=?',acquisitionId,user.id,definition.code,plan.outputBefore+1,user.id,definition.code,plan.outputBefore+1,token),p('DELETE FROM workshop_craft_guards_v1668 WHERE guard_id=?',grant));
  }
  list.push(p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',key,JSON.stringify(plan.pity)));
  list.push(p("INSERT INTO workshop_craft_logs_v1668(request_id,user_id,recipe_id,recipe_name,category,output_type,output_ref,output_quantity,payment_type,coin_spent,master_star_spent,success) VALUES(?,?,?,?,'MERCENARY_CRAFT','MERCENARY',?,?,'BOTH',?,0,?)",body.requestId,user.id,recipeId,definition.name,definition.code,plan.result.success?1:0,C.coinCost,plan.result.success?1:0));
  list.push(p("INSERT INTO workshop_craft_receipts_v1668(request_id,user_id,recipe_id,payment_type,status,result_json) VALUES(?,?,?,'BOTH','COMPLETED',?)",body.requestId,user.id,recipeId,JSON.stringify(plan.result)),jointGuardEnd(DB,token),jointGuardEnd(DB,configToken),jointGuardEnd(DB,pityToken),...modeTokens.map(t=>jointGuardEnd(DB,t)));
  return list;
 }});
 return {...operation.plan.result,replayed:operation.replayed};
}
