import {ICON_ENHANCEMENT_KEY as KEY,ICON_ENHANCEMENT_POLICY as POLICY,defaultIconEnhancementSettings,validateIconEnhancementSettings,iconEnhancementStepReady,iconEnhancementPower,iconEnhancementSteps} from '../shared/icon-enhancement-v1.mjs';
import {runJointOperation,readJointOperation,jointCoinDebit,jointInventoryChange,saveJointPolicyDraft,jointRequestId} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';

const KIND='ICON_ENHANCEMENT';
const fail=(code,message,status=409)=>jointError(`ICON_ENHANCEMENT_${code}`,message,status);
const terminal=(code,message)=>Object.assign(fail(code,message),{terminal:true});
const cardId=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw fail('INPUT','아이콘 카드를 선택하세요.',400);return value;};
async function readRecord(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first();
  if(!row)return {raw:null,settings:defaultIconEnhancementSettings()};
  const stored=JSON.parse(row.value);
  if(!Number.isSafeInteger(stored.revision)||stored.revision<1)throw Error('INVALID_ICON_ENHANCEMENT_SETTINGS');
  return {raw:row.value,settings:{...stored,...validateIconEnhancementSettings({enabled:stored.enabled,steps:stored.steps})}};
}
export const readIconEnhancementSettings=async env=>(await readRecord(env)).settings;
const selectOwned=`SELECT uc.quantity,uc.breakthrough_level,COALESCE(uc.breakthrough_fail_count,0) fail_count,c.rarity,c.title,c.base_power FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND uc.quantity>0`;
async function resources(DB,userId){
  const results=await DB.batch([DB.prepare('SELECT coin FROM users WHERE id=?').bind(userId),DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(userId)]);
  return {coin:String(results[0].results[0]?.coin??0),masterStars:Number(results[1].results[0]?.quantity||0)};
}
export async function iconEnhancementOverview(env,user,id){
  cardId(id);
  const [settings,card,owned,wallet,pending]=await Promise.all([
    readIconEnhancementSettings(env),env.DB.prepare("SELECT id,title,rarity,base_power FROM cards_effective_v1210 WHERE id=? AND rarity='ICON'").bind(id).first(),
    env.DB.prepare(selectOwned).bind(user.id,id).first(),resources(env.DB,user.id),
    env.DB.prepare("SELECT request_id,plan_json FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='PENDING' ORDER BY created_at LIMIT 1").bind(user.id,KIND).first()
  ]);
  if(!card)throw fail('CARD','아이콘 카드를 찾을 수 없습니다.',404);
  const basePower=Number(card.base_power)||180000,level=Number(owned?.breakthrough_level||0),step=settings.steps[level],ready=level<10&&iconEnhancementStepReady(step);
  return {policy:{...POLICY,basePower},steps:iconEnhancementSteps(basePower),revision:settings.revision,enabled:settings.enabled,card:{id,title:card.title,owned:Boolean(owned),quantity:Number(owned?.quantity||0),level,power:iconEnhancementPower(level,basePower)},resources:wallet,next:level>=10?null:{level:level+1,power:iconEnhancementPower(level+1,basePower),...step,ready},canAttempt:Boolean(owned&&settings.enabled&&ready),pending:pending?{requestId:pending.request_id,input:JSON.parse(pending.plan_json).input}:null};
}
const receipt=operation=>{const p=operation.plan;return {requestId:operation.requestId||operation.request_id,status:operation.status,replayed:operation.replayed===true,cardId:p.input.cardId,success:p.success,levelBefore:p.levelBefore,level:p.levelAfter,powerBefore:iconEnhancementPower(p.levelBefore,p.basePower||180000),power:iconEnhancementPower(p.levelAfter,p.basePower||180000),rate:10,spent:p.cost,policy:{...POLICY,basePower:p.basePower||180000}};};
export async function iconEnhancementReceipt(env,user,requestId){
  const row=await readJointOperation(env,user.id,requestId,KIND);
  // Never reveal the roll while a request is unpaid.
  return row.status==='COMPLETED'?receipt({...row,replayed:true}):{requestId,status:row.status,input:row.plan.input};
}
export async function runIconEnhancement(env,user,body,{randomInt=mercenaryRandomInt}={}){
  const input={cardId:cardId(body.cardId),expectedLevel:body.expectedLevel,expectedRevision:body.expectedRevision,policyVersion:body.policyVersion};
  if(!Number.isInteger(input.expectedLevel)||input.expectedLevel<0||input.expectedLevel>=10||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.policyVersion!==POLICY.version)throw fail('INPUT','강화 정보를 새로 불러오세요.',400);
  const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),requestId=body.requestId;
  const operation=await runJointOperation(env,user,{requestId,kind:KIND,input,prepare:async()=>{
    const [settings,owned,wallet,pending]=await Promise.all([readIconEnhancementSettings(env),p(selectOwned,user.id,input.cardId).first(),resources(DB,user.id),p("SELECT request_id FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='PENDING' LIMIT 1",user.id,KIND).first()]);
    if(pending)throw fail('PENDING','이전 강화 결과를 먼저 확인하세요.');
    if(!owned||owned.rarity!=='ICON')throw fail('CARD','보유한 아이콘 카드만 강화할 수 있습니다.',404);
    const level=Number(owned.breakthrough_level),step=settings.steps[level];
    if(level>=10)throw fail('MAX','이미 최대 +10 강화입니다.');
    if(level!==input.expectedLevel||settings.revision!==input.expectedRevision)throw fail('STALE','카드 또는 강화 설정이 변경되었습니다. 다시 불러오세요.');
    if(!settings.enabled||!iconEnhancementStepReady(step))throw fail('CLOSED','해당 단계는 강화 준비 중입니다.');
    if(BigInt(wallet.coin)<BigInt(step.coinCost)||wallet.masterStars<step.masterStarCost)throw fail('BALANCE','마스터의 별 또는 코인이 부족합니다.',400);
    const roll=randomInt(POLICY.chanceTotal);if(!Number.isInteger(roll)||roll<0||roll>=POLICY.chanceTotal)throw Error('INVALID_ICON_ENHANCEMENT_ROLL');
    const success=roll<POLICY.successChance;
    return {input,basePower:Number(owned.base_power)||180000,policyVersion:POLICY.version,cost:{...step},quantity:Number(owned.quantity),failCount:Number(owned.fail_count),levelBefore:level,levelAfter:level+(success?1:0),success,roll};
  },statements:async plan=>{
    const record=await readRecord(env),settings=record.settings,step=settings.steps[plan.levelBefore],owned=await p(selectOwned,user.id,input.cardId).first();
    if(!settings.enabled||settings.revision!==input.expectedRevision||!iconEnhancementStepReady(step)||step.coinCost!==plan.cost.coinCost||step.masterStarCost!==plan.cost.masterStarCost)throw terminal('STALE','설정이 변경되어 강화 요청을 취소했습니다. 재료는 소모되지 않았습니다.');
    if(!owned||owned.rarity!=='ICON'||Number(owned.breakthrough_level)!==plan.levelBefore||Number(owned.quantity)!==plan.quantity||Number(owned.fail_count)!==plan.failCount)throw terminal('STALE','카드 상태가 변경되어 강화 요청을 취소했습니다. 재료는 소모되지 않았습니다.');
    const token=crypto.randomUUID(),failCount=plan.success?0:plan.failCount+1;
    const guards="EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=? AND uc.quantity=? AND uc.breakthrough_level=? AND COALESCE(uc.breakthrough_fail_count,0)=? AND c.rarity='ICON')";
    return [jointGuard(DB,token,guards,[KEY,record.raw,user.id,input.cardId,plan.quantity,plan.levelBefore,plan.failCount]),
      ...jointCoinDebit(DB,user.id,plan.cost.coinCost,`${KIND}:${requestId}`),...jointInventoryChange(DB,user.id,'MASTER_STAR',-plan.cost.masterStarCost,plan.success?'ICON_ENHANCEMENT_SUCCESS':'ICON_ENHANCEMENT_FAIL',requestId),
      p('UPDATE user_cards SET breakthrough_level=?,breakthrough_fail_count=? WHERE user_id=? AND card_id=? AND quantity=? AND breakthrough_level=? AND COALESCE(breakthrough_fail_count,0)=?',plan.levelAfter,failCount,user.id,input.cardId,plan.quantity,plan.levelBefore,plan.failCount),
      p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND breakthrough_level=? AND breakthrough_fail_count=?) THEN 1 ELSE 0 END WHERE token=?',user.id,input.cardId,plan.quantity,plan.levelAfter,failCount,token),jointGuardEnd(DB,token)];
  }});
  return receipt(operation);
}
export async function saveIconEnhancementSettings(env,admin,body){
  jointRequestId(body.requestId);
  let draft;try{draft=validateIconEnhancementSettings({enabled:body.enabled,steps:body.steps});}catch(error){throw fail('SETTINGS',error.message,400);}
  const {raw,settings}=await readRecord(env);
  if(settings.requestId===body.requestId){if(JSON.stringify({enabled:settings.enabled,steps:settings.steps})!==JSON.stringify(draft))throw fail('CONFLICT','같은 요청 번호의 설정이 다릅니다.');return settings;}
  if(body.expectedRevision!==settings.revision)throw fail('CONFLICT','다른 창에서 설정을 변경했습니다. 최신 설정을 불러오세요.');
  return saveJointPolicyDraft(env,admin,KEY,raw,{revision:settings.revision+1,...draft,requestId:body.requestId,updatedAt:new Date().toISOString(),updatedBy:Number(admin.id)});
}
export async function handleIconEnhancement({path,request,env,deps}){
  if(!['icons/enhancement','icons/enhancement/attempt','icons/enhancement/receipt','admin/icons/enhancement'].includes(path))return null;
  const reply=(data,status=200)=>deps.json(data,status,{'Cache-Control':'private, no-store','Vary':'Authorization'});
  try{
    if(path==='admin/icons/enhancement'){
      const admin=await deps.requirePermission(request,env,'BATTLE_MANAGE');if(!admin||admin.role!=='OWNER')throw fail('PERMISSION','OWNER만 설정할 수 있습니다.',403);
      if(request.method==='GET')return reply({policy:POLICY,steps:iconEnhancementSteps(),settings:await readIconEnhancementSettings(env)});
      if(request.method!=='PATCH')throw fail('METHOD','PATCH 요청이 필요합니다.',405);
      const body=await readJointBody(request,{fields:['requestId','expectedRevision','enabled','steps']});
      return reply({policy:POLICY,steps:iconEnhancementSteps(),settings:await deps.withUserMutationLock(env,admin.id,path,()=>saveIconEnhancementSettings(env,admin,body))});
    }
    const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
    if(path==='icons/enhancement'&&request.method==='GET')return reply(await iconEnhancementOverview(env,user,new URL(request.url).searchParams.get('cardId')));
    if(path.endsWith('/receipt')&&request.method==='GET')return reply(await iconEnhancementReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
    if(path!=='icons/enhancement/attempt'||request.method!=='POST')throw fail('METHOD','지원하지 않는 요청입니다.',405);
    const body=await readJointBody(request,{fields:['requestId','cardId','expectedLevel','expectedRevision','policyVersion']});
    return reply(await deps.withUserMutationLock(env,user.id,path,()=>runIconEnhancement(env,user,body)));
  }catch(error){if(String(error.code||'').startsWith('ICON_ENHANCEMENT_'))return reply({ok:false,error:error.message,code:error.code,retryable:/PENDING/.test(error.code)},error.status);return jointResponseError(error,reply);}
}
