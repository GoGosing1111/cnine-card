import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {joinCoupRound, startCoupRound, coupStatus} from '../../functions/_coup.js';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';

export const ROUND_ID='68f4947a-af39-4be2-934b-191bb9df4594';
export const APPOINTMENT_ID='84fe83aa-a01a-4457-b9f5-f808519249dd';
export const OPERATION_KEY='ops:coup-commanders:20261019:v1';
export const START_KEY='ops:coup-start:20261019:2200:v1';
export const START_AT=Date.parse('2026-10-19T22:00:00+09:00');
export const COMMANDERS=[{id:45,nickname:'박세라-ㅂ-',side:'CHIEF'},{id:5426,nickname:'나무늘봉순',side:'REBEL'}];
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const configSql="SELECT key,value FROM app_meta WHERE key IN ('chief_appointment_v1','coup_settings_v2115','coup_chief_skill_settings_v2118') ORDER BY key";
const membersSql='SELECT * FROM coup_participants_v2115 WHERE round_id=$1 ORDER BY user_id';
const energySql='SELECT * FROM coup_energy_v2118 WHERE round_id=$1 ORDER BY user_id';
const cooldownSql='SELECT * FROM coup_skill_cooldowns_v2118 WHERE appointment_id IN ($1,$2) ORDER BY appointment_id,skill_code';
const omit=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
export function transactionEnvironment(c){
 const db=new __postgresCompatTest.PostgresD1Database(c);
 db.batch=statements=>db.enqueue(()=>db.batchSequential(statements,false));
 db.execSchema=()=>{throw Error('Unexpected schema migration during one-time operation');};
 return {DB:db};
}
async function context(c,now){
 assert.ok(Number.isSafeInteger(now),'Database time is required');
 const [identity]=await q(c,'SELECT current_database() AS database,pg_is_in_recovery() AS replica');
 assert.equal(identity.database,'cnine');assert.equal(identity.replica,false);
 const config=await q(c,configSql+' FOR UPDATE'),cfg=Object.fromEntries(config.map(r=>[r.key,JSON.parse(r.value)]));
 assert.equal(cfg.coup_settings_v2115?.enabled,true,'Coup is OFF');
 const appointment=cfg.chief_appointment_v1;
 assert.equal(appointment?.id,APPOINTMENT_ID,'Chief appointment changed');assert.equal(Number(appointment.userId),45);
 assert.ok(Date.parse(appointment.startsAt)<=now&&Date.parse(appointment.endsAt)>Math.max(now,START_AT),'Chief term is not valid at the scheduled start');
 const [owner]=await q(c,'SELECT id,role,status FROM users WHERE id=1');assert.equal(owner?.role,'OWNER');assert.equal(owner.status,'ACTIVE');
 const users=await q(c,'SELECT id,nickname,role,status FROM users WHERE id IN (45,5426) ORDER BY id FOR SHARE');
 for(const expected of COMMANDERS){const user=users.find(u=>Number(u.id)===expected.id);assert.equal(user?.nickname,expected.nickname);assert.equal(user.status,'ACTIVE');assert.ok(['USER','OWNER'].includes(user.role));}
 const [round]=await q(c,'SELECT * FROM coup_rounds_v2115 WHERE id=$1 FOR UPDATE',[ROUND_ID]);
 assert.ok(round,'Target round missing');assert.equal(round.appointment_id,APPOINTMENT_ID);assert.equal(Number(round.chief_user_id),45);assert.equal(round.chief_name,COMMANDERS[0].nickname);
 return {config,round,users};
}
async function snapshot(c){return {
 members:await q(c,membersSql,[ROUND_ID]),energy:await q(c,energySql,[ROUND_ID]),
 cooldowns:await q(c,cooldownSql,[APPOINTMENT_ID,'coup-rebel:'+ROUND_ID])
};}
async function noCombat(c){
 const [activity]=await q(c,'SELECT (SELECT COUNT(*)::int FROM coup_attacks_v2115 WHERE round_id=$1) attacks,(SELECT COUNT(*)::int FROM coup_skills_v2118 WHERE round_id=$1) skills',[ROUND_ID]);
 assert.deepEqual(activity,{attacks:0,skills:0},'Round has combat activity');
}
function checkCommanders(round,members){
 const command=JSON.parse(round.settings_json).rebelCommand;
 assert.equal(command?.roundId,ROUND_ID);assert.equal(Number(command?.userId),5426,'Rebel commander changed');
 for(const expected of COMMANDERS)assert.equal(members.find(m=>Number(m.user_id)===expected.id)?.side,expected.side,'Commander enrollment changed');
}
async function audit(c,key,action,before,receipt){
 const [row]=await q(c,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,\'COUP\',$2,$3,$4,sqlite_now()) RETURNING id::text',[action,ROUND_ID,JSON.stringify(before),JSON.stringify(receipt)]);
 receipt.auditId=row.id;
 await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[key,JSON.stringify(receipt)]);
 return receipt;
}

