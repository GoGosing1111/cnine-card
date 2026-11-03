import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:prediction-camp-closure:20261103:v1';
export const REASON='승부예측 폐쇄 · 참여 원금 전액 환불';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function snapshot(db){
 const q=async(s,v=[]) => (await db.query(s,v)).rows;
 return {
  settings:await q("SELECT key,value FROM app_meta WHERE key='coin_prediction_settings_v1'"),
  events:await q("SELECT * FROM coin_prediction_events WHERE status NOT IN ('SETTLED','VOID') ORDER BY id"),
  bets:await q("SELECT * FROM coin_prediction_bets WHERE status='ACTIVE' ORDER BY event_id,user_id"),
  subsidies:await q("SELECT * FROM administration_prediction_subsidies_v2030 WHERE status='ACTIVE' ORDER BY event_id"),
  // Preserve old wagers, receipts, sentences and ordinary administrative prison byte-for-byte.
  history:await q("SELECT (SELECT md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY event_id,user_id),'')) FROM (SELECT * FROM coin_prediction_bets WHERE status<>'ACTIVE') t) bets,(SELECT md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY request_id),'')) FROM coin_prediction_receipts t) receipts,(SELECT md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY user_id),'')) FROM user_prison_status t) ordinary_prison"),
 };
}
// Caller owns the transaction, shared account leases and final COMMIT. A replay only reads.
export async function closePredictionCamp(db,{plan,leaseToken,lockDeadline,sourceCommit,failAt=''}={}){
 const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
 if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
 assert(plan&&plan.operationKey===OP);assert.match(sourceCommit||'',/^[a-f0-9]{40}$/);
 const ids=plan.ids;assert(lockDeadline>Date.now()+5000,'Account leases expired');
 assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND lease_until_ms>$3 ORDER BY user_id FOR UPDATE',[ids,leaseToken,Date.now()+5000])).rowCount,ids.length,'Shared account leases required');
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
 await db.query('LOCK TABLE coin_prediction_events,coin_prediction_bets IN SHARE ROW EXCLUSIVE MODE');
 const fresh=await snapshot(db);assert.equal(hash(fresh),plan.snapshotHash,'Prediction state changed; refresh the reviewed plan');assert.equal(fresh.subsidies.length,0,'Treasury commitments need their own reconciliation');
 assert(fresh.events.every(e=>['DRAFT','OPEN','CLOSED'].includes(e.status)));const eventIds=fresh.events.map(e=>String(e.id));
 assert(fresh.bets.every(b=>eventIds.includes(String(b.event_id))),'Active wager on a finalized event');
 const oldLocks=(await db.query("SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) FOR UPDATE",[eventIds.map(id=>'coin_prediction_lock_event_'+id)])).rows;
 assert(!oldLocks.some(r=>Number(String(r.value).split('|').at(-1))>Date.now()),'Legacy settlement still running');
 await db.query('SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[ids]);
 const before=(await db.query('SELECT id::text,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).rows;assert.equal(before.length,ids.length);
 const refunds=[];
 for(const b of fresh.bets){
  const amount=BigInt(b.amount);assert(amount>0n&&BigInt(b.payout)===0n);
  const paid=await db.query("UPDATE coin_prediction_bets SET status='REFUNDED',payout=amount,settled_at=to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),updated_at=to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') WHERE event_id=$1 AND user_id=$2 AND status='ACTIVE' AND amount=$3 AND payout=0 RETURNING user_id",[b.event_id,b.user_id,amount.toString()]);assert.equal(paid.rowCount,1);
  const wallet=(await db.query('UPDATE users SET coin=coin+$2::bigint WHERE id=$1 RETURNING coin::text',[b.user_id,amount.toString()])).rows[0];assert(wallet);
  const log=(await db.query('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES($1,$2::bigint,$3::bigint,$4) RETURNING id::text',[b.user_id,amount.toString(),wallet.coin,REASON])).rows[0];
  refunds.push({eventId:String(b.event_id),userId:String(b.user_id),amount:amount.toString(),logId:log.id});
  if(failAt==='refund'&&refunds.length===1)throw Error('INJECTED_FAILURE_REFUND');
 }
 const ended=await db.query("UPDATE coin_prediction_events SET status='VOID',result_option_id=NULL,settled_at=to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),updated_at=to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') WHERE id=ANY($1::bigint[]) AND status IN ('DRAFT','OPEN','CLOSED') RETURNING id",[eventIds]);assert.equal(ended.rowCount,eventIds.length);
 const settings={...JSON.parse(fresh.settings[0].value),enabled:false,retired:true,retiredAt:new Date().toISOString(),retiredOperation:OP};
 assert.equal((await db.query("UPDATE app_meta SET value=$1,updated_at=to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') WHERE key='coin_prediction_settings_v1' AND value=$2",[JSON.stringify(settings),fresh.settings[0].value])).rowCount,1);
 // Only live camp sentences are released; expired records and DEATH_GAME are preserved.
 const releasedClan=(await db.query("UPDATE clan_prison_captives p SET released_at=to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),released_by=NULL,release_reason='포로수용소 영구 폐쇄' FROM clan_prison_camps c WHERE c.season_id=p.season_id AND p.released_at IS NULL AND c.jailed_until::timestamp>timezone('UTC',CURRENT_TIMESTAMP) RETURNING p.season_id,p.user_id")).rows;
 const releasedEvent=(await db.query("UPDATE event_prison_captives p SET released_at=to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS'),released_by=NULL,release_reason='포로수용소 영구 폐쇄' FROM event_prison_camps c WHERE c.event_id=p.event_id AND c.source_type<>'DEATH_GAME' AND p.released_at IS NULL AND c.jailed_until::timestamp>timezone('UTC',CURRENT_TIMESTAMP) RETURNING p.event_id,p.user_id")).rows;
 const after=(await db.query('SELECT id::text,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids])).rows;
 for(const u of after){const delta=refunds.filter(r=>r.userId===u.id).reduce((n,r)=>n+BigInt(r.amount),0n);assert.equal(BigInt(u.coin)-BigInt(before.find(b=>b.id===u.id).coin),delta);}
 const receipt={operationKey:OP,status:'COMPLETED',sourceCommit,planHash:hash(plan),at:new Date().toISOString(),events:eventIds,users:ids.length,betCount:refunds.length,totalRefund:refunds.reduce((n,r)=>n+BigInt(r.amount),0n).toString(),refunds,releasedClan,releasedEvent,before,after,historyBefore:fresh.history,settings,messagesSent:0};
 const audit=(await db.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT id,'PREDICTION_CAMP_CLOSED','OPERATION',$1,$2,$3 FROM users WHERE role='OWNER' ORDER BY id LIMIT 1 RETURNING id::text",[OP,JSON.stringify({events:fresh.events,settings:fresh.settings,history:fresh.history}),JSON.stringify(receipt)])).rows[0];assert(audit,'Authorized OWNER audit identity required');receipt.auditId=audit.id;
 if(failAt==='receipt')throw Error('INJECTED_FAILURE_RECEIPT');
 await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,to_char(timezone(\'UTC\',CURRENT_TIMESTAMP),\'YYYY-MM-DD HH24:MI:SS\'))',[OP,JSON.stringify(receipt)]);
 return {replayed:false,receipt};
}
