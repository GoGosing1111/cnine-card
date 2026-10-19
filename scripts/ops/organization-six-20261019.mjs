import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {allocateOrganizations,ORGANIZATIONS} from '../../shared/organization-system-v1.mjs';
import {rankedOrganizationElders,SQUADS} from '../../shared/organization-faction-v1.mjs';

export const OPERATION_KEY='ops:organization-six:20261019:v1';
export const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function consolidateOrganizations(client,{commit=false,expectedRosterHash,roundId=ROUND_ID,actorId=1,now=Date.now(),allowTest=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='25s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.roundId,roundId);await q('ROLLBACK');return {...receipt,replayed:true,committed:false};}
  assert.deepEqual(ORGANIZATIONS.map(o=>o.id),[1,2,3,4,5,6]);
  const [policy]=await q('SELECT revision,policy_json FROM organization_faction_policy_v1 WHERE id=1 FOR SHARE');
  assert.equal(JSON.parse(policy.policy_json).mode,allowTest?'TEST':'ON','Keep the saved operation mode');
  const [round]=await q('SELECT * FROM organization_rounds_v1 WHERE id=$1 FOR UPDATE',[roundId]);
  assert.equal(round.scope,allowTest?'TEST':'LIVE');assert.equal(round.phase,'ASSIGNED');
  const [latest]=await q('SELECT id FROM organization_rounds_v1 WHERE scope=$1 ORDER BY created_at DESC LIMIT 1',[round.scope]);assert.equal(latest.id,roundId);
  assert((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE' FOR SHARE",[actorId])).length);
  const [row]=await q('SELECT revision,state_json FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[roundId]);assert(row);
  const before=JSON.parse(row.state_json);assert(!before.battles.some(b=>b.status==='ACTIVE'),'Wait for active battles to finish');assert(!['ACTIVE','PAUSED'].includes(before.session?.status),'Wait for the current session to settle');assert.equal(before.sessionQueue?.length||0,0,'Queued session must finish first');
  const members=await q('SELECT m.*,u.nickname,u.status,s.preferred_id FROM organization_members_v1 m JOIN users u ON u.id=m.user_id LEFT JOIN organization_surveys_v1 s ON s.round_id=m.round_id AND s.user_id=m.user_id WHERE m.round_id=$1 ORDER BY m.user_id FOR UPDATE OF m FOR SHARE OF u',[roundId]);
  assert(members.length>0&&members.length<=150);assert(members.every(m=>m.status==='ACTIVE'),'Inactive members need explicit handling');
  const rosterHash=hash(members);if(commit){assert(expectedRosterHash,'Reviewed roster hash required');assert.equal(rosterHash,expectedRosterHash,'Roster changed after review');}
  const plan=allocateOrganizations(members.map(m=>({userId:Number(m.user_id),nickname:m.nickname,power:Number(m.seed_power),preferredOrganizationId:Number(m.preferred_id||m.organization_id)})),{seed:OPERATION_KEY});
  assert.equal(plan.organizations.length,6);assert(plan.stats.maxMembers-plan.stats.minMembers<=1);assert(plan.stats.maxMembers<=25);
  const byId=new Map(members.map(m=>[Number(m.user_id),m]));
  const assignments=plan.organizations.flatMap(o=>o.members.map(m=>({user_id:m.userId,organization_id:o.id,slot:m.slot,seed_power:m.power,joined_at:Number(byId.get(m.userId).joined_at)})));
  assert.equal(new Set(assignments.map(m=>m.user_id)).size,members.length);
  const funds=await q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1 ORDER BY organization_id FOR UPDATE',[roundId]);
  const progress=await q('SELECT * FROM organization_progress_v1 WHERE round_id=$1 ORDER BY organization_id FOR SHARE',[roundId]);
  const backup={round,members,funds,progress,state:before,stateRevision:Number(row.revision)},backupHash=hash(backup);
  // Only this content's slot constraint widens. Historical organization ids stay readable.
  await q('ALTER TABLE organization_members_v1 DROP CONSTRAINT organization_members_v1_slot_check');
  await q('ALTER TABLE organization_members_v1 ADD CONSTRAINT organization_members_v1_slot_check CHECK(slot BETWEEN 1 AND 25)');
  await q('DELETE FROM organization_members_v1 WHERE round_id=$1',[roundId]);
  await q('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) SELECT $1,user_id,organization_id,slot,seed_power,joined_at FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,organization_id int,slot int,seed_power bigint,joined_at bigint)',[roundId,JSON.stringify(assignments)]);
  const state=structuredClone(before),kept=[],released=[];
  for(const d of state.districts){d.defense='';if(d.owner>6){released.push(d.id);Object.assign(d,{owner:0,protectedUntil:0,taxAt:now,taxRemainder:0});}else if(d.owner)kept.push({id:d.id,owner:d.owner,protectedUntil:d.protectedUntil});}
  state.formations=Object.fromEntries(ORGANIZATIONS.map(o=>[o.id,Object.fromEntries(SQUADS.map(s=>[s.id,[]]))]));state.captains={};state.squadReady={};state.targetReady={};state.organizationVersion=2;
  const elders=rankedOrganizationElders(assignments.map(m=>({userId:m.user_id,clanId:m.organization_id,slot:m.slot,seedPower:m.seed_power,status:'ACTIVE'})));
  assert(elders.every(o=>o.userIds.length===3));state.elders=Object.fromEntries(elders.map(o=>[o.organizationId,o.userIds]));state.commanders=Object.fromEntries(elders.map(o=>[o.organizationId,o.userIds[0]]));
  state.events.unshift({id:OPERATION_KEY,kind:'REORGANIZED',by:'운영',at:now});state.events=state.events.slice(0,80);
  await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2',[JSON.stringify(state),roundId]);
  // Keep old ledgers and paid rewards; record a single compensating reset entry.
  await q('INSERT INTO organization_faction_treasury_v1(round_id,organization_id) SELECT $1,generate_series(1,15) ON CONFLICT DO NOTHING',[roundId]);
  await q('INSERT INTO organization_faction_ledger_v1(id,round_id,organization_id,delta,balance,reason,reference_key,created_at) SELECT $1||\':\'||organization_id,$2,organization_id,-balance,0,$3,$1,$4 FROM organization_faction_treasury_v1 WHERE round_id=$2',[OPERATION_KEY,roundId,'6개 조직 재편 · 공동 자금 전체 초기화',now]);
  await q('UPDATE organization_faction_treasury_v1 SET balance=0,total_earned=0 WHERE round_id=$1',[roundId]);
  await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1',[roundId]);
  const proposalId=randomUUID();await q('INSERT INTO organization_proposals_v1(id,round_id,round_revision,input_hash,result_json,expires_at,created_at,applied_at) VALUES($1,$2,$3,$4,$5,$6,$6,$6)',[proposalId,roundId,Number(round.revision)+1,rosterHash,JSON.stringify(plan),now]);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,roundId,completedAt:new Date(now).toISOString(),basis:'Saved server-evaluated seed_power; balanced count, then power, then wishes',rosterHash,backupHash,backup,plan,assignments,elders,keptDistricts:kept,releasedDistricts:released,resetFunds:funds.reduce((n,f)=>n+Number(f.balance),0),beforeRevision:Number(row.revision),afterRevision:Number(row.revision)+1,proposalId};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[actorId,'ORGANIZATION_CONSOLIDATE','ORGANIZATION_ROUND',roundId,JSON.stringify({backupHash,memberCount:members.length,funds:receipt.resetFunds}),JSON.stringify({rosterHash,organizations:6,stats:plan.stats,elders,keptDistricts:kept.length,releasedDistricts:released.length})]);receipt.adminLogId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt]);
  assert.equal((await q('SELECT count(*)::int AS n FROM organization_members_v1 WHERE round_id=$1',[roundId]))[0].n,members.length);
  assert.equal((await q('SELECT count(*)::int AS n FROM organization_faction_treasury_v1 WHERE round_id=$1 AND (balance<>0 OR total_earned<>0)',[roundId]))[0].n,0);
  assert.deepEqual(await q('SELECT * FROM organization_progress_v1 WHERE round_id=$1 ORDER BY organization_id',[roundId]),progress);
  assert.deepEqual(state.sessionHistory,before.sessionHistory);assert.deepEqual(state.session,before.session);assert.deepEqual(state.battles,before.battles);
  await q(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
