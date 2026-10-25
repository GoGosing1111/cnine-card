import assert from 'node:assert/strict';
import {inspectReshuffle,ROUND_ID} from './clan-reshuffle-20261025.mjs';
import {hash} from './clan-reshuffle-plan-20261025.mjs';
export {ROUND_ID};
export const OP='ops:clan-inactive-withdraw:20261025:v1';
export const TARGETS=[{id:4084,nickname:'게임닉네임',clanId:5},{id:5947,nickname:'Balance',clanId:7},{id:5972,nickname:'아까르씨',clanId:6}];
const IDS=TARGETS.map(t=>t.id),removed=id=>IDS.includes(Number(id));
const AUTHORIZATION=['왜 3명 탈퇴 안시켰냐?','게임닉네임하고 밸런스?'];
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const query=db=>async(sql,args=[])=>(await db.query(sql,args)).rows;
async function snapshot(db){
 const q=query(db),base=(await inspectReshuffle(db)).before;
 const surveys=await q('SELECT * FROM organization_surveys_v1 WHERE round_id=$1 ORDER BY user_id',[ROUND_ID]);
 const users=await q('SELECT id,nickname,status,md5(row_to_json(users)::text) digest FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[IDS]);
 return {...base,surveys,users};
}
export async function inspectWithdrawal(db){const q=query(db),before=await snapshot(db),r=(await q('SELECT value FROM app_meta WHERE key=$1',[OP]))[0];return {before,receipt:r?JSON.parse(r.value):null};}
export function pruneDeparted(state){
 const next=structuredClone(state);
 for(const squads of Object.values(next.formations||{}))for(const [squad,ids] of Object.entries(squads))squads[squad]=ids.filter(id=>!removed(id));
 for(const captains of Object.values(next.captains||{}))for(const [squad,id] of Object.entries(captains))if(removed(id))delete captains[squad];
 for(const id of IDS)delete next.strikeReady[id];
 return next;
}
export async function verifyWithdrawal(db){
 const q=query(db),receipt=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OP])).value);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.authorization,AUTHORIZATION);assert.deepEqual(receipt.targets,TARGETS);
 const after=await snapshot(db),before=receipt.before;
 assert.equal(after.seasonId,before.seasonId);assert.equal(after.members.length,125);
 assert.deepEqual(after.members,before.members.filter(m=>!removed(m.user_id)));
 assert.deepEqual(after.current.clan_members,before.current.clan_members.filter(m=>!removed(m.user_id)));
 for(const table of ['clan_weekly_availability','clan_war_readiness'])assert.deepEqual(after.current[table],before.current[table].filter(m=>!removed(m.user_id)));
 for(const table of ['clan_season_teams','clan_executives','clan_war_field_state','clan_war_field_receipts','clan_war_reservation_locks'])assert.deepEqual(after.current[table],before.current[table]);
 const pools=after.current.clan_draft_pool,oldPools=before.current.clan_draft_pool;
 assert.deepEqual(pools.filter(p=>!removed(p.user_id)),oldPools.filter(p=>!removed(p.user_id)));
 for(const id of IDS){const old=one(oldPools.filter(p=>Number(p.user_id)===id)),current=one(pools.filter(p=>Number(p.user_id)===id));assert.deepEqual(current,{...old,status:'WITHDRAWN',drafted_clan_id:null,pick_no:null,updated_at:receipt.completedAt});}
 assert.deepEqual(after.surveys.filter(s=>!removed(s.user_id)),before.surveys.filter(s=>!removed(s.user_id)));
 for(const old of before.surveys.filter(s=>removed(s.user_id))){const current=one(after.surveys.filter(s=>s.user_id===old.user_id));assert.deepEqual(current,{...old,active:0,revision:Number(old.revision)+1,updated_at:typeof old.updated_at==='string'?String(receipt.completedMs):receipt.completedMs});}
 const protectedHashes=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='organization_surveys_v1'));
 assert.deepEqual(protectedHashes(after.protectedHashes),protectedHashes(before.protectedHashes));assert.deepEqual(after.wars,before.wars);assert.deepEqual(after.season,before.season);
 assert.deepEqual(JSON.parse(after.state.state_json),pruneDeparted(JSON.parse(before.state.state_json)));assert.deepEqual(after.users,before.users);
 const clans=Array.from({length:8},(_,i)=>{const m=after.members.filter(m=>Number(m.organization_id)===i+1);return {id:i+1,count:m.length,power:m.reduce((n,m)=>n+Number(m.seed_power),0)};});
 assert.deepEqual(clans.map(c=>c.count),[16,16,16,16,15,15,15,16]);
 const audit=one(await q('SELECT action_type,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]));assert.equal(audit.action_type,'CLAN_INACTIVE_THREE_WITHDRAW');assert.equal(JSON.parse(audit.after_data).memberCount,125);
 return {verified:true,receipt,clans,protectedUnchanged:true};
}
export async function withdrawInactive(db,{dryRun=true,now=Date.now()}={}){
 const q=query(db);if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verifyWithdrawal(db),replayed:true};
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='30s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length){const result=await verifyWithdrawal(db);await q('ROLLBACK');return {...result,replayed:true};}
  await q('SELECT user_id FROM organization_actors_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);
  one(await q('SELECT id FROM organization_rounds_v1 WHERE id=$1 FOR UPDATE',[ROUND_ID]));one(await q('SELECT round_id FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[ROUND_ID]));
  const before=await snapshot(db),seasonId=before.seasonId,state=JSON.parse(before.state.state_json);
  one(await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE' FOR SHARE"));
  const accounts=await q('SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[IDS]);assert.deepEqual(accounts.map(a=>({id:Number(a.id),nickname:a.nickname,status:a.status})),TARGETS.map(t=>({id:t.id,nickname:t.nickname,status:'ACTIVE'})));
  assert.equal(before.round.scope,'LIVE');assert.equal(before.round.phase,'ASSIGNED');assert.equal(before.members.length,128);assert.equal(before.current.clan_members.length,128);
  assert.equal(before.wars.length,28);assert(before.wars.every(w=>w.status==='SCHEDULED'&&Date.parse(w.starts_at)>now));assert.equal(before.current.clan_war_field_state.length,0);assert.equal(before.current.clan_war_field_receipts.length,0);assert.equal(before.current.clan_war_reservation_locks.length,0);
  assert(!['ACTIVE','PAUSED'].includes(state.session?.status));assert.equal(state.sessionQueue?.length||0,0);assert(!(state.battles||[]).some(b=>b.status==='ACTIVE'));
  for(const t of TARGETS){assert.equal(Number(one(before.members.filter(m=>Number(m.user_id)===t.id)).organization_id),t.clanId);const regular=one(before.current.clan_members.filter(m=>Number(m.user_id)===t.id));assert.equal(Number(regular.clan_id),t.clanId);assert.equal(regular.member_role,'MEMBER');assert(!before.current.clan_executives.some(e=>Number(e.user_id)===t.id));assert(!Object.values(state.elders).flat().includes(t.id));assert(!Object.values(state.commanders).includes(t.id));}
  await q('SELECT user_id FROM organization_members_v1 WHERE round_id=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id FOR UPDATE',[ROUND_ID,IDS]);
  await q('SELECT user_id FROM clan_members WHERE season_id=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id FOR UPDATE',[seasonId,IDS]);
  await q('SELECT user_id FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id FOR UPDATE',[ROUND_ID,IDS]);
  const at=new Date(now).toISOString();
  assert.equal((await q('DELETE FROM organization_members_v1 WHERE round_id=$1 AND user_id=ANY($2::bigint[]) RETURNING user_id',[ROUND_ID,IDS])).length,3);
  assert.equal((await q('DELETE FROM clan_members WHERE season_id=$1 AND user_id=ANY($2::bigint[]) RETURNING user_id',[seasonId,IDS])).length,3);
  assert.equal((await q("UPDATE clan_draft_pool SET status='WITHDRAWN',drafted_clan_id=NULL,pick_no=NULL,updated_at=$3 WHERE season_id=$1 AND user_id=ANY($2::bigint[]) AND status='DRAFTED' RETURNING user_id",[seasonId,IDS,at])).length,3);
  await q('UPDATE organization_surveys_v1 SET active=0,revision=revision+1,updated_at=$3 WHERE round_id=$1 AND user_id=ANY($2::bigint[])',[ROUND_ID,IDS,now]);
  await q('DELETE FROM clan_weekly_availability WHERE season_id=$1 AND user_id=ANY($2::bigint[])',[seasonId,IDS]);
  await q('DELETE FROM clan_war_readiness WHERE user_id=ANY($2::bigint[]) AND war_id IN (SELECT id FROM clan_wars WHERE season_id=$1)',[seasonId,IDS]);
  one(await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 AND revision=$3 RETURNING round_id',[JSON.stringify(pruneDeparted(state)),ROUND_ID,before.state.revision]));
  one(await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING id',[ROUND_ID,before.round.revision]));
  const receipt={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,targets:TARGETS,roundId:ROUND_ID,seasonId,completedAt:at,completedMs:now,before,memberCountBefore:128,memberCountAfter:125,otherMembersMoved:0,accountWrites:0,grants:0,messagesSent:0};
  receipt.auditId=String(one(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'CLAN_INACTIVE_THREE_WITHDRAW','ORGANIZATION_ROUND',$1,$2,$3) RETURNING id",[ROUND_ID,JSON.stringify({reviewHash:hash(before),memberCount:128,targets:TARGETS}),JSON.stringify({operationKey:OP,memberCount:125,targets:TARGETS,otherMembersMoved:0,accountWrites:0,grants:0})])).id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),at]);
  const result=await verifyWithdrawal(db);await q(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
