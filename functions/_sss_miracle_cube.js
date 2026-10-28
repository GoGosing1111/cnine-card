import {EUNSEOL_ART} from '../shared/mercenary-eunseol-v1.mjs';
import {GENERAL_JOK_ART} from '../shared/mercenary-general-jok-v1.mjs';
import {SSS_CUBE,emptySssCubePolicy,validateSssCubePolicy,sssCubeReadiness,pickSssCubeBatch,sssCubePercent} from '../shared/sss-miracle-cube-v1.mjs';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {HALLOWEEN_SSS_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {SSS_CUBE_LIMITED_CODES,SSS_CUBE_STOCK_SCOPE,sssCubeStockCode,sssCubeCatalogWithLimits} from '../shared/sss-miracle-cube-stock-v1.mjs';
import {PRIME_ART} from '../shared/mercenary-prime-requiem-v1.mjs';
import {ZERO_ART} from '../shared/mercenary-zero-v1.mjs';
import {LEONEL_ART} from '../shared/mercenary-leonel-v1.mjs';
import {SHIRANUI_ART} from '../shared/mercenary-shiranui-v1.mjs';
import {KAIRON_ART} from '../shared/mercenary-kairon-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {limitedPackRandomInt} from './_mercenary_limited_pack.js';
import {runJointOperation,readJointOperation,jointInventoryChange} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError,readJointBody} from './_joint_request.js';

