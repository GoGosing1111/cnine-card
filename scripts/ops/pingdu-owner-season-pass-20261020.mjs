import assert from 'node:assert/strict';
import {SUPPORT_DURATION_MS} from '../../shared/server-support-v1.mjs';
export const OPERATION_KEY='ops:pingdu-owner-season-pass:20261020:v1';
export const ACTION='OWNER_SEASON_PASS_GRANT';
export const TARGET=Object.freeze({id:1,nickname:'핑크빛유두',role:'OWNER'});
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
export async function inspectOwnerPass(db){
 const [user]=await q(db,"SELECT id::text,nickname,role,status,EXISTS(SELECT 1 FROM user_second_verifications v WHERE v.user_id=users.id) AS verified FROM users WHERE id=1");
 assert(user&&Number(user.id)===TARGET.id&&user.nickname===TARGET.nickname&&user.role===TARGET.role&&user.status==='ACTIVE','Exact active OWNER required');
 const rows=await q(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[[OPERATION_KEY,'server_support_v1:1','supporter_season_pass_v1']]);
 const read=key=>rows.find(r=>r.key===key)?.value??null;
 const config=JSON.parse(read('supporter_season_pass_v1')||'null');
 return {user,supportRaw:read('server_support_v1:1'),receipt:JSON.parse(read(OPERATION_KEY)||'null'),pass:{enabled:config?.enabled===true,revision:config?.revision,configuredDays:config?.days?.filter(d=>d.rewards?.length).length||0}};
}
export async function verifyOwnerPass(db){
 const state=await inspectOwnerPass(db),r=state.receipt;assert(r&&r.operationKey===OPERATION_KEY&&r.status==='COMPLETED');
 assert.equal(r.subscription.endsAt-r.subscription.startsAt,SUPPORT_DURATION_MS);assert.equal(r.amountWon,0);
 const current=JSON.parse(state.supportRaw);assert.deepEqual(current,r.subscription,'Registered pass changed after this operation');
 const [audit]=await q(db,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1::bigint',[r.adminLogId]);
 assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,'1');assert.deepEqual(JSON.parse(audit.after_data),r.audit);
 assert.equal(state.user.verified,r.verifiedBefore,'Second verification is preserved');
 return {receipt:r,active:current.revokedAt===null&&current.startsAt<=Date.now()&&current.endsAt>Date.now(),pass:state.pass};
}
export async function grantOwnerPass(db,{leaseToken,lockDeadline,dryRun=false}={}){
 const prior=await inspectOwnerPass(db);if(prior.receipt)return {replayed:true,...await verifyOwnerPass(db)};
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL statement_timeout='10s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  await db.query('SELECT id FROM users WHERE id=1 FOR UPDATE');
  const state=await inspectOwnerPass(db);
  if(state.receipt){await db.query('ROLLBACK');return {replayed:true,...await verifyOwnerPass(db)};}
  assert.equal(state.supportRaw,null,'Existing subscription requires review; do not extend it automatically');
  assert(state.pass.enabled&&state.pass.configuredDays===30,'Live season pass must be configured and enabled');
  assert(lockDeadline>Date.now()+30000,'Account lock is near expiry');
  const [lease]=await q(db,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=1 AND token=$1 AND lease_until_ms=$2 FOR UPDATE',[leaseToken,lockDeadline]);assert(lease,'Account lock required');
  const now=Date.now(),subscription={version:1,revision:1,startsAt:now,endsAt:now+SUPPORT_DURATION_MS,magnetPetCode:null,revokedAt:null};
  const audit={operationKey:OPERATION_KEY,actor:'CODEX_OPERATIONS',target:TARGET,authorization:'핑크빛유두 OWNER 계정이라 예외처리하고 시즌패스 적용해',durationDays:30,amountWon:0,subscription,petGranted:false,rewardsClaimed:false};
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',['server_support_v1:1',JSON.stringify(subscription)]);
  const [log]=await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER','1',$2,$3) RETURNING id::text",[ACTION,JSON.stringify({subscription:null,verified:state.user.verified}),JSON.stringify(audit)]);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,target:TARGET,subscription,amountWon:0,verifiedBefore:state.user.verified,adminLogId:log.id,audit,completedAt:new Date(now).toISOString()};
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)]);
  const verified=await verifyOwnerPass(db);assert(verified.active);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {replayed:false,dryRun,...verified};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
