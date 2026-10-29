import {HEUKMU_CODE} from '../shared/mercenary-heukmu-v1.mjs';
import {KAMISHIRO_CODE} from '../shared/mercenary-kamishiro-v1.mjs';
import {CARDGU_CODE} from '../shared/mercenary-cardgu-v1.mjs';
import {REVAN_CODE} from '../shared/mercenary-revan-v1.mjs';
import {AWAKENED_OMEGA_CODE} from '../shared/mercenary-awakened-omega-v1.mjs';
import {EUNSEOL_CODE} from '../shared/mercenary-eunseol-v1.mjs';
import {GENERAL_JOK_CODE} from '../shared/mercenary-general-jok-v1.mjs';
import {PRIME_CODE} from '../shared/mercenary-prime-requiem-v1.mjs';
import {RAZAK_CODE} from '../shared/mercenary-razak-v1.mjs';
import {ZERO_CODE} from '../shared/mercenary-zero-v1.mjs';
import {LEONEL_CODE} from '../shared/mercenary-leonel-v1.mjs';
import {JOKRO_CODE,jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';
import {SHIRANUI_CODE} from '../shared/mercenary-shiranui-v1.mjs';
import {MERCENARY_LEVEL_RELEASE_ENABLED as RELEASE,MERCENARY_LEVEL_RULES as RULES,MERCENARY_LEVEL_KEY as KEY,LEVEL_BONUS_TYPES,mercenaryGrowthSummary,mercenaryLevelReadiness,mercenaryLevelStateFromStorage,mercenaryLevelStorageLevel,normalizeLevelMaterials,planMercenaryTraining,planMercenaryBreakthrough,levelError} from '../shared/mercenary-level-v1.mjs';
import {readMercenaryLevelPolicy,saveMercenaryLevelPolicy,readMercenaryLevelState} from './_mercenary_level_policy.js';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED as SEED} from './_mercenary_cms_seed.js';
import {ALL_LIMITED_MERCENARIES as LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {KAIRON_CODE} from '../shared/mercenary-kairon-v1.mjs';
import {readJinmuPackOwners} from './_mercenary_jinmu_access.js';
import {readJokroPackOwners} from './_mercenary_jokro_access.js';
import {JINMU_CODE,jinmuAccountAllowed} from '../shared/mercenary-jinmu-v1.mjs';
import {mercenaryRandomInt} from './_mercenary_draw_accounting.js';
import {runJointOperation,readJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readJointBody,jointResponseError} from './_joint_request.js';
import {readMercenaryBreakthroughHistory,mercenaryPityFromHistory} from './_mercenary_level_pity.js';
import {readExperienceTransfer,readMercenaryGrowthHistory,transferCardView,transferRecordGuard,readTransferItemQuantity} from './_mercenary_experience_transfer.js';
import {TRANSFER_ITEM,TRANSFER_RELEASE_ENABLED,TRANSFER_REPAIR_MESSAGE,mercenaryTransferState,planItemExperienceTransfer,applyTransferXp,transferError} from '../shared/mercenary-experience-transfer-v1.mjs';

const KIND='MERCENARY_LEVEL_V1';
// Freeze growth effects in the same receipt as the material/XP change. Replaying
// a completed operation must not recompute effects from a newer CMS policy.
function captureGrowth(policy,result){
 if(policy.growth)result.growth={version:policy.growth.version,policyRevision:policy.revision,before:mercenaryGrowthSummary(policy.growth,result.before),after:mercenaryGrowthSummary(policy.growth,result.after)};
 return result;
}
const terminal=message=>Object.assign(levelError('MERCENARY_LEVEL_CONFLICT',message,409),{terminal:true});
function levelCatalog(document,userId,hasJinmuPackIssue,hasJokroPackIssue){return [...document.mercenaries.map(c=>({...c,sourceArt:SEED.catalog.cards.find(art=>art.code===c.code)?.sourceArt})),...[...LIMITED_MERCENARIES.map(c=>c.code),CARDGU_CODE,KAMISHIRO_CODE,HEUKMU_CODE,AWAKENED_OMEGA_CODE,REVAN_CODE,EUNSEOL_CODE,GENERAL_JOK_CODE,PRIME_CODE,RAZAK_CODE,JINMU_CODE,KAIRON_CODE,SHIRANUI_CODE,JOKRO_CODE,LEONEL_CODE,ZERO_CODE].filter(code=>jinmuAccountAllowed(userId,code,hasJinmuPackIssue)&&jokroAccountAllowed(userId,code,Date.now(),hasJokroPackIssue)).map(limitedDeploymentSnapshot).filter(Boolean)];}
function normalize(body,action,{preview=false}={}){
 if(['EXTRACT','INFUSE'].includes(action))throw transferError('LEGACY_DISABLED','기존 무료 추출·물약 보관 방식은 종료됐습니다. 별도로 획득한 물약을 사용해 주세요.',423);
 if(action==='TRANSFER'&&!TRANSFER_RELEASE_ENABLED)throw transferError('PAUSED',TRANSFER_REPAIR_MESSAGE,423);
 if(!['TRAIN','BREAKTHROUGH','TRANSFER'].includes(action)||!SEED.catalog.cards.some(c=>c.code===body.mercenaryCode)&&!limitedDeploymentSnapshot(body.mercenaryCode))throw levelError('MERCENARY_LEVEL_TARGET','성장 대상 용병을 확인하세요.');
 if(!Number.isSafeInteger(body.revision)||body.revision<0)throw levelError('MERCENARY_LEVEL_REVISION','최신 성장 상태를 불러오세요.');
 if(action==='TRAIN'&&body.allowOverflow!==undefined&&typeof body.allowOverflow!=='boolean')throw levelError('MERCENARY_LEVEL_OVERFLOW','초과 경험치 동의 항목을 확인하세요.');
 if(action==='TRANSFER'){
  if(!Number.isSafeInteger(body.transferRevision)||body.transferRevision<0||!Number.isSafeInteger(body.policyRevision)||body.policyRevision<0)throw transferError('REVISION','최신 물약과 성장 설정을 불러오세요.');
  if(!/^V-\d{3}$/.test(body.sourceCode)||!Number.isSafeInteger(body.sourceRevision)||body.sourceRevision<0)throw transferError('SOURCE','경험치를 보낼 용병의 최신 상태를 선택하세요.');
  if(!preview&&(!Number.isSafeInteger(body.expectedXp)||body.expectedXp<1))throw transferError('QUOTE','이전할 경험치와 초기화를 먼저 확인하세요.');
  return {action,mercenaryCode:body.mercenaryCode,revision:body.revision,transferRevision:body.transferRevision,policyRevision:body.policyRevision,sourceCode:body.sourceCode,sourceRevision:body.sourceRevision,...(preview?{}:{expectedXp:body.expectedXp})};
 }
 return {action,mercenaryCode:body.mercenaryCode,revision:body.revision,...(action==='TRAIN'?{materials:normalizeLevelMaterials(body.materials),allowOverflow:body.allowOverflow===true}:{})};
}
async function context(env,user,input){
 const [{policy,raw},{document,revision:cmsRevision},state,owned]=await Promise.all([readMercenaryLevelPolicy(env),readMercenaryDocument(env),readMercenaryLevelState(env,user.id,input.mercenaryCode),env.DB.prepare('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=?').bind(user.id).all()]);
 if(policy.mode!=='ON')throw levelError('MERCENARY_LEVEL_CLOSED','용병 성장이 현재 OFF입니다.',423);
 if(!mercenaryLevelReadiness(policy).ready)throw levelError('MERCENARY_LEVEL_UNCONFIGURED','용병 성장 수치가 미정입니다.',409);
 if(state.revision!==input.revision)throw terminal('성장 상태가 변경되었습니다. 다시 불러오세요.');
 const [jinmuOwners,jokroOwners]=await Promise.all([readJinmuPackOwners(env,owned.results.some(r=>r.mercenary_code===JINMU_CODE)?[user.id]:[]),readJokroPackOwners(env,owned.results.some(r=>r.mercenary_code===JOKRO_CODE)?[user.id]:[])]);
 const hasJinmuPackIssue=jinmuOwners.has(Number(user.id)),hasJokroPackIssue=jokroOwners.has(Number(user.id));
 if(!(jinmuAccountAllowed(user.id,input.mercenaryCode,hasJinmuPackIssue)&&jokroAccountAllowed(user.id,input.mercenaryCode,Date.now(),hasJokroPackIssue))||!owned.results.some(r=>r.mercenary_code===input.mercenaryCode&&Number(r.total_copies)>0))throw levelError('MERCENARY_LEVEL_NOT_OWNED','보유한 용병만 성장시킬 수 있습니다.',403);
 const catalog=levelCatalog(document,user.id,hasJinmuPackIssue,hasJokroPackIssue),target=catalog.find(c=>c.code===input.mercenaryCode);
 if(!target?.rank)throw levelError('MERCENARY_LEVEL_RANK','성장 대상의 등급이 미정입니다.',409);
 const transfer=await readExperienceTransfer(env,user.id),memory=mercenaryTransferState(transfer.state,input.mercenaryCode);
 if(!TRANSFER_RELEASE_ENABLED&&['TRAIN','BREAKTHROUGH'].includes(input.action)&&transfer.state.mercenaries[input.mercenaryCode])throw transferError('REPAIR_PENDING','이 용병의 경험치 이전 기록을 복구 중입니다. 복구 후 성장할 수 있습니다.',423);
 let source=null,sourceState=null,itemQuantity=0;
 if(input.action==='TRANSFER'){
  if(input.transferRevision!==transfer.state.revision||input.policyRevision!==policy.revision)throw terminal('물약 또는 성장 설정이 변경됐습니다. 다시 확인하세요.');
  source=catalog.find(c=>c.code===input.sourceCode);
  if(!source?.rank||!owned.results.some(r=>r.mercenary_code===input.sourceCode&&Number(r.total_copies)>0))throw levelError('MERCENARY_LEVEL_NOT_OWNED','보유한 용병끼리만 경험치를 이전할 수 있습니다.',403);
  sourceState=await readMercenaryLevelState(env,user.id,input.sourceCode);
  if(sourceState.revision!==input.sourceRevision)throw terminal('보내는 용병의 성장 상태가 변경됐습니다. 다시 확인하세요.');
  itemQuantity=await readTransferItemQuantity(env,user.id);
  if(itemQuantity<1)throw transferError('ITEM_REQUIRED','별도로 획득한 용병 경험치 50% 이전 물약 1개가 필요합니다.');
 }
 const pity=input.action==='BREAKTHROUGH'?mercenaryPityFromHistory(await readMercenaryBreakthroughHistory(env,user.id),input.mercenaryCode,state,memory.resetRevision):null;
 return {policy,raw,cmsRevision,state,target,owned:owned.results,catalog,pity,transfer,source,sourceState,itemQuantity};
}
export async function previewMercenaryTraining(env,user,body){const input=normalize(body,'TRAIN'),ctx=await context(env,user,input);return captureGrowth(ctx.policy,planMercenaryTraining({...ctx,materials:input.materials}));}
export async function previewExperienceExtraction(env,user,body){
 normalize(body,'EXTRACT',{preview:true});
}
export async function previewItemExperienceTransfer(env,user,body){
 const input=normalize(body,'TRANSFER',{preview:true}),ctx=await context(env,user,input),planned=planItemExperienceTransfer({...ctx,transferState:ctx.transfer.state,history:await readMercenaryGrowthHistory(env,user.id)});
 return {...input,expectedXp:planned.result.xp,result:planned.result,itemQuantity:ctx.itemQuantity,name:ctx.target.name};
}
// Prepared core. Only the release-gated route and isolated transaction tests call it.
export async function runPreparedMercenaryLevel(env,user,body,action,{randomInt=mercenaryRandomInt}={}){
 const input=normalize(body,action),DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
 const op=await runJointOperation(env,user,{requestId:body.requestId,kind:KIND,input,prepare:async()=>{
  const ctx=await context(env,user,input),createdAt=new Date().toISOString();let result,transferNext=null;
  if(action==='TRANSFER'){
   const planned=planItemExperienceTransfer({...ctx,transferState:ctx.transfer.state,requestId:body.requestId,history:await readMercenaryGrowthHistory(env,user.id)});
   result=planned.result;transferNext=planned.next;
   if(result.xp!==input.expectedXp)throw transferError('QUOTE','이전 예상 경험치가 변경됐습니다. 다시 확인하세요.');
  }else{
   result=action==='TRAIN'?planMercenaryTraining({...ctx,materials:input.materials}):planMercenaryBreakthrough({...ctx,roll:randomInt(1000000),pityFailures:ctx.pity?.failures??0});
   const memory=mercenaryTransferState(ctx.transfer.state,input.mercenaryCode);
   if(action==='BREAKTHROUGH'&&memory.bankedXp>0){
    const applied=applyTransferXp({policy:ctx.policy,state:result.after,target:ctx.target,xp:memory.bankedXp});
    result.breakthroughAfter={...result.after};result.after=applied.after;result.transfer={bankedBefore:memory.bankedXp,appliedXp:applied.appliedXp,bankedAfter:applied.bankedXp};
    transferNext=structuredClone(ctx.transfer.state);transferNext.revision++;transferNext.mercenaries[input.mercenaryCode]={...memory,bankedXp:applied.bankedXp};
   }
  }
  if(result.overflowXp&&!input.allowOverflow)throw levelError('MERCENARY_LEVEL_OVERFLOW','돌파 구간의 초과 경험치는 저장되지 않습니다. 재료를 줄이거나 초과 경험치 소멸에 동의하세요.',409);
  captureGrowth(ctx.policy,result);
  return {version:RULES.version,action,mercenaryCode:input.mercenaryCode,name:ctx.target.name,rank:ctx.target.rank,policyRevision:ctx.policy.revision,policyRaw:ctx.raw,cmsRevision:ctx.cmsRevision,result,createdAt,transferBeforeRaw:ctx.transfer.raw,transferNext};
 },statements:async plan=>{
  const current=await context(env,user,input);
  if(current.raw!==plan.policyRaw||current.cmsRevision!==plan.cmsRevision)throw terminal('성장 정책 또는 용병 등급이 변경되었습니다. 다시 확인하세요.');
  // Old pending growth receipts have no transfer snapshot; cancel only if this
  // account has since started using the new feature. Completed receipts replay.
  if(current.transfer.raw!==(plan.transferBeforeRaw??null))throw terminal('물약 보관 상태가 변경되었습니다. 다시 확인하세요.');
  const consumed=plan.result.consumed||[],before=plan.result.before,after=plan.result.after;
  for(const m of consumed){const r=current.owned.find(c=>c.mercenary_code===m.code);if(Number(r?.total_copies)!==m.totalBefore||Number(r?.duplicate_count)!==m.duplicatesBefore)throw terminal('재료 수량이 변경되었습니다. 다시 선택하세요.');}
  if(JSON.stringify(current.state)!==JSON.stringify(before))throw terminal('성장 상태가 변경되었습니다. 다시 불러오세요.');
  if(action==='TRANSFER'&&JSON.stringify(current.sourceState)!==JSON.stringify(plan.result.source.before))throw terminal('보내는 용병의 성장 상태가 변경되었습니다. 다시 불러오세요.');
  if(action==='BREAKTHROUGH'){
   // Completed legacy receipts remain immutable. An uncommitted pre-pity failure
   // must not consume the newly guaranteed attempt when recovered after release.
   if(!plan.result.pity&&current.pity?.guaranteed&&!plan.result.success)throw terminal('돌파 천장이 적용되었습니다. 최신 상태에서 확정 돌파를 다시 시작하세요.');
   if(plan.result.pity&&plan.result.pity.failuresBefore!==current.pity?.failures)throw terminal('돌파 실패 기록이 변경되었습니다. 다시 불러오세요.');
  }
  const token=crypto.randomUUID(),list=[];
  // PostgreSQL share locks serialize policy/CMS edits with this commit; the account
  // row is already locked by runJointOperation. SQLite batches are write-serialized.
  if(DB.dialect==='postgres'){
   list.push(p('SELECT key FROM app_meta WHERE key=? FOR SHARE',KEY),p("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"));
   const codes=[...new Set([input.mercenaryCode,...(action==='TRANSFER'?[input.sourceCode]:[]),...consumed.map(m=>m.code)])].sort();
   list.push(p(`SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN (${codes.map(()=>'?').join(',')}) ORDER BY mercenary_code FOR UPDATE`,user.id,...codes),p('SELECT mercenary_code FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=? FOR UPDATE',user.id,input.mercenaryCode));
   if(action==='TRANSFER')list.push(p('SELECT mercenary_code FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=? FOR UPDATE',user.id,input.sourceCode),p('SELECT item_code FROM cnine_user_inventory WHERE user_id=? AND item_code=? FOR UPDATE',user.id,TRANSFER_ITEM.code));
  }
  const predicates=['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',"EXISTS(SELECT 1 FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=?)",'EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies>=1)'];
  const values=[KEY,plan.policyRaw,plan.cmsRevision,user.id,input.mercenaryCode];
  const transferGuard=transferRecordGuard(current.transfer);predicates.push(transferGuard.sql);values.push(...transferGuard.values);
  predicates.push('(EXISTS(SELECT 1 FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=? AND level=? AND experience=? AND breakthrough_mask=? AND revision=?) OR (?=0 AND NOT EXISTS(SELECT 1 FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=?)))');
  values.push(user.id,input.mercenaryCode,mercenaryLevelStorageLevel(before),before.experience,before.breakthroughMask,before.revision,before.revision,user.id,input.mercenaryCode);
  if(action==='TRANSFER'){
   const s=plan.result.source.before;
   predicates.push('EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies>=1)');values.push(user.id,input.sourceCode);
   predicates.push('(EXISTS(SELECT 1 FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=? AND level=? AND experience=? AND breakthrough_mask=? AND revision=?) OR (?=0 AND NOT EXISTS(SELECT 1 FROM user_mercenary_levels_v1 WHERE user_id=? AND mercenary_code=?)))');
   values.push(user.id,input.sourceCode,mercenaryLevelStorageLevel(s),s.experience,s.breakthroughMask,s.revision,s.revision,user.id,input.sourceCode);
  }
  for(const m of consumed){predicates.push('EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?)');values.push(user.id,m.code,m.totalBefore,m.duplicatesBefore);}
  list.push(jointGuard(DB,token,predicates.join(' AND '),values));
  if(action==='TRANSFER'){
   list.push(...jointInventoryChange(DB,user.id,TRANSFER_ITEM.code,-1,'용병 경험치 50% 이전',body.requestId));
   const s=plan.result.source.after;
   list.push(p('INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET level=excluded.level,experience=excluded.experience,breakthrough_mask=excluded.breakthrough_mask,revision=excluded.revision,updated_at=excluded.updated_at',user.id,input.sourceCode,mercenaryLevelStorageLevel(s),s.experience,s.breakthroughMask,s.revision,plan.createdAt));
  }
  for(const m of consumed){
   list.push(p('UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-?,duplicate_count=duplicate_count-? WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?',m.quantity,m.quantity,user.id,m.code,m.totalBefore,m.duplicatesBefore));
   list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?) THEN 1 ELSE 0 END WHERE token=?',user.id,m.code,m.totalBefore-m.quantity,m.duplicatesBefore-m.quantity,token));
  }
  list.push(p('INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET level=excluded.level,experience=excluded.experience,breakthrough_mask=excluded.breakthrough_mask,revision=excluded.revision,updated_at=excluded.updated_at',user.id,input.mercenaryCode,mercenaryLevelStorageLevel(after),after.experience,after.breakthroughMask,after.revision,plan.createdAt));
  if(plan.transferNext)list.push(p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',current.transfer.key,JSON.stringify(plan.transferNext)));
  list.push(jointGuardEnd(DB,token));
  return list;
 }});
 return receipt(op);
}
function receipt(op){const {policyRaw,transferBeforeRaw,transferNext,...plan}=op.plan;return {requestId:op.requestId??op.request_id,status:op.status,replayed:op.replayed??true,...(op.status==='COMPLETED'?{...plan}:{})};}
export async function mercenaryLevelReceipt(env,user,requestId){return receipt(await readJointOperation(env,user.id,requestId,KIND));}
export async function handleMercenaryLevel({path,request,env,deps}){
 const admin=path==='admin/mercenaries/leveling',base='mercenaries/v3/leveling/',action=path.startsWith(base)?path.slice(base.length):null;
 if(!admin&&!['feature','state','preview','train','breakthrough','receipt','extract-preview','extract','infuse','transfer-preview','transfer'].includes(action))return null;
 const {json,authenticate,withUserMutationLock}=deps,reply=data=>json(data,200,{'cache-control':'no-store'});
 try{
  if(action==='feature'){if(request.method!=='GET')throw levelError('MERCENARY_LEVEL_METHOD','GET 요청이 필요합니다.',405);return reply({releaseEnabled:RELEASE,rules:RULES,transferEnabled:TRANSFER_RELEASE_ENABLED,itemRequired:true,legacyExtractionEnabled:false});}
  if(!admin&&['train','breakthrough','preview','extract-preview','extract','infuse','transfer-preview','transfer'].includes(action)&&!RELEASE)throw levelError('MERCENARY_LEVEL_PREPARATION','용병 레벨 활성화를 준비 중입니다. 카드가 소모되지 않았습니다.',423);
  const user=await authenticate(request,env);if(!user)throw levelError('MERCENARY_LEVEL_AUTH','로그인이 필요합니다.',401);
  if(admin&&user.role!=='OWNER')throw levelError('MERCENARY_LEVEL_PERMISSION','OWNER만 성장 초안을 관리할 수 있습니다.',403);
  if(request.method==='GET'){
   if(admin){const {policy}=await readMercenaryLevelPolicy(env);return reply({revision:policy.revision,policy,releaseEnabled:RELEASE,rules:RULES,readiness:mercenaryLevelReadiness(policy,{requireGrowth:true}),bonusTypes:LEVEL_BONUS_TYPES});}
   if(action==='receipt')return reply(await mercenaryLevelReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
   if(action==='state'){
    const [{policy},{document},owned]=await Promise.all([readMercenaryLevelPolicy(env),readMercenaryDocument(env),env.DB.prepare('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=?').bind(user.id).all()]);
    const configured=RELEASE&&mercenaryLevelReadiness(policy,{requireGrowth:true}).ready,enabled=configured&&policy.mode==='ON';
    const rows=configured?(await env.DB.prepare('SELECT * FROM user_mercenary_levels_v1 WHERE user_id=?').bind(user.id).all()).results:[];
    const history=configured&&rows.length?await readMercenaryBreakthroughHistory(env,user.id):[];
    const [packOwners,jokroPackOwners]=await Promise.all([readJinmuPackOwners(env,owned.results.some(r=>r.mercenary_code===JINMU_CODE)?[user.id]:[]),readJokroPackOwners(env,owned.results.some(r=>r.mercenary_code===JOKRO_CODE)?[user.id]:[])]);
    const catalog=levelCatalog(document,user.id,packOwners.has(Number(user.id)),jokroPackOwners.has(Number(user.id)));
    const transfer=await readExperienceTransfer(env,user.id),quantity=await readTransferItemQuantity(env,user.id);
    return reply({userId:Number(user.id),enabled,policy,rules:RULES,transfer:{enabled:TRANSFER_RELEASE_ENABLED,message:TRANSFER_REPAIR_MESSAGE,revision:transfer.state.revision,quantity,potions:[],item:TRANSFER_ITEM},cards:owned.results.filter(r=>catalog.some(c=>c.code===r.mercenary_code)).map(r=>{const state=mercenaryLevelStateFromStorage(rows.find(s=>s.mercenary_code===r.mercenary_code)),card=catalog.find(c=>c.code===r.mercenary_code),memory=transferCardView(transfer,card);return {code:r.mercenary_code,totalCopies:Number(r.total_copies),duplicates:Number(r.duplicate_count),...card,growth:state,transfer:memory,breakthroughPity:mercenaryPityFromHistory(history,r.mercenary_code,state,memory.resetRevision)};})});
   }
  }
  if(request.method!==(admin?'PATCH':'POST'))throw levelError('MERCENARY_LEVEL_METHOD','지원하지 않는 요청입니다.',405);
  const fields=admin?['policy']:['transfer-preview','transfer'].includes(action)?['requestId','mercenaryCode','revision','policyRevision','transferRevision','sourceCode','sourceRevision',...(action==='transfer'?['expectedXp']:[])]:['extract-preview','extract','infuse'].includes(action)?['requestId','mercenaryCode','revision','policyRevision','transferRevision',...(action==='extract'?['expectedXp','group']:action==='infuse'?['potionId']:[])]:action==='breakthrough'?['requestId','mercenaryCode','revision']:['requestId','mercenaryCode','revision','materials','allowOverflow'];
  const body=await readJointBody(request,{fields,maxBytes:16384});
  if(admin){const policy=await saveMercenaryLevelPolicy(env,user,body.policy);return reply({revision:policy.revision,policy,releaseEnabled:RELEASE});}
  // The historical prepared core remains replay-compatible. Only a complete V2
  // growth policy may enter the future public release route.
  if(['preview','train','breakthrough','extract-preview','extract','infuse','transfer-preview','transfer'].includes(action)){
   const {policy}=await readMercenaryLevelPolicy(env);
   if(!mercenaryLevelReadiness(policy,{requireGrowth:true}).ready)throw levelError('MERCENARY_LEVEL_UNCONFIGURED','레벨별 성장과 돌파 능력 설정을 완료해야 합니다.',409);
  }
  if(action==='preview')return reply(await previewMercenaryTraining(env,user,body));
  if(action==='extract-preview')return reply(await previewExperienceExtraction(env,user,body));
  if(action==='transfer-preview')return reply(await previewItemExperienceTransfer(env,user,body));
  if(!['train','breakthrough','extract','infuse','transfer'].includes(action))throw levelError('MERCENARY_LEVEL_METHOD','GET 요청이 필요합니다.',405);
  if(typeof withUserMutationLock!=='function')throw levelError('MERCENARY_LEVEL_LOCK','계정 잠금 서비스를 확인하세요.',503);
  return reply(await withUserMutationLock(env,user.id,path,()=>runPreparedMercenaryLevel(env,user,body,action.toUpperCase())));
 }catch(e){return jointResponseError(e,json);}
}
