import {ULTIMATE_BULK,ultimateBulkCount,ultimateBulkCost,validateUltimateBulkReceipt} from '../shared/ultimate-pack-bulk-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';

const fail=(code,message,status=400)=>jointError('JOINT_ULTIMATE_'+code,message,status);
const int=value=>Math.max(0,Number(value)||0);
const compact=card=>({id:String(card.id),title:String(card.title||''),grade:String(card.grade)});

// Use the ordinary pack sampler and the same 100-card rules, without making
// 1,000 HTTP requests or constructing/storing 100,000 card result objects.
export function sampleUltimateBulk({context,pack,count,critical,stock,draw,order,random=Math.random}){
  ultimateBulkCount(count);const rows=new Map(),limited=[],limitedLogs=[],remaining=new Map(stock.map(c=>[String(c.id),Math.max(0,Number(c.limited_total)-Number(c.issued_count))]));
  let criticalBlocks=0;
  for(let start=0;start<count;start+=100){
    const criticalHit=critical.enabled===true&&random()*100<critical.chance,bonus=criticalHit?Number(critical.bonus)||0:0;
    if(criticalHit)criticalBlocks++;
    const block=[];let limitedDrawn=false;
    for(let index=0;index<100;index++){
      const minimum=index%10===9&&pack.guarantee_10&&!block.slice(index-9).some(c=>order[c.grade]>=order[pack.guarantee_10])?pack.guarantee_10:null;
      const card=draw(context,pack,minimum,!limitedDrawn,bonus);
      if(!card?.id)throw fail('POOL','현재 추첨할 수 있는 카드가 없습니다.');
      block.push(card);if(card.grade==='LIMITED')limitedDrawn=true;
    }
    block.sort((a,b)=>order[b.grade]-order[a.grade]);
    for(let index=0;index<block.length;index++){
      let card=block[index];
      if(card.limited_total!==null&&card.limited_total!==undefined){
        const available=remaining.get(String(card.id))||0;
        if(available>0){remaining.set(String(card.id),available-1);limited.push({cardId:String(card.id),slot:start+index});}
        else card=draw(context,pack,null,false,bonus);
      }
      if(!card?.id)throw fail('POOL','품절 카드의 대체 결과를 확인하지 못했습니다.');
      if(card.grade==='LIMITED')limitedLogs.push({cardId:String(card.id),slot:start+index});
      const id=String(card.id),row=rows.get(id)||{card,count:0};row.count++;rows.set(id,row);
    }
  }
  return {rows:[...rows.values()],limited,limitedLogs,criticalBlocks};
}

