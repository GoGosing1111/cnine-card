// One-time, user-authorized entry reset. Never imported by gameplay routes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const KEY='ops:legion-hunt-entry-reset:20260928:v1',DAY='2026-09-28';
export const TARGETS=Object.freeze([
 {id:52,nickname:'폭군#'},{id:850,nickname:'뽑기고수71'},
 {id:1195,nickname:'씨나인택갓'},{id:4570,nickname:'혜정'},{id:4705,nickname:'˚쟁이。'}
]);
const ids=TARGETS.map(t=>t.id),keys=ids.map(id=>'legion_hunt_owner_session_v1:'+id);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const withoutDaily=run=>{const {daily,...rest}=run;return rest;};

export async function inspectEntryReset(q){
 const rows=await q('SELECT u.id,u.nickname,u.role,m.value,m.updated_at FROM users u JOIN app_meta m ON m.key=\'legion_hunt_owner_session_v1:\'||u.id::text WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',[ids]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
 return {day:DAY,targets:rows.map(row=>{
  const run=parse(row.value);
  return {userId:Number(row.id),nickname:row.nickname,role:row.role,day:run.daily?.day,used:run.daily?.used,remaining:run.daily?.day===DAY?2-run.daily.used:2,sessionId:run.state?.id,sessionEnded:run.state?.ended,liveRewards:run.liveRewards,stateDigest:hash(withoutDaily(run))};
 }),receipt:saved?parse(saved.value):null};
}

// Caller holds the five USER_LOCK leases and one PostgreSQL transaction.
export async function resetLegionHuntEntries(q){
 const [clock]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day");
 assert.equal(clock.day,DAY,'Authorized KST date only');
 await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[KEY]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]),prior=parse(saved.value);
 if(prior.status==='COMPLETED')return {...prior,replayed:true};
 assert.equal(prior.status,'PENDING');
 const users=await q('SELECT id,nickname,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 assert.equal(users.length,TARGETS.length);
 for(const target of TARGETS){
  const user=users.find(row=>Number(row.id)===target.id);
  assert.equal(user.nickname,target.nickname,'Account name changed');assert.equal(user.role,'USER');
 }
 assert.ok((await q("SELECT id FROM users WHERE id=1 AND role='OWNER'"))[0],'Audit owner missing');
 const [policy]=await q("SELECT value FROM app_meta WHERE key='legion_hunt_settings_v1' FOR SHARE");
 const [assignment]=await q("SELECT after_data FROM admin_logs WHERE id=36753 AND action_type='LEGION_HUNT_SETTINGS_SAVE'");
 assert.ok(assignment,'Verified test assignment missing');
 assert.equal(parse(assignment.after_data).mode,'TEST');
 assert.deepEqual(parse(assignment.after_data).testUserIds,ids,'Test participant set changed');
 const runs=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[keys]);
 assert.equal(runs.length,TARGETS.length);
 const now=new Date().toISOString(),results=[];
 for(const target of TARGETS){
  const key='legion_hunt_owner_session_v1:'+target.id,row=runs.find(row=>row.key===key),before=parse(row.value);
  assert.equal(before.daily?.day,DAY,'No entry use on the authorized day');
  assert.ok(Number.isInteger(before.daily.used)&&before.daily.used>=0&&before.daily.used<=2,'Invalid entry counter');
  const after={...before,daily:{...before.daily,used:0}},stateDigest=hash(withoutDaily(before));
  const updated=await q('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[JSON.stringify(after),now,key,row.value]);
  assert.equal(updated.length,1,'Concurrent session change');
  const [check]=await q('SELECT value FROM app_meta WHERE key=$1',[key]),verified=parse(check.value);
  assert.deepEqual(verified.daily,{...before.daily,used:0});
  assert.deepEqual(withoutDaily(verified),withoutDaily(before),'Active battle, drops or claims changed');
  const result={userId:target.id,nickname:target.nickname,beforeUsed:before.daily.used,used:0,remaining:2,sessionId:before.state?.id,stateDigest,statePreserved:true};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',[
   'LEGION_HUNT_DAILY_ENTRY_RESET','USER',String(target.id),
   JSON.stringify({daily:before.daily,sessionId:before.state?.id,stateDigest}),
   JSON.stringify({...result,day:DAY,operationKey:KEY,testAssignmentAdminLogId:36753,authorization:'오늘 군단토벌 태스트한 계정들 횟수 리셋시켜'})
  ]);
  assert.ok(audit);result.adminLogId=String(audit.id);results.push(result);
 }
 assert.deepEqual(await q('SELECT id,nickname,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]),users,'Account balances changed');
 assert.equal((await q("SELECT value FROM app_meta WHERE key='legion_hunt_settings_v1'"))[0].value,policy.value,'CMS policy changed');
 const result={status:'COMPLETED',operationKey:KEY,day:DAY,count:results.length,targets:results,completedAt:now,balancesPreserved:true,policyPreserved:true};
 await q('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3',[JSON.stringify(result),now,KEY]);
 return {...result,replayed:false};
}
