import assert from 'node:assert/strict';
import {OP,CLANS,FIXED_USER,FIXED_CLAN,hash} from './clan-reshuffle-plan-20261025.mjs';
import {ROUND_ID} from './clan-resume-20261025.mjs';
import {SQUADS} from '../../shared/organization-faction-v1.mjs';
import {CLAN_RESUMPTION_STATE_KEY} from '../../shared/clan-resumption-v1.mjs';
import {FORGE_ADVANCED_KEY} from '../../shared/equipment-forge-advanced-v1.mjs';
export {OP,ROUND_ID};
const AUTHORIZATION=['ㄴㄴ 나무늘봉순만 그대로 두고 다시 한번 섞어','좀 안가본대로 섞어 다','밸런스 잡으면서'];
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const query=db=>async(sql,args=[])=>(await db.query(sql,args)).rows;
const warTables=['clan_war_readiness','clan_war_field_state','clan_war_field_receipts','clan_war_reservation_locks'];
async function snapshot(q,{lock=false}={}){
 const round=one(await q('SELECT * FROM organization_rounds_v1 WHERE id=$1'+(lock?' FOR UPDATE':''),[ROUND_ID]));
 const state=one(await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1'+(lock?' FOR UPDATE':''),[ROUND_ID]));
 const release=one(await q('SELECT * FROM app_meta WHERE key=$1',[CLAN_RESUMPTION_STATE_KEY]));
 const seasonId=Number(JSON.parse(release.value).seasonId);
 const season=one(await q('SELECT * FROM clan_seasons WHERE id=$1'+(lock?' FOR UPDATE':''),[seasonId]));
 const members=await q('SELECT * FROM organization_members_v1 WHERE round_id=$1 ORDER BY user_id'+(lock?' FOR UPDATE':''),[ROUND_ID]);
 const current={};
 for(const table of ['clan_members','clan_draft_pool','clan_season_teams','clan_executives','clan_weekly_availability'])current[table]=await q('SELECT * FROM '+table+' WHERE season_id=$1 ORDER BY row_to_json('+table+')::text'+(lock?' FOR UPDATE':''),[seasonId]);
 const wars=await q('SELECT * FROM clan_wars WHERE season_id=$1 ORDER BY id'+(lock?' FOR UPDATE':''),[seasonId]);
 for(const table of warTables)current[table]=await q(`SELECT * FROM ${table} WHERE war_id IN (SELECT id FROM clan_wars WHERE season_id=$1) ORDER BY row_to_json(${table})::text`,[seasonId]);
 const protectedHashes={};
 for(const table of ['organization_progress_v1','organization_faction_treasury_v1','organization_surveys_v1','organization_faction_days_v1','organization_faction_settlements_v1','organization_faction_ledger_v1'])protectedHashes[table]=hash(await q('SELECT * FROM '+table+' WHERE round_id=$1 ORDER BY row_to_json('+table+')::text',[ROUND_ID]));
 protectedHashes.settings=hash(await q("SELECT key,value FROM app_meta WHERE key IN ('clan_settings_v1','clan_resumption_v1','clan_reform_v1') ORDER BY key"));
 protectedHashes.factionPolicy=hash(await q('SELECT * FROM organization_faction_policy_v1 ORDER BY id'));
 protectedHashes.applications=hash(await q('SELECT key,value FROM app_meta WHERE left(key,length($1))=$1 ORDER BY key',['organization-join:'+ROUND_ID+':']));
 for(const table of ['clan_members','clan_draft_pool','clan_season_teams','clan_executives','clan_weekly_availability'])protectedHashes['history:'+table]=one(await q(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) digest FROM ${table} t WHERE season_id<>$1`,[seasonId])).digest;
 for(const table of ['clan_war_battles','clan_participation_progress','clan_participation_receipts','clan_participation_round_rules','clan_championships','clan_championship_rewards','clan_season_settlements'])protectedHashes[table]=one(await q(`SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) digest FROM ${table} t`)).digest;
 return {round,state,release,seasonId,season,members,current,wars,protectedHashes};
}
export async function inspectReshuffle(db){const q=query(db),before=await snapshot(q),row=(await q('SELECT value FROM app_meta WHERE key=$1',[OP]))[0];return {before,reviewHash:hash(before),receipt:row?JSON.parse(row.value):null};}
const keepState=value=>{const s=structuredClone(value);for(const key of ['formations','captains','squadReady','targetReady','strikeReady','elders','commanders','events'])delete s[key];s.districts=s.districts.map(({defense,...d})=>d);return s;};
const sortedRows=(rows,fields)=>rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!fields.includes(k)))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
export function validatePlan(plan){
 const {planHash,...body}=plan;assert.equal(hash(body),planHash,'Plan fingerprint mismatch');assert.equal(plan.operationKey,OP);assert.equal(plan.assignments.length,128);
 const rows=plan.assignments;assert.equal(new Set(rows.map(p=>p.userId)).size,128);assert(!rows.some(p=>p.userId===73));
 for(const p of rows){assert(Number.isSafeInteger(p.power)&&p.power>0&&p.power<2147483647);assert(CLANS.includes(p.clanId));assert.equal(p.fixed,p.userId===FIXED_USER);assert.equal(p.unvisited,!p.visited.includes(p.clanId));assert(p.fixed?p.clanId===FIXED_CLAN:p.clanId!==p.currentClan);}
 assert.equal(rows.filter(p=>p.fixed).length,1);assert.equal(rows.find(p=>p.fixed).currentClan,FIXED_CLAN);
 for(const id of CLANS){const m=rows.filter(p=>p.clanId===id);assert.equal(m.length,16);assert.deepEqual(m.map(p=>p.slot).sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i+1));assert.equal(m.filter(p=>p.rank<=8).length,1);assert.equal(m.filter(p=>p.rank<=16).length,2);assert.equal(m.filter(p=>p.rank<=32).length,4);assert(m.filter(p=>p.inactive).length<=1);}
}
export async function verifyReshuffle(db){
 const q=query(db),receipt=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OP])).value);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.authorization,AUTHORIZATION);validatePlan(receipt.plan);
 const current=await snapshot(q),state=JSON.parse(current.state.state_json);assert.equal(current.seasonId,receipt.seasonId);
 const expected=receipt.plan.assignments.map(p=>[p.userId,p.clanId,p.slot,p.power,p.joinedAt]).sort((a,b)=>a[0]-b[0]);
 assert.deepEqual(current.members.map(m=>[Number(m.user_id),Number(m.organization_id),Number(m.slot),Number(m.seed_power),Number(m.joined_at)]),expected);
 assert.deepEqual(current.current.clan_members.map(m=>[Number(m.user_id),Number(m.clan_id)]).sort((a,b)=>a[0]-b[0]),expected.map(m=>m.slice(0,2)));
 for(const id of CLANS){
  const elders=receipt.elders[id];assert.deepEqual(state.elders[id],elders);assert.equal(state.commanders[id],elders[0]);
  assert.deepEqual(current.current.clan_executives.filter(e=>Number(e.clan_id)===id).sort((a,b)=>Number(a.position)-Number(b.position)).map(e=>Number(e.user_id)),elders);
  assert.equal(Number(one(current.current.clan_season_teams.filter(t=>Number(t.clan_id)===id)).master_user_id),elders[0]);
 }
 for(const m of current.current.clan_members){const p=receipt.plan.assignments.find(p=>p.userId===Number(m.user_id)),master=receipt.elders[p.clanId][0]===p.userId;assert.equal(m.member_role,master?'MASTER':'MEMBER');assert.equal(Number(m.draft_pick_no),p.slot);const pool=one(current.current.clan_draft_pool.filter(x=>Number(x.user_id)===p.userId));assert.equal(Number(pool.drafted_clan_id),p.clanId);assert.equal(Number(pool.pick_no),p.slot);assert.equal(Number(pool.total_score),p.power);assert.equal(pool.status,master?'MASTER':'DRAFTED');}
 assert.deepEqual(current.wars,receipt.before.wars);assert.deepEqual(current.season,receipt.before.season);assert.deepEqual(current.protectedHashes,receipt.before.protectedHashes);
 assert.deepEqual(keepState(state),keepState(JSON.parse(receipt.before.state.state_json)));
 for(const [table,allowed] of Object.entries({clan_members:['clan_id','member_role','draft_pick_no','updated_at'],clan_draft_pool:['drafted_clan_id','pick_no','total_score','status','updated_at'],clan_season_teams:['master_user_id','updated_at'],clan_weekly_availability:['clan_id']}))assert.deepEqual(sortedRows(current.current[table],allowed),sortedRows(receipt.before.current[table],allowed),table+' protected fields');
 for(const table of ['clan_war_readiness','clan_war_field_state'])assert.equal(current.current[table].length,0);
 assert.deepEqual(current.current.clan_war_field_receipts,receipt.before.current.clan_war_field_receipts);assert.deepEqual(current.current.clan_war_reservation_locks,receipt.before.current.clan_war_reservation_locks);
 for(const a of current.current.clan_weekly_availability)assert.equal(Number(a.clan_id),receipt.plan.assignments.find(p=>p.userId===Number(a.user_id)).clanId);
 const audit=one(await q('SELECT * FROM admin_logs WHERE id=$1',[receipt.auditId]));assert.equal(audit.action_type,'CLAN_HISTORY_BALANCED_RESHUFFLE');assert.equal(JSON.parse(audit.after_data).planHash,receipt.plan.planHash);
 return {verified:true,receipt,protectedUnchanged:true,stats:receipt.plan.stats};
}
export async function applyReshuffle(db,{plan,dryRun=true,now=Date.now()}={}){
 const q=query(db);if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verifyReshuffle(db),replayed:true};
 validatePlan(plan);assert(now>=Date.parse(plan.evaluatedAt)&&now-Date.parse(plan.evaluatedAt)<1800000,'Refresh power evaluation after 30 minutes');
 // Read the newest state after acquiring the existing round/state locks. The
 // live scheduler may finish a revision while this operation waits for a lock.
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='30s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length){const result=await verifyReshuffle(db);await q('ROLLBACK');return {...result,replayed:true};}
  one(await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE' FOR SHARE"));
  const before=await snapshot(q,{lock:true}),seasonId=before.seasonId;
  assert.equal(before.round.scope,'LIVE');assert.equal(before.round.phase,'ASSIGNED');assert.equal(before.season.phase,'ACTIVE');assert.equal(Number(before.season.season_no),4);
  assert.equal(before.members.length,128);assert.equal(before.current.clan_members.length,128);assert.equal(before.current.clan_draft_pool.length,128);
  assert.equal(before.wars.length,28);assert(before.wars.every(w=>w.status==='SCHEDULED'&&Date.parse(w.starts_at)>now+60000),'Regular war has already started');
  assert.equal(before.current.clan_war_field_receipts.length,0);assert.equal(before.current.clan_war_reservation_locks.length,0);
  const state=JSON.parse(before.state.state_json);assert(!['ACTIVE','PAUSED'].includes(state.session?.status),'Faction war must be settled before reshuffling');assert.equal(state.sessionQueue?.length||0,0);assert(!(state.battles||[]).some(b=>b.status==='ACTIVE'));
  const policy=one(await q('SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1'));assert.equal(Number(policy.revision),plan.policyRevision,'Power policy changed; recalculate');
  const forge=(await q('SELECT value FROM app_meta WHERE key=$1',[FORGE_ADVANCED_KEY]))[0];assert.equal(forge?Number(JSON.parse(forge.value).revision):0,plan.advancedForgeRevision);
  const people=await q('SELECT id,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR SHARE',[plan.assignments.map(p=>p.userId)]);assert.equal(people.length,128);assert(people.every(p=>p.status==='ACTIVE'));assert.equal(people.find(p=>Number(p.id)===FIXED_USER).nickname,'나무늘봉순');
  const expectedBefore=plan.assignments.map(p=>[p.userId,p.currentClan,p.previousSlot,p.previousPower,p.joinedAt]).sort((a,b)=>a[0]-b[0]);
  assert.deepEqual(before.members.map(m=>[Number(m.user_id),Number(m.organization_id),Number(m.slot),Number(m.seed_power),Number(m.joined_at)]),expectedBefore,'Membership changed; replan');
  assert.deepEqual(before.current.clan_members.map(m=>[Number(m.user_id),Number(m.clan_id)]).sort((a,b)=>a[0]-b[0]),expectedBefore.map(r=>r.slice(0,2)));
  const elders=Object.fromEntries(CLANS.map(id=>[id,plan.assignments.filter(p=>p.clanId===id).sort((a,b)=>a.slot-b.slot).slice(0,3).map(p=>p.userId)]));
  const assignments=plan.assignments.map(p=>({user_id:p.userId,organization_id:p.clanId,slot:p.slot,seed_power:p.power,joined_at:p.joinedAt,member_role:elders[p.clanId][0]===p.userId?'MASTER':'MEMBER'})),encoded=JSON.stringify(assignments),at=new Date(now).toISOString();
  await q('DELETE FROM organization_members_v1 WHERE round_id=$1',[ROUND_ID]);
  await q('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) SELECT $1,user_id,organization_id,slot,seed_power,joined_at FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,organization_id int,slot int,seed_power bigint,joined_at bigint)',[ROUND_ID,encoded]);
  await q('UPDATE clan_members m SET clan_id=x.organization_id,member_role=x.member_role,draft_pick_no=x.slot,updated_at=$3 FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,organization_id int,slot int,member_role text) WHERE m.season_id=$1 AND m.user_id=x.user_id',[seasonId,encoded,at]);
  await q("UPDATE clan_draft_pool p SET drafted_clan_id=x.organization_id,pick_no=x.slot,total_score=x.seed_power,status=CASE WHEN x.member_role='MASTER' THEN 'MASTER' ELSE 'DRAFTED' END,updated_at=$3 FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,organization_id int,slot int,seed_power int,member_role text) WHERE p.season_id=$1 AND p.user_id=x.user_id",[seasonId,encoded,at]);
  // Temporary real, distinct roster members avoid immediate unique-master
  // collisions while exchanging leaders. They are never visible outside COMMIT.
  const unavailable=new Set([...before.current.clan_season_teams.map(t=>Number(t.master_user_id)),...Object.values(elders).map(e=>e[0])]);
  for(const id of CLANS){const temporary=plan.assignments.find(p=>p.clanId===id&&!unavailable.has(p.userId));assert(temporary);await q('UPDATE clan_season_teams SET master_user_id=$1 WHERE season_id=$2 AND clan_id=$3',[temporary.userId,seasonId,id]);}
  for(const id of CLANS)await q('UPDATE clan_season_teams SET master_user_id=$1,updated_at=$4 WHERE season_id=$2 AND clan_id=$3',[elders[id][0],seasonId,id,at]);
  await q('DELETE FROM clan_executives WHERE season_id=$1',[seasonId]);
  const executiveRows=CLANS.flatMap(id=>elders[id].map((uid,i)=>({clan_id:id,user_id:uid,power:plan.assignments.find(p=>p.userId===uid).power,position:i+1})));
  await q('INSERT INTO clan_executives(season_id,clan_id,user_id,power,position,checked_ms) SELECT $1,clan_id,user_id,power,position,$3 FROM jsonb_to_recordset($2::jsonb) AS x(clan_id int,user_id bigint,power double precision,position int)',[seasonId,JSON.stringify(executiveRows),now]);
  await q('UPDATE clan_weekly_availability a SET clan_id=x.organization_id FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,organization_id int) WHERE a.season_id=$1 AND a.user_id=x.user_id',[seasonId,encoded]);
  for(const table of ['clan_war_readiness','clan_war_field_state'])await q(`DELETE FROM ${table} WHERE war_id IN (SELECT id FROM clan_wars WHERE season_id=$1)`,[seasonId]);
  state.formations=Object.fromEntries(CLANS.map(id=>[id,Object.fromEntries(SQUADS.map(s=>[s.id,[]]))]));state.captains={};state.squadReady={};state.targetReady={};state.strikeReady={};state.elders=elders;state.commanders=Object.fromEntries(CLANS.map(id=>[id,elders[id][0]]));for(const d of state.districts)d.defense='';
  state.events=[{id:OP,kind:'REORGANIZED',organizationCount:8,by:'운영',at:now},...(state.events||[])].slice(0,80);
  one(await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 AND revision=$3 RETURNING round_id',[JSON.stringify(state),ROUND_ID,before.state.revision]));
  one(await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING id',[ROUND_ID,before.round.revision]));
  const receipt={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,roundId:ROUND_ID,seasonId,completedAt:at,before,plan,elders,accountWrites:0,grants:0,publicationsSent:0};
  receipt.auditId=String(one(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'CLAN_HISTORY_BALANCED_RESHUFFLE','ORGANIZATION_ROUND',$1,$2,$3) RETURNING id",[ROUND_ID,JSON.stringify({reviewHash:hash(before),memberCount:128}),JSON.stringify({operationKey:OP,planHash:plan.planHash,seasonId,fixedUserId:FIXED_USER,fixedClanId:FIXED_CLAN,stats:plan.stats,accountWrites:0,grants:0})])).id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),at]);
  const result=await verifyReshuffle(db);await q(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