// Caller owns BEGIN/COMMIT. The real join routine computes each current PVP formation.
export async function configureCoupCommanders(c,deps,now,releaseCommit){
 assert.match(releaseCommit,/^[a-f0-9]{40}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [prior]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(prior)return {changed:false,replayed:true,receipt:JSON.parse(prior.value)};
 const {config,round,users}=await context(c,now);
 assert.ok(now<START_AT,'Configuration window has passed');assert.equal(round.status,'RECRUITING');assert.equal(round.starts_at,null);
 await noCombat(c);const before=await snapshot(c),settings=JSON.parse(round.settings_json);
 for(const expected of COMMANDERS){const existing=before.members.find(m=>Number(m.user_id)===expected.id);if(existing)assert.equal(existing.side,expected.side,'Account already joined another side');}
 const afterSettings={...settings,rebelCommand:{roundId:ROUND_ID,userId:5426}};
 await q(c,'UPDATE coup_rounds_v2115 SET settings_json=$1,revision=revision+1 WHERE id=$2',[JSON.stringify(afterSettings),ROUND_ID]);
 const env=transactionEnvironment(c);
 for(const expected of COMMANDERS){
  const user=users.find(u=>Number(u.id)===expected.id);
  await joinCoupRound(env,deps,user,{roundId:ROUND_ID,side:expected.side,acceptPenalty:true},now);
 }
 const [updated]=await q(c,'SELECT * FROM coup_rounds_v2115 WHERE id=$1',[ROUND_ID]),after=await snapshot(c);
 checkCommanders(updated,after.members);
 assert.equal(hash(omit(round,['settings_json','revision','token'])),hash(omit(updated,['settings_json','revision','token'])),'Other round state changed');
 assert.equal(hash(config),hash(await q(c,configSql)),'Global settings or appointment changed');
 assert.equal(hash(before.energy),hash(after.energy));assert.equal(hash(before.cooldowns),hash(after.cooldowns));
 for(const member of before.members)assert.equal(hash(member),hash(after.members.find(m=>m.user_id===member.user_id)),'Existing participant changed');
 assert.equal(after.members.length-before.members.length,COMMANDERS.filter(u=>!before.members.some(m=>Number(m.user_id)===u.id)).length);
 const receipt={operationKey:OPERATION_KEY,roundId:ROUND_ID,appointmentId:APPOINTMENT_ID,scheduledAt:new Date(START_AT).toISOString(),
  commanders:COMMANDERS.map(u=>({...u,enrolled:true,alreadyEnrolled:before.members.some(m=>Number(m.user_id)===u.id)})),
  counts:Object.fromEntries(['CHIEF','REBEL'].map(side=>[side,after.members.filter(m=>m.side===side).length])),
  beforeSettings:settings,afterSettings,previousRevision:Number(round.revision),revision:Number(updated.revision),
  preserved:{existingParticipants:true,chiefAppointment:true,globalSettings:true,frontAndHp:true,energy:true,cooldowns:true},
  releaseCommit,completedAt:new Date(now).toISOString()};
 await audit(c,OPERATION_KEY,'COUP_COMMANDERS_ENROLL',{settings,participants:before.members.map(m=>({userId:Number(m.user_id),side:m.side}))},receipt);
 return {changed:true,replayed:false,receipt};
}

export async function startScheduledCoup(c,now){
 assert.ok(Number.isSafeInteger(now),'Database time is required');
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[START_KEY]);
 const [prior]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[START_KEY]);
 if(prior)return {changed:false,replayed:true,receipt:JSON.parse(prior.value)};
 assert.ok(now>=START_AT,'Scheduled start is not due');assert.ok(now<=START_AT+600000,'Scheduled start window expired');
 const {config,round}=await context(c,now),before=await snapshot(c);
 checkCommanders(round,before.members);
 if(round.status==='ACTIVE')return {changed:false,alreadyActive:true,round:{id:round.id,status:round.status,startsAt:Number(round.starts_at),endsAt:Number(round.ends_at)}};
 assert.equal(round.status,'RECRUITING','Target round no longer recruiting');assert.equal(round.starts_at,null);await noCombat(c);
 const [configured]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(configured,'Commander preparation receipt missing');
 const updated=await startCoupRound(transactionEnvironment(c),ROUND_ID,now);
 assert.equal(updated.status,'ACTIVE');assert.equal(Number(updated.starts_at),now);
 assert.equal(Number(updated.ends_at),now+JSON.parse(round.settings_json).battleMinutes*60000);
 assert.equal(hash(omit(round,['status','starts_at','ends_at','revision','token'])),hash(omit(updated,['status','starts_at','ends_at','revision','token'])));
 const after=await snapshot(c);assert.equal(hash(before),hash(after),'Participants, energy or cooldowns changed');
 assert.equal(hash(config),hash(await q(c,configSql)),'Global settings changed');
 const receipt={operationKey:START_KEY,roundId:ROUND_ID,appointmentId:APPOINTMENT_ID,chiefUserId:45,rebelCommanderId:5426,
  scheduledAt:new Date(START_AT).toISOString(),startedAt:new Date(now).toISOString(),endsAt:new Date(Number(updated.ends_at)).toISOString(),
  counts:Object.fromEntries(['CHIEF','REBEL'].map(side=>[side,before.members.filter(m=>m.side===side).length])),participantHash:hash(before.members),
  preserved:{participants:true,settings:true,frontAndHp:true,energy:true,cooldowns:true},previousRevision:Number(round.revision),revision:Number(updated.revision)};
 await audit(c,START_KEY,'COUP_SCHEDULED_START',{status:round.status,startsAt:round.starts_at},receipt);
 return {changed:true,replayed:false,receipt};
}

export async function verifyCoupCommanders(c,now,{active=false}={}){
 const env=transactionEnvironment(c),states=[];
 for(const user of COMMANDERS){
  const state=await coupStatus(env,{...user,role:'USER'},now);
  assert.equal(state.round?.id,ROUND_ID);assert.equal(state.round?.status,active?'ACTIVE':'RECRUITING');
  assert.equal(Number(state.mine?.user_id),user.id);assert.equal(state.mine?.side,user.side);assert.equal(state.commandSide,user.side);
  assert.equal(state.commander?.userId,user.id);assert.equal(state.rebelCommander?.userId,5426);assert.equal(state.rebelCommander?.enrolled,true);
  assert.equal(state.canUseCommandSkills,active);assert.equal(state.canUseChiefSkills,active&&user.side==='CHIEF');
  states.push({userId:user.id,nickname:user.nickname,side:state.mine.side,commanderId:state.commander.userId,enrolled:true,
   status:state.round.status,canUseCommandSkills:state.canUseCommandSkills,skills:state.commandSkills.map(s=>({code:s.code,enabled:s.enabled,nextUseAt:s.nextUseAt}))});
 }
 return states;
}
