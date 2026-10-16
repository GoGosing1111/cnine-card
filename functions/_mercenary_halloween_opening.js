import {HALLOWEEN_MERCENARIES} from '../shared/mercenary-halloween-catalog-v1.mjs';
import {HALLOWEEN_PACK,HALLOWEEN_PACK_KEY,HALLOWEEN_OPEN_KIND,HALLOWEEN_PACK_RELEASE_ENABLED,HALLOWEEN_SERVER_LIMIT,halloweenPackPrice,validateHalloweenOpeningBody,pickHalloweenBatch} from '../shared/mercenary-halloween-pack-v1.mjs';
import {limitedPackRandomInt} from './_mercenary_limited_pack.js';
import {mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {runJointOperation,readJointOperation,jointCoinDebit} from './_joint_transactions.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';

const halloween=code=>HALLOWEEN_MERCENARIES.some(c=>c.code===code);
const terminal=(code,message)=>Object.assign(jointError('MERCENARY_HALLOWEEN_'+code,message,409),{terminal:true});
// No HTTP release override. Tests use this factory against isolated databases.
export function createHalloweenPackService({readState,releaseEnabled=HALLOWEEN_PACK_RELEASE_ENABLED,randomInt=limitedPackRandomInt}={}){
 if(typeof readState!=='function')throw Error('Halloween state reader required');
 const stateFor=env=>readState(env,{releaseEnabled});
 async function open(env,user,raw){
  if(!releaseEnabled)throw jointError('MERCENARY_HALLOWEEN_CLOSED','할로윈팩은 출시 준비 중입니다. 코인은 차감되지 않았습니다.',423);
  const {requestId,count,expectedRevision}=validateHalloweenOpeningBody(raw);
  const result=await runJointOperation(env,user,{requestId,kind:HALLOWEEN_OPEN_KIND,input:{count,expectedRevision},
   prepare:async()=>{
    const state=await stateFor(env);
    if(state.settings.mode!=='ON')throw terminal('CLOSED','할로윈팩 개봉이 중지됐습니다.');
    if(state.revision!==expectedRevision)throw terminal('CHANGED','가격·확률이 변경됐습니다. 새 설정을 확인하세요.');
    if(!state.readiness.ready)throw terminal('NOT_READY',state.readiness.blockers.join(' '));
    const coinCost=halloweenPackPrice(state.settings,count),wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
    if(!wallet||BigInt(wallet.coin)<BigInt(coinCost))throw terminal('FUNDS','코인이 부족합니다.');
    return {count,coinCost,draws:pickHalloweenBatch(state,count,randomInt),revision:state.revision,rawPack:state.rawPack,normalCmsRevision:state.normalCmsRevision,normalDrawRevision:state.normalDrawRevision};
   },
   statements:async plan=>{
    const state=await stateFor(env);
    if(state.settings.mode!=='ON'||state.rawPack!==plan.rawPack||state.normalCmsRevision!==plan.normalCmsRevision||state.normalDrawRevision!==plan.normalDrawRevision)throw terminal('CHANGED','개봉 설정이 변경되어 미완료 요청을 취소했습니다.');
    const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),grouped=new Map(),token=crypto.randomUUID(),timestamp=new Date().toISOString();
    plan.draws.forEach((r,i)=>{
     if(halloween(r.mercenaryCode)){if(!grouped.has(r.mercenaryCode))grouped.set(r.mercenaryCode,[]);grouped.get(r.mercenaryCode).push(i);}
     else if(r.mercenaryCode&&!state.normalCards.some(c=>c.code===r.mercenaryCode&&c.rank===r.rank&&c.weight>0))throw terminal('NORMAL_POOL','일반 용병 획득 설정이 변경됐습니다.');
    });
    for(const [code,indices] of grouped)if((state.stock.find(s=>s.code===code)?.remaining??0)<indices.length)throw terminal('SOLD_OUT','다른 이용자가 한정 수량을 획득했습니다. 코인은 차감되지 않았습니다.');
    const list=[];
    if(DB.dialect==='postgres')list.push(p('SELECT key FROM app_meta WHERE key=? FOR SHARE',HALLOWEEN_PACK_KEY),p("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"),p('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE'));
    list.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=?) AND EXISTS(SELECT 1 FROM mercenary_draw_config_v1 WHERE id=1 AND revision=?)",[HALLOWEEN_PACK_KEY,plan.rawPack,plan.normalCmsRevision,plan.normalDrawRevision]));
    for(const [code,indices] of [...grouped].sort(([a],[b])=>a.localeCompare(b))){
     const size=indices.length,claim=crypto.randomUUID();
     list.push(p('UPDATE mercenary_limited_stock_v1 SET issued=issued+?,revision=revision+1,last_token=? WHERE code=? AND stock_limit=? AND issued+?<=stock_limit',size,claim,code,HALLOWEEN_SERVER_LIMIT,size),
      jointGuard(DB,claim,'EXISTS(SELECT 1 FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?)',[code,claim]),
      p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+excluded.total_copies,duplicate_count=user_mercenary_cards_v1.duplicate_count+excluded.total_copies,last_obtained_at=excluded.last_obtained_at',user.id,code,size,size-1,timestamp,timestamp));
     indices.forEach((index,j)=>{const aid=requestId+':'+index,offset=size-j-1;
      list.push(p('INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) SELECT ?,?,?,code,issued-?,? FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?',aid,requestId,user.id,offset,timestamp,code,claim),
       p('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT ?,user_id,mercenary_code,CASE WHEN total_copies-?>1 THEN 1 ELSE 0 END,total_copies-?,total_copies-?-1,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',aid,offset,offset,offset,timestamp,user.id,code));
     });list.push(jointGuardEnd(DB,claim));
    }
    plan.draws.forEach((r,i)=>{if(r.mercenaryCode&&!halloween(r.mercenaryCode))list.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:r.mercenaryCode,acquisitionId:requestId+':'+i}));});
    list.push(...jointCoinDebit(DB,user.id,plan.coinCost,'할로윈 리미티드 용병팩 '+requestId),jointGuardEnd(DB,token));return list;
   }
  }).catch(async error=>{
   const row=await env.DB.prepare('SELECT status,plan_json FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND kind=?').bind(requestId,user.id,HALLOWEEN_OPEN_KIND).first();
   if(row?.status==='PENDING'){
    const plan=JSON.parse(row.plan_json),state=await stateFor(env),counts={};
    for(const r of plan.draws)if(halloween(r.mercenaryCode))counts[r.mercenaryCode]=(counts[r.mercenaryCode]||0)+1;
    const sold=Object.entries(counts).some(([code,n])=>(state.stock.find(s=>s.code===code)?.remaining??0)<n),changed=state.rawPack!==plan.rawPack||state.normalCmsRevision!==plan.normalCmsRevision||state.normalDrawRevision!==plan.normalDrawRevision;
    if(sold||changed){await env.DB.prepare("UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'").bind(new Date().toISOString(),requestId,user.id).run();throw terminal(sold?'SOLD_OUT':'CHANGED',sold?'할로윈 한정 수량이 소진됐습니다. 코인은 차감되지 않았습니다.':'설정이 변경되어 개봉을 취소했습니다. 코인은 차감되지 않았습니다.');}
   }throw error;
  });
  return receipt(env,user,result.requestId,result.replayed);
 }
 async function receipt(env,user,requestId,replayed=true){
  const op=await readJointOperation(env,user.id,requestId,HALLOWEEN_OPEN_KIND);
  if(op.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
  const ids=op.plan.draws.flatMap((r,i)=>r.mercenaryCode?[requestId+':'+i]:[]);
  const found=ids.length?(await env.DB.prepare(`SELECT a.acquisition_id,a.mercenary_code,l.serial,a.is_duplicate,a.total_copies_after,a.duplicate_count_after FROM mercenary_card_acquisitions_v1 a LEFT JOIN mercenary_limited_issues_v1 l ON l.acquisition_id=a.acquisition_id AND l.user_id=a.user_id AND l.code=a.mercenary_code WHERE a.user_id=? AND a.acquisition_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids).all()).results:[];
  const byId=new Map(found.map(r=>[r.acquisition_id,r])),draws=op.plan.draws.map((r,i)=>{
   if(!r.mercenaryCode)return r;const row=byId.get(requestId+':'+i),limited=halloween(r.mercenaryCode);
   if(!row||row.mercenary_code!==r.mercenaryCode||limited&&!row.serial)throw jointError('MERCENARY_HALLOWEEN_RECEIPT','지급 영수증 확인이 필요합니다.',503);
   return {...r,...(limited?{serial:Number(row.serial)}:{}),duplicate:Boolean(Number(row.is_duplicate)),totalCopies:Number(row.total_copies_after),duplicateCount:Number(row.duplicate_count_after)};
  });
  const wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
  return {requestId,status:'COMPLETED',packId:HALLOWEEN_PACK.id,accountId:Number(user.id),count:op.plan.count,coinCost:op.plan.coinCost,coin:String(wallet.coin),draws,replayed,revision:op.plan.revision};
 }
 return {open,receipt};
}
