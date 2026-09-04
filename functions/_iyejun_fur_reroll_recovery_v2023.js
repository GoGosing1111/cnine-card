export const IYEJUN_FUR_REROLL_RECOVERY_VERSION=2023;
export const IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY='iyejun_fur_reroll_recovery_v2023_completed';
export const IYEJUN_FUR_MEMBER_NAME='이예준';

const RECOVERY_TABLE='iyejun_fur_reroll_recovery_v2023';
const HIGH_GRADE_SOURCE='HIGH_GRADE';
const FUR_TICKET_SOURCE='FUR_TICKET';
const HIGH_GRADE_TICKET='HIGH_GRADE_REROLL_TICKET';
const FUR_REROLL_TICKET='FUR_REROLL_TICKET';
const RECOVERY_REASON='IYEJUN_FUR_REROLL_RECOVERY_V2023';

function rows(result){return result?.results||[]}
function integer(value,fallback=0){const number=Number(value);return Number.isFinite(number)?Math.floor(number):fallback}
function safeJson(value,fallback={}){try{const parsed=typeof value==='string'?JSON.parse(value):value;return parsed??fallback}catch{return fallback}}
function compactName(value){return String(value||'').normalize('NFKC').replace(/\s+/g,'')}
function completedSummary(row,{replayed=true}={}){const parsed=safeJson(row?.value,null);return parsed?.status==='COMPLETED'?{...parsed,replayed}:null}
function receiptCardId(receipt){const response=safeJson(receipt?.response_json,{});return String(response?.card?.id||response?.resultCardId||'')}

async function ensureRecoveryFoundation(env){
  const sqliteSchema=[
    `CREATE TABLE IF NOT EXISTS ${RECOVERY_TABLE}(
      source_type TEXT NOT NULL,request_id TEXT NOT NULL,user_id INTEGER NOT NULL,target_card_id TEXT NOT NULL,
      nonce TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(source_type,request_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_iyejun_fur_reroll_recovery_user_v2023 ON ${RECOVERY_TABLE}(user_id,target_card_id,status)`
  ];
  if(env.DB?.dialect==='postgres'&&typeof env.DB.execSchema==='function'){
    await env.DB.execSchema([
      `CREATE TABLE IF NOT EXISTS ${RECOVERY_TABLE}(
        source_type TEXT NOT NULL,request_id TEXT NOT NULL,user_id BIGINT NOT NULL,target_card_id TEXT NOT NULL,
        nonce TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',response_json TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(source_type,request_id)
      )`,
      sqliteSchema[1]
    ]);
  }else{
    const cardColumns=rows(await env.DB.prepare('PRAGMA table_info(cards)').all());
    if(!cardColumns.some(column=>String(column.name||'')==='reroll_result_enabled'))await env.DB.prepare('ALTER TABLE cards ADD COLUMN reroll_result_enabled INTEGER NOT NULL DEFAULT 1').run();
    await env.DB.batch(sqliteSchema.map(sql=>env.DB.prepare(sql)));
  }
}

async function currentHolding(env,userId,cardId){
  return env.DB.prepare(`SELECT quantity,COALESCE(breakthrough_level,0) AS breakthrough_level,
    COALESCE(breakthrough_fail_count,0) AS breakthrough_fail_count
    FROM user_cards WHERE user_id=? AND card_id=?`).bind(userId,cardId).first();
}

async function currentInventory(env,userId,itemCode){
  const row=await env.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?').bind(userId,itemCode).first();
  return Math.max(0,integer(row?.quantity));
}

async function completedReceiptRecovery(env,sourceType,requestId){
  const row=await env.DB.prepare(`SELECT status,response_json FROM ${RECOVERY_TABLE} WHERE source_type=? AND request_id=?`).bind(sourceType,requestId).first();
  if(String(row?.status||'').toUpperCase()!=='COMPLETED')return null;
  return{...safeJson(row.response_json,{}),status:'COMPLETED',replayed:true};
}

async function clearUnfinishedClaim(env,sourceType,requestId,nonce){
  await env.DB.prepare(`DELETE FROM ${RECOVERY_TABLE} WHERE source_type=? AND request_id=? AND nonce=? AND status<>'COMPLETED'`).bind(sourceType,requestId,nonce).run();
}

