import {MERCENARY_LEVEL_RELEASE_ENABLED as RELEASE,MERCENARY_LEVEL_RULES as RULES,MERCENARY_LEVEL_KEY as KEY,LEVEL_BONUS_TYPES,mercenaryLevelReadiness,mercenaryLevelState,normalizeLevelMaterials,planMercenaryTraining,planMercenaryBreakthrough,levelError} from '../shared/mercenary-level-v1.mjs';
import {readMercenaryLevelPolicy,saveMercenaryLevelPolicy,readMercenaryLevelState} from './_mercenary_level_policy.js';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED as SEED} from './_mercenary_cms_seed.js';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';
import {runJointOperation,readJointOperation} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readJointBody,jointResponseError} from './_joint_request.js';

const KIND='MERCENARY_LEVEL_V1';
const terminal=message=>Object.assign(levelError('MERCENARY_LEVEL_CONFLICT',message,409),{terminal:true});
function normalize(body,action){
 if(!['TRAIN','BREAKTHROUGH'].includes(action)||!SEED.catalog.cards.some(c=>c.code===body.mercenaryCode))throw levelError('MERCENARY_LEVEL_TARGET','성장 대상 용병을 확인하세요.');
 if(!Number.isSafeInteger(body.revision)||body.revision<0)throw levelError('MERCENARY_LEVEL_REVISION','최신 성장 상태를 불러오세요.');
 if(action==='TRAIN'&&body.allowOverflow!==undefined&&typeof body.allowOverflow!=='boolean')throw levelError('MERCENARY_LEVEL_OVERFLOW','초과 경험치 동의 항목을 확인하세요.');
 return {action,mercenaryCode:body.mercenaryCode,revision:body.revision,...(action==='TRAIN'?{materials:normalizeLevelMaterials(body.materials),allowOverflow:body.allowOverflow===true}:{})};
}
async function context(env,user,input){
 const [{policy,raw},{document,revision:cmsRevision},state,owned]=await Promise.all([readMercenaryLevelPolicy(env),readMercenaryDocument(env),readMercenaryLevelState(env,user.id,input.mercenaryCode),env.DB.prepare('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=?').bind(user.id).all()]);
 if(policy.mode!=='ON')throw levelError('MERCENARY_LEVEL_CLOSED','용병 성장이 현재 OFF입니다.',423);
 if(!mercenaryLevelReadiness(policy).ready)throw levelError('MERCENARY_LEVEL_UNCONFIGURED','용병 성장 수치가 미정입니다.',409);
 if(state.revision!==input.revision)throw terminal('성장 상태가 변경되었습니다. 다시 불러오세요.');
 if(!owned.results.some(r=>r.mercenary_code===input.mercenaryCode&&Number(r.total_copies)>0))throw levelError('MERCENARY_LEVEL_NOT_OWNED','보유한 용병만 성장시킬 수 있습니다.',403);
 const target=document.mercenaries.find(c=>c.code===input.mercenaryCode);
 if(!target?.rank)throw levelError('MERCENARY_LEVEL_RANK','성장 대상의 등급이 미정입니다.',409);
 return {policy,raw,cmsRevision,state,target,owned:owned.results,catalog:document.mercenaries};
}
export async function previewMercenaryTraining(env,user,body){const input=normalize(body,'TRAIN'),ctx=await context(env,user,input);return planMercenaryTraining({...ctx,materials:input.materials});}
// Prepared core. Only the release-gated route and isolated transaction tests call it.
export async function runPreparedMercenaryLevel(env,user,body,action,{randomInt=mercenaryRandomInt}={}){
 const input=normalize(body,action),DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
 const op=await runJointOperation(env,user,{requestId:body.requestId,kind:KIND,input,prepare:async()=>{
  const ctx=await context(env,user,input),result=action==='TRAIN'?planMercenaryTraining({...ctx,materials:input.materials}):planMercenaryBreakthrough({...ctx,roll:randomInt(1000000)});
  if(result.overflowXp&&!input.allowOverflow)throw levelError('MERCENARY_LEVEL_OVERFLOW','돌파 구간의 초과 경험치는 저장되지 않습니다. 재료를 줄이거나 초과 경험치 소멸에 동의하세요.',409);
  return {version:RULES.version,action,mercenaryCode:input.mercenaryCode,name:ctx.target.name,rank:ctx.target.rank,policyRevision:ctx.policy.revision,policyRaw:ctx.raw,cmsRevision:ctx.cmsRevision,result,createdAt:new Date().toISOString()};
 },statements:async plan=>{
  const current=await context(env,user,input);
  if(current.raw!==plan.policyRaw||current.cmsRevision!==plan.cmsRevision)throw terminal('성장 정책 또는 용병 등급이 변경되었습니다. 다시 확인하세요.');
  const consumed=plan.result.consumed||[],before=plan.result.before,after=plan.result.after;
  for(const m of consumed){const r=current.owned.find(c=>c.mercenary_code===m.code);if(Number(r?.total_copies)!==m.totalBefore||Number(r?.duplicate_count)!==m.duplicatesBefore)throw terminal('재료 수량이 변경되었습니다. 다시 선택하세요.');}
  if(JSON.stringify(current.state)!==JSON.stringify(before))throw terminal('성장 상태가 변경되었습니다. 다시 불러오세요.');
  const token=crypto.randomUUID(),list=[];
  // PostgreSQL share locks serialize policy/CMS edits with this commit; the account
  // row is already locked by runJointOperation. SQLite batches are write-serialized.
  if(DB.dialect==='postgres'){
   list.push(p('SELECT key FROM app_meta WHERE key=? FOR SHARE',KEY),p("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"));
   const codes=[...new Set([input.mercenaryCode,...consumed.map(m=>m.code)])].sort();
   list.push(p(`SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN (${codes.map(()=>'?').join(',')}) ORDER BY mercenary_code FOR UPDATE`,user.id,...codes),p('SELECT mercenary_code FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=? FOR UPDATE',user.id,input.mercenaryCode));
  }
  const predicates=['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',"EXISTS(SELECT 1 FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=?)",'EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies>=1)'];
  const values=[KEY,plan.policyRaw,plan.cmsRevision,user.id,input.mercenaryCode];
  predicates.push('(EXISTS(SELECT 1 FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=? AND level=? AND experience=? AND breakthrough_mask=? AND revision=?) OR (?=0 AND NOT EXISTS(SELECT 1 FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=?)))');
  values.push(user.id,input.mercenaryCode,before.level,before.experience,before.breakthroughMask,before.revision,before.revision,user.id,input.mercenaryCode);
  for(const m of consumed){predicates.push('EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?)');values.push(user.id,m.code,m.totalBefore,m.duplicatesBefore);}
  list.push(jointGuard(DB,token,predicates.join(' AND '),values));
  for(const m of consumed){
   list.push(p('UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-?,duplicate_count=duplicate_count-? WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?',m.quantity,m.quantity,user.id,m.code,m.totalBefore,m.duplicatesBefore));
   list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?) THEN 1 ELSE 0 END WHERE token=?',user.id,m.code,m.totalBefore-m.quantity,m.duplicatesBefore-m.quantity,token));
  }
  list.push(p('INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET level=excluded.level,experience=excluded.experience,breakthrough_mask=excluded.breakthrough_mask,revision=excluded.revision,updated_at=excluded.updated_at',user.id,input.mercenaryCode,after.level,after.experience,after.breakthroughMask,after.revision,plan.createdAt),jointGuardEnd(DB,token));
  return list;
 }});
 return receipt(op);
}
function receipt(op){const {policyRaw,...plan}=op.plan;return {requestId:op.requestId??op.request_id,status:op.status,replayed:op.replayed??true,...(op.status==='COMPLETED'?{...plan}:{})};}
export async function mercenaryLevelReceipt(env,user,requestId){return receipt(await readJointOperation(env,user.id,requestId,KIND));}
export async function handleMercenaryLevel({path,request,env,deps}){
 const admin=path==='admin/mercenaries/leveling',base='mercenaries/v3/leveling/',action=path.startsWith(base)?path.slice(base.length):null;
 if(!admin&&!['feature','state','preview','train','breakthrough','receipt'].includes(action))return null;
 const {json,authenticate,withUserMutationLock}=deps,reply=data=>json(data,200,{'cache-control':'no-store'});
 try{
  if(action==='feature'){if(request.method!=='GET')throw levelError('MERCENARY_LEVEL_METHOD','GET 요청이 필요합니다.',405);return reply({releaseEnabled:RELEASE,rules:RULES});}
  if(!admin&&['train','breakthrough','preview'].includes(action)&&!RELEASE)throw levelError('MERCENARY_LEVEL_PREPARATION','용병 레벨 활성화를 준비 중입니다. 카드가 소모되지 않았습니다.',423);
  const user=await authenticate(request,env);if(!user)throw levelError('MERCENARY_LEVEL_AUTH','로그인이 필요합니다.',401);
  if(admin&&user.role!=='OWNER')throw levelError('MERCENARY_LEVEL_PERMISSION','OWNER만 성장 초안을 관리할 수 있습니다.',403);
  if(request.method==='GET'){
   if(admin){const {policy}=await readMercenaryLevelPolicy(env);return reply({revision:policy.revision,policy,releaseEnabled:RELEASE,rules:RULES,readiness:mercenaryLevelReadiness(policy),bonusTypes:LEVEL_BONUS_TYPES});}
   if(action==='receipt')return reply(await mercenaryLevelReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
   if(action==='state'){
    const [{policy},{document},owned]=await Promise.all([readMercenaryLevelPolicy(env),readMercenaryDocument(env),env.DB.prepare('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=?').bind(user.id).all()]);
    const rows=RELEASE?(await env.DB.prepare('SELECT * FROM user_mercenary_levels_v1 WHERE user_id=?').bind(user.id).all()).results:[];
    return reply({userId:Number(user.id),enabled:RELEASE&&policy.mode==='ON'&&mercenaryLevelReadiness(policy).ready,policy,rules:RULES,cards:owned.results.map(r=>({code:r.mercenary_code,totalCopies:Number(r.total_copies),duplicates:Number(r.duplicate_count),...document.mercenaries.find(c=>c.code===r.mercenary_code),sourceArt:SEED.catalog.cards.find(c=>c.code===r.mercenary_code)?.sourceArt,growth:mercenaryLevelState(rows.find(s=>s.mercenary_code===r.mercenary_code))}))});
   }
  }
  if(request.method!==(admin?'PATCH':'POST'))throw levelError('MERCENARY_LEVEL_METHOD','지원하지 않는 요청입니다.',405);
  const fields=admin?['policy']:action==='breakthrough'?['requestId','mercenaryCode','revision']:['requestId','mercenaryCode','revision','materials','allowOverflow'];
  const body=await readJointBody(request,{fields,maxBytes:16384});
  if(admin){const policy=await saveMercenaryLevelPolicy(env,user,body.policy);return reply({revision:policy.revision,policy,releaseEnabled:RELEASE});}
  if(action==='preview')return reply(await previewMercenaryTraining(env,user,body));
  if(!['train','breakthrough'].includes(action))throw levelError('MERCENARY_LEVEL_METHOD','GET 요청이 필요합니다.',405);
  if(typeof withUserMutationLock!=='function')throw levelError('MERCENARY_LEVEL_LOCK','계정 잠금 서비스를 확인하세요.',503);
  return reply(await withUserMutationLock(env,user.id,path,()=>runPreparedMercenaryLevel(env,user,body,action==='train'?'TRAIN':'BREAKTHROUGH')));
 }catch(e){return jointResponseError(e,json);}
}