export const SSS_CUBE_KEY='sss_miracle_cube_policy_20261021_v1',SSS_CUBE_KIND='SSS_MIRACLE_CUBE_OPEN';
const limitedCards=[...new Map([...HALLOWEEN_SSS_CARDS,EUNSEOL_ART,GENERAL_JOK_ART,PRIME_ART,ZERO_ART,LEONEL_ART,SHIRANUI_ART,KAIRON_ART].filter(c=>c.rank==='SSS').map(c=>[c.code,c])).values()];
const releasedLimited=new Set(SSS_CUBE_LIMITED_CODES);
const fail=(code,message,status=409)=>jointError('SSS_CUBE_'+code,message,status);
const terminal=(code,message)=>Object.assign(fail(code,message),{terminal:true});
const stored=async env=>(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SSS_CUBE_KEY).first())?.value??null;
const balance=async(env,userId)=>Number((await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,SSS_CUBE.code).first())?.quantity||0);
export async function ensureSssCubeCatalog(env){
 await env.DB.prepare('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES(?,?,?,?,?,?,?,?,1) ON CONFLICT(code) DO NOTHING')
  .bind(SSS_CUBE.code,SSS_CUBE.name,'SSS MIRACLE CUBE','SSS 일반·SSS 리미티드 용병 중 1장을 획득합니다. 리미티드는 큐브 전용 한도를 사용합니다.','CUBE','MIRACLE',SSS_CUBE.image,30).run();
}
export function presentSssCubeInventory(items){return items.map(item=>item.code===SSS_CUBE.code?{...item,name:SSS_CUBE.name,image:SSS_CUBE.image,usable:true,useDisabledMessage:''}:item);}
export async function readSssCubeCatalog(env){
 const [cms,draw,stock]=await Promise.all([
  env.DB.prepare("SELECT payload_json,revision FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first(),
  env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first(),
  env.DB.prepare('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code LIKE ?').bind(SSS_CUBE_STOCK_SCOPE+':%').all()
 ]);
 if(!cms||!draw)throw fail('CATALOG','용병 획득 설정을 먼저 등록하세요.');
 const rules=JSON.parse(draw.payload_json).cardRules,document=expandMercenarySkillCatalog(JSON.parse(cms.payload_json),MERCENARY_CMS_SEED.document,MERCENARY_CMS_SEED.catalog);
 const catalog=document.mercenaries.filter(c=>c.rank==='SSS'&&!limitedCards.some(l=>l.code===c.code)).map(c=>{
  const art=MERCENARY_CMS_SEED.catalog.cards.find(a=>a.code===c.code),available=Boolean(art?.sourceArt)&&mercenaryAcquisitionEnabled(c.code,rules);
  return {code:c.code,name:c.name,rank:'SSS',limited:false,sourceArt:art?.sourceArt?'/'+art.sourceArt.replace(/^\//,''):'',available,lockReason:available?'':'일반 용병 획득이 잠겨 있습니다.'};
 });
 for(const c of limitedCards){
  const stockCode=sssCubeStockCode(c.code),s=stock.results.find(s=>s.code===stockCode),stockLimit=s?Number(s.stock_limit):null,issued=s?Number(s.issued):0;
  const prepared=Number.isSafeInteger(stockLimit)&&stockLimit>0&&stockLimit<=1_000_000&&Number.isSafeInteger(issued)&&issued>=0&&issued<=stockLimit;
  const remaining=prepared?stockLimit-issued:null,unlocked=releasedLimited.has(c.code),available=unlocked&&prepared&&remaining>0;
  catalog.push({code:c.code,name:c.name,rank:'SSS',limited:true,cubeEligible:unlocked,stockCode,stockScope:SSS_CUBE_STOCK_SCOPE,sourceArt:'/'+c.sourceArt.replace(/^\//,''),available,stockLimit,issued,remaining,
   lockReason:!unlocked?'현재 획득 경로가 잠긴 리미티드입니다.':!prepared?'큐브 전용 한도를 등록하세요.':remaining===0?'큐브 전용 한정 수량이 소진됐습니다.':''});
 }
 return {catalog,cmsRevision:Number(cms.revision),drawRevision:Number(draw.revision)};
}
export async function sssCubeState(env,user){
 const [raw,data,quantity]=await Promise.all([stored(env),readSssCubeCatalog(env),balance(env,user.id)]);
 const setting=raw?JSON.parse(raw):{revision:0,policy:emptySssCubePolicy(),updatedAt:null};
 const policy=validateSssCubePolicy(setting.policy,data.catalog),readiness=sssCubeReadiness(policy,data.catalog);
 return {item:SSS_CUBE,accountId:Number(user.id),balance:quantity,revision:setting.revision,updatedAt:setting.updatedAt,
  isOwner:user.role==='OWNER',mode:policy.mode,policy:{...policy,notes:user.role==='OWNER'?policy.notes:''},...readiness,
  openingEnabled:policy.mode==='ON'&&readiness.ready,catalog:data.catalog.map(c=>({...c,units:policy.cards[c.code]??null,percent:sssCubePercent(policy.cards[c.code])})),soldOutPolicy:'STOP_WITHOUT_DEBIT'};
}
export async function saveSssCubePolicy(env,user,body){
 if(user.role!=='OWNER')throw fail('PERMISSION','OWNER만 SSS 미라클큐브를 설정할 수 있습니다.',403);
 if(!Number.isSafeInteger(body.revision)||body.revision<0||body.revision>=2147483646)throw fail('REVISION','현재 설정 버전을 확인하세요.',400);
 const data=await readSssCubeCatalog(env);let policy;
 try{policy=validateSssCubePolicy(body.policy,data.catalog);}catch(e){throw fail('POLICY',e.message,400);}
 const result=await runJointOperation(env,user,{requestId:body.requestId,kind:'SSS_MIRACLE_CUBE_POLICY',input:{revision:body.revision,policy},prepare:async()=>{
  const before=await stored(env),previous=before?JSON.parse(before):{revision:0};
  if(previous.revision!==body.revision)throw fail('REVISION_CONFLICT','설정이 변경됐습니다. 최신 설정을 불러오세요.');
  if(policy.mode==='ON'){const ready=sssCubeReadiness(policy,sssCubeCatalogWithLimits((await readSssCubeCatalog(env)).catalog,policy.stockLimits));if(!ready.ready)throw fail('NOT_READY',ready.blockers.join(' '));}
  return {before,next:{revision:previous.revision+1,policy,updatedAt:new Date().toISOString(),updatedBy:Number(user.id)}};
 },statements:async plan=>{
  if(await stored(env)!==plan.before)throw terminal('REVISION_CONFLICT','다른 창에서 설정이 변경됐습니다.');
  const latest=(await readSssCubeCatalog(env)).catalog;
  if(Object.entries(policy.stockLimits).some(([code,limit])=>limit<(latest.find(c=>c.code===code)?.issued??0)))throw terminal('STOCK','저장 중 추가 발행됐습니다. 최신 발행 수량을 확인하세요.');
  if(policy.mode==='ON'){const ready=sssCubeReadiness(policy,sssCubeCatalogWithLimits(latest,policy.stockLimits));if(!ready.ready)throw terminal('NOT_READY',ready.blockers.join(' '));}
  const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID(),text=JSON.stringify(plan.next);
  const limits=[];
  for(const [code,limit] of Object.entries(policy.stockLimits).sort(([a],[b])=>a.localeCompare(b))){
   const stockCode=sssCubeStockCode(code),claim=crypto.randomUUID();
   limits.push(p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,last_token) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET stock_limit=excluded.stock_limit,revision=mercenary_limited_stock_v1.revision+1,last_token=excluded.last_token WHERE mercenary_limited_stock_v1.issued<=excluded.stock_limit',stockCode,limit,claim),jointGuard(DB,claim,'EXISTS(SELECT 1 FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?)',[stockCode,claim]),jointGuardEnd(DB,claim));
  }
  return [...(DB.dialect==='postgres'?[p('SELECT key FROM app_meta WHERE key=? FOR UPDATE',SSS_CUBE_KEY)]:[]),jointGuard(DB,token,plan.before===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',plan.before===null?[SSS_CUBE_KEY]:[SSS_CUBE_KEY,plan.before]),...limits,
   p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',SSS_CUBE_KEY,text),
   p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'SSS_MIRACLE_CUBE_POLICY','APP_META',SSS_CUBE_KEY,plan.before,text),jointGuardEnd(DB,token)];
 }}).catch(async error=>{
  const latest=(await readSssCubeCatalog(env)).catalog;
  if(Object.entries(policy.stockLimits).some(([code,limit])=>limit<(latest.find(c=>c.code===code)?.issued??0))){
   await env.DB.prepare("UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id=? AND user_id=? AND kind='SSS_MIRACLE_CUBE_POLICY' AND status='PENDING'").bind(new Date().toISOString(),body.requestId,user.id).run();
   throw terminal('STOCK','저장 중 추가 발행됐습니다. 최신 발행 수량을 확인하세요.');
  }
  throw error;
 });
 return {...await sssCubeState(env,user),replayed:result.replayed};
}
export async function openSssCube(env,user,body,{randomInt=limitedPackRandomInt}={}){
 const {count,expectedRevision,requestId}=body;
 if(!SSS_CUBE.counts.includes(count)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw fail('INPUT','개봉 횟수와 설정 버전을 확인하세요.',400);
 const result=await runJointOperation(env,user,{requestId,kind:SSS_CUBE_KIND,input:{count,expectedRevision},prepare:async()=>{
  const raw=await stored(env);if(!raw)throw fail('CLOSED','SSS 미라클큐브 개봉을 준비 중입니다.');
  const setting=JSON.parse(raw),data=await readSssCubeCatalog(env),policy=validateSssCubePolicy(setting.policy,data.catalog);
  if(policy.mode!=='ON')throw fail('CLOSED','SSS 미라클큐브 개봉을 준비 중입니다.');
  if(setting.revision!==expectedRevision)throw fail('POLICY_CHANGED','확률 설정이 변경됐습니다. 새 설정을 확인하세요.');
  const ready=sssCubeReadiness(policy,data.catalog);if(!ready.ready)throw fail('NOT_READY',ready.blockers.join(' '));
  if(await balance(env,user.id)<count)throw fail('BALANCE','보유한 SSS 미라클큐브가 부족합니다.');
  return {count,raw,revision:setting.revision,cmsRevision:data.cmsRevision,drawRevision:data.drawRevision,draws:pickSssCubeBatch(policy,data.catalog,count,randomInt)};
 },statements:async plan=>{
  if(await stored(env)!==plan.raw)throw terminal('POLICY_CHANGED','개봉 설정이 변경되어 요청을 취소했습니다. 큐브는 소모되지 않았습니다.');
  const data=await readSssCubeCatalog(env);
  if(data.cmsRevision!==plan.cmsRevision||data.drawRevision!==plan.drawRevision)throw terminal('CATALOG_CHANGED','용병 설정이 변경되어 요청을 취소했습니다.');
  const grouped=new Map();
  plan.draws.forEach((r,i)=>{
   const c=data.catalog.find(c=>c.code===r.mercenaryCode&&c.rank==='SSS'&&c.limited===r.limited);
   if(!c?.available)throw terminal(r.limited?'STOCK':'CATALOG_CHANGED',c?.lockReason||'용병 획득 상태가 변경됐습니다.');
   if(r.limited){if(!grouped.has(c.code))grouped.set(c.code,[]);grouped.get(c.code).push(i);
    if(r.stockCode!==c.stockCode||c.stockLimit!==r.stockLimit||grouped.get(c.code).length>c.remaining)throw terminal('STOCK','리미티드 수량이 변경됐습니다. 큐브는 소모되지 않았습니다.');}
  });
  const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID(),time=new Date().toISOString(),list=[];
  if(DB.dialect==='postgres')list.push(p('SELECT key FROM app_meta WHERE key=? FOR SHARE',SSS_CUBE_KEY),p("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"),p('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE'));
  list.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=?) AND EXISTS(SELECT 1 FROM mercenary_draw_config_v1 WHERE id=1 AND revision=?)",[SSS_CUBE_KEY,plan.raw,plan.cmsRevision,plan.drawRevision]));
  list.push(...jointInventoryChange(DB,user.id,SSS_CUBE.code,-plan.count,'SSS 미라클큐브 개봉',requestId));
  for(const [code,indices] of [...grouped].sort(([a],[b])=>a.localeCompare(b))){
   const size=indices.length,claim=crypto.randomUUID(),stockCode=sssCubeStockCode(code);
   list.push(p('UPDATE mercenary_limited_stock_v1 SET issued=issued+?,revision=revision+1,last_token=? WHERE code=? AND stock_limit=? AND issued+?<=stock_limit',size,claim,stockCode,plan.draws[indices[0]].stockLimit,size),
    jointGuard(DB,claim,'EXISTS(SELECT 1 FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?)',[stockCode,claim]),
    p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+excluded.total_copies,duplicate_count=user_mercenary_cards_v1.duplicate_count+excluded.total_copies,last_obtained_at=excluded.last_obtained_at',user.id,code,size,size-1,time,time));
   indices.forEach((i,j)=>{const aid=requestId+':'+i,offset=size-j-1;
    list.push(p('INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) SELECT ?,?,?,code,issued-?,? FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?',aid,requestId,user.id,offset,time,stockCode,claim),
     p('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT ?,user_id,mercenary_code,CASE WHEN total_copies-?>1 THEN 1 ELSE 0 END,total_copies-?,total_copies-?-1,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',aid,offset,offset,offset,time,user.id,code));
   });list.push(jointGuardEnd(DB,claim));
  }
  plan.draws.forEach((r,i)=>{if(!r.limited)list.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:r.mercenaryCode,acquisitionId:requestId+':'+i}));});
  list.push(jointGuardEnd(DB,token));return list;
 }}).catch(async error=>{
  const row=await env.DB.prepare('SELECT status,plan_json FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND kind=?').bind(requestId,user.id,SSS_CUBE_KIND).first();
  if(row?.status==='PENDING'){
   const plan=JSON.parse(row.plan_json),data=await readSssCubeCatalog(env),needed={};
   for(const r of plan.draws)if(r.limited)needed[r.mercenaryCode]=(needed[r.mercenaryCode]||0)+1;
   const sold=Object.entries(needed).some(([code,n])=>{const c=data.catalog.find(c=>c.code===code);return !c?.available||c.remaining<n||c.stockLimit!==plan.draws.find(d=>d.mercenaryCode===code).stockLimit;});
   if(sold){await env.DB.prepare("UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'").bind(new Date().toISOString(),requestId,user.id).run();throw terminal('STOCK','다른 이용자가 잔여 수량을 획득했습니다. 큐브는 소모되지 않았습니다.');}
  }
  throw error;
 });
 return sssCubeReceipt(env,user,result.requestId,result.replayed);
}
export async function sssCubeReceipt(env,user,requestId,replayed=true){
 const op=await readJointOperation(env,user.id,requestId,SSS_CUBE_KIND);if(op.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
 const ids=op.plan.draws.map((_,i)=>requestId+':'+i),rows=(await env.DB.prepare(`SELECT a.acquisition_id,a.mercenary_code,a.is_duplicate,a.total_copies_after,a.duplicate_count_after,l.serial,l.code AS issue_code FROM mercenary_card_acquisitions_v1 a LEFT JOIN mercenary_limited_issues_v1 l ON l.acquisition_id=a.acquisition_id AND l.user_id=a.user_id AND (l.code=a.mercenary_code OR l.code=('SSS_MIRACLE_CUBE:' || a.mercenary_code)) WHERE a.user_id=? AND a.acquisition_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids).all()).results;
 const draws=op.plan.draws.map((r,i)=>{const a=rows.find(a=>a.acquisition_id===ids[i]);
  if(!a||a.mercenary_code!==r.mercenaryCode||r.limited&&(!a.serial||a.issue_code!==(r.stockCode||r.mercenaryCode)))throw fail('RECEIPT','지급 영수증을 다시 확인하고 있습니다.',503);
  return {...r,duplicate:Boolean(Number(a.is_duplicate)),totalCopies:Number(a.total_copies_after),duplicateCount:Number(a.duplicate_count_after),...(r.limited?{serial:Number(a.serial)}:{})};
 });
 return {requestId,status:'COMPLETED',accountId:Number(user.id),count:op.plan.count,revision:op.plan.revision,balance:await balance(env,user.id),draws,replayed};
}
export async function handleSssCube({path,request,env,deps}){
 if(!['sss-miracle-cube/state','sss-miracle-cube/open','sss-miracle-cube/receipt','admin/sss-miracle-cube'].includes(path))return null;
 try{
  const user=await deps.authenticate(request,env);if(!user)throw fail('AUTH','로그인이 필요합니다.',401);
  const admin=path==='admin/sss-miracle-cube';if(admin&&user.role!=='OWNER')throw fail('PERMISSION','OWNER만 관리할 수 있습니다.',403);
  if(request.method==='GET'){
   if(path==='sss-miracle-cube/receipt')return deps.json(await sssCubeReceipt(env,user,new URL(request.url).searchParams.get('requestId')),200,{'cache-control':'no-store'});
   if(path==='sss-miracle-cube/open')throw fail('METHOD','POST 요청이 필요합니다.',405);
   if(admin)await ensureSssCubeCatalog(env);return deps.json(await sssCubeState(env,user),200,{'cache-control':'no-store'});
  }
  if(request.method!==(admin?'PATCH':'POST')||!admin&&path!=='sss-miracle-cube/open')throw fail('METHOD','지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{maxBytes:24000,fields:admin?['requestId','revision','policy']:['requestId','count','expectedRevision']});
  if(typeof deps.withUserMutationLock!=='function')throw fail('LOCK','계정 잠금 서비스를 확인하세요.',503);
  return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>admin?saveSssCubePolicy(env,user,body):openSssCube(env,user,body)),200,{'cache-control':'no-store'});
 }catch(e){const known=/^(SSS_CUBE_|JOINT_)/.test(e.code||'');return deps.json({code:known?e.code:'SSS_CUBE_RETRYABLE',error:known?e.message:'처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.',retryable:!known||e.status>=500},known?e.status||400:503,{'cache-control':'no-store'});}
}
