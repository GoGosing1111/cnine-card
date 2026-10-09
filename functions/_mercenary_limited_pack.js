import {LIMITED_MERCENARIES,isLimitedMercenary} from '../shared/mercenary-limited-catalog-v1.mjs';
import {LIMITED_POLICY_KEY,limitedPolicyDraft,readLimitedPolicy,validateLimitedPolicy} from '../shared/mercenary-limited-policy-v1.mjs';
import {LIMITED_PACK,LIMITED_PACK_KEY,LIMITED_PACK_KIND,LIMITED_PACK_RELEASE_ENABLED,LIMITED_EXTRA_REWARDS,LIMITED_NORMAL_RANKS,limitedNormalCards,limitedPackDraft,readLimitedPack,validateLimitedPack,limitedPackReadiness,limitedPackPrice,limitedPackCatalogRow,validateLimitedOpeningBody} from '../shared/mercenary-limited-pack-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {runJointOperation,readJointOperation,jointHash,jointCoinDebit,jointInventoryChange} from './_joint_transactions.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';
import {mercenaryRandomInt,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {validateMercenaryCardRules} from '../shared/mercenary-draw-policy-v1.mjs';
import {LIMITED_DAILY_CAP,limitedDailyStatus,limitedDailyLimitError} from '../shared/mercenary-limited-daily-v1.mjs';

export const LIMITED_PACK_SCHEMA=[
 "CREATE TABLE IF NOT EXISTS mercenary_limited_stock_v1(code TEXT PRIMARY KEY,stock_limit BIGINT,issued BIGINT NOT NULL DEFAULT 0 CHECK(issued>=0),revision BIGINT NOT NULL DEFAULT 0,last_token TEXT,CHECK((stock_limit IS NULL AND issued=0) OR (stock_limit>=issued AND stock_limit<=1000000)))",
 "CREATE TABLE IF NOT EXISTS mercenary_limited_issues_v1(acquisition_id TEXT PRIMARY KEY,request_id TEXT NOT NULL,user_id BIGINT NOT NULL,code TEXT NOT NULL,serial BIGINT NOT NULL CHECK(serial>0),created_at TEXT NOT NULL,UNIQUE(code,serial))",
 "CREATE INDEX IF NOT EXISTS mercenary_limited_issues_request_v1 ON mercenary_limited_issues_v1(user_id,request_id)"
];
// Explicit preparation/migration only. HTTP never performs DDL or seeds counters.
export async function ensureLimitedPackSchema(env){if(env.DB.execSchema)await env.DB.execSchema(LIMITED_PACK_SCHEMA);else for(const sql of LIMITED_PACK_SCHEMA)await env.DB.prepare(sql).run();}
const initialPolicy=()=>({revision:1,policy:limitedPolicyDraft(),updatedAt:null});
const initialPack=()=>({revision:0,settings:limitedPackDraft(),updatedAt:null});
const terminal=(code,message)=>Object.assign(jointError(code,message,409),{terminal:true});
const parse=(raw,fallback)=>raw===null?fallback():JSON.parse(raw);
export async function readLimitedPackState(env,{releaseEnabled=LIMITED_PACK_RELEASE_ENABLED}={}){
 const [settingsRows,stockRows,cms,normalDraw]=await Promise.all([
  env.DB.prepare('SELECT key,value FROM app_meta WHERE key IN (?,?)').bind(LIMITED_POLICY_KEY,LIMITED_PACK_KEY).all(),
  env.DB.prepare('SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 ORDER BY code').all(),
  readMercenaryDocument(env),env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first()
 ]);
 const values=new Map(settingsRows.results.map(r=>[r.key,r.value]));
 const rawPolicy=values.get(LIMITED_POLICY_KEY)??null,rawPack=values.get(LIMITED_PACK_KEY)??null;
 const old=parse(rawPolicy,initialPolicy),pack=parse(rawPack,initialPack);
 const policy=readLimitedPolicy(old.policy),settings=readLimitedPack(pack.settings,{releaseEnabled});
 const stock=LIMITED_MERCENARIES.map(card=>{const r=stockRows.results.find(s=>s.code===card.code);return {code:card.code,limit:settings.stockLimits[card.code],issued:Number(r?.issued||0),remaining:settings.stockLimits[card.code]===null?null:Math.max(0,settings.stockLimits[card.code]-Number(r?.issued||0))};});
 const normalRules=normalDraw?validateMercenaryCardRules(JSON.parse(normalDraw.payload_json).cardRules,MERCENARY_CMS_SEED.catalog.cards.map(c=>c.code)):null;
 const normalCards=normalRules?limitedNormalCards(cms.document.mercenaries,MERCENARY_CMS_SEED.catalog.cards,normalRules):[];
 const readiness=limitedPackReadiness(settings,policy,stock,normalCards);
 return {revision:Number(old.revision),packRevision:Number(pack.revision),policy,packSettings:settings,stock,cards:LIMITED_MERCENARIES,
  normalCards,normalCmsRevision:cms.revision,normalDrawRevision:Number(normalDraw?.revision||0),readiness:{ready:readiness.ready,blockers:readiness.blockers,totalPpm:readiness.totalPpm},
  releaseEnabled,userOpeningEnabled:releaseEnabled&&settings.mode==='ON'&&readiness.ready,rawPolicy,rawPack};
}
const publicState=state=>{const {rawPolicy,rawPack,...safe}=state;return safe;};
const dailyKey=(userId,day)=>'mercenary_limited_daily_v1:'+userId+':'+day;
export async function readLimitedPackDaily(env,userId,now=Date.now()){
 if(!userId)return limitedDailyStatus(null,now);
 const {day}=limitedDailyStatus(0,now),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(dailyKey(userId,day)).first();
 return limitedDailyStatus(Number(row?.value??0),now);
}
export async function limitedPackShopRow(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LIMITED_PACK_KEY).first();
 return limitedPackCatalogRow(row?readLimitedPack(JSON.parse(row.value).settings):limitedPackDraft());
}
export async function saveLimitedPack(env,actor,body){
 const keys=['expectedRevision','expectedPackRevision','policy','packSettings','requestId','reason'];
 if(!body||Object.keys(body).sort().join(',')!==keys.sort().join(',')||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||
 !Number.isSafeInteger(body.expectedPackRevision)||body.expectedPackRevision<0||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||
 typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.length>500||/[\u0000-\u001f]/.test(body.reason))throw jointError('MERCENARY_LIMITED_CONFIG','현재 버전·요청 번호·저장 사유를 확인하세요.');
 let policy,settings;
 try{policy=validateLimitedPolicy(body.policy);settings=validateLimitedPack(body.packSettings);}
 catch(e){throw jointError('MERCENARY_LIMITED_CONFIG',e.message);}
 const receiptKey='mercenary_limited_pack_save:'+body.requestId;
 const hash=await jointHash({actor:Number(actor.id),...body,requestId:undefined});
 const oldReceipt=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(receiptKey).first();
 if(oldReceipt){if(JSON.parse(oldReceipt.value).hash!==hash)throw jointError('MERCENARY_LIMITED_CONFLICT','같은 요청 번호에 다른 내용이 있습니다.',409);return {...publicState(await readLimitedPackState(env)),replayed:true};}
 const before=await readLimitedPackState(env);
 if(before.revision!==body.expectedRevision||before.packRevision!==body.expectedPackRevision)throw jointError('MERCENARY_LIMITED_CONFLICT','다른 창에서 설정을 변경했습니다. 새로 불러오세요.',409);
 for(const stock of before.stock)if(stock.issued>0&&(settings.stockLimits[stock.code]===null||settings.stockLimits[stock.code]<stock.issued))throw jointError('MERCENARY_LIMITED_STOCK_LIMIT','발행 한도를 이미 지급된 수량보다 낮출 수 없습니다.',409);
 if(settings.mode==='ON'){const ready=limitedPackReadiness(settings,policy,before.stock,before.normalCards);if(!ready.ready)throw jointError('MERCENARY_LIMITED_NOT_READY',ready.blockers.join(' '),409);}
 const now=new Date().toISOString(),nextPolicy={revision:before.revision+1,policy,updatedAt:now,updatedBy:Number(actor.id),lastRequestId:body.requestId};
 const nextPack={revision:before.packRevision+1,settings,updatedAt:now,updatedBy:Number(actor.id),lastRequestId:body.requestId};
 const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),token=crypto.randomUUID();
 const beforePolicy=before.rawPolicy??JSON.stringify(initialPolicy()),beforePack=before.rawPack??JSON.stringify(initialPack());
 const policyText=JSON.stringify(nextPolicy),packText=JSON.stringify(nextPack);
 // Conditional UPDATE takes the row lock before checking the previous value.
 // Also safe when two OWNER tabs save previously absent settings concurrently.
 const statements=[
  p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',LIMITED_POLICY_KEY,beforePolicy),
  p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',LIMITED_PACK_KEY,beforePack),
  p('UPDATE app_meta SET value=? WHERE key=? AND value=?',policyText,LIMITED_POLICY_KEY,beforePolicy),
  p('UPDATE app_meta SET value=? WHERE key=? AND value=?',packText,LIMITED_PACK_KEY,beforePack),
  jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[LIMITED_POLICY_KEY,policyText,LIMITED_PACK_KEY,packText])];
 for(const code of Object.keys(settings.stockLimits).sort())statements.push(p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET stock_limit=excluded.stock_limit,revision=mercenary_limited_stock_v1.revision+1',code,settings.stockLimits[code]));
 statements.push(p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',actor.id,'MERCENARY_LIMITED_PACK_SAVE','SETTING',LIMITED_PACK_KEY,JSON.stringify({policy:before.policy,packSettings:before.packSettings}),JSON.stringify({policy,packSettings:settings,reason:body.reason.trim(),requestId:body.requestId})),
  p('INSERT INTO app_meta(key,value) VALUES(?,?)',receiptKey,JSON.stringify({hash,revision:nextPolicy.revision,packRevision:nextPack.revision})),jointGuardEnd(DB,token));
 try{await DB.batch(statements);}
 catch(e){
  const saved=await p('SELECT value FROM app_meta WHERE key=?',receiptKey).first();
  if(saved&&JSON.parse(saved.value).hash===hash)return {...publicState(await readLimitedPackState(env)),replayed:true};
  const latest=await readLimitedPackState(env);
  if(latest.revision!==before.revision||latest.packRevision!==before.packRevision)throw jointError('MERCENARY_LIMITED_CONFLICT','다른 창에서 설정을 변경했습니다. 새로 불러오세요.',409);
  if(latest.stock.some(s=>s.issued>0&&(settings.stockLimits[s.code]===null||settings.stockLimits[s.code]<s.issued)))throw jointError('MERCENARY_LIMITED_STOCK_LIMIT','저장 중 추가 발행됐습니다. 발행 한도를 확인하세요.',409);
  throw e;
 }
 return {...publicState(await readLimitedPackState(env)),replayed:false};
}
function sample(random,max){const n=random(max);if(!Number.isSafeInteger(n)||n<0||n>=max)throw Error('Invalid random sample');return n;}
export function pickLimitedBatch(state,count,random=mercenaryRandomInt){
 const {packSettings:settings,policy}=state,used=Object.fromEntries(state.stock.map(r=>[r.code,r.issued]));
 const outcomes=[...['SS','SSS'].map(rank=>({id:'LIMITED_'+rank,rank,limited:true,chancePpm:policy.rankRatesPpm[rank]})),...LIMITED_NORMAL_RANKS.map(rank=>({id:'CARD_'+rank,rank,limited:false,chancePpm:settings.normalRankRatesPpm[rank]})),...settings.extraRewards];
 const draws=[];
 for(let i=0;i<count;i++){
  let n=sample(random,1000000);const outcome=outcomes.find(r=>{n-=r.chancePpm;return n<0;});
  if(!outcome)throw jointError('MERCENARY_LIMITED_CONFIG','개봉 확률 설정을 확인하세요.',409);
  if(!outcome.rank){draws.push({outcomeId:outcome.id,quantity:outcome.quantity});continue;}
  if(!outcome.limited){
   const pool=state.normalCards.filter(c=>c.rank===outcome.rank&&c.weight>0&&!isLimitedMercenary(c.code));
   if(!pool.length)throw terminal('MERCENARY_LIMITED_NORMAL_POOL','선택된 등급의 일반 용병이 없습니다. 코인은 차감되지 않았습니다.');
   let ticket=sample(random,pool.reduce((sum,c)=>sum+c.weight,0));const card=pool.find(c=>{ticket-=c.weight;return ticket<0;});
   draws.push({outcomeId:outcome.id,mercenaryCode:card.code,name:card.name,rank:card.rank,edition:'STANDARD',quantity:1,sourceArt:card.sourceArt});continue;
  }
  const pool=LIMITED_MERCENARIES.filter(c=>c.rank===outcome.rank&&policy.cardWeights[c.code]>0&&Number.isSafeInteger(settings.stockLimits[c.code])&&settings.stockLimits[c.code]>0&&settings.stockLimits[c.code]>(used[c.code]||0));
  if(!pool.length)throw terminal('MERCENARY_LIMITED_SOLD_OUT','선택한 횟수에 필요한 리미티드 잔여 수량이 없습니다. 코인은 차감되지 않았습니다.');
  let ticket=sample(random,pool.reduce((sum,c)=>sum+policy.cardWeights[c.code],0));
  const card=pool.find(c=>{ticket-=policy.cardWeights[c.code];return ticket<0;});used[card.code]=(used[card.code]||0)+1;
  draws.push({outcomeId:outcome.id,mercenaryCode:card.code,name:card.name,rank:card.rank,edition:'LIMITED',quantity:1,sourceArt:card.sourceArt});
 }
 return draws;
}
// Private factory dependency is for isolated tests; HTTP never accepts a release override.
export function createLimitedPackService({releaseEnabled=LIMITED_PACK_RELEASE_ENABLED,randomInt=mercenaryRandomInt,now=()=>Date.now()}={}){
 async function open(env,user,raw){
  if(!releaseEnabled)throw jointError('MERCENARY_LIMITED_DISABLED','리미티드 용병팩은 출시 준비 중입니다. 코인은 차감되지 않았습니다.',423);
  const body=validateLimitedOpeningBody(raw),{requestId,count,expectedRevision,expectedPolicyRevision}=body;
  let usageTime;
  const result=await runJointOperation(env,user,{requestId,kind:LIMITED_PACK_KIND,input:{count,expectedRevision,expectedPolicyRevision},
   prepare:async()=>{
    const state=await readLimitedPackState(env,{releaseEnabled});
    if(state.packSettings.mode!=='ON')throw terminal('MERCENARY_LIMITED_DISABLED','리미티드팩 개봉이 중지됐습니다.');
    if(state.packRevision!==expectedRevision||state.revision!==expectedPolicyRevision)throw terminal('MERCENARY_LIMITED_PRICE_CHANGED','가격 또는 확률이 변경됐습니다. 새 가격을 확인하세요.');
    if(!state.readiness.ready)throw terminal('MERCENARY_LIMITED_NOT_READY',state.readiness.blockers.join(' '));
    const daily=await readLimitedPackDaily(env,user.id,now());
    if(count>daily.remaining)throw limitedDailyLimitError(daily.remaining);
    const coinCost=limitedPackPrice(state.packSettings,count),wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
    if(!wallet||Number(wallet.coin)<coinCost)throw terminal('MERCENARY_LIMITED_FUNDS','코인이 부족합니다.');
    return {count,coinCost,draws:pickLimitedBatch(state,count,randomInt),packRevision:state.packRevision,policyRevision:state.revision,rawPack:state.rawPack,rawPolicy:state.rawPolicy};
   },
   statements:async plan=>{
    const state=await readLimitedPackState(env,{releaseEnabled});
    if(state.packSettings.mode!=='ON'||state.rawPack!==plan.rawPack||state.rawPolicy!==plan.rawPolicy)throw terminal('MERCENARY_LIMITED_POLICY_CHANGED','개봉 설정이 변경됐습니다. 저장된 미완료 요청을 취소했습니다.');
    usageTime=now();
    const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),grouped=new Map(),items=new Map(),token=crypto.randomUUID(),timestamp=new Date(usageTime).toISOString();
    const daily=await readLimitedPackDaily(env,user.id,usageTime),key=dailyKey(user.id,daily.day);
    if(plan.count>daily.remaining)throw limitedDailyLimitError(daily.remaining);
    plan.draws.forEach((r,i)=>{if(r.mercenaryCode){if(isLimitedMercenary(r.mercenaryCode)){if(!grouped.has(r.mercenaryCode))grouped.set(r.mercenaryCode,[]);grouped.get(r.mercenaryCode).push(i);}else if(!state.normalCards.some(c=>c.code===r.mercenaryCode&&c.rank===r.rank&&c.weight>0))throw terminal('MERCENARY_LIMITED_NORMAL_POOL','일반 용병 획득 설정이 변경됐습니다. 코인은 차감되지 않았습니다.');}else if(r.quantity){const code=LIMITED_EXTRA_REWARDS.find(m=>m.id===r.outcomeId)?.itemCode;if(!code)throw Error('Unknown limited reward');items.set(code,(items.get(code)||0)+r.quantity);}});
    for(const [code,indices] of grouped)if((state.stock.find(s=>s.code===code)?.remaining??0)<indices.length)throw terminal('MERCENARY_LIMITED_SOLD_OUT','다른 유저가 마지막 수량을 획득했습니다. 코인은 차감되지 않았습니다.');
    const list=[];
    if(DB.dialect==='postgres')list.push(p('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR SHARE',LIMITED_PACK_KEY,LIMITED_POLICY_KEY));
    list.push(jointGuard(DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[LIMITED_PACK_KEY,plan.rawPack,LIMITED_POLICY_KEY,plan.rawPolicy]));
    // runJointOperation locks this user's row first. Recheck inside that same
    // transaction so concurrent devices cannot exceed the cap. All outcomes count.
    const dailyToken=crypto.randomUUID();
    list.push(jointGuard(DB,dailyToken,'COALESCE((SELECT CAST(value AS BIGINT) FROM app_meta WHERE key=?),0)+?<=?',[key,plan.count,LIMITED_DAILY_CAP]),
     p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(app_meta.value AS BIGINT)+CAST(excluded.value AS BIGINT) AS TEXT)',key,String(plan.count)),jointGuardEnd(DB,dailyToken));
    // Stable code ordering prevents cross-card deadlocks; no global stock counter.
    for(const [code,indices] of [...grouped].sort(([a],[b])=>a.localeCompare(b))){
     const size=indices.length,claim=crypto.randomUUID();
     list.push(p('UPDATE mercenary_limited_stock_v1 SET issued=issued+?,revision=revision+1,last_token=? WHERE code=? AND issued+?<=stock_limit',size,claim,code,size),
      jointGuard(DB,claim,'EXISTS(SELECT 1 FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?)',[code,claim]),
      p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+excluded.total_copies,duplicate_count=user_mercenary_cards_v1.duplicate_count+excluded.total_copies,last_obtained_at=excluded.last_obtained_at',user.id,code,size,size-1,timestamp,timestamp));
     indices.forEach((index,j)=>{
      const aid=requestId+':'+index,offset=size-j-1;
      list.push(p('INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) SELECT ?,?,?,code,issued-?,? FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?',aid,requestId,user.id,offset,timestamp,code,claim),
       p('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT ?,user_id,mercenary_code,CASE WHEN total_copies-?>1 THEN 1 ELSE 0 END,total_copies-?,total_copies-?-1,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',aid,offset,offset,offset,timestamp,user.id,code));
     });
     list.push(jointGuardEnd(DB,claim));
    }
    plan.draws.forEach((r,i)=>{if(r.mercenaryCode&&!isLimitedMercenary(r.mercenaryCode))list.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:r.mercenaryCode,acquisitionId:requestId+':'+i}));});
    list.push(...jointCoinDebit(DB,user.id,plan.coinCost,'리미티드 용병팩 '+requestId));
    for(const [code,quantity] of items)list.push(...jointInventoryChange(DB,user.id,code,quantity,'리미티드 용병팩',requestId));
    list.push(jointGuardEnd(DB,token));return list;
   }
  }).catch(async error=>{
   // Failed batch is rolled back. Only classify quota/config failures after checking
   // fresh values; unknown failures keep their original durable plan for recovery.
   const row=await env.DB.prepare('SELECT status,plan_json FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND kind=?').bind(requestId,user.id,LIMITED_PACK_KIND).first();
   if(row?.status==='PENDING'){
    const plan=JSON.parse(row.plan_json),state=await readLimitedPackState(env,{releaseEnabled});
    const counts={};for(const r of plan.draws)if(isLimitedMercenary(r.mercenaryCode))counts[r.mercenaryCode]=(counts[r.mercenaryCode]||0)+1;
    const sold=Object.entries(counts).some(([code,n])=>(state.stock.find(s=>s.code===code)?.remaining??0)<n),changed=state.rawPack!==plan.rawPack||state.rawPolicy!==plan.rawPolicy;
    const daily=await readLimitedPackDaily(env,user.id,usageTime??now()),dailyExceeded=plan.count>daily.remaining;
    if(sold||changed||dailyExceeded){
     await env.DB.prepare("UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'").bind(new Date().toISOString(),requestId,user.id).run();
     if(dailyExceeded)throw limitedDailyLimitError(daily.remaining);
     throw terminal(sold?'MERCENARY_LIMITED_SOLD_OUT':'MERCENARY_LIMITED_POLICY_CHANGED',sold?'리미티드 잔여 수량이 소진됐습니다. 코인은 차감되지 않았습니다.':'설정이 변경되어 개봉을 취소했습니다. 코인은 차감되지 않았습니다.');
    }
   }
   throw error;
  });
  return receipt(env,user,result.requestId,result.replayed);
 }
 async function receipt(env,user,requestId,replayed=true){
  const op=await readJointOperation(env,user.id,requestId,LIMITED_PACK_KIND);
  if(op.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
  const ids=op.plan.draws.flatMap((r,i)=>r.mercenaryCode?[requestId+':'+i]:[]);
  const found=ids.length?(await env.DB.prepare(`SELECT a.acquisition_id,a.mercenary_code,l.serial,a.is_duplicate,a.total_copies_after,a.duplicate_count_after FROM mercenary_card_acquisitions_v1 a LEFT JOIN mercenary_limited_issues_v1 l ON l.acquisition_id=a.acquisition_id AND l.user_id=a.user_id AND l.code=a.mercenary_code WHERE a.user_id=? AND a.acquisition_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids).all()).results:[];
  const byId=new Map(found.map(r=>[r.acquisition_id,r])),draws=op.plan.draws.map((r,i)=>{if(!r.mercenaryCode)return r;const row=byId.get(requestId+':'+i),limited=isLimitedMercenary(r.mercenaryCode);if(!row||row.mercenary_code!==r.mercenaryCode||limited&&!row.serial)throw jointError('MERCENARY_LIMITED_RECEIPT','지급 영수증 확인이 필요합니다.',503);return {...r,edition:limited?'LIMITED':'STANDARD',...(limited?{serial:Number(row.serial)}:{}),duplicate:Boolean(Number(row.is_duplicate)),totalCopies:Number(row.total_copies_after),duplicateCount:Number(row.duplicate_count_after)};});
  const wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
  return {requestId,status:'COMPLETED',accountId:Number(user.id),count:op.plan.count,coinCost:op.plan.coinCost,coin:String(wallet.coin),draws,replayed,packRevision:op.plan.packRevision,policyRevision:op.plan.policyRevision,daily:await readLimitedPackDaily(env,user.id,now())};
 }
 return {open,receipt};
}
const service=createLimitedPackService();
export async function handleLimitedPack({path,request,env,deps}){
 if(![LIMITED_PACK.featurePath,LIMITED_PACK.openPath,LIMITED_PACK.receiptPath,LIMITED_PACK.adminPath].includes(path))return null;
 try{
  if(path===LIMITED_PACK.adminPath){
   const actor=await deps.requirePermission(request,env,'BATTLE_MANAGE');
   if(!actor||actor.role!=='OWNER')throw jointError('MERCENARY_LIMITED_PERMISSION','OWNER만 리미티드팩을 설정할 수 있습니다.',403);
   if(request.method==='GET')return deps.json(publicState(await readLimitedPackState(env)));
   if(request.method!=='PATCH')return deps.json({error:'지원하지 않는 요청입니다.'},405);
   return deps.json(await saveLimitedPack(env,actor,await readJointBody(request,{maxBytes:24000})));
  }
  if(path===LIMITED_PACK.featurePath){
   if(request.method!=='GET')return deps.json({error:'지원하지 않는 요청입니다.'},405);
   const user=await deps.authenticate(request,env);
   return deps.json({...publicState(await readLimitedPackState(env)),daily:await readLimitedPackDaily(env,user?.id)});
  }
  const user=await deps.authenticate(request,env);
  if(!user)throw jointError('MERCENARY_LIMITED_AUTH','로그인이 필요합니다.',401);
  if(path===LIMITED_PACK.receiptPath&&request.method==='GET')return deps.json(await service.receipt(env,user,new URL(request.url).searchParams.get('requestId')));
  if(path!==LIMITED_PACK.openPath||request.method!=='POST')return deps.json({error:'지원하지 않는 요청입니다.'},405);
  if(!LIMITED_PACK_RELEASE_ENABLED)throw jointError('MERCENARY_LIMITED_DISABLED','리미티드 용병팩은 출시 준비 중입니다. 코인은 차감되지 않았습니다.',423);
  const body=await readJointBody(request,{maxBytes:2048,fields:['requestId','count','expectedRevision','expectedPolicyRevision']});
  return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>service.open(env,user,body)));
 }catch(e){return jointResponseError(e,deps.json);}
}
