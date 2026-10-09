import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const PLAN=Object.freeze({
 operationKey:'ops:hope-pubg-chicken:verified-coin:20261010:v1',
 title:'희망조 배그 치킨 미션 기념',
 authorization:'2차인증 전체유저 1조코인 지급 희망조 배그 치킨 미션 기념',
 delivery:'DIRECT',coinPerRecipient:'1000000000000',recipientCount:546,totalCoin:'546000000000000',
 recipientHash:'abab4fe30b9c9e692e379b122873e3622fe0102499921d62027769140762d813',
 eligibility:'ACTIVE accounts in user_second_verifications; all verified USER, ADMIN and OWNER accounts',
 roleCounts:{OWNER:2,USER:542,ADMIN:2},providerCounts:{PLAYDK:545,WAGO:1},excludedBanned:1,
 inspectedAt:'2026-10-09T20:26:56.051Z'
});
export const OPERATION_KEY=PLAN.operationKey;
export const ACTION='OPS_HOPE_PUBG_CHICKEN_COIN_20261010';
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
const safeMax=BigInt(Number.MAX_SAFE_INTEGER);
export const recipientHash=rows=>createHash('sha256').update(JSON.stringify(rows.map(
 ({userId,role,provider,providerUserId})=>({userId,role,provider,providerUserId})
))).digest('hex');
const counts=(rows,key)=>rows.reduce((result,row)=>{result[row[key]]=(result[row[key]]||0)+1;return result;},{});

export async function eligibleRecipients(c,{lock=false}={}){
 return q(c,`SELECT u.id::text AS "userId",u.nickname,
  UPPER(TRIM(COALESCE(u.role,'USER'))) AS role,u.coin::text AS coin,
  s.provider,s.provider_user_id AS "providerUserId"
  FROM user_second_verifications s JOIN users u ON u.id=s.user_id
  WHERE UPPER(TRIM(COALESCE(u.status,'ACTIVE')))='ACTIVE' ORDER BY u.id
  ${lock?'FOR UPDATE OF u FOR SHARE OF s':''}`);
}

function validateRecipients(rows){
 assert.equal(rows.length,PLAN.recipientCount,'Eligible recipient count changed');
 assert.equal(new Set(rows.map(r=>r.userId)).size,PLAN.recipientCount);
 assert.equal(recipientHash(rows),PLAN.recipientHash,'Eligible identities changed; inspect again before payment');
 assert.deepEqual(counts(rows,'role'),PLAN.roleCounts);
 assert.deepEqual(counts(rows,'provider'),PLAN.providerCounts);
}

export async function verifyHopeCoins(c,receipt,{balances=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.planHash,PLAN_HASH);assert.deepEqual(receipt.plan,PLAN);
 const grants=receipt.grants;validateRecipients(grants);
 const ids=grants.map(g=>g.userId),logIds=grants.map(g=>g.coinLogId);
 assert.equal(new Set(logIds).size,PLAN.recipientCount);
 const logs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=ANY($1::bigint[])',[logIds]);
 assert.equal(logs.length,PLAN.recipientCount);
 assert.equal(new Set(logs.map(l=>l.user_id)).size,PLAN.recipientCount);
 const logsById=new Map(logs.map(l=>[l.id,l]));
 const current=balances?await q(c,'SELECT id::text,coin::text FROM users WHERE id=ANY($1::bigint[])',[ids]):[];
 const balancesById=new Map(current.map(u=>[u.id,u.coin]));
 let total=0n;
 for(const grant of grants){
  assert.equal(grant.amount,PLAN.coinPerRecipient);
  assert.equal(BigInt(grant.after)-BigInt(grant.before),BigInt(PLAN.coinPerRecipient));
  assert.ok(BigInt(grant.before)>=0n&&BigInt(grant.after)<=safeMax);
  const log=logsById.get(grant.coinLogId);assert.ok(log);
  assert.equal(log.user_id,grant.userId);assert.equal(log.change_amount,grant.amount);
  assert.equal(log.balance_after,grant.after);assert.equal(log.reason,PLAN.title);assert.equal(log.admin_id,receipt.adminId);
  if(balances)assert.equal(balancesById.get(grant.userId),grant.after);
  total+=BigInt(grant.amount);
 }
 assert.equal(String(total),PLAN.totalCoin);
 const audits=await q(c,'SELECT id::text,admin_id::text,action_type,target_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1::bigint',[receipt.adminLogId]);
 assert.equal(audits.length,1);
 const audit=audits[0];assert.equal(audit.admin_id,receipt.adminId);assert.equal(audit.action_type,ACTION);
 assert.equal(audit.target_type,'VERIFIED_USERS');assert.equal(audit.target_id,OPERATION_KEY);
 assert.deepEqual(JSON.parse(audit.before_data),{recipientHash:PLAN.recipientHash,recipients:PLAN.recipientCount,priorGrant:false});
 assert.deepEqual(JSON.parse(audit.after_data),{actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,grants});
 return {recipients:grants.length,coinLogs:logs.length,adminLogs:1,missing:0,duplicates:0,totalCoin:String(total)};
}

// Caller owns BEGIN and COMMIT/ROLLBACK. Credit, ledger, audit and receipt commit together.
export async function grantHopeCoins(c,approvedPlanHash){
 assert.equal(approvedPlanHash,PLAN_HASH,'Inspected plan hash required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){
  const receipt=JSON.parse(saved.value);
  return {receipt,replayed:true,verification:await verifyHopeCoins(c,receipt)};
 }
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE action_type=$1 LIMIT 1',[ACTION])).length,0,'Prior audit without receipt requires reconciliation');
 const recipients=await eligibleRecipients(c,{lock:true});validateRecipients(recipients);
 for(const user of recipients)assert.ok(BigInt(user.coin)>=0n&&BigInt(user.coin)+BigInt(PLAN.coinPerRecipient)<=safeMax,'Unsafe resulting coin balance');
 const [owner]=await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");assert.ok(owner);
 const [cutoff]=await q(c,'SELECT clock_timestamp()::text AS at');
 const ids=recipients.map(r=>r.userId);
 const credited=await q(c,'UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id::text,coin::text',[ids,PLAN.coinPerRecipient]);
 assert.equal(credited.length,PLAN.recipientCount);
 const logs=await q(c,`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id)
  SELECT id,$2::bigint,coin,$3,$4 FROM users WHERE id=ANY($1::bigint[])
  RETURNING id::text,user_id::text`,[ids,PLAN.coinPerRecipient,PLAN.title,owner.id]);
 assert.equal(logs.length,PLAN.recipientCount);
 const creditedById=new Map(credited.map(u=>[u.id,u.coin])),logsByUser=new Map(logs.map(l=>[l.user_id,l.id]));
 const grants=recipients.map(({coin,...r})=>({...r,amount:PLAN.coinPerRecipient,before:coin,after:creditedById.get(r.userId),coinLogId:logsByUser.get(r.userId)}));
 const audits=await q(c,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,$2,'VERIFIED_USERS',$3,$4,$5) RETURNING id::text`,[owner.id,ACTION,OPERATION_KEY,
  JSON.stringify({recipientHash:PLAN.recipientHash,recipients:PLAN.recipientCount,priorGrant:false}),
  JSON.stringify({actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,grants})]);
 assert.equal(audits.length,1);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,
  adminId:owner.id,adminLogId:audits[0].id,grants,eligibilityConfirmedAt:cutoff.at,completedAt:new Date().toISOString()};
 assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
 return {receipt,replayed:false,verification:await verifyHopeCoins(c,receipt,{balances:true})};
}