async function recoverHighGradeReceipt(env,receipt){
  const requestId=String(receipt.request_id||''),userId=integer(receipt.user_id),targetCardId=String(receipt.result_card_id||''),sourceCardId=String(receipt.source_card_id||'');
  const replay=await completedReceiptRecovery(env,HIGH_GRADE_SOURCE,requestId);if(replay)return replay;
  const original=safeJson(receipt.response_json,{});
  if(original?.reverted===true)return{status:'ALREADY_REVERTED',sourceType:HIGH_GRADE_SOURCE,requestId,replayed:true};
  const [target,source,ticketBefore]=await Promise.all([currentHolding(env,userId,targetCardId),currentHolding(env,userId,sourceCardId),currentInventory(env,userId,HIGH_GRADE_TICKET)]);
  const targetQuantity=Math.max(0,integer(target?.quantity));
  if(targetQuantity<1)return{status:'SKIPPED_MISSING_CARD',sourceType:HIGH_GRADE_SOURCE,requestId,replayed:false};
  const targetLevel=Math.max(0,integer(target?.breakthrough_level)),targetFailCount=Math.max(0,integer(target?.breakthrough_fail_count));
  const sourceQuantity=Math.max(0,integer(source?.quantity)),sourceLevel=Math.max(0,integer(original?.breakthroughLevel));
  const nonce=crypto.randomUUID(),revertedAt=new Date().toISOString();
  const recovery={status:'COMPLETED',version:IYEJUN_FUR_REROLL_RECOVERY_VERSION,sourceType:HIGH_GRADE_SOURCE,requestId,userId,targetCardId,sourceCardId,cardsRecovered:1,sourceCardsRestored:1,highGradeTicketsRefunded:1,furTicketsRefunded:0,shardsReversed:0,breakthroughLevelRestored:sourceLevel,completedAt:revertedAt};
  const revertedResponse={...original,ok:false,reverted:true,recoveryCode:RECOVERY_REASON,revertedAt,ticketCode:HIGH_GRADE_TICKET,remaining:ticketBefore+1,sourceCardId,resultCardId:targetCardId};
  const claimGuard=`EXISTS(SELECT 1 FROM ${RECOVERY_TABLE} rr WHERE rr.source_type=? AND rr.request_id=? AND rr.nonce=? AND rr.status='CLAIMED')`;
  const guarded=(sql,...values)=>env.DB.prepare(sql.replaceAll('{GUARD}',claimGuard)).bind(...values,HIGH_GRADE_SOURCE,requestId,nonce);
  const statements=[
    env.DB.prepare(`INSERT OR IGNORE INTO ${RECOVERY_TABLE}(source_type,request_id,user_id,target_card_id,nonce,status) VALUES(?,?,?,?,?,'PENDING')`).bind(HIGH_GRADE_SOURCE,requestId,userId,targetCardId,nonce),
    env.DB.prepare(`UPDATE ${RECOVERY_TABLE} SET status='CLAIMED',updated_at=CURRENT_TIMESTAMP WHERE source_type=? AND request_id=? AND nonce=? AND status='PENDING'
      AND EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)=? AND COALESCE(breakthrough_fail_count,0)=?)
      AND EXISTS(SELECT 1 FROM high_grade_reroll_ticket_receipts WHERE request_id=? AND user_id=? AND source_card_id=? AND result_card_id=? AND response_json=?)`)
      .bind(HIGH_GRADE_SOURCE,requestId,nonce,userId,targetCardId,targetQuantity,targetLevel,targetFailCount,requestId,userId,sourceCardId,targetCardId,String(receipt.response_json||'')),
    guarded(`UPDATE user_cards SET quantity=quantity-1,
      breakthrough_level=CASE WHEN quantity<=1 THEN 0 ELSE breakthrough_level END,
      breakthrough_fail_count=CASE WHEN quantity<=1 THEN 0 ELSE breakthrough_fail_count END,last_obtained_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND card_id=? AND {GUARD}`,userId,targetCardId),
    guarded(`DELETE FROM user_cards WHERE user_id=? AND card_id=? AND quantity<=0 AND {GUARD}`,userId,targetCardId),
    guarded(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at)
      SELECT ?,?,1,?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE {GUARD}
      ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,
        breakthrough_level=CASE WHEN user_cards.breakthrough_level<excluded.breakthrough_level THEN excluded.breakthrough_level ELSE user_cards.breakthrough_level END,
        last_obtained_at=CURRENT_TIMESTAMP`,userId,sourceCardId,sourceLevel),
    guarded(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,?,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE {GUARD}
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+1,
        unseen_quantity=cnine_user_inventory.unseen_quantity+1,updated_at=CURRENT_TIMESTAMP`,userId,HIGH_GRADE_TICKET),
    guarded(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,?,1,quantity,?,'REROLL_RECOVERY',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND {GUARD}`,
      userId,HIGH_GRADE_TICKET,RECOVERY_REASON,requestId,userId,HIGH_GRADE_TICKET),
    guarded(`UPDATE high_grade_reroll_ticket_receipts SET response_json=? WHERE request_id=? AND user_id=? AND response_json=? AND {GUARD}`,
      JSON.stringify(revertedResponse),requestId,userId,String(receipt.response_json||'')),
    guarded(`UPDATE ${RECOVERY_TABLE} SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP
      WHERE source_type=? AND request_id=? AND nonce=? AND status='CLAIMED' AND {GUARD}`,
      JSON.stringify(recovery),HIGH_GRADE_SOURCE,requestId,nonce)
  ];
  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){const existing=await completedReceiptRecovery(env,HIGH_GRADE_SOURCE,requestId);return existing||{status:'RUNNING',sourceType:HIGH_GRADE_SOURCE,requestId,replayed:true}}
  const completed=await completedReceiptRecovery(env,HIGH_GRADE_SOURCE,requestId);
  if(completed)return{...completed,replayed:false};
  await clearUnfinishedClaim(env,HIGH_GRADE_SOURCE,requestId,nonce);
  return{status:'SKIPPED_STATE_CHANGED',sourceType:HIGH_GRADE_SOURCE,requestId,replayed:false,sourceQuantityBefore:sourceQuantity};
}

async function recoverFurTicketReceipt(env,receipt,targetCardId){
  const requestId=String(receipt.request_id||''),userId=integer(receipt.user_id);
  const replay=await completedReceiptRecovery(env,FUR_TICKET_SOURCE,requestId);if(replay)return replay;
  const original=safeJson(receipt.response_json,{});
  const [target,ticketBefore,user]=await Promise.all([
    currentHolding(env,userId,targetCardId),currentInventory(env,userId,FUR_REROLL_TICKET),
    env.DB.prepare('SELECT card_shards FROM users WHERE id=?').bind(userId).first()
  ]);
  const targetQuantity=Math.max(0,integer(target?.quantity));
  if(targetQuantity<1)return{status:'SKIPPED_MISSING_CARD',sourceType:FUR_TICKET_SOURCE,requestId,replayed:false};
  const targetLevel=Math.max(0,integer(target?.breakthrough_level)),targetFailCount=Math.max(0,integer(target?.breakthrough_fail_count));
  const shardGained=Math.max(0,integer(original?.shardGained)),shardsBefore=integer(user?.card_shards),shardsAfter=shardsBefore-shardGained;
  const nonce=crypto.randomUUID(),revertedAt=new Date().toISOString();
  const recovery={status:'COMPLETED',version:IYEJUN_FUR_REROLL_RECOVERY_VERSION,sourceType:FUR_TICKET_SOURCE,requestId,userId,targetCardId,cardsRecovered:1,sourceCardsRestored:0,highGradeTicketsRefunded:0,furTicketsRefunded:1,shardsReversed:shardGained,completedAt:revertedAt};
  const revertedResponse={...original,ok:false,reverted:true,recoveryCode:RECOVERY_REASON,revertedAt,itemCode:FUR_REROLL_TICKET,remaining:ticketBefore+1};
  const claimGuard=`EXISTS(SELECT 1 FROM ${RECOVERY_TABLE} rr WHERE rr.source_type=? AND rr.request_id=? AND rr.nonce=? AND rr.status='CLAIMED')`;
  const guarded=(sql,...values)=>env.DB.prepare(sql.replaceAll('{GUARD}',claimGuard)).bind(...values,FUR_TICKET_SOURCE,requestId,nonce);
  const statements=[
    env.DB.prepare(`INSERT OR IGNORE INTO ${RECOVERY_TABLE}(source_type,request_id,user_id,target_card_id,nonce,status) VALUES(?,?,?,?,?,'PENDING')`).bind(FUR_TICKET_SOURCE,requestId,userId,targetCardId,nonce),
    env.DB.prepare(`UPDATE ${RECOVERY_TABLE} SET status='CLAIMED',updated_at=CURRENT_TIMESTAMP WHERE source_type=? AND request_id=? AND nonce=? AND status='PENDING'
      AND EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity=? AND COALESCE(breakthrough_level,0)=? AND COALESCE(breakthrough_fail_count,0)=?)
      AND EXISTS(SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND user_id=? AND item_code=? AND status='COMPLETED' AND response_json=?)`)
      .bind(FUR_TICKET_SOURCE,requestId,nonce,userId,targetCardId,targetQuantity,targetLevel,targetFailCount,requestId,userId,FUR_REROLL_TICKET,String(receipt.response_json||'')),
    guarded(`UPDATE user_cards SET quantity=quantity-1,
      breakthrough_level=CASE WHEN quantity<=1 THEN 0 ELSE breakthrough_level END,
      breakthrough_fail_count=CASE WHEN quantity<=1 THEN 0 ELSE breakthrough_fail_count END,last_obtained_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND card_id=? AND {GUARD}`,userId,targetCardId),
    guarded(`DELETE FROM user_cards WHERE user_id=? AND card_id=? AND quantity<=0 AND {GUARD}`,userId,targetCardId),
    guarded(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      SELECT ?,?,1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP WHERE {GUARD}
      ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+1,
        unseen_quantity=cnine_user_inventory.unseen_quantity+1,updated_at=CURRENT_TIMESTAMP`,userId,FUR_REROLL_TICKET),
    ...(shardGained>0?[
      guarded(`UPDATE users SET card_shards=card_shards-? WHERE id=? AND {GUARD}`,shardGained,userId),
      guarded(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id)
        SELECT ?,-?,card_shards,?,? FROM users WHERE id=? AND {GUARD}`,userId,shardGained,RECOVERY_REASON,targetCardId,userId)
    ]:[]),
    guarded(`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
      SELECT ?,?,1,quantity,?,'REROLL_RECOVERY',? FROM cnine_user_inventory WHERE user_id=? AND item_code=? AND {GUARD}`,
      userId,FUR_REROLL_TICKET,RECOVERY_REASON,requestId,userId,FUR_REROLL_TICKET),
    guarded(`UPDATE inventory_use_receipts SET status='REVERTED',response_json=?,error_message=?,updated_at=CURRENT_TIMESTAMP
      WHERE request_id=? AND user_id=? AND item_code=? AND status='COMPLETED' AND response_json=? AND {GUARD}`,
      JSON.stringify(revertedResponse),'이예준 FUR 재뽑기 결과 운영 원복',requestId,userId,FUR_REROLL_TICKET,String(receipt.response_json||'')),
    guarded(`UPDATE ${RECOVERY_TABLE} SET status='COMPLETED',response_json=?,updated_at=CURRENT_TIMESTAMP
      WHERE source_type=? AND request_id=? AND nonce=? AND status='CLAIMED' AND {GUARD}`,
      JSON.stringify(recovery),FUR_TICKET_SOURCE,requestId,nonce)
  ];
  const results=await env.DB.batch(statements);
  if(Number(results[0]?.meta?.changes||0)===0){const existing=await completedReceiptRecovery(env,FUR_TICKET_SOURCE,requestId);return existing||{status:'RUNNING',sourceType:FUR_TICKET_SOURCE,requestId,replayed:true}}
  const completed=await completedReceiptRecovery(env,FUR_TICKET_SOURCE,requestId);
  if(completed)return{...completed,replayed:false};
  await clearUnfinishedClaim(env,FUR_TICKET_SOURCE,requestId,nonce);
  return{status:'SKIPPED_STATE_CHANGED',sourceType:FUR_TICKET_SOURCE,requestId,replayed:false};
}

export async function ensureIyejunFurRerollRecoveryV2023(env){
  const early=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY).first());
  if(early)return early;
  await ensureRecoveryFoundation(env);
  const targetResult=await env.DB.prepare(`SELECT c.id,c.title,m.name FROM cards c JOIN members m ON m.id=c.member_id
    WHERE UPPER(COALESCE(NULLIF(c.rarity_override,''),c.rarity))='FUR'
      AND (REPLACE(COALESCE(m.name,''),' ','')=? OR REPLACE(COALESCE(c.title,''),' ','') LIKE ?)
    ORDER BY c.id`).bind(compactName(IYEJUN_FUR_MEMBER_NAME),`%${compactName(IYEJUN_FUR_MEMBER_NAME)}%`).all();
  const targets=rows(targetResult),targetIds=[...new Set(targets.map(card=>String(card.id||'')).filter(Boolean))];
  if(!targetIds.length)return{status:'WAITING_CARD',version:IYEJUN_FUR_REROLL_RECOVERY_VERSION,replayed:false,targetCardCount:0,rerollBlocked:false};

  const placeholders=targetIds.map(()=>'?').join(',');
  await env.DB.prepare(`UPDATE cards SET reroll_result_enabled=0,updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND COALESCE(reroll_result_enabled,1)<>0`).bind(...targetIds).run();
  const runningValue=JSON.stringify({status:'RUNNING',version:IYEJUN_FUR_REROLL_RECOVERY_VERSION,nonce:crypto.randomUUID(),startedAt:new Date().toISOString()});
  let claimed=await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY,runningValue).run();
  if(Number(claimed?.meta?.changes||0)===0){
    const replay=completedSummary(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY).first());
    if(replay)return replay;
    claimed=await env.DB.prepare("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND updated_at<datetime('now','-2 minutes')").bind(runningValue,IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY).run();
    if(Number(claimed?.meta?.changes||0)===0)return{status:'RUNNING',version:IYEJUN_FUR_REROLL_RECOVERY_VERSION,replayed:true,targetCardCount:targetIds.length,rerollBlocked:true};
  }

  try{
    const [highResult,inventoryResult]=await Promise.all([
      env.DB.prepare(`SELECT request_id,user_id,source_card_id,result_card_id,response_json,used_at FROM high_grade_reroll_ticket_receipts
        WHERE UPPER(grade)='FUR' AND result_card_id IN (${placeholders}) ORDER BY used_at DESC,request_id DESC`).bind(...targetIds).all(),
      env.DB.prepare("SELECT request_id,user_id,response_json,created_at FROM inventory_use_receipts WHERE item_code='FUR_REROLL_TICKET' AND status='COMPLETED' ORDER BY created_at DESC,request_id DESC").all()
    ]);
    const highReceipts=rows(highResult).filter(receipt=>safeJson(receipt.response_json,{}).reverted!==true);
    const targetSet=new Set(targetIds),furReceipts=rows(inventoryResult).map(receipt=>({...receipt,targetCardId:receiptCardId(receipt)})).filter(receipt=>targetSet.has(receipt.targetCardId));
    const outcomes=[];
    for(const receipt of highReceipts)outcomes.push(await recoverHighGradeReceipt(env,receipt));
    for(const receipt of furReceipts)outcomes.push(await recoverFurTicketReceipt(env,receipt,receipt.targetCardId));
    const recoveredResult=await env.DB.prepare(`SELECT response_json FROM ${RECOVERY_TABLE} WHERE status='COMPLETED' ORDER BY source_type,request_id`).all();
    const completed=rows(recoveredResult).map(row=>safeJson(row.response_json,{})).filter(item=>item?.status==='COMPLETED'),missing=outcomes.filter(item=>item?.status==='SKIPPED_MISSING_CARD').length,stateChanged=outcomes.filter(item=>item?.status==='SKIPPED_STATE_CHANGED').length;
    const sum=key=>completed.reduce((total,item)=>total+Math.max(0,integer(item?.[key])),0);
    const summary={
      status:'COMPLETED',version:IYEJUN_FUR_REROLL_RECOVERY_VERSION,completedAt:new Date().toISOString(),replayed:false,
      targetCardCount:targetIds.length,rerollBlocked:true,
      highGradeReceiptsFound:Math.max(highReceipts.length,completed.filter(item=>item.sourceType===HIGH_GRADE_SOURCE).length),
      furTicketReceiptsFound:Math.max(furReceipts.length,completed.filter(item=>item.sourceType===FUR_TICKET_SOURCE).length),
      highGradeRecovered:completed.filter(item=>item.sourceType===HIGH_GRADE_SOURCE).length,
      furTicketRecovered:completed.filter(item=>item.sourceType===FUR_TICKET_SOURCE).length,
      cardsRecovered:sum('cardsRecovered'),sourceCardsRestored:sum('sourceCardsRestored'),
      highGradeTicketsRefunded:sum('highGradeTicketsRefunded'),furTicketsRefunded:sum('furTicketsRefunded'),
      shardsReversed:sum('shardsReversed'),missingCurrentCards:missing,stateChanged
    };
    const finalized=await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(summary),IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY,runningValue).run();
    if(Number(finalized?.meta?.changes||0)!==1)throw new Error('이예준 FUR 재뽑기 원복 완료 마커를 확정하지 못했습니다.');
    console.log('IYEJUN_FUR_REROLL_RECOVERY_V2023',JSON.stringify(summary));
    return summary;
  }catch(error){
    await env.DB.prepare('DELETE FROM app_meta WHERE key=? AND value=?').bind(IYEJUN_FUR_REROLL_RECOVERY_MARKER_KEY,runningValue).run().catch(()=>{});
    throw error;
  }
}
