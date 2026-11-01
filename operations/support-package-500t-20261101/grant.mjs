import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readPackageCoinAccounting} from '../../tmp/duo-settlement-recovery-20261027/functions/_package_coin_accounting.js';
export const OP='ops:support-package-500t-difference:20261101:v1',ACTION='OPS_SUPPORT_PACKAGE_500T_DIFFERENCE';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows,one=rows=>(assert.equal(rows.length,1),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v,MAX=9223372036854775807n;
export const reason=id=>'시즌패스 패키지 구매 '+OP+':'+id;
export const ids=plan=>plan.targets.map(t=>t.id).sort((a,b)=>Number(a)-Number(b));
export function accountingEnv(db){return {DB:{prepare(sql){assert.match(sql,/^SELECT\b/i);let i=0;const text=sql.replace(/\?/g,()=>'$'+ ++i);return {bind(...args){return {first:async()=>(await q(db,text,args))[0]||null,all:async()=>({results:await q(db,text,args)})};}};}}};}
export function validate(plan){
 assert.equal(plan.operationKey,OP);assert.equal(plan.dateKst,'2026-11-01');assert.equal(plan.delivery,'DIRECT');assert.equal(plan.sendMessages,false);assert.equal(plan.targetCoinsPerPurchase,'500000000000000');assert.equal(new Set(ids(plan)).size,plan.targets.length);assert(plan.targets.length>0);
 const keys=new Set();let total=0n;
 for(const t of plan.targets){assert.equal(t.status,'ACTIVE');assert.match(t.identityHash,/^[a-f0-9]{64}$/);let amount=0n;
  for(const o of t.orders){assert(!keys.has(o.key));keys.add(o.key);const old=JSON.parse(o.raw);assert.equal(o.hash,hash(o.raw));assert.equal(old.status,'FULFILLED');assert.equal(String(old.userId),t.id);assert.equal(o.quantity,old.quantity??1);assert(Number.isInteger(o.quantity)&&o.quantity>=1&&o.quantity<=100);assert(old.processedAt>=Date.parse('2026-11-01T00:00:00+09:00')&&old.processedAt<Date.parse('2026-11-02T00:00:00+09:00'));assert.equal(o.beforeCoins,String(old.fulfillment.coins));assert.equal(o.beforeCoins,(400000000000000n*BigInt(o.quantity)).toString());assert.equal(o.amount,(100000000000000n*BigInt(o.quantity)).toString());assert.equal(o.log.change_amount,o.beforeCoins);assert.equal(o.log.user_id,t.id);assert.equal(o.log.reason,'시즌패스 패키지 구매 '+old.id);amount+=BigInt(o.amount);}
  assert.equal(t.amount,amount.toString());total+=amount;
 }assert.equal(plan.totalAmount,total.toString());
}
export async function receipt(db){const r=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function sourceProof(db,plan){
 const orders=plan.targets.flatMap(t=>t.orders),rows=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[orders.map(o=>o.key)]);assert.equal(rows.length,orders.length);
 const logs=await q(db,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[orders.map(o=>o.log.id)]);assert.equal(logs.length,orders.length);
 for(const o of orders){assert.equal(one(rows.filter(r=>r.key===o.key)).value,o.raw,'Original paid order changed');const log=one(logs.filter(l=>l.id===o.log.id));for(const k of Object.keys(log))assert.equal(log[k],o.log[k]);}
}
export async function snapshot(db,plan){const userIds=ids(plan);return {
 users:await q(db,'SELECT id::text,nickname,status,role,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[userIds]),
 protectedUsers:await q(db,"SELECT to_jsonb(u)-'coin' account FROM users u WHERE id=ANY($1::bigint[]) ORDER BY id",[userIds]),
 inventory:await q(db,'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',[userIds]),
 orders:await q(db,"SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key",[plan.targets.flatMap(t=>[...t.orders.map(o=>o.key),'server_support_v1:'+t.id,'support_package_pending_v1:'+t.id])]),
 accounting:await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[userIds.map(id=>'support_package_coin_v1:'+id)]),
 sync:await q(db,'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[userIds])
};}
export const protectedState=s=>({users:s.protectedUsers,inventory:s.inventory,orders:s.orders});
export async function artifacts(db,plan){return {receipt:await receipt(db),coins:await q(db,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id>$1::bigint AND user_id=ANY($2::bigint[]) AND reason=ANY($3::text[]) ORDER BY user_id',[plan.logFloor.coins,ids(plan),ids(plan).map(reason)]),audits:await q(db,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE id>$1::bigint AND action_type=$2 AND target_id=$3 ORDER BY id',[plan.logFloor.audit,ACTION,OP])};}
export async function verify(db,plan,saved){validate(plan);saved??=await receipt(db);assert.equal(saved?.status,'COMPLETED');assert.equal(saved.operationKey,OP);assert.equal(saved.planHash,hash(plan));assert.deepEqual(saved.plan,plan);assert.equal(saved.totalAmount,plan.totalAmount);assert.equal(saved.grants.length,plan.targets.length);assert.equal(saved.protectedBeforeHash,saved.protectedAfterHash);await sourceProof(db,plan);
 const a=await artifacts(db,plan);assert.deepEqual(a.receipt,saved);assert.equal(a.coins.length,plan.targets.length);const audit=one(a.audits),{auditId,...body}=saved;assert.equal(audit.id,auditId);assert.deepEqual(parse(audit.after_data),body);
 for(const t of plan.targets){const g=one(saved.grants.filter(g=>g.userId===t.id)),log=one(a.coins.filter(l=>l.user_id===t.id));assert.equal(g.amount,t.amount);assert.equal(g.logId,log.id);assert.equal(log.change_amount,t.amount);assert.equal(log.balance_after,g.after);assert.equal(log.reason,reason(t.id));assert.equal(log.admin_id,'1');assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(t.amount));assert.equal(BigInt(g.accountingAfter.restrictedExact)-BigInt(g.accountingBefore.restrictedExact),BigInt(t.amount));assert.equal(g.accountingAfter.availableExact,g.accountingBefore.availableExact);assert.equal(String(g.accountingAfter.state.cursor),log.id);assert.equal(g.accountingAfter.state.precredited,null);}
 return {verified:true,recipients:plan.targets.length,orders:plan.targets.reduce((n,t)=>n+t.orders.length,0),purchases:plan.targets.flatMap(t=>t.orders).reduce((n,o)=>n+o.quantity,0),totalAmount:plan.totalAmount,auditId:saved.auditId,completedAt:saved.completedAt,grants:saved.grants.map(({userId,nickname,amount,logId})=>({userId,nickname,amount,logId}))};
}
// Caller owns the transaction and both production account locks.
export async function grant(db,plan,{leaseToken,lockDeadline}={}){
 validate(plan);let saved=await receipt(db);if(saved)return {replayed:true,receipt:saved,verification:await verify(db,plan,saved)};
 assert.match(leaseToken||'',/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);assert.equal(one(await q(db,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst")).kst,plan.dateKst);
 await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);saved=await receipt(db);if(saved)return {replayed:true,receipt:saved,verification:await verify(db,plan,saved)};
 const userIds=ids(plan),leases=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[userIds,leaseToken,OP,Date.now()+5000])).length,userIds.length);};
 await q(db,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[userIds]);assert.equal((await q(db,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[userIds])).length,userIds.length);await leases();await sourceProof(db,plan);
 const identity=await q(db,'SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',[userIds]);
 for(const t of plan.targets){const u=one(identity.filter(u=>u.id===t.id));for(const k of ['nickname','status','role'])assert.equal(u[k],t[k]);assert.equal(hash({provider:u.provider,providerUserId:u.provider_user_id}),t.identityHash);}
 one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));const prior=await artifacts(db,plan);assert.equal(prior.receipt,null);assert.equal(prior.coins.length,0);assert.equal(prior.audits.length,0);
 const before=await snapshot(db,plan),grants=[],now=new Date().toISOString();
 for(const t of plan.targets){const old=one(before.users.filter(u=>u.id===t.id)).coin,accountingBefore=await readPackageCoinAccounting(accountingEnv(db),t.id);assert(accountingBefore.tracked);assert.equal(accountingBefore.totalExact,old);assert(BigInt(old)>=0n&&BigInt(old)+BigInt(t.amount)<=MAX);
  const after=one(await q(db,'UPDATE users SET coin=coin+$1::bigint WHERE id=$2::bigint AND coin=$3::bigint RETURNING coin::text',[t.amount,t.id,old])).coin;
  const log=one(await q(db,'INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at) VALUES($1,$2,$3,$4,1,$5) RETURNING id::text',[t.id,t.amount,after,reason(t.id),now]));
  const reconciled=await readPackageCoinAccounting(accountingEnv(db),t.id);assert.equal(BigInt(reconciled.restrictedExact)-BigInt(accountingBefore.restrictedExact),BigInt(t.amount));assert.equal(reconciled.availableExact,accountingBefore.availableExact);assert.equal(reconciled.state.precredited,null);
  const next={...reconciled.state,revision:reconciled.state.revision+1};
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at RETURNING key',[reconciled.key,JSON.stringify(next),now]));
  const accountingAfter=await readPackageCoinAccounting(accountingEnv(db),t.id);assert.equal(accountingAfter.state.cursor,Number(log.id));grants.push({userId:t.id,nickname:t.nickname,amount:t.amount,before:old,after,logId:log.id,accountingBefore,accountingAfter});
 }
 const after=await snapshot(db,plan);assert.deepEqual(protectedState(after),protectedState(before));for(const id of userIds){assert(BigInt(one(after.sync.filter(s=>s.user_id===id)).domains.wallet)>BigInt(one(before.sync.filter(s=>s.user_id===id)).domains.wallet||0));}
 const result={status:'COMPLETED',operationKey:OP,planHash:hash(plan),plan,completedAt:now,totalAmount:plan.totalAmount,grants,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),syncBefore:before.sync,syncAfter:after.sync,messagesSent:0};
 result.auditId=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER_GROUP',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({balances:before.users,protectedHash:result.protectedBeforeHash}),JSON.stringify(result),now])).id;
 one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(result),now]));await leases();return {replayed:false,receipt:result,verification:await verify(db,plan,result)};
}
