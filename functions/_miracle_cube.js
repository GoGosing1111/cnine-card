import {MIRACLE_CUBE,MIRACLE_RANKS,emptyMiraclePolicy,validateMiraclePolicy,miracleReadiness,miracleOdds,rollMiracleCube} from '../shared/miracle-cube-policy-v1.mjs';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryRandomInt,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {runJointOperation,readJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError,readJointBody} from './_joint_request.js';

export const MIRACLE_KEY='miracle_cube_policy_20261003_v1';
const fail=(code,message,status=409)=>jointError('MIRACLE_'+code,message,status);
const stored=async env=>(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(MIRACLE_KEY).first())?.value??null;
async function cubeBalance(env,userId){
 return Number((await env.DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MIRACLE_CUBE'").bind(userId).first())?.quantity||0);
}
export async function readMiraclePolicy(env){const raw=await stored(env);return raw?JSON.parse(raw):{revision:0,policy:emptyMiraclePolicy(),updatedAt:null};}
export function presentMiracleInventory(items){
 return items.map(item=>item.code!==MIRACLE_CUBE.code?item:{...item,name:MIRACLE_CUBE.name,subtitle:'MIRACLE CUBE',description:'C~SSS 등급 용병 1장을 획득하는 최상위 큐브입니다.',category:'CUBE',rarity:'MIRACLE',image:MIRACLE_CUBE.image,usable:true,useDisabledMessage:''});
}
export async function ensureMiracleCubeCatalog(env){
 await env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING')
  .bind(MIRACLE_CUBE.code,MIRACLE_CUBE.name,'MIRACLE CUBE','C~SSS 등급의 용병 1장을 획득하는 최상위 용병 큐브입니다.','CUBE','MIRACLE',MIRACLE_CUBE.image,29).run();
}
async function catalogState(env){
 const [document,draw]=await Promise.all([env.DB.prepare("SELECT payload_json,revision FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first(),env.DB.prepare('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first()]);
 if(!document||!draw)throw fail('CATALOG','용병 획득 설정을 먼저 등록하세요.');
 const config={document:JSON.parse(document.payload_json),revision:Number(document.revision)};
 const rules=JSON.parse(draw.payload_json).cardRules;
 const catalog=config.document.mercenaries.map(card=>{
  const art=MERCENARY_CMS_SEED.catalog.cards.find(row=>row.code===card.code);
  return {code:card.code,name:card.name,rank:card.rank,sourceArt:art?.sourceArt?'/'+art.sourceArt.replace(/^\//,''):'',available:MIRACLE_RANKS.includes(card.rank)&&Boolean(art?.sourceArt)&&mercenaryAcquisitionEnabled(card.code,rules)};
 }).filter(card=>MIRACLE_RANKS.includes(card.rank));
 return {catalog,cmsRevision:config.revision};
}
export async function miracleCubeState(env,user){
 const [setting,{catalog,cmsRevision}]=await Promise.all([readMiraclePolicy(env),catalogState(env)]);
 const policy=validateMiraclePolicy(setting.policy,catalog),readiness=miracleReadiness(policy,catalog),itemCode=MIRACLE_CUBE.code;
 const balance=await cubeBalance(env,user.id);
 return {item:MIRACLE_CUBE,itemCode,accountId:Number(user.id),revision:setting.revision,updatedAt:setting.updatedAt,policy:user.role==='OWNER'?policy:{...policy,notes:''},mode:policy.mode,openingEnabled:policy.mode==='ON'&&readiness.ready,...readiness,balance,cmsRevision,catalog:miracleOdds(policy,catalog),isOwner:user.role==='OWNER'};
}
export async function saveMiraclePolicy(env,user,body){
 if(user.role!=='OWNER')throw fail('PERMISSION','OWNER만 미라클 큐브 확률을 변경할 수 있습니다.',403);
 if(!Number.isSafeInteger(body.revision)||body.revision<0||body.revision>=2147483646)throw fail('REVISION','현재 설정 버전을 확인하세요.',400);
 const {catalog}=await catalogState(env);let policy;
 try{policy=validateMiraclePolicy(body.policy,catalog);}catch(error){throw fail('POLICY',error.message,400);}
 const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'MIRACLE_CUBE_POLICY',input:{revision:body.revision,policy},prepare:async()=>{
  const before=await stored(env),previous=before?JSON.parse(before):{revision:0,policy:emptyMiraclePolicy()};
  if(previous.revision!==body.revision)throw fail('REVISION_CONFLICT','다른 창에서 설정을 변경했습니다. 최신 설정을 불러오세요.');
  if(policy.mode==='ON'){const ready=miracleReadiness(policy,catalog);if(!ready.ready)throw fail('NOT_READY',ready.blockers.join(' '));}
  return {before,next:{revision:previous.revision+1,policy,updatedBy:Number(user.id),updatedAt:new Date().toISOString()}};
 },statements:async plan=>{
  if((await stored(env))!==plan.before)throw Object.assign(fail('REVISION_CONFLICT','다른 창에서 설정을 변경했습니다.'),{terminal:true});
  if(plan.next.policy.mode==='ON'){const live=await catalogState(env),ready=miracleReadiness(plan.next.policy,live.catalog);if(!ready.ready)throw fail('NOT_READY',ready.blockers.join(' '));}
  const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),token=crypto.randomUUID(),encoded=JSON.stringify(plan.next);
  return [jointGuard(DB,token,plan.before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',plan.before===null?[MIRACLE_KEY]:[MIRACLE_KEY,plan.before]),
   p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',MIRACLE_KEY,encoded),
   p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'MIRACLE_CUBE_POLICY','APP_META',MIRACLE_KEY,plan.before,encoded),jointGuardEnd(DB,token)];
 }});
 return {...await miracleCubeState(env,user),savedRevision:result.plan.next.revision,replayed:result.replayed};
}
export async function openMiracleCube(env,user,body,{randomInt=mercenaryRandomInt}={}){
 const count=body.count??1;if(!MIRACLE_CUBE.counts.includes(count))throw fail('COUNT','1개 또는 10개를 선택하세요.',400);
 const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'MIRACLE_CUBE_OPEN',input:{count},prepare:async()=>{
  const raw=await stored(env);if(!raw)throw fail('CLOSED','미라클 큐브 개봉을 준비 중입니다.');
  const setting=JSON.parse(raw),{catalog,cmsRevision}=await catalogState(env),policy=validateMiraclePolicy(setting.policy,catalog);
  if(policy.mode!=='ON')throw fail('CLOSED','미라클 큐브 개봉을 준비 중입니다.');
  const ready=miracleReadiness(policy,catalog);if(!ready.ready)throw fail('NOT_READY',ready.blockers.join(' '));
  const balance=await cubeBalance(env,user.id);
  if(balance<count)throw fail('BALANCE','보유한 미라클 큐브가 부족합니다.');
  return {count,policyRaw:raw,policyRevision:setting.revision,cmsRevision,draws:Array.from({length:count},()=>rollMiracleCube(policy,catalog,randomInt))};
 },statements:async plan=>{
  const raw=await stored(env);if(raw!==plan.policyRaw)throw Object.assign(fail('POLICY_CHANGED','개봉 설정이 변경되었습니다. 보유 수량을 확인한 뒤 다시 시도하세요.'),{terminal:true});
  const {catalog,cmsRevision}=await catalogState(env);
  if(cmsRevision!==plan.cmsRevision||plan.draws.some(draw=>!catalog.some(card=>card.code===draw.mercenaryCode&&card.rank===draw.rank&&card.available)))throw Object.assign(fail('CATALOG_CHANGED','용병 설정이 변경되어 개봉을 취소했습니다.'),{terminal:true});
  const DB=env.DB,token=crypto.randomUUID(),list=[];
  if(DB.dialect==='postgres')list.push(DB.prepare('SELECT value FROM app_meta WHERE key=? FOR SHARE').bind(MIRACLE_KEY),DB.prepare("SELECT revision FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"));
  list.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=?)",[MIRACLE_KEY,raw,plan.cmsRevision]));
  list.push(...jointInventoryChange(DB,user.id,MIRACLE_CUBE.code,-plan.count,'미라클 큐브 개봉',body.requestId));
  plan.draws.forEach((draw,index)=>list.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:draw.mercenaryCode,acquisitionId:`${body.requestId}:${index}`})));
  list.push(jointGuardEnd(DB,token));return list;
 }});
 return miracleCubeReceipt(env,user,result.requestId,result.replayed);
}
export async function miracleCubeReceipt(env,user,requestId,replayed=true){
 const row=await readJointOperation(env,user.id,requestId,'MIRACLE_CUBE_OPEN');
 if(row.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
 const ids=row.plan.draws.map((_,index)=>`${requestId}:${index}`),found=(await env.DB.prepare(`SELECT acquisition_id,is_duplicate,total_copies_after,duplicate_count_after FROM mercenary_card_acquisitions_v1 WHERE user_id=? AND acquisition_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids).all()).results;
 const balance=await cubeBalance(env,user.id);
 return {requestId,status:'COMPLETED',accountId:Number(user.id),count:row.plan.count,policyRevision:row.plan.policyRevision,balance,replayed,draws:row.plan.draws.map((draw,index)=>{
  const acquired=found.find(item=>item.acquisition_id===ids[index]);if(!acquired)throw fail('RECEIPT','개봉 지급 기록을 확인하지 못했습니다.',503);
  return {...draw,duplicate:Boolean(Number(acquired.is_duplicate)),totalCopies:Number(acquired.total_copies_after),duplicateCount:Number(acquired.duplicate_count_after)};
 })};
}
export async function handleMiracleCube({path,request,env,deps}){
 if(!['miracle-cube/state','miracle-cube/open','miracle-cube/receipt','admin/miracle-cube'].includes(path))return null;
 try{
  const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
  const admin=path==='admin/miracle-cube';if(admin&&user.role!=='OWNER')throw fail('PERMISSION','OWNER만 관리할 수 있습니다.',403);
  if(request.method==='GET'){
   if(path==='miracle-cube/receipt')return deps.json(await miracleCubeReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
   if(path==='miracle-cube/open')throw fail('METHOD','POST 요청이 필요합니다.',405);
   if(admin)await ensureMiracleCubeCatalog(env);return deps.json(await miracleCubeState(env,user));
  }
  if(request.method!==(admin?'PATCH':'POST')||(!admin&&path!=='miracle-cube/open'))throw fail('METHOD','지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{maxBytes:24000,fields:admin?['requestId','revision','policy']:['requestId','count']});
  if(typeof deps.withUserMutationLock!=='function')throw fail('LOCK','계정 잠금 서비스를 확인하세요.',503);
  return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>admin?saveMiraclePolicy(env,user,body):openMiracleCube(env,user,body)));
 }catch(error){const known=/^(MIRACLE_|JOINT_)/.test(error.code||'');return deps.json({code:known?error.code:'MIRACLE_FAILED',error:known?error.message:'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.',retryable:!known||error.status>=500},known?error.status||400:503);}
}
