// User-authorized one-time operation. Never imported by game routes.
import assert from 'node:assert/strict';
export const DAY='2026-09-28',KEY='ops:legion-hunt-all-entry-reset:20260928:v1';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const PREFIX='legion_hunt_owner_session_v1:';
export async function inspectAllEntries(q){
 const rows=await q(`SELECT u.id,u.nickname,u.role,m.key,m.value::jsonb#>>'{daily,day}' AS day,
 m.value::jsonb#>>'{daily,used}' AS used,
 md5((m.value::jsonb #- '{daily,used}')::text) AS preserved_digest
 FROM app_meta m JOIN users u ON m.key=$1||u.id::text
 WHERE m.key LIKE $2 ORDER BY u.id`,[PREFIX,PREFIX+'%']);
 for(const row of rows)if(row.day===DAY)assert.ok(Number.isInteger(Number(row.used))&&Number(row.used)>=0&&Number(row.used)<=2,'Invalid daily counter');
 const [users]=await q('SELECT count(*)::int AS count FROM users');
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
 const [policy]=await q("SELECT value FROM app_meta WHERE key='legion_hunt_settings_v1'");
 const targets=rows.filter(row=>row.day===DAY&&Number(row.used)>0);
 return {day:DAY,totalUsers:users.count,sessionUsers:rows.length,affectedUsers:targets.length,usedEntries:targets.reduce((sum,r)=>sum+Number(r.used),0),targets,receipt:saved?parse(saved.value):null,policyDigest:policy?parse(policy.value).revision:null};
}
// Caller holds affected USER_LOCK leases and a PostgreSQL transaction.
export async function resetAllEntries(q,lockedIds){
 const [clock]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day");
 assert.equal(clock.day,DAY,'Only authorized KST day');
 await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[KEY]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]);
 const prior=parse(saved.value);
 if(prior.status==='COMPLETED')return {...prior,replayed:true};
 assert.equal(prior.status,'PENDING');
 assert.ok((await q("SELECT id FROM users WHERE id=1 AND role='OWNER'"))[0],'Audit owner missing');
 const before=await inspectAllEntries(q);
 for(const row of before.targets)assert.ok(lockedIds.includes(Number(row.id)),'New entrant detected; retry before applying');
 const keys=before.targets.map(row=>row.key);
 const locked=await q(`SELECT key,value::jsonb#>>'{daily,day}' AS day,value::jsonb#>>'{daily,used}' AS used,
 md5((value::jsonb #- '{daily,used}')::text) AS preserved_digest
 FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE`,[keys]);
 assert.equal(locked.length,keys.length);
 const balances=keys.length?await q('SELECT id,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[before.targets.map(row=>row.id)]):[];
 const [policy]=await q("SELECT value FROM app_meta WHERE key='legion_hunt_settings_v1' FOR SHARE");
 const changed=await q(`UPDATE app_meta SET value=jsonb_set(value::jsonb,'{daily,used}','0'::jsonb,false)::text,updated_at=CURRENT_TIMESTAMP
 WHERE key=ANY($1::text[]) AND value::jsonb#>>'{daily,day}'=$2 AND (value::jsonb#>>'{daily,used}')::int>0
 RETURNING key,value::jsonb#>>'{daily,used}' AS used,md5((value::jsonb #- '{daily,used}')::text) AS preserved_digest`,[keys,DAY]);
 assert.equal(changed.length,keys.length,'Counter update count');
 for(const row of changed){
  const old=locked.find(item=>item.key===row.key);
  assert.equal(row.used,'0');
  assert.equal(row.preserved_digest,old.preserved_digest,'Battle, drops, claims or non-counter data changed');
 }
 const targets=before.targets.map(row=>({userId:Number(row.id),nickname:row.nickname,beforeUsed:Number(row.used),used:0,remaining:row.role==='OWNER'?null:2,unlimited:row.role==='OWNER',preservedDigest:row.preserved_digest}));
 const audits=targets.map(target=>({id:target.userId,before:JSON.stringify({day:DAY,used:target.beforeUsed,preservedDigest:target.preservedDigest}),after:JSON.stringify({...target,day:DAY,operationKey:KEY,authorization:'전체유저 군단토벌 횟수 리셋해'})}));
 const logRows=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
 SELECT 1,'LEGION_HUNT_DAILY_ENTRY_RESET','USER',r.id::text,r.before,r.after
 FROM jsonb_to_recordset($1::jsonb) AS r(id bigint,before text,after text)
 RETURNING id,target_id`,[JSON.stringify(audits)]);
 assert.equal(logRows.length,targets.length);
 for(const target of targets)target.adminLogId=String(logRows.find(row=>Number(row.target_id)===target.userId).id);
 if(keys.length)assert.deepEqual(await q('SELECT id,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[targets.map(row=>row.userId)]),balances,'Balances changed during reset');
 assert.equal((await q("SELECT value FROM app_meta WHERE key='legion_hunt_settings_v1'"))[0]?.value,policy?.value,'Policy changed');
 const remaining=await q(`SELECT key FROM app_meta WHERE key LIKE $1 AND value::jsonb#>>'{daily,day}'=$2 AND (value::jsonb#>>'{daily,used}')::int>0`,[PREFIX+'%',DAY]);
 assert.equal(remaining.length,0,'New entry during reset; transaction must retry');
 const result={status:'COMPLETED',operationKey:KEY,day:DAY,totalUsers:before.totalUsers,count:targets.length,restoredEntries:targets.reduce((sum,row)=>sum+row.beforeUsed,0),targets,battleAndRewardsPreserved:true,balancesPreserved:true,policyPreserved:true,completedAt:new Date().toISOString()};
 await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(result),KEY]);
 return {...result,replayed:false};
}
export async function verifyReceipt(q,record){
 if(!record)return null;
 assert.equal(record.status,'COMPLETED');
 const rows=await q("SELECT id,target_id,after_data FROM admin_logs WHERE action_type='LEGION_HUNT_DAILY_ENTRY_RESET' AND id=ANY($1::bigint[])",[record.targets.map(row=>row.adminLogId)]);
 assert.equal(rows.length,record.count);
 for(const target of record.targets){
  const row=rows.find(item=>String(item.id)===target.adminLogId);
  assert.equal(Number(row.target_id),target.userId);
  assert.equal(parse(row.after_data).operationKey,KEY);
  assert.equal(target.used,0);
 }
 return {auditCount:rows.length,verified:true};
}
