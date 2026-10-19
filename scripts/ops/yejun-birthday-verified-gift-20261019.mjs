import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:yejun-birthday:verified-200b:20261019:v1';
export const TITLE='예준탄신일';
export const COIN_PER_USER='200000000000';
export const AUTHORIZATION='2차인증 전체 유저 2000억씩 지급해 예준탄신일. 후속 정정: [C9]족쪽이도 함께 지급.';
export const ACTION='OPS_YEJUN_BIRTHDAY_GIFT';
export const INCLUDED_USER=Object.freeze({id:'303',nickname:'[C9]족쪽이'});
const rosterSql=`SELECT u.id::text id,UPPER(TRIM(COALESCE(u.role,'USER'))) role FROM users u
 WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE'
 AND EXISTS(SELECT 1 FROM user_second_verifications s WHERE s.user_id=u.id) ORDER BY u.id LIMIT 10001`;
const walletSql='SELECT id::text id,status,role,coin::text coin,card_shards::text card_shards,magic_crystals::text magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id::bigint';
const digest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const q=async(db,sql,values=[])=>(await db.query(sql,values)).rows;
const summarize=recipients=>({recipientCount:recipients.length,recipientHash:digest(recipients),recipients,
 roles:recipients.reduce((out,row)=>(out[row.role]=(out[row.role]||0)+1,out),{}),coinPerUser:COIN_PER_USER,totalCoin:String(BigInt(recipients.length)*BigInt(COIN_PER_USER))});

