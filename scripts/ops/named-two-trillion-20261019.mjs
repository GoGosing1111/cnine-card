import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(readFileSync(new URL('./named-two-trillion-20261019-plan.json',import.meta.url),'utf8'));
export const PLAN_HASH='28f085ab137bca2b6fcd87703a6d30f5024954d61769872d705d02e0b15e6833';
export const OPERATION_KEY='ops:named-two-trillion:20261019:v1';
export const REASON='명단 지정 2조 코인 지급 · 2026-10-19';
const ACTION='OPS_NAMED_TWO_TRILLION_GRANT';
export const TARGETS=[...PLAN.recipients].sort((a,b)=>Number(a.userId)-Number(b.userId));
const IDS=TARGETS.map(t=>t.userId),NAMES=TARGETS.map(t=>t.nickname);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const walletSql='SELECT id::text id,nickname,status,role,coin::text coin,card_shards::text card_shards,magic_crystals::text magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id::bigint';
function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan required');
 assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),PLAN_HASH,'Plan changed');
 assert.equal(PLAN.operationKey,OPERATION_KEY);assert.equal(PLAN.recipientCount,39);assert.equal(TARGETS.length,39);
 assert.equal(new Set(IDS).size,39);assert.equal(new Set(NAMES).size,39);assert.equal(PLAN.amountEach,'2000000000000');assert.equal(PLAN.totalCoin,'78000000000000');
 assert.equal(TARGETS.filter(t=>t.nickname==='Mild7').length,1);
}
async function saved(c){return (await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).map(r=>JSON.parse(r.value))[0]??null;}
function identities(users){
 assert.deepEqual(users.map(u=>u.id),IDS,'Missing, duplicated or ambiguous account');
 for(let i=0;i<TARGETS.length;i++){
  const u=users[i],t=TARGETS[i];assert.equal(u.nickname,t.nickname,'Nickname changed');assert.equal(u.role,t.role);assert.equal(u.status,'ACTIVE');
  assert(BigInt(u.coin)>=0n&&BigInt(u.coin)+BigInt(PLAN.amountEach)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported coin balance');
 }
}
export async function inspect(c){
 validate(PLAN_HASH);
 const users=await q(c,'SELECT id::text id,nickname,status,role,coin::text coin FROM users WHERE id=ANY($1::bigint[]) OR nickname=ANY($2::text[]) ORDER BY id::bigint',[IDS,NAMES]);identities(users);
 const receipt=await saved(c);
 const recent=one(await q(c,'SELECT COUNT(*)::int n FROM coin_logs WHERE id>(SELECT COALESCE(MAX(id),0)-100000 FROM coin_logs) AND reason=$1',[REASON]));
 return {recipientCount:39,totalCoin:PLAN.totalCoin,amountEach:PLAN.amountEach,planHash:PLAN_HASH,users,receipt,recentMatchingLogs:recent.n};
}
export async function verify(c,receipt){
 validate(PLAN_HASH);const r=receipt??await saved(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.planHash,PLAN_HASH);assert.deepEqual(r.plan,PLAN);
 assert.equal(r.delivery,'DIRECT');assert.equal(r.recipientCount,39);assert.equal(r.totalCoin,PLAN.totalCoin);assert.equal(r.recipients.length,39);
 assert.deepEqual(r.recipients.map(t=>t.userId),IDS);
 const logs=await q(c,'SELECT id::text id,user_id::text user_id,change_amount::text change_amount,balance_after::text balance_after,reason,admin_id::text admin_id FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY coin_logs.user_id',[r.recipients.map(t=>t.coinLogId)]);
 assert.equal(logs.length,39);assert.deepEqual(logs.map(t=>t.user_id),IDS);
 for(let i=0;i<39;i++){
  const t=TARGETS[i],g=r.recipients[i],l=logs[i];assert.equal(g.nickname,t.nickname);assert.equal(l.id,g.coinLogId);assert.equal(l.change_amount,PLAN.amountEach);assert.equal(l.balance_after,g.coinAfter);assert.equal(l.reason,REASON);assert.equal(l.admin_id,r.adminId);
  assert.equal(BigInt(g.coinAfter)-BigInt(g.coinBefore),BigInt(PLAN.amountEach));
 }
 const audit=one(await q(c,'SELECT admin_id::text admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.auditId]));assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);assert.equal(audit.admin_id,r.adminId);
 const {auditId,...audited}=r;assert.deepEqual(JSON.parse(audit.after_data),audited);
 return {status:'VERIFIED',recipientCount:39,amountEach:PLAN.amountEach,totalCoin:PLAN.totalCoin,coinLogs:logs.length,mild7Included:true,missing:0,duplicates:0,auditId:r.auditId,completedAt:r.completedAt};
}
// Direct additive credits use current row-locked balances. All ledger rows,
// audit and the immutable one-time receipt commit together; no message is sent.
export async function grant(c,{expectedPlanHash,commit=false}={}){
 validate(expectedPlanHash);await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='15s'");
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const existing=await saved(c);if(existing){const verification=await verify(c,existing);await c.query('ROLLBACK');return {receipt:existing,verification,replayed:true,committed:true};}
  assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,39);
  const before=await inspect(c);assert.equal(before.receipt,null);assert.equal(before.recentMatchingLogs,0,'Prior or orphan credit needs reconciliation');
  const owner=one(await q(c,"SELECT id::text id FROM users WHERE id=1 AND status='ACTIVE' AND role='OWNER'"));
  const wallets=await q(c,walletSql,[IDS]);identities(wallets);
  const completedAt=new Date().toISOString();
  const logs=await q(c,`WITH credited AS (UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin)
   INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
   SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id::text id,user_id::text user_id,change_amount::text change_amount,balance_after::text balance_after`,[IDS,PLAN.amountEach,REASON,owner.id,completedAt]);
  assert.equal(logs.length,39);const byUser=new Map(logs.map(l=>[l.user_id,l]));assert.equal(byUser.size,39);
  const after=await q(c,walletSql,[IDS]);assert.deepEqual(after.map(u=>u.id),IDS);
  const recipients=wallets.map((u,i)=>{
   const a=after[i],l=byUser.get(u.id);assert.equal(BigInt(a.coin)-BigInt(u.coin),BigInt(PLAN.amountEach));assert.deepEqual({...a,coin:u.coin},u,'Unrelated wallet data changed');
   assert.equal(l.change_amount,PLAN.amountEach);assert.equal(l.balance_after,a.coin);
   return {userId:u.id,nickname:u.nickname,coinBefore:u.coin,coinAfter:a.coin,coinLogId:l.id};
  });
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,delivery:'DIRECT',recipientCount:39,totalCoin:PLAN.totalCoin,recipients,adminId:owner.id,completedAt};
  receipt.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,'NAMED_USERS',$3,$4,$5,$6) RETURNING id::text id",[owner.id,ACTION,OPERATION_KEY,JSON.stringify({recipientCount:39,priorReceipt:null}),JSON.stringify(receipt),completedAt])).id;
  one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),completedAt]));
  const verification=await verify(c,receipt);await c.query(commit?'COMMIT':'ROLLBACK');return {receipt,verification,committed:commit,replayed:false};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
}
