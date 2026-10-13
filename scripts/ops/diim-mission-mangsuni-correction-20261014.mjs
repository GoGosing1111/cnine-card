import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(fs.readFileSync(new URL('./diim-mission-mangsuni-correction-20261014.json',import.meta.url),'utf8'));
export const OPERATION_KEY=PLAN.operationKey;
export const PLAN_HASH=createHash('sha256').update(JSON.stringify(PLAN)).digest('hex');
export const ACTION='OPS_DIIM_MISSION_RECIPIENT_CORRECTION_20261014';
export const IDS=[PLAN.from.userId,PLAN.to.userId];
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
assert.equal(new Set(IDS).size,2);
const marker=()=>({operationKey:OPERATION_KEY,originalOperationKey:PLAN.originalOperationKey,originalCoinLogId:PLAN.originalCoinLogId,fromUserId:PLAN.from.userId,toUserId:PLAN.to.userId,amount:PLAN.amount});

export async function verifyCorrection(c,receipt,{balances=false}={}){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.planHash,PLAN_HASH);assert.deepEqual(receipt.plan,PLAN);
 assert.equal(receipt.from.userId,PLAN.from.userId);assert.equal(receipt.to.userId,PLAN.to.userId);
 assert.equal(BigInt(receipt.from.before)-BigInt(receipt.from.after),BigInt(PLAN.amount));
 assert.equal(BigInt(receipt.to.after)-BigInt(receipt.to.before),BigInt(PLAN.amount));
 assert.equal(BigInt(receipt.from.before)+BigInt(receipt.to.before),BigInt(receipt.from.after)+BigInt(receipt.to.after));
 assert.ok(BigInt(receipt.from.after)>=0n);
 const logIds=[receipt.from.coinLogId,receipt.to.coinLogId];assert.equal(new Set(logIds).size,2);
 const logs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=ANY($1::bigint[])',[logIds]);
 assert.equal(logs.length,2);
 for(const [account,amount,reason] of [[receipt.from,'-'+PLAN.amount,PLAN.recoveryReason],[receipt.to,PLAN.amount,PLAN.grantReason]]){
  const log=logs.find(l=>l.id===account.coinLogId);assert.ok(log);
  assert.equal(log.user_id,account.userId);assert.equal(log.change_amount,amount);
  assert.equal(log.balance_after,account.after);assert.equal(log.reason,reason);assert.equal(log.admin_id,receipt.adminId);
 }
 const [claim]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[PLAN.reversalKey]);assert.ok(claim);
 assert.deepEqual(JSON.parse(claim.value),marker());
 const [audit]=await q(c,'SELECT action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1::bigint',[receipt.adminLogId]);assert.ok(audit);
 assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USERS');assert.equal(audit.target_id,OPERATION_KEY);
 assert.deepEqual(JSON.parse(audit.after_data),{actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,from:receipt.from,to:receipt.to,originalGrant:receipt.originalGrant});
 const [original]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[PLAN.originalOperationKey]);assert.ok(original);
 assert.deepEqual(JSON.parse(original.value).grants.find(g=>g.coinLogId===PLAN.originalCoinLogId),receipt.originalGrant);
 if(balances){
  const users=await q(c,'SELECT id::text,coin::text FROM users WHERE id=ANY($1::bigint[])',[IDS]);
  for(const account of [receipt.from,receipt.to])assert.equal(users.find(u=>u.id===account.userId)?.coin,account.after);
 }
 return{recoveredCoin:PLAN.amount,regrantedCoin:PLAN.amount,netCoinChange:'0',coinLogs:2,adminLogs:1,originalGrantPreserved:true,duplicates:0};
}

