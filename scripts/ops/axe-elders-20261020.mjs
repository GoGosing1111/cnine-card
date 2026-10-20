import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {organizationElderIds,validateOrganizationElders} from '../../shared/organization-faction-v1.mjs';

export const OPERATION_KEY='ops:axe-elders:exclude-streamers:20261020:v1';
export const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1';
const ORGANIZATION_ID=1,REMOVED=[5426,4754],KEPT=4582,REPLACEMENTS=[4391,2333];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const protectedState=state=>{
 const copy=structuredClone(state);delete copy.elders?.[ORGANIZATION_ID];delete copy.commanders?.[ORGANIZATION_ID];delete copy.events;return copy;
};
const rosterSql='SELECT m.user_id,m.organization_id,m.slot,m.seed_power,u.nickname,u.status,u.role FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 AND m.organization_id=1 ORDER BY m.seed_power DESC,m.slot,m.user_id';

// One requested replacement in 도끼파. No reassignment, account-role change or automatic rotation.
export async function replaceAxeElders(client,{commit=false,expectedRosterHash,actorId=1,now=Date.now()}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const [policy]=await q('SELECT revision,policy_json FROM organization_faction_policy_v1 WHERE id=1 FOR SHARE');
  assert.equal(JSON.parse(policy.policy_json).mode,'ON','Do not change operation mode');
  const [round]=await q('SELECT id,scope,phase FROM organization_rounds_v1 WHERE id=$1 FOR UPDATE',[ROUND_ID]);
  assert.equal(round?.scope,'LIVE');assert.equal(round.phase,'ASSIGNED');
  assert.equal((await q("SELECT id FROM organization_rounds_v1 WHERE scope='LIVE' ORDER BY created_at DESC LIMIT 1"))[0].id,ROUND_ID);
  assert((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE' FOR SHARE",[actorId])).length);
  const [row]=await q('SELECT revision,state_json FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[ROUND_ID]);
  const before=JSON.parse(row.state_json),state=structuredClone(before);
  const members=await q(rosterSql+' FOR SHARE OF m,u',[ROUND_ID]);
  const rosterHash=hash(members);
  if(commit){assert(expectedRosterHash,'Inspected roster hash required');assert.equal(rosterHash,expectedRosterHash,'Roster changed; inspect again');}
  const roster=members.map(m=>({userId:Number(m.user_id),clanId:Number(m.organization_id),slot:Number(m.slot),seedPower:Number(m.seed_power),nickname:m.nickname,status:m.status}));
  const oldIds=organizationElderIds(before,roster,ORGANIZATION_ID);
  assert.deepEqual(oldIds,[...REMOVED,KEPT],'Elders changed since inspection');
  assert.equal(roster.find(m=>m.userId===5426)?.nickname,'나무늘봉순');
  assert.equal(roster.find(m=>m.userId===4754)?.nickname,'조은');
  const streamerIds=(await q('SELECT user_id FROM soopketland_accounts WHERE user_id IS NOT NULL FOR SHARE')).map(r=>Number(r.user_id));
  const excluded=new Set([...REMOVED,...streamerIds]);
  const selected=roster.filter(m=>m.status==='ACTIVE'&&!oldIds.includes(m.userId)&&!excluded.has(m.userId)).slice(0,2);
  assert.deepEqual(selected.map(m=>m.userId),REPLACEMENTS,'Eligible ranking changed');
  const nextIds=validateOrganizationElders([KEPT,...REPLACEMENTS],roster,ORGANIZATION_ID);
  const treasuryBefore=await q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1 ORDER BY organization_id',[ROUND_ID]);
  state.elders[ORGANIZATION_ID]=nextIds;state.commanders[ORGANIZATION_ID]=nextIds[0];
  state.events||=[];
  state.events.unshift({id:randomUUID(),kind:'ELDERS',clanId:ORGANIZATION_ID,by:'운영',names:nextIds.map(id=>roster.find(m=>m.userId===id).nickname),at:now});
  state.events=state.events.slice(0,80);
  assert.deepEqual(protectedState(state),protectedState(before));
  assert.equal((await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 AND revision=$3 RETURNING revision',[JSON.stringify(state),ROUND_ID,row.revision])).length,1);
  const describe=ids=>ids.map(id=>{const m=roster.find(m=>m.userId===id);return {userId:id,nickname:m.nickname,seedPower:m.seedPower,slot:m.slot};});
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,roundId:ROUND_ID,organizationId:ORGANIZATION_ID,organizationName:'도끼파',authorization:'도끼파 조은 봉순 원로 내리고 다른 상위2명으로 대체해 스트리머라 안됨',basis:'Saved seed_power DESC, slot ASC, user_id ASC; exclude current elders and registered streamers',removed:describe(REMOVED),appointed:describe(REPLACEMENTS),elders:describe(nextIds),kept:describe([KEPT])[0],rosterHash,protectedStateHash:hash(protectedState(before)),treasuryHash:hash(treasuryBefore),beforeRevision:Number(row.revision),afterRevision:Number(row.revision)+1,completedAt:new Date(now).toISOString(),committed:commit};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'ORGANIZATION_ELDERS_REPLACE','ORGANIZATION_ROUND',$2,$3,$4) RETURNING id",[actorId,ROUND_ID,JSON.stringify({organizationId:ORGANIZATION_ID,elders:oldIds,commanderId:before.commanders[ORGANIZATION_ID],revision:row.revision}),JSON.stringify(receipt)]);
  receipt.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  const saved=JSON.parse((await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[ROUND_ID]))[0].state_json);
  assert.deepEqual(saved,state);assert.deepEqual(organizationElderIds(saved,roster,ORGANIZATION_ID),nextIds);
  assert.deepEqual(await q(rosterSql,[ROUND_ID]),members);
  assert.deepEqual(await q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1 ORDER BY organization_id',[ROUND_ID]),treasuryBefore);
  await q(commit?'COMMIT':'ROLLBACK');return {...receipt,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
