import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {rankedOrganizationElders,validateOrganizationElders} from '../../shared/organization-faction-v1.mjs';

export const OPERATION_KEY='ops:organization-elders:top3:20261019:v1';
export const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const preserved=state=>{const copy=structuredClone(state);delete copy.elders;delete copy.commanders;delete copy.events;return copy;};

// Explicit one-time appointment. Later ranking changes and CMS edits never trigger reassignment.
export async function appointOrganizationElders(client,{commit=false,expectedRosterHash,actorId=1,now=Date.now()}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.roundId,ROUND_ID);await q('ROLLBACK');return {...receipt,replayed:true};}
  const [policy]=await q('SELECT revision,policy_json FROM organization_faction_policy_v1 WHERE id=1 FOR SHARE');
  assert.equal(JSON.parse(policy?.policy_json||'{}').mode,'ON','Do not override the operation switch');
  const [round]=await q('SELECT id,scope,phase FROM organization_rounds_v1 WHERE id=$1 FOR UPDATE',[ROUND_ID]);
  assert.equal(round?.scope,'LIVE');assert.equal(round.phase,'ASSIGNED');
  const [latest]=await q("SELECT id FROM organization_rounds_v1 WHERE scope='LIVE' ORDER BY created_at DESC LIMIT 1");assert.equal(latest?.id,ROUND_ID,'Live round changed');
  const [owner]=await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE' FOR SHARE",[actorId]);assert(owner,'Active audit owner required');
  const [row]=await q('SELECT revision,state_json FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[ROUND_ID]);assert(row,'Faction state missing');
  const members=(await q('SELECT m.user_id,m.organization_id,m.slot,m.seed_power,u.nickname,u.status FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 ORDER BY m.organization_id,m.slot FOR SHARE OF m,u',[ROUND_ID])).map(m=>({userId:Number(m.user_id),clanId:Number(m.organization_id),slot:Number(m.slot),seedPower:Number(m.seed_power),nickname:m.nickname,status:m.status}));
  for(const m of members){assert(Number.isSafeInteger(m.userId)&&m.userId>0);assert(Number.isSafeInteger(m.seedPower)&&m.seedPower>0);assert(Number.isInteger(m.clanId)&&m.clanId>=1&&m.clanId<=15);}
  const rosterHash=hash(members),selection=rankedOrganizationElders(members);
  if(commit){assert(expectedRosterHash,'Reviewed roster hash required');assert.equal(rosterHash,expectedRosterHash,'Roster or evaluated power changed after review');}
  assert.equal(selection.length,15);
  for(const group of selection){assert.equal(group.userIds.length,3,'Every organization needs three active members');validateOrganizationElders(group.userIds,members,group.organizationId);}
  const before=JSON.parse(row.state_json),state=structuredClone(before),protectedStateHash=hash(preserved(before));
  state.elders||={};state.commanders||={};state.events||=[];
  for(const group of selection){
   state.elders[group.organizationId]=group.userIds;state.commanders[group.organizationId]=group.userIds[0];
   group.members=group.userIds.map(id=>members.find(m=>m.userId===id));
   state.events.unshift({id:randomUUID(),kind:'ELDERS',clanId:group.organizationId,by:'운영',names:group.members.map(m=>m.nickname),at:now});
  }
  state.events=state.events.slice(0,80);assert.deepEqual(preserved(state),preserved(before));
  assert.equal((await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 AND revision=$3 RETURNING revision',[JSON.stringify(state),ROUND_ID,row.revision])).length,1);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,roundId:ROUND_ID,authorization:'조직에서 상위3명씩 지휘관 지정해 지휘관이라는 단어 말고 원로',basis:'assignment seed_power DESC, slot ASC, user_id ASC',rosterHash,memberCount:members.length,elderCount:45,selection,protectedStateHash,beforeRevision:Number(row.revision),afterRevision:Number(row.revision)+1,policyRevision:Number(policy.revision),completedAt:new Date(now).toISOString()};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[actorId,'ORGANIZATION_ELDERS_APPOINT','ORGANIZATION_ROUND',ROUND_ID,JSON.stringify({elders:before.elders||{},commanders:before.commanders||{},revision:row.revision}),JSON.stringify(receipt)]);assert(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
  const [saved]=await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[ROUND_ID]);assert.deepEqual(JSON.parse(saved.state_json),state);
  await q(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