export function createUltimateBulkService(deps){
  const {loadContext,criticalSettings,draw,order,shardRewards}=deps;
  async function stored(env,user,requestId,body){
    const row=await env.DB.prepare('SELECT user_id,pack_id,draw_count,status,cost,response_json FROM draw_request_receipts_v2 WHERE request_id=?').bind(requestId).first();
    if(!row)return null;
    if(Number(row.user_id)!==Number(user.id)||row.pack_id!==ULTIMATE_BULK.receiptPack||(body&&(Number(row.draw_count)!==body.count||Number(row.cost)!==body.expectedCost)))throw fail('CONFLICT','이미 다른 구매에 사용된 요청 번호입니다.',409);
    if(row.status!=='COMPLETED'||!row.response_json)throw fail('RECEIPT','이전 지급 기록을 확인해야 합니다. 새로 결제하지 않습니다.',409);
    return validateUltimateBulkReceipt(JSON.parse(row.response_json),{requestId,userId:user.id});
  }
  async function hydrate(env,user,receipt,replayed=false){
    const ids=JSON.stringify(receipt.results.map(r=>r.card.id)),DB=env.DB;
    const rows=await DB.batch([
      DB.prepare('SELECT coin,card_shards FROM users WHERE id=?').bind(user.id),
      DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'").bind(user.id),
      DB.prepare('SELECT card_id,quantity,breakthrough_level FROM user_cards WHERE user_id=? AND card_id IN (SELECT value FROM json_each(?))').bind(user.id,ids),
      DB.prepare('SELECT id,image_url AS image,focus_x AS focusX,focus_y AS focusY FROM cards_effective_v1210 WHERE id IN (SELECT value FROM json_each(?))').bind(ids)
    ]);
    const images=new Map((rows[3].results||[]).map(c=>[String(c.id),c]));
    return {...receipt,replayed,results:receipt.results.map(row=>({...row,card:{...images.get(row.card.id),...row.card}})),current:{coin:Number(rows[0].results[0].coin),cardShards:Number(rows[0].results[0].card_shards),masterStars:Number(rows[1].results[0]?.quantity||0),cards:rows[2].results}};
  }
  async function open(env,user,body){
    const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v),requestId=String(body.requestId||'');
    try{ultimateBulkCount(body.count);}catch(e){throw fail('COUNT',e.message);}
    if(!/^ult-\d{13}-[a-zA-Z0-9_-]{16,64}$/.test(requestId)||!Number.isSafeInteger(body.expectedCost)||body.expectedCost<=0)throw fail('INPUT','구매 수량·가격·요청 번호를 확인하세요.');
    const prior=await stored(env,user,requestId,body);if(prior)return hydrate(env,user,prior,true);
    const age=Date.now()-Number(requestId.split('-')[1]);
    if(age>ULTIMATE_BULK.maxAgeMs||age< -60000)throw fail('EXPIRED','오래된 구매 요청입니다. 운영자에게 지급 기록 확인을 요청하세요.',409);
    for(let attempt=0;attempt<3;attempt++){
      const base=await DB.batch([
        p("SELECT * FROM card_packs WHERE id='ultimate' AND is_active=1"),
        p('SELECT coin,card_shards FROM users WHERE id=?',user.id),
        p("SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'",user.id),
        p("SELECT id,limited_total,issued_count FROM cards WHERE limited_total IS NOT NULL"),
        p('SELECT request_id FROM draw_active_lock_v1480 WHERE user_id=? AND lease_until_ms>?',user.id,Date.now())
      ]);
      if(base[4].results.length)throw fail('BUSY','진행 중인 카드 개봉이 끝난 뒤 다시 시도하세요.',409);
      const pack=base[0].results[0],account=base[1].results[0],stars=int(base[2].results[0]?.quantity),stock=base[3].results;
      if(!pack)throw fail('CLOSED','얼티메이트팩은 현재 판매 중이 아닙니다.',423);
      const cost=ultimateBulkCost(Number(pack.price),body.count);
      if(cost!==body.expectedCost)throw fail('PRICE','가격이 변경되었습니다. 최신 가격을 확인하세요.',409);
      if(!account||Number(account.coin)<cost)throw fail('COIN','코인이 부족합니다.');
      const [context,critical]=await Promise.all([(attempt>0&&deps.queryContext?deps.queryContext:loadContext)(env,pack),criticalSettings(env)]);
      const plan=sampleUltimateBulk({context,pack,count:body.count,critical,stock,draw,order});
      const ids=JSON.stringify(plan.rows.map(r=>String(r.card.id))),owned=(await p('SELECT card_id,quantity,breakthrough_level FROM user_cards WHERE user_id=? AND card_id IN (SELECT value FROM json_each(?))',user.id,ids).all()).results;
      const quantities=new Map(owned.map(r=>[String(r.card_id),int(r.quantity)]));
      const results=plan.rows.map(row=>{
        const before=quantities.get(String(row.card.id))||0,duplicateCount=row.count-(before===0?1:0);
        return {card:compact(row.card),count:row.count,quantityBefore:before,quantityAfter:before+row.count,duplicateCount,shardGained:duplicateCount*int(shardRewards[row.card.grade]),masterStarGained:['MA','LIMITED'].includes(row.card.grade)?duplicateCount:0};
      }).sort((a,b)=>order[b.card.grade]-order[a.card.grade]||a.card.id.localeCompare(b.card.id));
      const shardTotal=results.reduce((n,r)=>n+r.shardGained,0),masterStarTotal=results.reduce((n,r)=>n+r.masterStarGained,0);
      const receipt=validateUltimateBulkReceipt({format:ULTIMATE_BULK.format,status:'COMPLETED',packId:'ultimate',requestId,userId:Number(user.id),count:body.count,unitPrice:Number(pack.price),cost,coinBefore:Number(account.coin),coinAfter:Number(account.coin)-cost,shardTotal,masterStarTotal,criticalBlocks:plan.criticalBlocks,blocks:body.count/100,results});
      const token=crypto.randomUUID(),list=[];
      if(DB.dialect==='postgres')list.push(p('SELECT id FROM users WHERE id=? FOR UPDATE',user.id));
      list.push(jointGuard(DB,token,"NOT EXISTS(SELECT 1 FROM draw_request_receipts_v2 WHERE request_id=?) AND EXISTS(SELECT 1 FROM card_packs WHERE id='ultimate' AND is_active=1 AND price=?) AND EXISTS(SELECT 1 FROM users WHERE id=? AND coin=? AND card_shards=?) AND COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'),0)=?",[requestId,pack.price,user.id,Number(account.coin),Number(account.card_shards),user.id,stars]));
      // Verify every selected card and its prior ownership within the same commit.
      for(let offset=0;offset<results.length;offset+=30){
        const chunk=results.slice(offset,offset+30),conditions=chunk.map(()=>"EXISTS(SELECT 1 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=? AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1) AND COALESCE((SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?),0)=?").join(' AND '),args=chunk.flatMap(r=>[r.card.id,user.id,r.card.id,r.quantityBefore]);
        list.push(p(`UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN ${conditions} THEN 1 ELSE 0 END WHERE token=?`,...args,token));
      }
      const stockMap=new Map(stock.map(r=>[String(r.id),r]));
      for(const row of results.filter(r=>plan.limited.some(l=>l.cardId===r.card.id))){
        const before=stockMap.get(row.card.id),after=Number(before.issued_count)+row.count;
        const update='UPDATE cards SET issued_count=issued_count+? WHERE id=? AND issued_count=? AND limited_total>=?';
        if(DB.dialect==='postgres')list.push(p(`WITH changed AS (${update} RETURNING id) UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN (SELECT COUNT(*) FROM changed)=1 THEN 1 ELSE 0 END WHERE token=?`,row.count,row.card.id,Number(before.issued_count),after,token));
        else list.push(p(update,row.count,row.card.id,Number(before.issued_count),after),p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN changes()=1 THEN 1 ELSE 0 END WHERE token=?',token));
      }
      list.push(p('UPDATE users SET coin=coin-?,card_shards=card_shards+? WHERE id=?',cost,shardTotal,user.id));
      for(let offset=0;offset<results.length;offset+=30){const chunk=results.slice(offset,offset+30);list.push(p(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES ${chunk.map(()=>'(?,?,?)').join(',')} ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+excluded.quantity,last_obtained_at=CURRENT_TIMESTAMP`,...chunk.flatMap(r=>[user.id,r.card.id,r.count])));}
      if(masterStarTotal){
        list.push(p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,'MASTER_STAR',?,?) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=CURRENT_TIMESTAMP",user.id,masterStarTotal,masterStarTotal));
        list.push(p("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES(?,'MASTER_STAR',?,?,'HIGH_GRADE_DUPLICATE','PACK_DRAW',?)",user.id,masterStarTotal,stars+masterStarTotal,requestId));
      }
      // A trigger, concurrent card-only mutation or failed write must never
      // produce a receipt that claims cards/currency which were not applied.
      list.push(p("UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND coin=? AND card_shards=?) AND COALESCE((SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code='MASTER_STAR'),0)=? THEN 1 ELSE 0 END WHERE token=?",user.id,receipt.coinAfter,Number(account.card_shards)+shardTotal,user.id,stars+masterStarTotal,token));
      for(let offset=0;offset<results.length;offset+=30){const chunk=results.slice(offset,offset+30);list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN '+chunk.map(()=> 'EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=?)').join(' AND ')+' THEN 1 ELSE 0 END WHERE token=?',...chunk.flatMap(r=>[user.id,r.card.id,r.quantityAfter]),token));}
      if(shardTotal)list.push(p("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'DUPLICATE',NULL)",user.id,shardTotal,Number(account.card_shards)+shardTotal));
      list.push(p("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'PACK_DRAW')",user.id,-cost,receipt.coinAfter));
      const limitedSeen=new Map(),resultMap=new Map(results.map(r=>[r.card.id,r]));
      for(const event of plan.limited){
        const row=resultMap.get(event.cardId),n=limitedSeen.get(event.cardId)||0,before=stockMap.get(event.cardId);limitedSeen.set(event.cardId,n+1);
        list.push(deps.audit(env,{eventKey:`draw:${requestId}:${event.slot}:${event.cardId}`,requestId,drawGroupId:requestId,sourceType:'PACK',sourceId:'ultimate',userId:user.id,userNickname:user.nickname,cardId:event.cardId,cardTitle:row.card.title,packId:'ultimate',status:'COMPLETED',coinCost:cost,stockBefore:Number(before.issued_count)+n,stockAfter:Number(before.issued_count)+n+1,quantityBefore:row.quantityBefore+n,quantityAfter:row.quantityBefore+n+1,isDuplicate:row.quantityBefore+n>0,stockReserved:true,cardGranted:true}).statement);
      }
      const logged=new Map();
      for(const event of plan.limitedLogs){const row=resultMap.get(event.cardId),n=logged.get(event.cardId)||0;logged.set(event.cardId,n+1);list.push(p("INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new) VALUES(?,?,'ultimate',?,'LIMITED',?,?)",requestId,user.id,event.cardId,event.slot%100===0?Number(pack.price)*100:0,row.quantityBefore+n===0?1:0));}
      list.push(p("INSERT INTO draw_request_receipts_v2(request_id,user_id,pack_id,draw_count,status,cost,response_json) VALUES(?,?,?,?,'COMPLETED',?,?)",requestId,user.id,ULTIMATE_BULK.receiptPack,body.count,cost,JSON.stringify(receipt)),jointGuardEnd(DB,token));
      try{await DB.batch(list);return await hydrate(env,user,receipt);}
      catch(error){
        const saved=await stored(env,user,requestId,body);if(saved)return hydrate(env,user,saved,true);
        if(attempt===2||!/joint_atomic_guards|deadlock|serializ|lock timeout/i.test(String(error.message)))throw error;
      }
    }
  }
  return {open,async receipt(env,user,requestId){const result=await stored(env,user,String(requestId||''));if(!result)throw fail('NOT_FOUND','아직 완료된 개봉 기록이 없습니다.',404);return hydrate(env,user,result,true);}};
}

export async function handleUltimateBulk({path,request,env,deps}){
  if(!['draw/ultimate-bulk','draw/ultimate-bulk/receipt'].includes(path))return null;
  try{
    const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
    const service=createUltimateBulkService(deps);
    if(path.endsWith('/receipt')){if(request.method!=='GET')return deps.json({error:'지원하지 않는 요청입니다.'},405);return deps.json(await service.receipt(env,user,new URL(request.url).searchParams.get('requestId')),200,{'cache-control':'no-store'});}
    if(request.method!=='POST')return deps.json({error:'지원하지 않는 요청입니다.'},405);
    const body=await readJointBody(request,{maxBytes:2048,fields:['requestId','count','expectedCost']}),browserId=String(request.headers.get('x-cnine-draw-client')||'');
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(browserId))throw fail('CLIENT','게임 화면에서 다시 시도하세요.',403);
    return deps.json(await deps.withUserMutationLock(env,user.id,path,async()=>{
      const lease=await deps.claimBrowser(env,user.id,browserId);if(!lease.allowed)throw fail('BUSY','다른 브라우저에서 카드 개봉 중입니다.',409);
      return service.open(env,user,body);
    }),200,{'cache-control':'no-store'});
  }catch(e){return jointResponseError(e,deps.json);}
}
