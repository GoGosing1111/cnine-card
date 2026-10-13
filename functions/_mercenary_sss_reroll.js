import {SSS_REROLL,emptySssRerollPolicy,validateSssRerollPolicy,sssRerollReadiness,sssRerollOdds,pickSssReroll} from '../shared/mercenary-sss-reroll-v1.mjs';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {isLimitedMercenary} from '../shared/mercenary-limited-catalog-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryRandomInt,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {readMercenaryModes,mercenaryModeGuard} from './_mercenary_loadout_modes.js';
import {runJointOperation,readJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError,readJointBody} from './_joint_request.js';

export const SSS_REROLL_KEY='mercenary_sss_reroll_policy_v1';
const KIND='MERCENARY_SSS_REROLL',fail=(code,message,status=409)=>jointError('SSS_REROLL_'+code,message,status);
const stored=async env=>(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SSS_REROLL_KEY).first())?.value??null;
const balance=async(env,id)=>Number((await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(id,SSS_REROLL.code).first())?.quantity||0);
export async function ensureSssRerollCatalog(env){
 await env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING')
  .bind(SSS_REROLL.code,SSS_REROLL.name,'SSS RECONTRACT','보유한 일반 SSS 용병 1장과 재뽑기권 1개를 소모해 다른 일반 SSS 용병 1장을 획득합니다.','REROLL','SSS',SSS_REROLL.image,116).run();
}
export const presentSssRerollInventory=items=>items.map(item=>item.code!==SSS_REROLL.code?item:{...item,name:SSS_REROLL.name,image:SSS_REROLL.image,usable:true,useDisabledMessage:''});
export async function sssRerollCatalog(env){
 const [doc,draw]=await Promise.all([
  env.DB.prepare("SELECT payload_json,revision FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first(),
  env.DB.prepare('SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1').first()
 ]);
 if(!doc||!draw)throw fail('CATALOG','용병 CMS 설정을 먼저 등록하세요.');
 const rules=JSON.parse(draw.payload_json).cardRules;
 const catalog=expandMercenarySkillCatalog(JSON.parse(doc.payload_json),MERCENARY_CMS_SEED.document,MERCENARY_CMS_SEED.catalog).mercenaries.map(card=>{
  const art=MERCENARY_CMS_SEED.catalog.cards.find(row=>row.code===card.code),limited=isLimitedMercenary(card.code)||Boolean(limitedDeploymentSnapshot(card.code))||card.edition==='LIMITED';
  return{code:card.code,name:card.name,title:card.title||'',rank:card.rank,limited,sourceArt:art?.sourceArt?'/'+art.sourceArt.replace(/^\//,''):'',available:!limited&&Boolean(art?.sourceArt)&&mercenaryAcquisitionEnabled(card.code,rules)};
 });
 return{catalog,cmsRevision:Number(doc.revision)};
}
async function setting(env,catalog){
 const raw=await stored(env),document=raw?JSON.parse(raw):{revision:0,policy:emptySssRerollPolicy(),updatedAt:null};
 return{raw,...document,policy:validateSssRerollPolicy(document.policy,catalog)};
}
const generalSss=card=>card&&card.rank==='SSS'&&!card.limited;
const equipped=(record,code)=>Object.values(record.loadouts).some(slot=>slot.mercenaryCode===code);
export async function sssRerollState(env,user){
 const [{catalog,cmsRevision},owned,modes,count,recent]=await Promise.all([
  sssRerollCatalog(env),
  env.DB.prepare('SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=?').bind(user.id).all(),
  readMercenaryModes(env,[user.id]),balance(env,user.id),
  env.DB.prepare("SELECT request_id FROM joint_operations_v1 WHERE user_id=? AND kind=? AND status='COMPLETED' ORDER BY created_at DESC LIMIT 1").bind(user.id,KIND).first()
 ]);
 const config=await setting(env,catalog),ready=sssRerollReadiness(config.policy,catalog),record=modes.get(Number(user.id));
 const cards=owned.results.flatMap(row=>{
  const card=catalog.find(c=>c.code===row.mercenary_code);if(!generalSss(card))return[];
  const copies=Number(row.total_copies),isEquipped=equipped(record,card.code);
  return[{...card,copies,equipped:isEquipped,selectable:copies>1||!isEquipped,disabledReason:copies===1&&isEquipped?'편성 중인 마지막 1장입니다. 편성을 해제한 뒤 선택하세요.':''}];
 });
 return{accountId:Number(user.id),item:SSS_REROLL,balance:count,cards,catalog:catalog.filter(c=>generalSss(c)||Object.hasOwn(config.policy.cards,c.code)),revision:config.revision,policy:{...config.policy,notes:user.role==='OWNER'?config.policy.notes:''},mode:config.policy.mode,openingEnabled:config.policy.mode==='ON'&&ready.ready,...ready,cmsRevision,updatedAt:config.updatedAt,isOwner:user.role==='OWNER',recentReceiptId:recent?.request_id||null};
}
export async function saveSssRerollPolicy(env,user,body){
 if(user.role!=='OWNER')throw fail('PERMISSION','OWNER만 SSS 재뽑기 확률을 변경할 수 있습니다.',403);
 if(!Number.isSafeInteger(body.revision)||body.revision<0||body.revision>=2147483646)throw fail('REVISION','현재 설정 버전을 확인하세요.',400);
 const {catalog}=await sssRerollCatalog(env);let policy;
 try{policy=validateSssRerollPolicy(body.policy,catalog);}catch(error){throw fail('POLICY',error.message,400);}
 const assertReady=pool=>{if(policy.mode==='ON'){const ready=sssRerollReadiness(policy,pool);if(!ready.ready)throw fail('NOT_READY',ready.blockers.join(' '));}};
 const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'SSS_REROLL_POLICY',input:{revision:body.revision,policy},prepare:async()=>{
  const current=await setting(env,catalog);if(current.revision!==body.revision)throw fail('REVISION_CONFLICT','다른 창에서 변경했습니다. 최신 설정을 불러오세요.');
  assertReady(catalog);return{before:current.raw,next:{revision:current.revision+1,policy,updatedBy:Number(user.id),updatedAt:new Date().toISOString()}};
 },statements:async plan=>{
  if((await stored(env))!==plan.before)throw Object.assign(fail('REVISION_CONFLICT','다른 창에서 변경했습니다. 최신 설정을 불러오세요.'),{terminal:true});
  assertReady((await sssRerollCatalog(env)).catalog);
  const DB=env.DB,token=crypto.randomUUID(),encoded=JSON.stringify(plan.next),p=(sql,...args)=>DB.prepare(sql).bind(...args);
  return[jointGuard(DB,token,plan.before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',plan.before===null?[SSS_REROLL_KEY]:[SSS_REROLL_KEY,plan.before]),
   plan.before===null?p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',SSS_REROLL_KEY,encoded):p('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',encoded,SSS_REROLL_KEY,plan.before),
   p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) THEN 1 ELSE 0 END WHERE token=?',SSS_REROLL_KEY,encoded,token),
   p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'SSS_REROLL_POLICY','APP_META',SSS_REROLL_KEY,plan.before,encoded),jointGuardEnd(DB,token)];
 }});
 return{...await sssRerollState(env,user),savedRevision:result.plan.next.revision,replayed:result.replayed};
}
export async function executeSssReroll(env,user,body,{randomInt=mercenaryRandomInt}={}){
 const code=body.sourceCode;if(typeof code!=='string'||!/^V-\d{3}$/.test(code))throw fail('SOURCE','재뽑기에 사용할 일반 SSS 용병 1장을 선택하세요.',400);
 const readSource=()=>env.DB.prepare('SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,code).first();
 const operation=await runJointOperation(env,user,{requestId:body.requestId,kind:KIND,input:{sourceCode:code},prepare:async()=>{
  const [{catalog,cmsRevision},owned,modes,count]=await Promise.all([sssRerollCatalog(env),readSource(),readMercenaryModes(env,[user.id]),balance(env,user.id)]);
  const config=await setting(env,catalog);if(config.policy.mode!=='ON')throw fail('CLOSED','SSS 재뽑기를 준비 중입니다. 아이템과 용병은 소모되지 않았습니다.');
  const ready=sssRerollReadiness(config.policy,catalog);if(!ready.ready)throw fail('NOT_READY',ready.blockers.join(' '));
  const source=catalog.find(c=>c.code===code);if(!generalSss(source))throw fail('SOURCE','일반 SSS 용병만 사용할 수 있습니다. 리미티드는 제외됩니다.');
  const total=Number(owned?.total_copies),duplicates=Number(owned?.duplicate_count);
  if(!owned||!Number.isSafeInteger(total)||total<1||duplicates!==total-1)throw fail('OWNERSHIP','선택한 용병을 보유하고 있지 않습니다.');
  const record=modes.get(Number(user.id));if(total===1&&equipped(record,code))throw fail('EQUIPPED','편성 중인 마지막 1장은 사용할 수 없습니다. 먼저 편성을 해제하세요.');
  if(count<1)throw fail('BALANCE','SSS 재뽑기권이 부족합니다.');
  const result=pickSssReroll(config.policy,catalog,code,randomInt);
  return{policyRaw:config.raw,policyRevision:config.revision,cmsRevision,record,source:{code,name:source.name,sourceArt:source.sourceArt,totalBefore:total,duplicatesBefore:duplicates,totalAfter:total-1},result,odds:sssRerollOdds(config.policy,catalog,code).map(c=>({code:c.code,units:c.units,percent:c.percent})),createdAt:new Date().toISOString()};
 },statements:async plan=>{
  if((await stored(env))!==plan.policyRaw)throw Object.assign(fail('POLICY_CHANGED','재뽑기 설정이 변경되어 요청을 취소했습니다. 다시 선택하세요.'),{terminal:true});
  const live=await sssRerollCatalog(env),current=await readSource(),modes=await readMercenaryModes(env,[user.id]),record=modes.get(Number(user.id));
  if(live.cmsRevision!==plan.cmsRevision||!generalSss(live.catalog.find(c=>c.code===code))||!live.catalog.some(c=>c.code===plan.result.mercenaryCode&&generalSss(c)&&c.available))throw Object.assign(fail('CATALOG_CHANGED','용병 설정이 변경되어 요청을 취소했습니다.'),{terminal:true});
  if(Number(current?.total_copies)!==plan.source.totalBefore||Number(current?.duplicate_count)!==plan.source.duplicatesBefore||plan.source.totalBefore===1&&equipped(record,code))throw Object.assign(fail('SOURCE_CHANGED','보유 수량 또는 편성이 변경되어 요청을 취소했습니다.'),{terminal:true});
  const DB=env.DB,p=(sql,...args)=>DB.prepare(sql).bind(...args),token=crypto.randomUUID(),modeToken=crypto.randomUUID(),list=[];
  if(DB.dialect==='postgres')list.push(p('SELECT value FROM app_meta WHERE key=? FOR SHARE',SSS_REROLL_KEY),p("SELECT revision FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"));
  list.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=?) AND EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?) AND NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?)",[SSS_REROLL_KEY,plan.policyRaw,plan.cmsRevision,user.id,code,plan.source.totalBefore,plan.source.duplicatesBefore,body.requestId+':sss-reroll']));
  if(plan.source.totalBefore===1)list.push(mercenaryModeGuard(DB,modeToken,user.id,record));
  list.push(...jointInventoryChange(DB,user.id,SSS_REROLL.code,-1,'SSS 용병 재뽑기',body.requestId));
  if(plan.source.totalBefore===1)list.push(p('DELETE FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=1',user.id,code));
  else list.push(p('UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-1,duplicate_count=duplicate_count-1 WHERE user_id=? AND mercenary_code=? AND total_copies=?',user.id,code,plan.source.totalBefore));
  const predicate=plan.source.totalAfter===0?'NOT EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?)':'EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?)';
  list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN '+predicate+' THEN 1 ELSE 0 END WHERE token=?',user.id,code,...(plan.source.totalAfter?[plan.source.totalAfter,plan.source.totalAfter-1]:[]),token));
  list.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:plan.result.mercenaryCode,acquisitionId:body.requestId+':sss-reroll',createdAt:plan.createdAt}));
  if(plan.source.totalBefore===1)list.push(jointGuardEnd(DB,modeToken));list.push(jointGuardEnd(DB,token));return list;
 }});
 return sssRerollReceipt(env,user,operation.requestId,operation.replayed);
}
export async function sssRerollReceipt(env,user,requestId,replayed=true){
 const row=await readJointOperation(env,user.id,requestId,KIND);
 if(row.status!=='COMPLETED')return{requestId,status:'PENDING',retryable:true};
 const acquired=await env.DB.prepare('SELECT is_duplicate,total_copies_after,duplicate_count_after FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=? AND user_id=?').bind(requestId+':sss-reroll',user.id).first();
 if(!acquired)throw fail('RECEIPT','결과 지급 기록을 확인하지 못했습니다.',503);
 return{requestId,status:'COMPLETED',accountId:Number(user.id),replayed,itemCode:SSS_REROLL.code,itemConsumed:1,balance:await balance(env,user.id),policyRevision:row.plan.policyRevision,source:row.plan.source,result:{...row.plan.result,isDuplicate:Boolean(Number(acquired.is_duplicate)),totalCopiesAfter:Number(acquired.total_copies_after),duplicatesAfter:Number(acquired.duplicate_count_after)}};
}
export async function handleSssReroll({path,request,env,deps}){
 if(!['mercenary-sss-reroll/state','mercenary-sss-reroll/execute','mercenary-sss-reroll/receipt','admin/mercenary-sss-reroll'].includes(path))return null;
 try{
  const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
  const admin=path==='admin/mercenary-sss-reroll';if(admin&&user.role!=='OWNER')throw fail('PERMISSION','OWNER만 관리할 수 있습니다.',403);
  if(request.method==='GET'){
   if(path.endsWith('/execute'))throw fail('METHOD','POST 요청이 필요합니다.',405);
   if(path.endsWith('/receipt'))return deps.json(await sssRerollReceipt(env,user,new URL(request.url).searchParams.get('requestId')));
   if(admin)await ensureSssRerollCatalog(env);return deps.json(await sssRerollState(env,user));
  }
  if(request.method!==(admin?'PATCH':'POST')||!admin&&!path.endsWith('/execute'))throw fail('METHOD','지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{maxBytes:24000,fields:admin?['requestId','revision','policy']:['requestId','sourceCode']});
  if(typeof deps.withUserMutationLock!=='function')throw fail('LOCK','계정 잠금 서비스를 확인하세요.',503);
  return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>admin?saveSssRerollPolicy(env,user,body):executeSssReroll(env,user,body)));
 }catch(error){const known=/^(SSS_REROLL_|JOINT_)/.test(error.code||'');return deps.json({code:known?error.code:'SSS_REROLL_FAILED',error:known?error.message:'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.',retryable:!known||error.status>=500},known?error.status||400:503);}
}
