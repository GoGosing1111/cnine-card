import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startCoupRound} from '../../functions/_coup.js';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';

export const ROUND_ID='337d1c95-4d88-4045-a81d-4ab359e5f627';
export const APPOINTMENT_ID='ed09bfce-ae09-4222-ae97-3049c9fed1e3';
export const OPERATION_KEY='ops:coup-start:20261018:2200:v1';
export const START_AT=Date.parse('2026-10-18T22:00:00+09:00');
export const LATEST_START_AT=START_AT+10*60*1000;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;

// The caller owns the entire transaction, including the production start routine,
// audit and retry receipt. Tests use the same routine and explicitly roll back.
export async function startScheduledCoup(c,now){
 assert.ok(Number.isSafeInteger(now),'Database time is required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);assert.equal(receipt.roundId,ROUND_ID);return {changed:false,replayed:true,receipt};}
 assert.ok(now>=START_AT,'Scheduled start is not due');
 assert.ok(now<=LATEST_START_AT,'Scheduled start window expired; do not start late or on another day');
 const settingsSql="SELECT key,value FROM app_meta WHERE key IN ('chief_appointment_v1','coup_settings_v2115','coup_chief_skill_settings_v2118') ORDER BY key";
 const settings=await q(c,settingsSql+' FOR UPDATE');
 const cfg=Object.fromEntries(settings.map(r=>[r.key,JSON.parse(r.value)]));
 assert.equal(cfg.coup_settings_v2115?.enabled,true,'Coup has been turned OFF');
 assert.equal(cfg.chief_appointment_v1?.id,APPOINTMENT_ID,'Chief appointment changed');
 const [owner]=await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner);
 const [round]=await q(c,'SELECT * FROM coup_rounds_v2115 WHERE id=$1 FOR UPDATE',[ROUND_ID]);
 assert.ok(round);assert.equal(round.appointment_id,APPOINTMENT_ID);assert.equal(Number(round.chief_user_id),5426);
 if(round.status==='ACTIVE')return {changed:false,alreadyActive:true,round:{id:round.id,status:round.status,startsAt:Number(round.starts_at),endsAt:Number(round.ends_at)}};
 assert.equal(round.status,'RECRUITING','Target round no longer recruiting');assert.equal(round.starts_at,null);
 const beforeSettings=JSON.parse(round.settings_json);
 assert.equal(beforeSettings.rebelCommand?.roundId,ROUND_ID);assert.equal(Number(beforeSettings.rebelCommand?.userId),45,'Rebel commander changed');
 const participantSql='SELECT * FROM coup_participants_v2115 WHERE round_id=$1 ORDER BY user_id';
 const participants=await q(c,participantSql+' FOR SHARE',[ROUND_ID]);
 assert.ok(participants.some(r=>r.side==='CHIEF')&&participants.some(r=>r.side==='REBEL'),'Both sides must have participants');
 const [commander]=await q(c,"SELECT c.side,u.status FROM coup_participants_v2115 c JOIN users u ON u.id=c.user_id WHERE c.round_id=$1 AND c.user_id=45",[ROUND_ID]);
 assert.equal(commander?.side,'REBEL');assert.equal(commander.status,'ACTIVE');
 const [activity]=await q(c,'SELECT (SELECT COUNT(*)::int FROM coup_attacks_v2115 WHERE round_id=$1) attacks,(SELECT COUNT(*)::int FROM coup_skills_v2118 WHERE round_id=$1) skills',[ROUND_ID]);
 assert.deepEqual(activity,{attacks:0,skills:0});
 const energySql='SELECT * FROM coup_energy_v2118 WHERE round_id=$1 ORDER BY user_id';
 const cooldownSql='SELECT * FROM coup_skill_cooldowns_v2118 WHERE appointment_id IN ($1,$2) ORDER BY appointment_id,skill_code';
 const energy=await q(c,energySql,[ROUND_ID]),cooldowns=await q(c,cooldownSql,[APPOINTMENT_ID,'coup-rebel:'+ROUND_ID]);
 const db=new __postgresCompatTest.PostgresD1Database(c);
 // Keep the production routine inside the caller's transaction; do not nest COMMIT.
 db.batch=statements=>db.enqueue(()=>db.batchSequential(statements,false));
 db.execSchema=()=>{throw Error('Unexpected schema migration during one-time operation');};
 const updated=await startCoupRound({DB:db},ROUND_ID,now);
 assert.equal(updated.status,'ACTIVE');assert.equal(Number(updated.starts_at),now);
 assert.equal(Number(updated.ends_at),now+beforeSettings.battleMinutes*60000);
 const preserved=row=>Object.fromEntries(Object.entries(row).filter(([k])=>!['status','starts_at','ends_at','revision','token'].includes(k)));
 assert.equal(digest(preserved(updated)),digest(preserved(round)),'Unrelated round state changed');
 assert.equal(digest(await q(c,participantSql,[ROUND_ID])),digest(participants),'Participants changed');
 assert.equal(digest(await q(c,settingsSql)),digest(settings),'Global settings changed');
 assert.equal(digest(await q(c,energySql,[ROUND_ID])),digest(energy),'Energy changed');
 assert.equal(digest(await q(c,cooldownSql,[APPOINTMENT_ID,'coup-rebel:'+ROUND_ID])),digest(cooldowns),'Cooldowns changed');
 const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',roundId:ROUND_ID,appointmentId:APPOINTMENT_ID,authorization:'22:00 쿠데타 개전 시작해',scheduledAt:new Date(START_AT).toISOString(),startedAt:new Date(now).toISOString(),endsAt:new Date(Number(updated.ends_at)).toISOString(),chiefUserId:5426,rebelCommanderId:45,participants:participants.length,chiefCount:participants.filter(r=>r.side==='CHIEF').length,rebelCount:participants.filter(r=>r.side==='REBEL').length,participantHash:digest(participants),preserved:{participants:true,settings:true,frontAndHp:true,energy:true,cooldowns:true},previousRevision:Number(round.revision),revision:Number(updated.revision)};
 const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'COUP_SCHEDULED_START','COUP',$2,$3,$4) RETURNING id::text",[owner.id,ROUND_ID,JSON.stringify({status:round.status,starts_at:round.starts_at}),JSON.stringify(receipt)]);
 receipt.auditId=audit.id;
 await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)]);
 return {changed:true,replayed:false,receipt};
}
