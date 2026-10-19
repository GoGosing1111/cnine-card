import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const ROUND_ID='337d1c95-4d88-4045-a81d-4ab359e5f627';
export const OPERATION_KEY='ops:coup:'+ROUND_ID+':victory-allowance:20261019:v1';
export const RECIPIENT_HASH='0b32f28cf356d2bc4eac215ed5eeedcb21ad99efcb91470d6c168424cf94b530';
export const COUNT=62,AMOUNT='300000000000',TOTAL='18600000000000';
export const REASON='2026-10-18 쿠데타 승리 수당 · 박세라 반란군 · 3,000억 코인';
export const ACTION='OPS_COUP_VICTORY_ALLOWANCE',COIN_LOG_FLOOR='93359486';
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
const hash=r=>createHash('sha256').update(JSON.stringify(r.map(x=>({id:x.id,side:x.side,joinedAt:x.joinedAt})))).digest('hex');
const one=rows=>{assert.equal(rows.length,1,'Expected one row');return rows[0];};
const parse=v=>typeof v==='string'?JSON.parse(v):v;

export async function audience(c,{lock=false}={}){
 const round=one(await q(c,'SELECT id,status,winner,starts_at::text,finished_at::text FROM coup_rounds_v2115 WHERE id=$1'+(lock?' FOR SHARE':''),[ROUND_ID]));
 assert.deepEqual(round,{id:ROUND_ID,status:'FINISHED',winner:'REBEL',starts_at:'1792328443386',finished_at:'1792332995730'},'Reviewed finished coup changed');
 const rows=await q(c,`SELECT p.user_id::text id,p.side,p.joined_at::text AS "joinedAt",u.nickname,u.status,u.role,u.coin::text coin,u.card_shards::text card_shards,u.magic_crystals::text magic_crystals
  FROM coup_participants_v2115 p JOIN users u ON u.id=p.user_id WHERE p.round_id=$1 AND p.side='REBEL' ORDER BY p.user_id`+(lock?' FOR UPDATE OF u FOR SHARE OF p':''),[ROUND_ID]);
 assert.equal(rows.length,COUNT);assert.equal(new Set(rows.map(r=>r.id)).size,COUNT);
 assert.equal(hash(rows),RECIPIENT_HASH,'Winning roster changed');assert.ok(rows.every(r=>r.status==='ACTIVE'),'Winner account is not active');
 return {round,rows};
}
export async function savedReceipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){
 return {
  receipts:await q(c,'SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY]),
  audits:await q(c,'SELECT id::text FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]),
  coins:await q(c,'SELECT id::text FROM coin_logs WHERE id>$1::bigint AND reason=$2',[COIN_LOG_FLOOR,REASON])
 };
}
export async function verify(c,r,{exact=false}={}){
 assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.roundId,ROUND_ID);assert.equal(r.winner,'REBEL');
 assert.equal(r.recipientHash,RECIPIENT_HASH);assert.equal(r.amountEach,AMOUNT);assert.equal(r.totalCoin,TOTAL);assert.equal(r.delivery,'DIRECT');assert.equal(r.recipients.length,COUNT);
 assert.equal(hash(r.recipients.map(x=>({id:x.userId,side:x.side,joinedAt:x.joinedAt}))),RECIPIENT_HASH);
 const logs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs l WHERE id=ANY($1::bigint[]) ORDER BY l.user_id',[r.recipients.map(x=>x.coinLogId)]);
 assert.equal(logs.length,COUNT);assert.equal(new Set(logs.map(l=>l.user_id)).size,COUNT);
 for(const [i,t]of r.recipients.entries()){
  const log=logs[i];assert.equal(log.user_id,t.userId);assert.equal(log.id,t.coinLogId);assert.equal(log.change_amount,AMOUNT);assert.equal(log.balance_after,t.coinAfter);
  assert.equal(log.reason,REASON);assert.equal(log.admin_id,r.adminId);assert.equal(BigInt(t.coinAfter)-BigInt(t.coinBefore),BigInt(AMOUNT));
 }
 const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]));
 assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,r.adminId);const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 const counts=await artifacts(c);assert.equal(counts.receipts.length,1);assert.equal(counts.audits.length,1);assert.equal(counts.coins.length,COUNT);
 if(exact){const {rows}=await audience(c);for(const [i,t]of r.recipients.entries())assert.equal(rows[i].coin,t.coinAfter);}
 return {status:'VERIFIED',recipientCount:COUNT,coinPerUser:AMOUNT,totalCoin:TOTAL,coinLogs:COUNT,auditRecords:1,completionReceipts:1,duplicates:0,missing:0,auditId:r.auditId,completedAt:r.completedAt};
}

