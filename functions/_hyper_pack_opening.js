import {MERCENARY_PACK} from '../shared/mercenary-pack-contract-v1.mjs';
import {validateMercenaryDraw,mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {readMercenaryDocument,readMercenaryRuntime} from './_mercenary_account.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {runJointOperation} from './_joint_transactions.js';

// Public opening is controlled only by the OWNER's switch. Deployment defaults OFF.
export const HYPER_OPENING_KEY='hyper_pack_opening_v2093';
export const HYPER_OPEN_PATHS=new Set(['mercenary-cards/open','mercenary-cards/open-batch','hyper-pack/open','mercenaries/v3/open']);
const defaults=()=>({revision:0,mode:'OFF',version:'hyper-opening-2093'});
async function stored(env){return (await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(HYPER_OPENING_KEY).first())?.value??null;}
export async function readHyperOpening(env){
 const raw=await stored(env);if(raw===null)return defaults();const value=JSON.parse(raw);
 if(!['OFF','ON'].includes(value.mode)||!Number.isSafeInteger(value.revision)||value.revision<1)throw jointError('HYPER_POLICY_INVALID','하이퍼팩 운영 설정을 확인하세요.',503);
 return value;
}
export async function hyperOpeningFeature(env){
 const setting=await readHyperOpening(env);
 return {connected:true,cmsControlled:true,openingVersion:2104,mode:setting.mode,revision:setting.revision,userOpeningEnabled:setting.mode==='ON',packId:MERCENARY_PACK.id,price:MERCENARY_PACK.price,maxCount:MERCENARY_PACK.maxCount,openPath:MERCENARY_PACK.openPath,batchPath:MERCENARY_PACK.batchPath,receiptPath:MERCENARY_PACK.receiptPath,accountUrl:MERCENARY_PACK.accountUrl};
}
// probeTables 는 운영 콘솔이 스키마 존재까지 확인할 때만 쓴다. 실제 뽑기 경로에서는
// 같은 요청 안에서 진짜 문장들이 곧바로 실행되므로, 존재 확인 6쿼리를 또 돌리지 않는다.
export async function hyperOpeningReadiness(env,{probeTables=true}={}){
 const blockers=[];let cmsRevision=null,drawRevision=null,rankCounts={},outcomes=[];
 try{
  const [{document,revision},policy,row,items]=await Promise.all([
   readMercenaryDocument(env),readMercenaryRuntime(env,{draft:true}),env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first(),
   env.DB.prepare("SELECT code,is_active FROM inventory_items WHERE code IN ('MASTER_STAR','STARLIGHT_ARMOR_CORE')").all()
  ]);
  cmsRevision=revision;if(!row)throw Error('개봉 확률을 먼저 저장하세요.');drawRevision=Number(row.revision);
  const draw=validateMercenaryDraw(JSON.parse(row.payload_json)),pools=mercenaryGradePools(document.mercenaries,MERCENARY_CMS_SEED.catalog.cards.map(c=>c.code));
  outcomes=draw.outcomes;rankCounts=Object.fromEntries(Object.entries(pools).map(([rank,codes])=>[rank,codes.length]));
  for(const r of draw.outcomes){
   if(r.id.startsWith('CARD_')&&r.chancePpm>0&&!pools[r.id.slice(5)].length)blockers.push(`${r.id.slice(5)} 등급의 용병이 없습니다.`);
   const item=r.id==='MASTER_STAR'?'MASTER_STAR':r.id==='MYSTIC_ENERGY'?'STARLIGHT_ARMOR_CORE':null;
   if(item&&r.chancePpm>0&&!items.results.some(i=>i.code===item&&Number(i.is_active)===1))blockers.push(`${r.id==='MASTER_STAR'?'마스터의 별':'미스틱 에너지'} 지급 항목을 활성화하세요.`);
  }
  if(document.mercenaries.some(c=>!c.rank))blockers.push('등급이 미정인 용병이 있습니다.');
  if(policy.opening.paymentKind!=='COIN'||policy.opening.coinPerOpen!==MERCENARY_PACK.price||policy.opening.maxBatch!==MERCENARY_PACK.maxCount)blockers.push('개봉 비용을 1회 5억 코인·최대 10회로 설정하세요.');
  if(probeTables)await Promise.all(['SELECT request_id FROM joint_operations_v1 WHERE 1=0','SELECT token FROM joint_atomic_guards_v1 WHERE 1=0','SELECT user_id FROM user_mercenary_cards_v1 WHERE 1=0','SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE 1=0','SELECT user_id FROM user_mercenary_loadout_v1 WHERE 1=0','SELECT user_id FROM user_mercenary_growth_v1 WHERE 1=0'].map(sql=>env.DB.prepare(sql).all()));
 }catch(error){blockers.push(error.code?.startsWith('MERCENARY_')?error.message:'확률·용병·지급 데이터 준비 상태를 확인하세요.');}
 return {ready:blockers.length===0,blockers,cmsRevision,drawRevision,rankCounts,outcomes,price:MERCENARY_PACK.price,maxCount:MERCENARY_PACK.maxCount};
}
export async function hyperOpeningState(env){return {...await readHyperOpening(env),...await hyperOpeningReadiness(env)};}
// recheck=true 는 같은 요청의 커밋 직전 재확인이다. 준비도(CMS·확률·지급 항목)는 이미 prepare 에서
// 확인했고 그 사이의 ON/OFF 전환은 hyperOpeningGuards 의 원자적 가드가 같은 트랜잭션에서 막는다.
// 그래서 여기서는 ON 여부만 다시 읽는다. 준비도 재조회(요청당 ~12쿼리)를 없애려는 것이지
// 검사를 없애는 것이 아니다.
export async function hyperOpeningRuntime(env,{recheck=false}={}){
 const setting=await readHyperOpening(env);if(setting.mode!=='ON')throw jointError('MERCENARY_OPENING_DISABLED','하이퍼팩 개봉은 현재 OFF입니다.',409);
 if(!recheck){const ready=await hyperOpeningReadiness(env,{probeTables:false});if(!ready.ready)throw jointError('HYPER_NOT_READY',ready.blockers.join(' '),409);}
 return {mode:'ON',approved:true,version:`hyper-opening-2093-r${setting.revision}`,opening:{paymentKind:'COIN',coinPerOpen:MERCENARY_PACK.price,itemCode:null,itemsPerOpen:null,maxBatch:MERCENARY_PACK.maxCount}};
}
export async function hyperOpeningGuards(env){
 const raw=await stored(env);if(!raw||JSON.parse(raw).mode!=='ON')throw jointError('MERCENARY_OPENING_DISABLED','하이퍼팩 개봉은 현재 OFF입니다.',409);
 const DB=env.DB,token=crypto.randomUUID();
 return [...(DB.dialect==='postgres'?[DB.prepare('SELECT value FROM app_meta WHERE key=? FOR SHARE').bind(HYPER_OPENING_KEY)]:[]),jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[HYPER_OPENING_KEY,raw]),jointGuardEnd(DB,token)];
}
export async function handleHyperOpening({path,request,env,deps}){
 if(path!=='admin/mercenaries/opening')return null;
 try{
  const user=await deps.authenticate(request,env);if(!user||user.role!=='OWNER')throw jointError('HYPER_PERMISSION','OWNER만 개봉 상태를 변경할 수 있습니다.',403);
  if(request.method==='GET')return deps.json(await hyperOpeningState(env));
  if(request.method!=='PATCH')throw jointError('HYPER_METHOD','GET 또는 PATCH 요청이 필요합니다.',405);
  const body=await readJointBody(request,{fields:['mode','revision','requestId']});
  if(!['OFF','ON'].includes(body.mode)||!Number.isSafeInteger(body.revision)||body.revision<0||body.revision>=2147483646)throw jointError('HYPER_POLICY_INVALID','ON/OFF와 현재 설정 버전을 확인하세요.');
  if(typeof deps.withUserMutationLock!=='function')throw jointError('HYPER_LOCK','설정 잠금 서비스를 확인하세요.',503);
  const result=await deps.withUserMutationLock(env,user.id,path,()=>runJointOperation(env,user,{requestId:body.requestId,kind:'HYPER_OPENING_POLICY',input:{mode:body.mode,revision:body.revision},prepare:async()=>{
   const before=await stored(env),current=before?JSON.parse(before):defaults();if(current.revision!==body.revision)throw jointError('HYPER_REVISION_CONFLICT','다른 창에서 변경했습니다. 최신 상태를 불러오세요.',409);
   if(body.mode==='ON'){const ready=await hyperOpeningReadiness(env);if(!ready.ready)throw jointError('HYPER_NOT_READY',ready.blockers.join(' '),409);}
   return {before,next:{revision:current.revision+1,mode:body.mode,version:'hyper-opening-2093',updatedBy:Number(user.id),updatedAt:new Date().toISOString()}};
  },statements:async plan=>{
   if((await stored(env))!==plan.before)throw Object.assign(jointError('HYPER_REVISION_CONFLICT','다른 창에서 변경했습니다. 최신 상태를 불러오세요.',409),{terminal:true});
   if(plan.next.mode==='ON'){const ready=await hyperOpeningReadiness(env);if(!ready.ready)throw jointError('HYPER_NOT_READY',ready.blockers.join(' '),409);}
   const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID(),next=JSON.stringify(plan.next);
   return [jointGuard(DB,token,plan.before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',plan.before===null?[HYPER_OPENING_KEY]:[HYPER_OPENING_KEY,plan.before]),
    p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',HYPER_OPENING_KEY,next),
    p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'HYPER_PACK_OPENING_MODE','APP_META',HYPER_OPENING_KEY,plan.before,next),jointGuardEnd(DB,token)];
  }}));
  return deps.json({...await hyperOpeningState(env),savedRevision:result.plan.next.revision,replayed:result.replayed});
 }catch(error){return jointResponseError(error,deps.json);}
}
