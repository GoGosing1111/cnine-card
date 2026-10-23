import {BLOODMOON_PACK_CARDS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {BLOODMOON_PACK,BLOODMOON_PACK_KEY,BLOODMOON_OPEN_KIND,BLOODMOON_PACK_RELEASE_ENABLED,bloodmoonPackPrice,validateBloodmoonOpeningBody,pickBloodmoonBatch,pickBloodmoonNormalCard} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {limitedPackRandomInt} from './_mercenary_limited_pack.js';
import {mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {runJointOperation,readJointOperation,jointCoinDebit} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';
import {readBloodmoonSsOnce,pickBloodmoonSsOnceCode,consumeBloodmoonSsOnce} from './_mercenary_bloodmoon_once.js';

const bloodmoon=code=>BLOODMOON_PACK_CARDS.some(c=>c.code===code);
const terminal=(code,message)=>Object.assign(jointError('MERCENARY_BLOODMOON_'+code,message,409),{terminal:true});
// Only uncommitted, unavailable limited slots may change. Save their ordinary
// SSS replacement before charging so retries (including old pending plans) keep it.
async function reconcileBloodmoonStock(DB,userId,requestId,plan,state,randomInt){
 const before=JSON.stringify(plan),next=structuredClone(plan),remaining=new Map(state.stock.map(s=>[s.code,s.remaining]));
 // Reserve the explicitly guaranteed slot before ordinary results compete for
 // the remaining serials during a stock race. Legacy guarantees still use 0.
 const guaranteedIndex=next.once?.slotIndex??0;
 const indices=next.draws.map((_,i)=>i);
 if(next.once&&guaranteedIndex>0)indices.unshift(...indices.splice(guaranteedIndex,1));
 for(const i of indices){
  const draw=next.draws[i];if(!bloodmoon(draw.mercenaryCode))continue;
  const stock=state.stock.find(s=>s.code===draw.mercenaryCode);
  if(!stock?.prepared)throw terminal('NOT_READY','리미티드 발행 수량을 확인해야 합니다.');
  if(remaining.get(stock.code)>0){remaining.set(stock.code,remaining.get(stock.code)-1);draw.stockLimit=stock.limit;}
  else{
   next.draws[i]=pickBloodmoonNormalCard(state,'SSS',randomInt);
   (next.stockFallbacks??=[]).push({index:i,limitedCode:draw.mercenaryCode,ordinaryCode:next.draws[i].mercenaryCode});
  }
 }
 const after=JSON.stringify(next);if(after===before)return;
 const saved=await DB.prepare("UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=? AND user_id=? AND kind=? AND status='PENDING' AND plan_json=? RETURNING request_id").bind(after,requestId,userId,BLOODMOON_OPEN_KIND,before).first();
 if(!saved)throw jointError('MERCENARY_BLOODMOON_PLAN_CONFLICT','개봉 결과를 다시 확인하고 있습니다.',503);
 Object.assign(plan,next);
}
// No HTTP release override. Tests use this factory against isolated databases.
export function createBloodmoonPackService({readState,releaseEnabled=BLOODMOON_PACK_RELEASE_ENABLED,randomInt=limitedPackRandomInt}={}){
 if(typeof readState!=='function')throw Error('Bloodmoon state reader required');
 const stateFor=env=>readState(env,{releaseEnabled});
 async function open(env,user,raw){
  if(!releaseEnabled)throw jointError('MERCENARY_BLOODMOON_CLOSED','블러드팩은 출시 준비 중입니다. 코인은 차감되지 않았습니다.',423);
  const {requestId,count,expectedRevision}=validateBloodmoonOpeningBody(raw);
  let result;
  // Each stock race replaces at least one still-limited slot. Retry the same
  // durable request, never the rank lottery, payment or an already completed receipt.
  for(let attempt=0;;attempt++){
   try{result=await runJointOperation(env,user,{requestId,kind:BLOODMOON_OPEN_KIND,input:{count,expectedRevision},
   prepare:async()=>{
    const state=await stateFor(env);
    if(state.settings.mode!=='ON')throw terminal('CLOSED','블러드팩 개봉이 중지됐습니다.');
    if(state.revision!==expectedRevision)throw terminal('CHANGED','가격·확률이 변경됐습니다. 새 설정을 확인하세요.');
    if(!state.readiness.ready)throw terminal('NOT_READY',state.readiness.blockers.join(' '));
    const coinCost=bloodmoonPackPrice(state.settings,count),wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
    if(!wallet||BigInt(wallet.coin)<BigInt(coinCost))throw terminal('FUNDS','코인이 부족합니다.');
    const configuredOnce=await readBloodmoonSsOnce(env.DB,user.id);
    // A single opening cannot consume a guarantee for a later batch slot.
    const once=configuredOnce&&(configuredOnce.slotIndex??0)<count?configuredOnce:null;
    const firstLimitedCode=once?pickBloodmoonSsOnceCode(state,randomInt,once):null;
    const draws=pickBloodmoonBatch(state,count,randomInt,{firstLimitedCode});
    // Generate the guaranteed card first to reserve its stock, then place it
    // in the requested slot without rerolling the ordinary results.
    if(firstLimitedCode&&once.slotIndex){const [guaranteed]=draws.splice(0,1);draws.splice(once.slotIndex,0,guaranteed);}
    return {count,coinCost,draws,...(once&&firstLimitedCode?{once}:{}),revision:state.revision,rawPack:state.rawPack,normalCmsRevision:state.normalCmsRevision,normalDrawRevision:state.normalDrawRevision};
   },
   statements:async plan=>{
    const state=await stateFor(env);
    if(state.settings.mode!=='ON'||state.rawPack!==plan.rawPack||state.normalCmsRevision!==plan.normalCmsRevision||state.normalDrawRevision!==plan.normalDrawRevision)throw terminal('CHANGED','개봉 설정이 변경되어 미완료 요청을 취소했습니다.');
    await reconcileBloodmoonStock(env.DB,user.id,requestId,plan,state,randomInt);
    const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),grouped=new Map(),token=crypto.randomUUID(),timestamp=new Date().toISOString();
    plan.draws.forEach((r,i)=>{
     if(bloodmoon(r.mercenaryCode)){if(!grouped.has(r.mercenaryCode))grouped.set(r.mercenaryCode,[]);grouped.get(r.mercenaryCode).push(i);}
     else if(r.mercenaryCode&&!state.normalCards.some(c=>c.code===r.mercenaryCode&&c.rank===r.rank&&c.weight>0))throw terminal('NORMAL_POOL','일반 용병 획득 설정이 변경됐습니다.');
    });
    // A stock-race fallback must not consume a separately armed guarantee.
    const guaranteedDraw=plan.draws[plan.once?.slotIndex??0];
    const list=await consumeBloodmoonSsOnce(DB,user.id,requestId,bloodmoon(guaranteedDraw?.mercenaryCode)?plan.once:null,guaranteedDraw);
    if(DB.dialect==='postgres')list.push(p('SELECT key FROM app_meta WHERE key=? FOR SHARE',BLOODMOON_PACK_KEY),p("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"),p('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE'));
    list.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=?) AND EXISTS(SELECT 1 FROM mercenary_draw_config_v1 WHERE id=1 AND revision=?) AND EXISTS(SELECT 1 FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND status='PENDING' AND plan_json=?)",[BLOODMOON_PACK_KEY,plan.rawPack,plan.normalCmsRevision,plan.normalDrawRevision,requestId,user.id,JSON.stringify(plan)]));
    for(const [code,indices] of [...grouped].sort(([a],[b])=>a.localeCompare(b))){
     const size=indices.length,claim=crypto.randomUUID();
     list.push(p('UPDATE mercenary_limited_stock_v1 SET issued=issued+?,revision=revision+1,last_token=? WHERE code=? AND stock_limit=? AND issued+?<=stock_limit',size,claim,code,plan.draws[indices[0]].stockLimit,size),
      jointGuard(DB,claim,'EXISTS(SELECT 1 FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?)',[code,claim]),
      p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+excluded.total_copies,duplicate_count=user_mercenary_cards_v1.duplicate_count+excluded.total_copies,last_obtained_at=excluded.last_obtained_at',user.id,code,size,size-1,timestamp,timestamp));
     indices.forEach((index,j)=>{const aid=requestId+':'+index,offset=size-j-1;
      list.push(p('INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) SELECT ?,?,?,code,issued-?,? FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?',aid,requestId,user.id,offset,timestamp,code,claim),
       p('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT ?,user_id,mercenary_code,CASE WHEN total_copies-?>1 THEN 1 ELSE 0 END,total_copies-?,total_copies-?-1,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',aid,offset,offset,offset,timestamp,user.id,code));
     });list.push(jointGuardEnd(DB,claim));
    }
    plan.draws.forEach((r,i)=>{if(r.mercenaryCode&&!bloodmoon(r.mercenaryCode))list.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:r.mercenaryCode,acquisitionId:requestId+':'+i}));});
    list.push(...jointCoinDebit(DB,user.id,plan.coinCost,'블러드 리미티드 용병팩 '+requestId),jointGuardEnd(DB,token));return list;
   }
  });break;}catch(error){
   if(error.code==='MERCENARY_BLOODMOON_PLAN_CONFLICT'&&attempt<=count)continue;
   const row=await env.DB.prepare('SELECT status,plan_json FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND kind=?').bind(requestId,user.id,BLOODMOON_OPEN_KIND).first();
   if(row?.status==='PENDING'){
    const plan=JSON.parse(row.plan_json),state=await stateFor(env),counts={};
    for(const r of plan.draws)if(bloodmoon(r.mercenaryCode))counts[r.mercenaryCode]=(counts[r.mercenaryCode]||0)+1;
    const stockChanged=Object.entries(counts).some(([code,n])=>{const stock=state.stock.find(s=>s.code===code);return stock?.prepared&&(stock.remaining<n||stock.limit!==plan.draws.find(r=>r.mercenaryCode===code).stockLimit);});
    const changed=state.rawPack!==plan.rawPack||state.normalCmsRevision!==plan.normalCmsRevision||state.normalDrawRevision!==plan.normalDrawRevision;
    if(changed){await env.DB.prepare("UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'").bind(new Date().toISOString(),requestId,user.id).run();throw terminal('CHANGED','설정이 변경되어 개봉을 취소했습니다. 코인은 차감되지 않았습니다.');}
    if(stockChanged&&attempt<=count)continue;
   }throw error;
   }
  }
  return receipt(env,user,result.requestId,result.replayed);
 }
 async function receipt(env,user,requestId,replayed=true){
  const op=await readJointOperation(env,user.id,requestId,BLOODMOON_OPEN_KIND);
  if(op.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
  const ids=op.plan.draws.flatMap((r,i)=>r.mercenaryCode?[requestId+':'+i]:[]);
  const found=ids.length?(await env.DB.prepare(`SELECT a.acquisition_id,a.mercenary_code,l.serial,a.is_duplicate,a.total_copies_after,a.duplicate_count_after FROM mercenary_card_acquisitions_v1 a LEFT JOIN mercenary_limited_issues_v1 l ON l.acquisition_id=a.acquisition_id AND l.user_id=a.user_id AND l.code=a.mercenary_code WHERE a.user_id=? AND a.acquisition_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids).all()).results:[];
  const byId=new Map(found.map(r=>[r.acquisition_id,r])),draws=op.plan.draws.map((r,i)=>{
   if(!r.mercenaryCode)return r;const row=byId.get(requestId+':'+i),limited=bloodmoon(r.mercenaryCode);
   if(!row||row.mercenary_code!==r.mercenaryCode||limited&&!row.serial)throw jointError('MERCENARY_BLOODMOON_RECEIPT','지급 영수증 확인이 필요합니다.',503);
   return {...r,...(limited?{serial:Number(row.serial)}:{}),duplicate:Boolean(Number(row.is_duplicate)),totalCopies:Number(row.total_copies_after),duplicateCount:Number(row.duplicate_count_after)};
  });
  const wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
  return {requestId,status:'COMPLETED',packId:BLOODMOON_PACK.id,accountId:Number(user.id),count:op.plan.count,coinCost:op.plan.coinCost,coin:String(wallet.coin),draws,replayed,revision:op.plan.revision};
 }
 return {open,receipt};
}
