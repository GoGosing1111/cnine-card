import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {__clanTest as clan} from '../../functions/_clan.js';
import {CLAN_RESUMPTION_STATE_KEY,CLAN_WED_SAT_SUN_SCHEDULE as SCHEDULE,resumedClanSettings,activeClanResumption} from '../../shared/clan-resumption-v1.mjs';
export const OP='ops:clan-wed-sat-sun:20261025:v1';
export const AUTHORIZATION=['클랜전 수,토,일로 변경','10/28(수)부터 — 기존 첫 경기 예정일 이후 적용'];
const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1',ACTION='CLAN_REGULAR_SCHEDULE_CHANGE';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const query=db=>async(sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const withoutDates=({starts_at,ends_at,updated_at,...rest})=>rest;

async function snapshot(q,{lock=false}={}){
 const rows=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key'+(lock?' FOR UPDATE':''),[['clan_settings_v1',CLAN_RESUMPTION_STATE_KEY]]);
 const meta=Object.fromEntries(rows.map(r=>[r.key,JSON.parse(r.value)])),resumption=meta[CLAN_RESUMPTION_STATE_KEY],settings=meta.clan_settings_v1;
 assert(resumption&&settings);assert.equal(resumption.roundId,ROUND_ID);
 const season=one(await q('SELECT * FROM clan_seasons WHERE id=$1'+(lock?' FOR UPDATE':''),[resumption.seasonId]));
 const wars=await q('SELECT * FROM clan_wars WHERE season_id=$1 ORDER BY round_no,id'+(lock?' FOR UPDATE':''),[resumption.seasonId]);
 return {settings,resumption,season,wars};
}
async function protectedHashes(q,seasonId){
 const out={};
 for(const table of ['clan_season_teams','clan_members','clan_executives','clan_draft_pool','clan_war_battles','clan_weekly_availability','clan_championships'])
  out[table]=one(await q(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) digest FROM ${table} t WHERE season_id=$1`,[seasonId])).digest;
 for(const table of ['clan_war_readiness','clan_war_field_state'])
  out[table]=one(await q(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) digest FROM ${table} t WHERE war_id IN (SELECT id FROM clan_wars WHERE season_id=$1)`,[seasonId])).digest;
 return out;
}
export function plannedSchedule(before){
 const resumption={...before.resumption,regularSchedule:{...SCHEDULE}},settings=resumedClanSettings(before.settings,resumption);
 const starts=clan.scheduledWindowStarts(settings,Date.parse(SCHEDULE.firstStartsAt),7);
 assert.equal(starts.length,7);
 return {resumption,settings,wars:before.wars.map(w=>({...w,starts_at:new Date(starts[Number(w.round_no)-1]).toISOString(),ends_at:new Date(starts[Number(w.round_no)-1]+3600000).toISOString()}))};
}
export async function inspectSchedule(db){
 const q=query(db),before=await snapshot(q),saved=await q('SELECT value FROM app_meta WHERE key=$1',[OP]);
 return {before,reviewHash:hash(before),plan:plannedSchedule(before),receipt:saved[0]?JSON.parse(saved[0].value):null};
}
export async function verifySchedule(db){
 const q=query(db),receipt=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OP])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OP);assert.deepEqual(receipt.authorization,AUTHORIZATION);
 const current=await snapshot(q),faction=JSON.parse(one(await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[ROUND_ID])).state_json);
 assert.deepEqual(current.resumption,receipt.after.resumption);assert.deepEqual(faction.resumption,current.resumption);
 assert.deepEqual(current.settings.openDays,[3,6,0]);assert.equal(current.settings.warOpenTime,'21:00');assert.equal(current.settings.warDurationMinutes,60);
 assert.equal(current.season.starts_at,SCHEDULE.firstStartsAt);assert.equal(current.season.ends_at,receipt.after.wars.at(-1).ends_at);
 const dates=rows=>rows.map(({id,round_no,clan_a_id,clan_b_id,starts_at,ends_at})=>({id,round_no,clan_a_id,clan_b_id,starts_at,ends_at}));
 assert.deepEqual(dates(current.wars),dates(receipt.after.wars));assert.equal(current.wars.length,28);
 const audit=one(await q('SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]));
 assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,String(receipt.seasonId));
 const {auditId,...audited}=receipt;assert.deepEqual(JSON.parse(audit.after_data),audited);
 return {verified:true,receipt,seasonId:receipt.seasonId,warCount:28,roundStarts:[...new Set(current.wars.map(w=>w.starts_at))],endsAt:current.season.ends_at};
}
export async function applySchedule(db,{dryRun=true,expectedReviewHash,now=Date.now()}={}){
 const q=query(db);
 if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verifySchedule(db),replayed:true};
 assert.match(String(expectedReviewHash||''),/^[a-f0-9]{64}$/,'Reviewed plan required');
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='30s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length){const r=await verifySchedule(db);await q('ROLLBACK');return {...r,replayed:true};}
  one(await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE' FOR SHARE"));
  // Faction settlement also locks its state before the regular season.
  const stateRow=one(await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[ROUND_ID])),state=JSON.parse(stateRow.state_json);
  const before=await snapshot(q,{lock:true});assert.equal(hash(before),expectedReviewHash,'Schedule changed since review');
  assert(activeClanResumption(before.resumption,now));assert.deepEqual(state.resumption,before.resumption);
  assert.equal(before.season.phase,'ACTIVE');assert.equal(Number(before.season.season_no),4);assert.equal(before.wars.length,28);
  assert.equal(before.settings.mode,'ON');assert.deepEqual(before.settings.openDays,[2,3,4,6]);assert(!before.resumption.regularSchedule);
  for(const w of before.wars){assert.equal(w.status,'SCHEDULED');assert(Date.parse(w.starts_at)>now);assert.equal(Number(w.score_a),0);assert.equal(Number(w.score_b),0);assert.equal(Number(w.battle_count),0);}
  for(let round=1;round<=7;round++){
   const wars=before.wars.filter(w=>Number(w.round_no)===round);assert.equal(wars.length,4);
   assert.equal(new Set(wars.flatMap(w=>[Number(w.clan_a_id),Number(w.clan_b_id)])).size,8);
  }
  assert.equal(one(await q('SELECT COUNT(*)::int n FROM clan_war_battles WHERE season_id=$1',[before.resumption.seasonId])).n,0);
  assert(now<Date.parse(SCHEDULE.firstStartsAt),'First approved match has already started');
  const preserved=await protectedHashes(q,before.resumption.seasonId),plan=plannedSchedule(before),completedAt=new Date(now).toISOString();
  assert.deepEqual({...plan.settings,openDays:before.settings.openDays},before.settings,'Only weekdays may change');
  const updated=await q(`UPDATE clan_wars w SET starts_at=x.starts_at,ends_at=x.ends_at,updated_at=CURRENT_TIMESTAMP
   FROM jsonb_to_recordset($1::jsonb) x(id bigint,starts_at text,ends_at text)
   WHERE w.id=x.id AND w.season_id=$2 AND w.status='SCHEDULED' RETURNING w.id`,[JSON.stringify(plan.wars.map(({id,starts_at,ends_at})=>({id,starts_at,ends_at}))),before.resumption.seasonId]);
  assert.equal(updated.length,28);
  assert.equal((await q("UPDATE clan_seasons SET starts_at=$1,ends_at=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND phase='ACTIVE' RETURNING id",[plan.wars[0].starts_at,plan.wars.at(-1).ends_at,before.resumption.seasonId])).length,1);
  for(const [key,value] of [['clan_settings_v1',plan.settings],[CLAN_RESUMPTION_STATE_KEY,plan.resumption]])
   assert.equal((await q('UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 RETURNING key',[JSON.stringify(value),completedAt,key])).length,1);
  const nextState={...state,resumption:plan.resumption};
  assert.equal((await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 RETURNING round_id',[JSON.stringify(nextState),ROUND_ID])).length,1);
  const after=await snapshot(q),afterState=JSON.parse(one(await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[ROUND_ID])).state_json);
  assert.deepEqual({...afterState,resumption:state.resumption},state,'Faction session and holdings must remain unchanged');
  assert.deepEqual(after.wars.map(withoutDates),before.wars.map(withoutDates));assert.deepEqual(withoutDates(after.season),withoutDates(before.season));
  assert.deepEqual(after.settings,plan.settings);assert.deepEqual(await protectedHashes(q,before.resumption.seasonId),preserved);
  const receipt={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,seasonId:Number(before.resumption.seasonId),completedAt,before,after,protectedHashes:preserved,protectedUnchanged:true,accountGrants:0};
  receipt.auditId=String(one(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'CLAN_SEASON',$2,$3,$4) RETURNING id",[ACTION,String(receipt.seasonId),JSON.stringify({reviewHash:expectedReviewHash}),JSON.stringify(receipt)])).id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),completedAt]);
  const result=await verifySchedule(db);await q(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
