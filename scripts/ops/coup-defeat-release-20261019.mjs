import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {settleCoupRound,coupStatus} from '../../functions/_coup.js';
import {releaseClanCaptives,clanCampStatusForUser} from '../../functions/_clan_prison_camp.js';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
export const ROUND_ID='68f4947a-af39-4be2-934b-191bb9df4594',KEEP_USER=5426;
export const EVENT_ID='coup:'+ROUND_ID,OPERATION_KEY='ops:coup-defeat-release:20261019:v1';
const q=async(c,s,v=[])=>(await c.query(s,v)).rows;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function environment(c){const db=new __postgresCompatTest.PostgresD1Database(c);db.batch=s=>db.enqueue(()=>db.batchSequential(s,false));db.execSchema=()=>{throw Error('Unexpected schema migration');};return {DB:db};}
export async function savedReceipt(c){const [r]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);return r?JSON.parse(r.value):null;}
export async function snapshot(c){return {
 round:(await q(c,'SELECT * FROM coup_rounds_v2115 WHERE id=$1',[ROUND_ID]))[0],
 camp:await q(c,'SELECT * FROM event_prison_camps WHERE event_id=$1',[EVENT_ID]),
 captives:await q(c,'SELECT * FROM event_prison_captives WHERE event_id=$1 ORDER BY user_id',[EVENT_ID])
};}
export async function closeAndRelease(c,now){
 assert.ok(Number.isSafeInteger(now));
 const [identity]=await q(c,'SELECT current_database() db,pg_is_in_recovery() replica');assert.equal(identity.db,'cnine');assert.equal(identity.replica,false);
 const [chief]=await q(c,"SELECT value FROM app_meta WHERE key='chief_appointment_v1' FOR UPDATE");
 const previous=await savedReceipt(c);if(previous)return {replayed:true,receipt:previous};
 const before=await snapshot(c);const [round]=await q(c,'SELECT * FROM coup_rounds_v2115 WHERE id=$1 FOR UPDATE',[ROUND_ID]);
 assert.equal(round.appointment_id,'84fe83aa-a01a-4457-b9f5-f808519249dd');assert.equal(Number(round.chief_user_id),45);
 assert.ok(round.status==='ACTIVE'||round.status==='SETTLING'&&round.winner==='CHIEF'||round.status==='FINISHED'&&round.winner==='CHIEF','Round result changed');
 const appointment=JSON.parse(chief.value);assert.equal(appointment.id,round.appointment_id);assert.equal(Number(appointment.userId),45);
 const [latest]=await q(c,'SELECT id FROM coup_rounds_v2115 ORDER BY created_at DESC,id DESC LIMIT 1');assert.equal(latest.id,ROUND_ID);
 const [owner]=await q(c,"SELECT id,role,status FROM users WHERE id=1");assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
 const [kept]=await q(c,'SELECT u.id,u.nickname,c.side FROM users u JOIN coup_participants_v2115 c ON c.user_id=u.id AND c.round_id=$1 WHERE u.id=$2',[ROUND_ID,KEEP_USER]);assert.equal(kept.nickname,'나무늘봉순');assert.equal(kept.side,'REBEL');
 const members=await q(c,'SELECT * FROM coup_participants_v2115 WHERE round_id=$1 ORDER BY user_id',[ROUND_ID]);
 const rebels=members.filter(r=>r.side==='REBEL'),env=environment(c);
 if(round.status!=='FINISHED'){
  const updated=await q(c,"UPDATE coup_rounds_v2115 SET status='SETTLING',winner='CHIEF',revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING id",[ROUND_ID,round.revision]);assert.equal(updated.length,1);
  await settleCoupRound(env,ROUND_ID,now);
 }
 const settled=await snapshot(c);assert.equal(settled.round.status,'FINISHED');assert.equal(settled.round.winner,'CHIEF');
 assert.deepEqual(settled.captives.map(x=>Number(x.user_id)),rebels.map(x=>Number(x.user_id)));
 assert.equal(settled.captives.find(x=>Number(x.user_id)===KEEP_USER).released_at,null);
 const targets=settled.captives.filter(r=>Number(r.user_id)!==KEEP_USER&&r.released_at==null);
 let releasedCount=0;for(const row of targets){const result=await releaseClanCaptives(env,owner,{eventId:EVENT_ID,userId:Number(row.user_id)},now);assert.equal(result.releasedCount,1);releasedCount++;}
 assert.equal(hash(await q(c,'SELECT * FROM coup_participants_v2115 WHERE round_id=$1 ORDER BY user_id',[ROUND_ID])),hash(members));
 assert.equal((await q(c,"SELECT value FROM app_meta WHERE key='chief_appointment_v1'"))[0].value,chief.value);
 const after=await snapshot(c);assert.deepEqual(after.captives.filter(r=>r.released_at==null).map(r=>Number(r.user_id)),[KEEP_USER]);
 const receipt={operationKey:OPERATION_KEY,roundId:ROUND_ID,eventId:EVENT_ID,winner:'CHIEF',status:'FINISHED',completedAt:new Date(now).toISOString(),
  beforeStatus:round.status,beforeWinner:round.winner,finishedAt:Number(after.round.finished_at),rebelCount:rebels.length,releasedCount,releasedUserIds:targets.map(r=>Number(r.user_id)),
  keptUserId:KEEP_USER,keptNickname:kept.nickname,jailedUntil:after.camp[0].jailed_until,participantHash:hash(members),
  eligibility:members.filter(r=>Number(r.attacks)>=20).map(r=>({userId:Number(r.user_id),side:r.side,attacks:Number(r.attacks)})),
  preserved:{chiefAppointment:true,participantsAndAttacks:true,coins:true,otherPrisons:true},actualSkillCast:false};
 const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,'COUP_FORCE_REBEL_DEFEAT_RELEASE','COUP',$1,$2,$3,sqlite_now()) RETURNING id::text",[ROUND_ID,JSON.stringify({status:round.status,winner:round.winner,revision:round.revision}),JSON.stringify(receipt)]);receipt.auditId=audit.id;
 await q(c,'INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
 return {replayed:false,receipt};
}
export async function verify(c,now){
 const r=await savedReceipt(c);assert.ok(r);const state=await snapshot(c),env=environment(c);
 assert.equal(state.round.status,'FINISHED');assert.equal(state.round.winner,'CHIEF');assert.equal(Number(state.round.finished_at),r.finishedAt);
 assert.equal(state.captives.length,r.rebelCount);assert.deepEqual(state.captives.filter(p=>p.released_at==null).map(p=>Number(p.user_id)),[KEEP_USER]);
 assert.equal(state.captives.filter(p=>p.released_at!=null).length,r.rebelCount-1);
 assert.equal((await clanCampStatusForUser(env,KEEP_USER,now)).incarcerated,true);
 const skills=await coupStatus(env,{id:KEEP_USER},now);assert.equal(skills.canUseCommandSkills,false);assert.equal(skills.rebelSkills.find(s=>s.code==='NUCLEAR').enabled,false);
 return {status:state.round.status,winner:state.round.winner,rebelCount:r.rebelCount,releasedCount:r.rebelCount-1,keptUserId:KEEP_USER,jailedUntil:r.jailedUntil,nuclearEnabled:false,eligibleCount:r.eligibility.length,auditId:r.auditId};
}