export async function inspectBirthdayGift(db){
 const recipients=await q(db,rosterSql);assert.ok(recipients.length<=10000,'Recipient limit exceeded');
 const named=await q(db,'SELECT id::text id,nickname FROM users WHERE id=$1 OR nickname=$2 ORDER BY id',[INCLUDED_USER.id,INCLUDED_USER.nickname]);
 assert.deepEqual(named,[INCLUDED_USER],'Explicitly included account identity changed');
 assert.equal(recipients.filter(r=>r.id===INCLUDED_USER.id).length,1,'[C9]족쪽이 must be included exactly once');
 const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 // Bounded indexed check for an alternate recent issuance; the durable operation
 // receipt below remains the permanent idempotency authority.
 const [recent]=await q(db,"SELECT COUNT(*)::int n FROM coin_logs WHERE id>=(SELECT COALESCE(MAX(id),0)-200000 FROM coin_logs) AND reason=$1",[TITLE]);
 const [message]=await q(db,"SELECT COUNT(*)::int n FROM user_messages WHERE id>=(SELECT COALESCE(MAX(id),0)-100000 FROM user_messages) AND title=$1",[TITLE]);
 return {...summarize(recipients),operationKey:OPERATION_KEY,title:TITLE,recentMatchingCoinLogs:Number(recent.n),recentMatchingMessages:Number(message.n),receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyBirthdayGift(db,receipt){
 if(!receipt){const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Receipt missing');receipt=JSON.parse(saved.value);}
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.title,TITLE);
 assert.equal(receipt.coinPerUser,COIN_PER_USER);assert.equal(receipt.delivery,'DIRECT');
 assert.equal(receipt.recipientCount,receipt.recipients.length);assert.equal(receipt.recipientHash,digest(receipt.recipients.map(({userId,role})=>({id:userId,role}))));
 assert.equal(new Set(receipt.recipients.map(r=>r.userId)).size,receipt.recipientCount);
 assert.equal(receipt.recipients.filter(r=>r.userId===INCLUDED_USER.id).length,1,'Explicit included account missing or duplicated');
 assert.equal(receipt.authorization,AUTHORIZATION);
 const logs=await q(db,'SELECT id::text id,user_id::text user_id,change_amount::text change_amount,balance_after::text balance_after,reason,admin_id::text admin_id FROM coin_logs WHERE id=ANY($1::bigint[])',[receipt.recipients.map(r=>r.coinLogId)]);
 assert.equal(logs.length,receipt.recipientCount);const byId=new Map(logs.map(r=>[r.id,r]));
 for(const r of receipt.recipients){
  const log=byId.get(r.coinLogId);assert.ok(log,'Coin ledger missing');assert.equal(log.user_id,r.userId);assert.equal(log.change_amount,COIN_PER_USER);
  assert.equal(log.balance_after,r.coinAfter);assert.equal(log.reason,TITLE);assert.equal(log.admin_id,receipt.adminId);
  assert.equal(BigInt(r.coinAfter)-BigInt(r.coinBefore),BigInt(COIN_PER_USER));
 }
 assert.equal(receipt.totalCoin,String(BigInt(receipt.recipientCount)*BigInt(COIN_PER_USER)));
 const [audit]=await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(audit?.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);
 const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited,'Audit and receipt differ');
 return {status:'VERIFIED',recipientCount:receipt.recipientCount,coinLogs:logs.length,coinPerUser:COIN_PER_USER,totalCoin:receipt.totalCoin,missing:0,duplicates:0,auditId:receipt.auditId,completedAt:receipt.completedAt};
}

// Explicit one-time direct credit. No runtime route, schedule, reward message,
// ownership bonus, verification change, or future-recipient enrollment.
export async function grantBirthdayGift(db,{expectedRecipientHash,commit=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Reviewed recipient hash required');
 // Account row locks preserve additive credits while live gameplay continues.
 // READ COMMITTED uses the latest balance after waiting for another writer.
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [saved]=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value),verification=await verifyBirthdayGift(db,receipt);await db.query('ROLLBACK');return {receipt,verification,replayed:true,committed:true};}
  const roster=await q(db,rosterSql+' FOR UPDATE OF u'),ids=roster.map(r=>r.id),plan=summarize(roster);
  assert.ok(ids.length>0&&ids.length<=10000,'Unexpected recipient count');assert.equal(plan.recipientHash,expectedRecipientHash,'Recipient list changed; inspect again');
  const proofs=await q(db,'SELECT s.user_id::text user_id FROM user_second_verifications s WHERE s.user_id=ANY($1::bigint[]) ORDER BY s.user_id FOR SHARE',[ids]);
  assert.deepEqual([...new Set(proofs.map(r=>r.user_id))],ids,'Secondary verification changed');
  const existing=await inspectBirthdayGift(db);assert.equal(existing.recentMatchingCoinLogs,0,'Matching direct credit already exists');assert.equal(existing.recentMatchingMessages,0,'Matching reward message already exists');
  const [owner]=await q(db,"SELECT id::text id FROM users WHERE UPPER(TRIM(role))='OWNER' AND UPPER(TRIM(status))='ACTIVE' ORDER BY id::bigint LIMIT 1");assert.ok(owner,'Active owner required for audit');
  const wallets=await q(db,walletSql,[ids]);assert.deepEqual(wallets.map(r=>r.id),ids);
  for(const user of wallets)assert.ok(BigInt(user.coin)>=0n&&BigInt(user.coin)+BigInt(COIN_PER_USER)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported coin balance');
  const completedAt=new Date().toISOString();
  const logs=await q(db,`WITH credited AS (UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin)
   INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
   SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id::text id,user_id::text user_id,change_amount::text change_amount,balance_after::text balance_after`,[ids,COIN_PER_USER,TITLE,owner.id,completedAt]);
  assert.equal(logs.length,ids.length);const byUser=new Map(logs.map(r=>[r.user_id,r]));assert.equal(byUser.size,ids.length);
  const after=await q(db,walletSql,[ids]);assert.deepEqual(after.map(r=>r.id),ids);
  const recipients=wallets.map((before,i)=>{
   assert.equal(BigInt(after[i].coin)-BigInt(before.coin),BigInt(COIN_PER_USER));assert.deepEqual({...after[i],coin:before.coin},before,'Unrelated wallet fields changed');
   const log=byUser.get(before.id);assert.ok(log);assert.equal(log.change_amount,COIN_PER_USER);assert.equal(log.balance_after,after[i].coin);
   return {userId:before.id,role:roster[i].role,coinBefore:before.coin,coinAfter:after[i].coin,coinLogId:log.id};
  });
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,title:TITLE,authorization:AUTHORIZATION,actor:'SYSTEM_OPS',delivery:'DIRECT',
   eligibility:'All ACTIVE secondary-verified accounts, all roles and providers; frozen at grant time',
   recipientCount:ids.length,recipientHash:plan.recipientHash,roles:plan.roles,coinPerUser:COIN_PER_USER,totalCoin:plan.totalCoin,recipients,adminId:owner.id,completedAt};
  const [audit]=await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,'VERIFIED_USERS',$3,$4,$5,$6) RETURNING id::text id",
   [owner.id,ACTION,OPERATION_KEY,JSON.stringify({recipientHash:plan.recipientHash,recipientCount:ids.length,previousOperation:null}),JSON.stringify(receipt),completedAt]);
  assert.ok(audit);receipt.auditId=audit.id;
  assert.equal((await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),completedAt])).length,1);
  const verification=await verifyBirthdayGift(db,receipt);await db.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,committed:commit,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
