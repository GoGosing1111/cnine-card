import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {coupStatus} from '../../functions/_coup.js';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';

export const ROUND_ID='68f4947a-af39-4be2-934b-191bb9df4594';
export const APPOINTMENT_ID='84fe83aa-a01a-4457-b9f5-f808519249dd';
export const OPERATION_KEY='ops:coup-rebel-nuclear:20261019:v1';
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const omit=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
const configSql="SELECT key,value FROM app_meta WHERE key IN ('chief_appointment_v1','coup_settings_v2115','coup_chief_skill_settings_v2118') ORDER BY key";
export async function savedReceipt(c){const [row]=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);return row?JSON.parse(row.value):null;}
export async function protectedState(c){return {
  participants:await q(c,'SELECT * FROM coup_participants_v2115 WHERE round_id=$1 ORDER BY user_id',[ROUND_ID]),
  energy:await q(c,'SELECT * FROM coup_energy_v2118 WHERE round_id=$1 ORDER BY user_id',[ROUND_ID]),
  cooldowns:await q(c,'SELECT * FROM coup_skill_cooldowns_v2118 WHERE appointment_id IN ($1,$2) ORDER BY appointment_id,skill_code',[APPOINTMENT_ID,'coup-rebel:'+ROUND_ID]),
  counts:await q(c,'SELECT (SELECT COUNT(*)::int FROM coup_skills_v2118 WHERE round_id=$1) skills,(SELECT COUNT(*)::int FROM coup_attacks_v2115 WHERE round_id=$1) attacks',[ROUND_ID])
};}
// The caller owns BEGIN/COMMIT, so the setting and receipt cannot separate.
export async function enableRebelNuclear(c,now,sourceCommit){
  assert.ok(Number.isSafeInteger(now));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
  const [identity]=await q(c,'SELECT current_database() database,pg_is_in_recovery() replica');assert.equal(identity.database,'cnine');assert.equal(identity.replica,false);
  const previous=await savedReceipt(c);if(previous){assert.equal(previous.roundId,ROUND_ID);return {replayed:true,receipt:previous};}
  const [operating]=await q(c,"SELECT value FROM app_meta WHERE key='coup_settings_v2115' FOR UPDATE");assert.equal(JSON.parse(operating.value).enabled,true);
  const [round]=await q(c,'SELECT * FROM coup_rounds_v2115 WHERE id=$1 FOR UPDATE',[ROUND_ID]);
  assert.equal(round?.status,'ACTIVE','The authorized round is not active');assert.ok(Number(round.ends_at)>now,'The authorized round ended');
  assert.equal(round.appointment_id,APPOINTMENT_ID);assert.equal(Number(round.chief_user_id),45);
  const [latest]=await q(c,'SELECT id FROM coup_rounds_v2115 ORDER BY created_at DESC,id DESC LIMIT 1');assert.equal(latest.id,ROUND_ID);
  const [owner]=await q(c,'SELECT id,role,status FROM users WHERE id=1');assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  const config=await q(c,configSql),global=Object.fromEntries(config.map(r=>[r.key,JSON.parse(r.value)]));
  assert.equal(global.chief_appointment_v1?.id,APPOINTMENT_ID);assert.equal(Number(global.chief_appointment_v1?.userId),45);
  assert.equal(global.coup_chief_skill_settings_v2118?.nuclearEnabled,false,'Global nuclear policy changed; do not alter it');
  const before=JSON.parse(round.settings_json);assert.equal(before.rebelCommand?.roundId,ROUND_ID);assert.equal(Number(before.rebelCommand?.userId),5426);
  const [commander]=await q(c,"SELECT u.id,u.status,c.side FROM users u JOIN coup_participants_v2115 c ON c.user_id=u.id AND c.round_id=$1 WHERE u.id=5426",[ROUND_ID]);
  assert.equal(commander?.status,'ACTIVE');assert.equal(commander.side,'REBEL');
  assert.ok(before.rebelNuclear==null,'An existing per-round nuclear policy requires review');
  const protectedBefore=hash(await protectedState(c));
  const after={...before,rebelNuclear:{roundId:ROUND_ID,enabled:true}};
  const [updated]=await q(c,'UPDATE coup_rounds_v2115 SET settings_json=$1,revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING *',[JSON.stringify(after),ROUND_ID,round.revision]);assert.ok(updated);
  assert.equal(hash(omit(updated,['settings_json','revision'])),hash(omit(round,['settings_json','revision'])),'Combat state changed');
  assert.equal(hash(await protectedState(c)),protectedBefore,'Participants, energy, cooldowns or battle receipts changed');
  assert.equal(hash(await q(c,configSql)),hash(config),'Global settings changed');
  const receipt={operationKey:OPERATION_KEY,roundId:ROUND_ID,appointmentId:APPOINTMENT_ID,sourceCommit,enabled:true,side:'REBEL',commanderId:5426,
    before,after,previousRevision:Number(round.revision),revision:Number(updated.revision),completedAt:new Date(now).toISOString(),
    expiresWithRound:true,globalNuclearEnabled:false,cooldownMs:1800000,maxTargets:50,blockMs:600000,
    protectedStateHash:protectedBefore,preserved:{frontAndHp:true,participants:true,energy:true,cooldowns:true,combatReceipts:true,globalSettings:true}};
  const [audit]=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,'COUP_REBEL_NUCLEAR_ROUND_ON','COUP',$1,$2,$3,sqlite_now()) RETURNING id::text",[ROUND_ID,JSON.stringify({rebelNuclear:before.rebelNuclear??null}),JSON.stringify(receipt)]);
  receipt.auditId=audit.id;
  await q(c,'INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(receipt)]);
  return {replayed:false,receipt};
}
export async function verifyRebelNuclear(c,now){
  const db=new __postgresCompatTest.PostgresD1Database(c);db.batch=statements=>db.enqueue(()=>db.batchSequential(statements,false));
  db.execSchema=()=>{throw Error('Unexpected schema change');};
  const states=[];
  for(const userId of [45,5426]){
    const state=await coupStatus({DB:db},{id:userId,role:'USER'},now);
    assert.equal(state.round?.id,ROUND_ID);assert.equal(state.round.status,'ACTIVE');
    assert.equal(state.skillSettings.nuclearEnabled,false);assert.equal(state.chiefSkills.find(s=>s.code==='NUCLEAR').enabled,false);
    assert.equal(state.rebelSkills.find(s=>s.code==='NUCLEAR').enabled,true);assert.equal(state.rebelSkills.find(s=>s.code==='NUCLEAR').cooldownMs,1800000);
    assert.equal(state.rebelCommander.userId,5426);assert.equal(state.rebelCommander.enrolled,true);
    const skill=state.commandSkills.find(s=>s.code==='NUCLEAR');assert.equal(skill.enabled,userId===5426);assert.equal(state.canUseCommandSkills,true);
    states.push({userId,side:state.commandSide,canUseCommandSkills:state.canUseCommandSkills,nuclearEnabled:skill.enabled,cooldownMs:skill.cooldownMs,nextUseAt:skill.nextUseAt,label:skill.label});
  }
  return states;
}
