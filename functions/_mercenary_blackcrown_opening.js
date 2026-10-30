import {BLACKCROWN_CODES} from '../shared/mercenary-blackcrown-catalog-v1.mjs';
import {blackcrownOwnedCodes} from '../shared/mercenary-blackcrown-ownership-v1.mjs';
import {isBlackcrownLimited,blackcrownUnlimitedDraw} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {BLACKCROWN_PACK,BLACKCROWN_PACK_KEY,BLACKCROWN_OPEN_KIND,BLACKCROWN_PACK_RELEASE_ENABLED,blackcrownPackPrice,validateBlackcrownOpeningBody,pickBlackcrownBatch,pickBlackcrownNormalCard} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {limitedPackRandomInt} from './_mercenary_limited_pack.js';
import {mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';
import {runJointOperation,readJointOperation,jointCoinDebit,jointInventoryChange} from './_joint_transactions.js';
import {PRIME_MATERIAL,PRIME_MATERIAL_STOCK_CODE,primeMaterialDraw,isPrimeMaterialDraw,bloodmoonDrawCode} from '../shared/mercenary-prime-material-v1.mjs';
import {ensurePrimeMaterialCatalog} from './_mercenary_prime_material.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {jointError} from './_joint_request.js';
import {BLACKCROWN_BULK_FORMAT,blackcrownBulkQuote,pickBlackcrownBulk,addBlackcrownNormal} from '../shared/mercenary-blackcrown-bulk-v1.mjs';
import {createBlackcrownBulkRandom,blackcrownBulkAcquisitionStatements} from './_mercenary_blackcrown_bulk.js';
import {blackcrownOnceCode,blackcrownOnceStatements} from './_mercenary_blackcrown_once.js';

const blackcrown=isBlackcrownLimited;
const ordinaryAllowed=(state,r)=>state.normalCards.some(c=>c.code===r.mercenaryCode&&c.rank===r.rank&&c.weight>0)||Boolean(blackcrownUnlimitedDraw(r.mercenaryCode)&&r.rank==='SSS'&&r.edition==='STANDARD'&&state.settings.cardRatesPpm[r.mercenaryCode]>0);
const terminal=(code,message)=>Object.assign(jointError('MERCENARY_BLACKCROWN_'+code,message,409),{terminal:true});
// Only uncommitted, unavailable limited slots may change. Save their ordinary
// SSS replacement before charging so retries (including old pending plans) keep it.
async function reconcileBlackcrownStock(DB,userId,requestId,plan,state,randomInt){
 const before=JSON.stringify(plan),next=structuredClone(plan),remaining=new Map(state.stock.map(s=>[s.code,s.remaining]));
 // A pre-change PENDING plan has not paid or granted anything. Keep its slot,
 // probability and serial budget, but never issue a completed Prime mercenary.
 next.draws=next.draws.map(r=>r.mercenaryCode===PRIME_MATERIAL_STOCK_CODE?primeMaterialDraw(r):r);
 const bulk=next.format===BLACKCROWN_BULK_FORMAT;
 const indices=next.draws.map((_,i)=>i);
 for(const i of indices){
  const draw=next.draws[i],code=bloodmoonDrawCode(draw);if(!blackcrown(code))continue;
  const stock=state.stock.find(s=>s.code===code);
  if(!stock?.prepared)throw terminal('NOT_READY','리미티드 발행 수량을 확인해야 합니다.');
  if(remaining.get(stock.code)>0){remaining.set(stock.code,remaining.get(stock.code)-1);draw.stockLimit=stock.limit;}
  else{
   if(draw.guaranteed===true)throw terminal('ONCE_STOCK','카드 재고가 변경됐습니다. 코인은 차감되지 않았습니다.');
   if(BLACKCROWN_CODES.includes(code))throw terminal('CHANGED','SS 리미티드 재고가 변경됐습니다. 코인은 차감되지 않았습니다. 현재 확률로 다시 개봉하세요.');
   next.draws[i]={...pickBlackcrownNormalCard(state,'SSS',randomInt),...(bulk?{drawIndex:draw.drawIndex}:{})};
   (next.stockFallbacks??=[]).push({index:i,limitedCode:code,ordinaryCode:next.draws[i].mercenaryCode});
  }
 }
 if(bulk){for(const draw of next.draws)if(!blackcrown(bloodmoonDrawCode(draw)))addBlackcrownNormal(next.normalDraws,draw);next.draws=next.draws.filter(r=>blackcrown(bloodmoonDrawCode(r)));}
 const after=JSON.stringify(next);if(after===before)return;
 const saved=await DB.prepare("UPDATE joint_operations_v1 SET plan_json=? WHERE request_id=? AND user_id=? AND kind=? AND status='PENDING' AND plan_json=? RETURNING request_id").bind(after,requestId,userId,BLACKCROWN_OPEN_KIND,before).first();
 if(!saved)throw jointError('MERCENARY_BLACKCROWN_PLAN_CONFLICT','개봉 결과를 다시 확인하고 있습니다.',503);
 Object.assign(plan,next);
}
// No HTTP release override. Tests use this factory against isolated databases.
export function createBlackcrownPackService({readState,releaseEnabled=BLACKCROWN_PACK_RELEASE_ENABLED,randomInt=limitedPackRandomInt}={}){
 if(typeof readState!=='function')throw Error('Blackcrown state reader required');
 const stateFor=(env,user)=>readState(env,{releaseEnabled,userId:user.id});
 async function open(env,user,raw){
  if(!releaseEnabled)throw jointError('MERCENARY_BLACKCROWN_CLOSED','블랙크라운팩은 출시 준비 중입니다. 코인은 차감되지 않았습니다.',423);
  const {requestId,count,expectedRevision}=validateBlackcrownOpeningBody(raw);
  const bulk=Object.hasOwn(raw,'budget'),random=bulk&&randomInt===limitedPackRandomInt?createBlackcrownBulkRandom():randomInt;
  let result;
  // Each stock race replaces at least one still-limited slot. Retry the same
  // durable request, never the rank lottery, payment or an already completed receipt.
  for(let attempt=0;;attempt++){
   try{result=await runJointOperation(env,user,{requestId,kind:BLACKCROWN_OPEN_KIND,input:{count,expectedRevision,...(bulk?{budget:raw.budget}:{})},
   prepare:async()=>{
    const state=await stateFor(env,user);
    if(state.settings.mode!=='ON')throw terminal('CLOSED','블랙크라운팩 개봉이 중지됐습니다.');
    if(state.revision!==expectedRevision)throw terminal('CHANGED','가격·확률이 변경됐습니다. 새 설정을 확인하세요.');
    if(!state.readiness.ready)throw terminal('NOT_READY',state.readiness.blockers.join(' '));
    const quote=bulk?blackcrownBulkQuote(state.settings.prices,raw.budget):null;
    if(quote&&quote.count!==count)throw terminal('INPUT','사용 한도와 개봉 횟수가 일치하지 않습니다.');
    const coinCost=quote?quote.coinCost:blackcrownPackPrice(state.settings,count),wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
    if(!wallet||BigInt(wallet.coin)<BigInt(coinCost))throw terminal('FUNDS','코인이 부족합니다.');
    const firstLimitedCode=blackcrownOnceCode(state),onceSnapshot=state.oneTimeRewardState?.before??null,once=firstLimitedCode?{mercenaryCode:firstLimitedCode}:null;
    if(bulk)return {count,coinCost,budget:raw.budget,...pickBlackcrownBulk(state,count,random,{firstLimitedCode}),once,onceSnapshot,ownedCodes:state.ownedCodes,revision:state.revision,rawPack:state.rawPack,normalCmsRevision:state.normalCmsRevision,normalDrawRevision:state.normalDrawRevision};
    const draws=pickBlackcrownBatch(state,count,randomInt,{firstLimitedCode});
    return {count,coinCost,draws,once,onceSnapshot,ownedCodes:state.ownedCodes,revision:state.revision,rawPack:state.rawPack,normalCmsRevision:state.normalCmsRevision,normalDrawRevision:state.normalDrawRevision};
   },
   statements:async plan=>{
    const state=await stateFor(env,user);
    if(state.settings.mode!=='ON'||state.rawPack!==plan.rawPack||state.normalCmsRevision!==plan.normalCmsRevision||state.normalDrawRevision!==plan.normalDrawRevision)throw terminal('CHANGED','개봉 설정이 변경되어 미완료 요청을 취소했습니다.');
    if((state.oneTimeRewardState?.before??null)!==(plan.onceSnapshot??null))throw terminal('CHANGED','개봉 설정이 변경됐습니다. 새 개봉으로 다시 시도하세요.');
    if(JSON.stringify(blackcrownOwnedCodes(plan.ownedCodes))!==JSON.stringify(blackcrownOwnedCodes(state.ownedCodes)))throw terminal('CHANGED','보유 종류가 변경됐습니다. 현재 확률을 확인한 뒤 다시 개봉하세요.');
    await reconcileBlackcrownStock(env.DB,user.id,requestId,plan,state,random);
    if(plan.draws.some(isPrimeMaterialDraw))await ensurePrimeMaterialCatalog(env);
    const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),grouped=new Map(),token=crypto.randomUUID(),timestamp=new Date().toISOString();
    plan.draws.forEach((r,i)=>{
     const code=bloodmoonDrawCode(r);
     if((r.kind==='ITEM'||r.itemCode||r.stockCode)&&!isPrimeMaterialDraw(r))throw terminal('MATERIAL','재료 카드 지급 설정을 확인하세요.');
     if(blackcrown(code)){if(!grouped.has(code))grouped.set(code,[]);grouped.get(code).push(i);}
     else if(r.mercenaryCode&&!ordinaryAllowed(state,r))throw terminal('NORMAL_POOL','일반 용병 획득 설정이 변경됐습니다.');
    });
    for(const r of plan.normalDraws||[])if(!ordinaryAllowed(state,r))throw terminal('NORMAL_POOL','일반 용병 획득 설정이 변경됐습니다.');
    const list=blackcrownOnceStatements(DB,user.id,requestId,plan);
    list.push(jointGuard(DB,token+':ownership','(SELECT COALESCE(SUM(CASE mercenary_code '+BLACKCROWN_CODES.map((code,i)=>"WHEN '"+code+"' THEN "+2**i).join(' ')+" ELSE 0 END),0) FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN ("+BLACKCROWN_CODES.map(()=>'?').join(',')+') AND total_copies>0)=?',[user.id,...BLACKCROWN_CODES,plan.ownedCodes.reduce((mask,code)=>mask+2**BLACKCROWN_CODES.indexOf(code),0)]),jointGuardEnd(DB,token+':ownership'));
    if(DB.dialect==='postgres')list.push(p('SELECT key FROM app_meta WHERE key=? FOR SHARE',BLACKCROWN_PACK_KEY),p("SELECT doc_key FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE"),p('SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE'));
    list.push(jointGuard(DB,token,"EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM mercenary_cms_documents_v1 WHERE doc_key='config' AND revision=?) AND EXISTS(SELECT 1 FROM mercenary_draw_config_v1 WHERE id=1 AND revision=?) AND EXISTS(SELECT 1 FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND status='PENDING' AND plan_json=?)",[BLACKCROWN_PACK_KEY,plan.rawPack,plan.normalCmsRevision,plan.normalDrawRevision,requestId,user.id,JSON.stringify(plan)]));
    for(const [code,indices] of [...grouped].sort(([a],[b])=>a.localeCompare(b))){
     const size=indices.length,claim=crypto.randomUUID();
     list.push(p('UPDATE mercenary_limited_stock_v1 SET issued=issued+?,revision=revision+1,last_token=? WHERE code=? AND stock_limit=? AND issued+?<=stock_limit',size,claim,code,plan.draws[indices[0]].stockLimit,size),
      jointGuard(DB,claim,'EXISTS(SELECT 1 FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?)',[code,claim]));
     if(code!==PRIME_MATERIAL_STOCK_CODE)list.push(p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+excluded.total_copies,duplicate_count=user_mercenary_cards_v1.duplicate_count+excluded.total_copies,last_obtained_at=excluded.last_obtained_at',user.id,code,size,size-1,timestamp,timestamp));
     indices.forEach((index,j)=>{const aid=requestId+':'+(plan.draws[index].drawIndex??index),offset=size-j-1;
      list.push(p('INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) SELECT ?,?,?,code,issued-?,? FROM mercenary_limited_stock_v1 WHERE code=? AND last_token=?',aid,requestId,user.id,offset,timestamp,code,claim));
      if(code===PRIME_MATERIAL_STOCK_CODE)list.push(...jointInventoryChange(DB,user.id,PRIME_MATERIAL.code,1,'BLACKCROWN_PRIME_MATERIAL',aid));
      else list.push(p('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) SELECT ?,user_id,mercenary_code,CASE WHEN total_copies-?>1 THEN 1 ELSE 0 END,total_copies-?,total_copies-?-1,? FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?',aid,offset,offset,offset,timestamp,user.id,code));
     });list.push(jointGuardEnd(DB,claim));
    }
    plan.draws.forEach((r,i)=>{
     if(!r.mercenaryCode||blackcrown(r.mercenaryCode))return;
     if(blackcrownUnlimitedDraw(r.mercenaryCode))list.push(...blackcrownBulkAcquisitionStatements(DB,{userId:Number(user.id),requestId,draw:r,createdAt:timestamp,acquisitionIndex:i}));
     else list.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:r.mercenaryCode,acquisitionId:requestId+':'+i}));
    });
    for(const draw of plan.normalDraws||[])list.push(...blackcrownBulkAcquisitionStatements(DB,{userId:Number(user.id),requestId,draw,createdAt:timestamp}));
    list.push(...jointCoinDebit(DB,user.id,plan.coinCost,'블랙크라운팩 '+requestId),jointGuardEnd(DB,token));return list;
   }
  });break;}catch(error){
   if(error.code==='MERCENARY_BLACKCROWN_PLAN_CONFLICT'&&attempt<(bulk?3:count+1))continue;
   const row=await env.DB.prepare('SELECT status,plan_json FROM joint_operations_v1 WHERE request_id=? AND user_id=? AND kind=?').bind(requestId,user.id,BLACKCROWN_OPEN_KIND).first();
   if(row?.status==='PENDING'){
    const plan=JSON.parse(row.plan_json),state=await stateFor(env,user),counts={};
    for(const r of plan.draws){const code=bloodmoonDrawCode(r);if(blackcrown(code))counts[code]=(counts[code]||0)+1;}
    const stockChanged=Object.entries(counts).some(([code,n])=>{const stock=state.stock.find(s=>s.code===code);return stock?.prepared&&(stock.remaining<n||stock.limit!==plan.draws.find(r=>bloodmoonDrawCode(r)===code).stockLimit);});
    const changed=(state.oneTimeRewardState?.before??null)!==(plan.onceSnapshot??null)||JSON.stringify(blackcrownOwnedCodes(plan.ownedCodes))!==JSON.stringify(blackcrownOwnedCodes(state.ownedCodes))||state.rawPack!==plan.rawPack||state.normalCmsRevision!==plan.normalCmsRevision||state.normalDrawRevision!==plan.normalDrawRevision;
    if(changed){await env.DB.prepare("UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id=? AND user_id=? AND status='PENDING'").bind(new Date().toISOString(),requestId,user.id).run();throw terminal('CHANGED','설정이 변경되어 개봉을 취소했습니다. 코인은 차감되지 않았습니다.');}
    if(stockChanged&&attempt<(bulk?3:count+1))continue;
   }throw error;
   }
  }
  return receipt(env,user,result.requestId,result.replayed);
 }
 async function receipt(env,user,requestId,replayed=true){
  const op=await readJointOperation(env,user.id,requestId,BLACKCROWN_OPEN_KIND);
  if(op.status!=='COMPLETED')return {requestId,status:'PENDING',retryable:true};
  const bulk=op.plan.format===BLACKCROWN_BULK_FORMAT;
  const ids=[...op.plan.draws.flatMap((r,i)=>r.mercenaryCode?[requestId+':'+(r.drawIndex??i)]:[]),...(op.plan.normalDraws||[]).map(r=>requestId+':bulk:'+r.mercenaryCode)];
  const found=ids.length?(await env.DB.prepare(`SELECT a.acquisition_id,a.mercenary_code,l.serial,a.is_duplicate,a.total_copies_after,a.duplicate_count_after FROM mercenary_card_acquisitions_v1 a LEFT JOIN mercenary_limited_issues_v1 l ON l.acquisition_id=a.acquisition_id AND l.user_id=a.user_id AND l.code=a.mercenary_code WHERE a.user_id=? AND a.acquisition_id IN (${ids.map(()=>'?').join(',')})`).bind(user.id,...ids).all()).results:[];
  const itemRows=op.plan.draws.some(isPrimeMaterialDraw)?(await env.DB.prepare("SELECT l.acquisition_id,l.serial,i.change_amount,i.balance_after FROM mercenary_limited_issues_v1 l JOIN inventory_logs i ON i.reference_id=l.acquisition_id AND i.user_id=l.user_id WHERE l.request_id=? AND l.user_id=? AND l.code=? AND i.item_code=? AND i.reason='BLACKCROWN_PRIME_MATERIAL' AND i.reference_type='V3_JOINT'").bind(requestId,user.id,PRIME_MATERIAL_STOCK_CODE,PRIME_MATERIAL.code).all()).results:[];
  const byId=new Map(found.map(r=>[r.acquisition_id,r])),draws=op.plan.draws.map((r,i)=>{
   if(isPrimeMaterialDraw(r)){
    const rows=itemRows.filter(row=>row.acquisition_id===requestId+':'+(r.drawIndex??i)),row=rows[0];
    if(rows.length!==1||Number(row.change_amount)!==1||!(Number(row.serial)>0)||!(Number(row.balance_after)>=1))throw jointError('MERCENARY_BLACKCROWN_RECEIPT','재료 카드 지급 영수증 확인이 필요합니다.',503);
    return {...r,serial:Number(row.serial),totalQuantity:Number(row.balance_after)};
   }
   if(!r.mercenaryCode)return r;const row=byId.get(requestId+':'+(r.drawIndex??i)),limited=blackcrown(r.mercenaryCode);
   if(!row||row.mercenary_code!==r.mercenaryCode||limited&&!row.serial)throw jointError('MERCENARY_BLACKCROWN_RECEIPT','지급 영수증 확인이 필요합니다.',503);
   return {...r,...(limited?{serial:Number(row.serial)}:{}),duplicate:Boolean(Number(row.is_duplicate)),totalCopies:Number(row.total_copies_after),duplicateCount:Number(row.duplicate_count_after)};
  });
  const normalDraws=(op.plan.normalDraws||[]).map(r=>{
   const row=byId.get(requestId+':bulk:'+r.mercenaryCode);
   if(!row||row.mercenary_code!==r.mercenaryCode||Number(row.total_copies_after)<r.quantity)throw jointError('MERCENARY_BLACKCROWN_RECEIPT','대량 지급 영수증 확인이 필요합니다.',503);
   return {...r,duplicate:Boolean(Number(row.is_duplicate)),totalCopies:Number(row.total_copies_after),duplicateCount:Number(row.duplicate_count_after)};
  });
  const wallet=await env.DB.prepare('SELECT coin FROM users WHERE id=?').bind(user.id).first();
  return {requestId,status:'COMPLETED',packId:BLACKCROWN_PACK.id,accountId:Number(user.id),count:op.plan.count,coinCost:op.plan.coinCost,coin:String(wallet.coin),draws,...(bulk?{format:BLACKCROWN_BULK_FORMAT,budget:op.plan.budget,normalDraws,missCount:op.plan.missCount}:{}),replayed,revision:op.plan.revision};
 }
 return {open,receipt};
}
