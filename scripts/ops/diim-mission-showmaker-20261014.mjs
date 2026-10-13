import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(fs.readFileSync(new URL('./diim-mission-showmaker-20261014.json',import.meta.url),'utf8'));
export const OPERATION_KEY=PLAN.operationKey;
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
export const ACTION='OPS_DIIM_MISSION_SHOWMAKER_20261014';
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
const ids=PLAN.recipients.map(r=>r.userId);
const safeMax=BigInt(Number.MAX_SAFE_INTEGER);
assert.equal(new Set(ids).size,1);
assert.equal(BigInt(PLAN.coinPerRecipient)*BigInt(ids.length),BigInt(PLAN.totalCoin));

export async function verifyGrant(c,receipt,{balances=false}={}){
 assert.equal(receipt.status,'COMPLETED');
 assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.planHash,PLAN_HASH);
 assert.deepEqual(receipt.plan,PLAN);
 assert.deepEqual(receipt.grants.map(({userId,nickname})=>({userId,nickname})),PLAN.recipients);
 const logIds=receipt.grants.map(g=>g.coinLogId);
 assert.equal(new Set(logIds).size,ids.length);
 const logs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=ANY($1::bigint[])',[logIds]);
 assert.equal(logs.length,ids.length);
 const logsById=new Map(logs.map(l=>[l.id,l]));
 const current=balances?await q(c,'SELECT id::text,coin::text FROM users WHERE id=ANY($1::bigint[])',[ids]):[];
 const balancesById=new Map(current.map(u=>[u.id,u.coin]));
 let total=0n;
 for(const grant of receipt.grants){
  assert.equal(grant.amount,PLAN.coinPerRecipient);
  assert.equal(BigInt(grant.after)-BigInt(grant.before),BigInt(grant.amount));
  assert.ok(BigInt(grant.before)>=0n&&BigInt(grant.after)<=safeMax);
  const log=logsById.get(grant.coinLogId);assert.ok(log);
  assert.equal(log.user_id,grant.userId);assert.equal(log.change_amount,grant.amount);
  assert.equal(log.balance_after,grant.after);assert.equal(log.reason,PLAN.title);assert.equal(log.admin_id,receipt.adminId);
  if(balances)assert.equal(balancesById.get(grant.userId),grant.after);
  total+=BigInt(grant.amount);
 }
 assert.equal(String(total),PLAN.totalCoin);
 const audits=await q(c,'SELECT id::text,admin_id::text,action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1::bigint',[receipt.adminLogId]);
 assert.equal(audits.length,1);
 const audit=audits[0];
 assert.equal(audit.admin_id,receipt.adminId);assert.equal(audit.action_type,ACTION);
 assert.equal(audit.target_type,'USERS');assert.equal(audit.target_id,OPERATION_KEY);
 assert.deepEqual(JSON.parse(audit.after_data),{actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,grants:receipt.grants});
 return{recipients:ids.length,coinLogs:logs.length,adminLogs:1,totalCoin:String(total),missing:0,duplicates:0};
}

// The caller owns the transaction. Credit, coin ledger, audit and receipt commit together.
export async function grantCoins(c,approvedPlanHash){
 assert.equal(approvedPlanHash,PLAN_HASH);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){
  const receipt=JSON.parse(saved.value);
  return{receipt,replayed:true,verification:await verifyGrant(c,receipt)};
 }
 const users=await q(c,'SELECT id::text AS "userId",nickname,status,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 assert.equal(users.length,ids.length);
 assert.deepEqual(users.map(({userId,nickname})=>({userId,nickname})),PLAN.recipients,'Target identity changed');
 const [verified]=await q(c,'SELECT user_id::text,provider,provider_user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[PLAN.verification.userId]);
 assert.ok(verified);assert.equal(verified.provider,PLAN.verification.provider);assert.equal(verified.provider_user_id,PLAN.verification.providerUserId);
 assert.equal(verified.user_id,PLAN.recipients[0].userId);
 for(const user of users){
  assert.equal(user.status,'ACTIVE');
  assert.ok(BigInt(user.coin)>=0n&&BigInt(user.coin)+BigInt(PLAN.coinPerRecipient)<=safeMax);
 }
 const [owner]=await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
 assert.ok(owner);
 const credited=await q(c,'UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id::text,coin::text',[ids,PLAN.coinPerRecipient]);
 assert.equal(credited.length,ids.length);
 const logs=await q(c,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) SELECT id,$2::bigint,coin,$3,$4 FROM users WHERE id=ANY($1::bigint[]) RETURNING id::text,user_id::text',[ids,PLAN.coinPerRecipient,PLAN.title,owner.id]);
 assert.equal(logs.length,ids.length);
 const balancesById=new Map(credited.map(u=>[u.id,u.coin]));
 const logsByUser=new Map(logs.map(l=>[l.user_id,l.id]));
 const grants=users.map(({coin,status,...u})=>({...u,amount:PLAN.coinPerRecipient,before:coin,after:balancesById.get(u.userId),coinLogId:logsByUser.get(u.userId)}));
 const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USERS',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,OPERATION_KEY,JSON.stringify({recipients:users}),JSON.stringify({actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,grants})]);
 assert.ok(audit);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,adminId:owner.id,adminLogId:audit.id,grants,completedAt:new Date().toISOString()};
 assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
 return{receipt,replayed:false,verification:await verifyGrant(c,receipt,{balances:true})};
}