// Caller owns the transaction and acquires live USER_LOCK + DB leases for all
// reviewed winning participants. No automatic hooks, messages or schema changes.
export async function grant(c,expectedHash,{leaseToken,lockDeadline}={}){
 assert.equal(expectedHash,RECIPIENT_HASH,'Reviewed recipient hash required');
 assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/,'Live account lease token required');
 assert.ok(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Live account leases required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const saved=await savedReceipt(c);if(saved)return {receipt:saved,replayed:true,verification:await verify(c,saved)};
 const date=one(await q(c,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') today"));assert.equal(date.today,'2026-10-19','One-time grant date expired');
 const before=await audience(c,{lock:true}),ids=before.rows.map(r=>r.id);
 const leases=await q(c,'SELECT user_id::text FROM user_mutation_locks_v1520 l WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 ORDER BY l.user_id',[ids,leaseToken,OPERATION_KEY,Date.now()+15000]);
 assert.deepEqual(leases.map(x=>x.user_id),ids,'Missing live account leases');
 for(const rows of Object.values(await artifacts(c)))assert.equal(rows.length,0,'Existing or partial grant needs reconciliation');
 assert.equal((await q(c,"SELECT key FROM app_meta WHERE key LIKE $1",['ops:coup:'+ROUND_ID+':%'])).length,0,'Another reward exists for this coup');
 const gifts=await q(c,"SELECT m.id FROM user_messages m JOIN user_message_rewards r ON r.message_id=m.id WHERE m.created_at>='2026-10-18 14:16:35' AND (m.title LIKE '%쿠데타%' OR m.body LIKE '%쿠데타%' OR m.campaign_key LIKE $1) LIMIT 1",['%'+ROUND_ID+'%']);
 assert.equal(gifts.length,0,'Coup reward messages already exist');
 const owner=one(await q(c,"SELECT id::text FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 for(const r of before.rows)assert.ok(BigInt(r.coin)>=0n&&BigInt(r.coin)+BigInt(AMOUNT)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported coin balance');
 const now=new Date().toISOString();
 const logs=await q(c,`WITH credited AS (UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin)
  INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
  SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id::text,user_id::text,change_amount::text,balance_after::text`,[ids,AMOUNT,REASON,owner.id,now]);
 assert.equal(logs.length,COUNT);const after=await audience(c);
 for(const [i,row]of before.rows.entries())assert.deepEqual(after.rows[i],{...row,coin:(BigInt(row.coin)+BigInt(AMOUNT)).toString()},'Unexpected wallet change');
 const recipients=before.rows.map((row,i)=>{const log=one(logs.filter(x=>x.user_id===row.id));assert.equal(log.change_amount,AMOUNT);assert.equal(log.balance_after,after.rows[i].coin);
  return {userId:row.id,nickname:row.nickname,side:row.side,joinedAt:row.joinedAt,coinBefore:row.coin,coinAfter:after.rows[i].coin,coinLogId:log.id};});
 const r={status:'COMPLETED',operationKey:OPERATION_KEY,roundId:ROUND_ID,winner:'REBEL',recipientHash:RECIPIENT_HASH,recipientCount:COUNT,amountEach:AMOUNT,totalCoin:TOTAL,
  delivery:'DIRECT',authorization:'쿠데타 승리 수당 3천억 지급해',eligibility:'All 62 participants on the finished winning REBEL side; no attack threshold',adminId:owner.id,recipients,completedAt:now};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,'COUP_WINNERS',$3,$4,$5,$6) RETURNING id::text",
  [owner.id,ACTION,OPERATION_KEY,JSON.stringify({roundId:ROUND_ID,recipientHash:RECIPIENT_HASH,recipientCount:COUNT,priorOperation:null}),JSON.stringify(r),now]));r.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(r),now]));
 const verification=await verify(c,r,{exact:true});assert.ok(lockDeadline>Date.now()+5000,'Account leases expiring before commit');
 return {receipt:r,replayed:false,verification};
}
