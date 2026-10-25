import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {__clanTest as clan} from '../../functions/_clan.js';
import {CLAN_RESUMPTION_KEY as OP,CLAN_RESUMPTION_STATE_KEY,CLAN_RESUMPTION_VERSION,resumedClanSettings,createResumedFactionDay} from '../../shared/clan-resumption-v1.mjs';
import {factionDayKey} from '../../shared/clan-faction-sessions-v1.mjs';
export {OP};
export const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1';
export const AUTHORIZATION=['재개해 화수목토 예전방식대로','정규클랜전 21~22시,세력전 1일 1번, 승점에 포함 (1점) 4개점령으로 변경','그리고 란x2 탈퇴시켜'];
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const query=db=>async(sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
async function snapshot(q,{lock=false}={}){
 const round=one(await q('SELECT * FROM organization_rounds_v1 WHERE id=$1'+(lock?' FOR UPDATE':''),[ROUND_ID]));
 const state=one(await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1'+(lock?' FOR UPDATE':''),[ROUND_ID]));
 const members=await q('SELECT * FROM organization_members_v1 WHERE round_id=$1 ORDER BY user_id'+(lock?' FOR UPDATE':''),[ROUND_ID]);
 const settings=one(await q("SELECT * FROM app_meta WHERE key='clan_settings_v1'"+(lock?' FOR UPDATE':'')));
 const factionPolicy=one(await q('SELECT * FROM organization_faction_policy_v1 WHERE id=1'+(lock?' FOR UPDATE':'')));
 const seasons=await q('SELECT * FROM clan_seasons ORDER BY season_no');
 const days=await q('SELECT * FROM organization_faction_days_v1 WHERE round_id=$1 ORDER BY day_key',[ROUND_ID]);
 const protectedHashes={};
 for(const table of ['organization_progress_v1','organization_faction_treasury_v1','organization_surveys_v1','organization_faction_settlements_v1','organization_faction_ledger_v1'])protectedHashes[table]=hash(await q('SELECT * FROM '+table+' WHERE round_id=$1 ORDER BY row_to_json('+table+')::text',[ROUND_ID]));
 protectedHashes.applications=hash(await q('SELECT key,value FROM app_meta WHERE left(key,length($1))=$1 ORDER BY key',['organization-join:'+ROUND_ID+':']));
 for(const table of ['clan_seasons','clan_season_teams','clan_members','clan_draft_pool','clan_wars','clan_war_battles','clan_championships','clan_championship_rewards','clan_season_settlements']){
  const field=table==='clan_seasons'?'id':'season_id';
  protectedHashes[table]=one(await q(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) digest FROM ${table} t WHERE ${field}<=6`)).digest;
 }
 return {round,state,members,settings,factionPolicy,seasons,days,protectedHashes};
}
export async function inspectResume(db){
 const q=query(db),before=await snapshot(q),receipt=await q('SELECT value FROM app_meta WHERE key=$1',[OP]);
 return {before,reviewHash:hash(before),receipt:receipt[0]?JSON.parse(receipt[0].value):null};
}
export function planRegularWars(settings,now,teams=[1,2,3,4,5,6,7,8]){
 const starts=clan.scheduledWindowStarts(resumedClanSettings(settings),now,7);
 return clan.roundRobinRounds(teams).flatMap((pairs,i)=>pairs.map(p=>({...p,status:'SCHEDULED',startsAt:new Date(starts[i]).toISOString(),endsAt:new Date(starts[i]+3600000).toISOString()})));
}
export async function verifyResume(db){
 const q=query(db),receipt=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OP])).value);
 assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.authorization,AUTHORIZATION);
 const current=await snapshot(q),state=JSON.parse(current.state.state_json);
 assert.equal(state.resumption.seasonId,receipt.seasonId);
 assert.deepEqual(JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[CLAN_RESUMPTION_STATE_KEY])).value),state.resumption);
 assert(!current.members.some(m=>Number(m.user_id)===73));
 assert.deepEqual(current.members,receipt.members);
 const mirrored=await q('SELECT user_id,clan_id FROM clan_members WHERE season_id=$1 ORDER BY user_id',[receipt.seasonId]);
 assert.deepEqual(mirrored.map(m=>[Number(m.user_id),Number(m.clan_id)]),current.members.map(m=>[Number(m.user_id),Number(m.organization_id)]));
 const wars=await q('SELECT round_no,clan_a_id,clan_b_id,status,starts_at,ends_at FROM clan_wars WHERE season_id=$1 ORDER BY round_no,clan_a_id,clan_b_id',[receipt.seasonId]);
 assert.equal(wars.length,28);assert(wars.every(w=>Number(w.round_no)<1000));
 assert.deepEqual(wars.map(({status,...w})=>w),receipt.wars.map(({status,...w})=>w));
 assert.deepEqual(JSON.parse(current.settings.value),receipt.settings);
 assert.equal((await q('SELECT * FROM clan_championships WHERE season_id=$1',[receipt.seasonId])).length,0);
 const account=one(await q('SELECT id,nickname,status FROM users WHERE id=73'));assert.equal(account.nickname,'란x2');assert.equal(account.status,'ACTIVE');
 assert(!Object.values(state.elders).flat().includes(73));assert(!Object.values(state.captains).flatMap(Object.values).includes(73));
 return {verified:true,receipt,protectedUnchanged:hash(current.protectedHashes)===hash(receipt.before.protectedHashes),clans:[1,2,3,4,5,6,7,8].map(id=>({id,count:current.members.filter(m=>Number(m.organization_id)===id).length})),regularFirstAt:wars[0].starts_at,regularEndAt:wars.at(-1).ends_at};
}
export async function applyResume(db,{dryRun=true,expectedReviewHash,now=Date.now(),random}={}){
 const q=query(db);
 if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verifyResume(db),replayed:true};
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='30s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length){const result=await verifyResume(db);await q('ROLLBACK');return {...result,replayed:true};}
  one(await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE' FOR SHARE"));
  const before=await snapshot(q,{lock:true});assert.equal(hash(before),expectedReviewHash,'State changed since review; inspect again');
  assert.equal(before.round.phase,'ASSIGNED');assert.equal(before.round.scope,'LIVE');assert.equal(before.members.length,129);
  assert(before.seasons.every(s=>s.phase==='COMPLETE'));assert.equal(Number(before.seasons.at(-1).id),6);
  const removed=one(before.members.filter(m=>Number(m.user_id)===73));assert.equal(Number(removed.organization_id),8);
  const account=one(await q('SELECT *,md5(row_to_json(users)::text) digest FROM users WHERE id=73 FOR SHARE'));assert.equal(account.nickname,'란x2');
  const state=JSON.parse(before.state.state_json);assert(!['ACTIVE','PAUSED'].includes(state.session?.status));assert(!state.battles.some(b=>b.status==='ACTIVE'));assert.equal(state.sessionQueue.length,0);
  const members=before.members.filter(m=>Number(m.user_id)!==73),settings=resumedClanSettings({...JSON.parse(before.settings.value),mode:'ON'}),wars=planRegularWars(settings,now);
  const season=one(await q("INSERT INTO clan_seasons(season_no,phase,max_members,registration_ends_at,draft_ends_at,starts_at,ends_at,draft_pick_count) VALUES($1,'ACTIVE',25,$2,$2,$3,$4,$5) RETURNING id",[Number(before.seasons.at(-1).season_no)+1,new Date(now).toISOString(),wars[0].startsAt,wars.at(-1).endsAt,members.length]));
  const release={version:CLAN_RESUMPTION_VERSION,enabled:true,effectiveAt:now,seasonId:Number(season.id),roundId:ROUND_ID};
  await q('DELETE FROM organization_members_v1 WHERE round_id=$1 AND user_id=73',[ROUND_ID]);
  for(const [id,formation] of Object.entries(state.formations||{}))for(const squad of Object.keys(formation))formation[squad]=formation[squad].filter(uid=>uid!==73);
  for(const captains of Object.values(state.captains||{}))for(const squad of Object.keys(captains))if(captains[squad]===73)captains[squad]=0;
  for(const id of Object.keys(state.elders)){state.elders[id]=state.elders[id].filter(uid=>uid!==73);if(state.commanders[id]===73)state.commanders[id]=state.elders[id][0]||0;}
  delete state.strikeReady[73];state.resumption=release;state.scheduleVersion=release.version;state.sessionDay='';state.sessionPlan=[];state.sessionQueue=[];
  for(const id of [1,2,3,4,5,6,7,8]){
   const people=members.filter(m=>Number(m.organization_id)===id),master=state.elders[id][0]||Number(people[0].user_id);
   await q('INSERT INTO clan_season_teams(season_id,clan_id,master_user_id,draft_position) VALUES($1,$2,$3,$4)',[season.id,id,master,id-1]);
   for(const [i,uid] of state.elders[id].entries())await q('INSERT INTO clan_executives(season_id,clan_id,user_id,power,position,checked_ms) VALUES($1,$2,$3,$4,$5,$6)',[season.id,id,uid,Number(people.find(m=>Number(m.user_id)===uid).seed_power),i+1,now]);
  }
  const mirror=members.map(m=>({...m,member_role:Number(m.user_id)===(state.elders[m.organization_id][0]||Number(members.find(n=>n.organization_id===m.organization_id).user_id))?'MASTER':'MEMBER',candidate_key:OP+':'+m.user_id}));
  await q("INSERT INTO clan_members(season_id,clan_id,user_id,member_role,draft_pick_no) SELECT $1,organization_id,user_id,member_role,slot FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,organization_id integer,member_role text,slot integer)",[season.id,JSON.stringify(mirror)]);
  await q("INSERT INTO clan_draft_pool(season_id,user_id,candidate_key,total_score,status,drafted_clan_id,pick_no) SELECT $1,user_id,candidate_key,seed_power,CASE WHEN member_role='MASTER' THEN 'MASTER' ELSE 'DRAFTED' END,organization_id,slot FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,candidate_key text,seed_power integer,member_role text,organization_id integer,slot integer)",[season.id,JSON.stringify(mirror)]);
  for(const w of wars)await q('INSERT INTO clan_wars(season_id,round_no,clan_a_id,clan_b_id,status,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[season.id,w.roundNo,w.clanAId,w.clanBId,w.status,w.startsAt,w.endsAt]);
  const day=factionDayKey(now),nextDay=factionDayKey(now+86400000),schedule=createResumedFactionDay(day,release,random),tomorrow=createResumedFactionDay(nextDay,release,random);
  for(const [d,slots] of [[day,schedule],[nextDay,tomorrow]])await q('INSERT INTO organization_faction_days_v1(round_id,day_key,schedule_json) VALUES($1,$2,$3) ON CONFLICT(round_id,day_key) DO UPDATE SET schedule_json=excluded.schedule_json',[ROUND_ID,d,JSON.stringify(slots)]);
  await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2',[JSON.stringify(state),ROUND_ID]);
  await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1',[ROUND_ID]);
  await q("UPDATE app_meta SET value=$1,updated_at=$2 WHERE key='clan_settings_v1'",[JSON.stringify(settings),new Date(now).toISOString()]);
  const factionPolicy={...JSON.parse(before.factionPolicy.policy_json),revision:Number(before.factionPolicy.revision)+1,pigCoinReward:{enabled:true,amount:200,...JSON.parse(before.factionPolicy.policy_json).pigCoinReward,requiredTerritories:4}};
  await q('UPDATE organization_faction_policy_v1 SET policy_json=$1,revision=revision+1 WHERE id=1',[JSON.stringify(factionPolicy)]);
  const after=await snapshot(q);assert.deepEqual(after.protectedHashes,before.protectedHashes);
  assert.equal(one(await q('SELECT md5(row_to_json(users)::text) digest FROM users WHERE id=73')).digest,account.digest);
  assert.deepEqual(state.districts,JSON.parse(before.state.state_json).districts);
  const savedWars=await q('SELECT round_no,clan_a_id,clan_b_id,status,starts_at,ends_at FROM clan_wars WHERE season_id=$1 ORDER BY round_no,clan_a_id,clan_b_id',[season.id]);
  const receipt={...release,status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,completedAt:new Date(now).toISOString(),before,members:after.members,wars:savedWars,settings,factionPolicy,schedule,tomorrow,withdrawn:{userId:73,nickname:'란x2',clanId:8},grants:0};
  receipt.auditId=String(one(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'CLAN_RESUME_AND_WITHDRAW','CLAN_SEASON',$1,$2,$3) RETURNING id",[String(season.id),JSON.stringify({reviewHash:expectedReviewHash,memberCount:129}),JSON.stringify({operationKey:OP,memberCount:128,seasonId:release.seasonId,withdrawn:receipt.withdrawn,weekdays:[2,3,4,6],minutes:60,factionDaily:1,requiredTerritories:4,points:1,grants:0})])).id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[CLAN_RESUMPTION_STATE_KEY,JSON.stringify(release),receipt.completedAt]);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),receipt.completedAt]);
  const result=await verifyResume(db);assert(result.protectedUnchanged);await q(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