// Caller owns the transaction; recovery, regrant, ledgers and both receipts are atomic.
export async function correctGrant(c,approvedPlanHash){
 assert.equal(approvedPlanHash,PLAN_HASH);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return{receipt,replayed:true,verification:await verifyCorrection(c,receipt)};}
 assert.equal((await q(c,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[PLAN.reversalKey])).length,0,'Original grant already recovered');
 const [original]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR SHARE',[PLAN.originalOperationKey]);assert.ok(original);
 const originalReceipt=JSON.parse(original.value);assert.equal(originalReceipt.status,'COMPLETED');
 const originalGrant=originalReceipt.grants.find(g=>g.coinLogId===PLAN.originalCoinLogId);assert.ok(originalGrant);
 assert.equal(originalGrant.userId,PLAN.from.userId);assert.equal(originalGrant.amount,PLAN.amount);
 const [originalLog]=await q(c,'SELECT user_id::text,change_amount::text,balance_after::text,reason FROM coin_logs WHERE id=$1::bigint',[PLAN.originalCoinLogId]);assert.ok(originalLog);
 assert.equal(originalLog.user_id,PLAN.from.userId);assert.equal(originalLog.change_amount,PLAN.amount);assert.equal(originalLog.balance_after,originalGrant.after);assert.equal(originalLog.reason,PLAN.grantReason);
 const users=await q(c,'SELECT id::text AS "userId",nickname,status,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]);assert.equal(users.length,2);
 const from=users.find(u=>u.userId===PLAN.from.userId),to=users.find(u=>u.userId===PLAN.to.userId);
 assert.equal(from.nickname,PLAN.from.nickname);assert.equal(to.nickname,PLAN.to.nickname);
 assert.equal(from.status,'ACTIVE');assert.equal(to.status,'ACTIVE');
 const [verified]=await q(c,'SELECT user_id::text,provider,provider_user_id,provider_name FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[to.userId]);assert.ok(verified);
 assert.equal(verified.provider,PLAN.to.provider);assert.equal(verified.provider_user_id,PLAN.to.providerUserId);
 assert.ok(BigInt(from.coin)>=BigInt(PLAN.amount),'Insufficient coins to recover original grant');
 assert.ok(BigInt(to.coin)>=0n&&BigInt(to.coin)+BigInt(PLAN.amount)<=BigInt(Number.MAX_SAFE_INTEGER));
 const [owner]=await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");assert.ok(owner);
 const recovered=await q(c,'UPDATE users SET coin=coin-$2::bigint WHERE id=$1 AND coin>=$2::bigint RETURNING coin::text',[from.userId,PLAN.amount]);assert.equal(recovered.length,1);
 const credited=await q(c,'UPDATE users SET coin=coin+$2::bigint WHERE id=$1 RETURNING coin::text',[to.userId,PLAN.amount]);assert.equal(credited.length,1);
 const logs=await q(c,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES($1,-$3::bigint,$4::bigint,$6,$8),($2,$3::bigint,$5::bigint,$7,$8) RETURNING id::text,user_id::text',[from.userId,to.userId,PLAN.amount,recovered[0].coin,credited[0].coin,PLAN.recoveryReason,PLAN.grantReason,owner.id]);assert.equal(logs.length,2);
 const fromRecord={userId:from.userId,nickname:from.nickname,before:from.coin,after:recovered[0].coin,coinLogId:logs.find(l=>l.user_id===from.userId).id};
 const toRecord={userId:to.userId,nickname:to.nickname,before:to.coin,after:credited[0].coin,coinLogId:logs.find(l=>l.user_id===to.userId).id};
 const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USERS',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,OPERATION_KEY,JSON.stringify({from,to}),JSON.stringify({actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,from:fromRecord,to:toRecord,originalGrant})]);assert.ok(audit);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,adminId:owner.id,adminLogId:audit.id,from:fromRecord,to:toRecord,originalGrant,completedAt:new Date().toISOString()};
 assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[PLAN.reversalKey,JSON.stringify(marker())])).rowCount,1);
 assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
 return{receipt,replayed:false,verification:await verifyCorrection(c,receipt,{balances:true})};
}
