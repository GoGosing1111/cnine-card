import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {organizationElderIds,validateOrganizationElders} from '../../shared/organization-faction-v1.mjs';
import {ORGANIZATIONS} from '../../shared/organization-system-v1.mjs';

export const OPERATION_KEY='ops:doksa-elder:ran-to-rangbi:20261022:v1';
export const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1';
export const ORGANIZATION_ID=3,REMOVED=73,APPOINTED=4615;
export const BEFORE_IDS=[4965,2246,REMOVED],AFTER_IDS=[4965,2246,APPOINTED];
export const rosterSql='SELECT m.user_id,m.organization_id,m.slot,m.seed_power,u.nickname,u.status,u.role FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 AND m.organization_id=3 ORDER BY m.seed_power DESC,m.slot,m.user_id';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rosterView=rows=>rows.map(m=>({userId:Number(m.user_id),clanId:Number(m.organization_id),nickname:m.nickname,status:m.status}));
const protectedState=state=>{
 const copy=structuredClone(state);delete copy.elders?.[ORGANIZATION_ID];delete copy.commanders?.[ORGANIZATION_ID];delete copy.events;return copy;
};

// This explicit appointment applies once to the current round; it never rotates elders by power.
export async function replaceDoksaElder(client,{commit=false,expectedRosterHash,actorId=1,now=Date.now()}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);await q('ROLLBACK');return {...receipt,replayed:true};}
  assert.equal(ORGANIZATIONS.find(o=>o.id===ORGANIZATION_ID)?.name,'독사파');
  const [policy]=await q('SELECT policy_json FROM organization_faction_policy_v1 WHERE id=1 FOR SHARE');
  assert.equal(JSON.parse(policy.policy_json).mode,'ON');
  const [round]=await q('SELECT id,scope,phase FROM organization_rounds_v1 WHERE id=$1 FOR UPDATE',[ROUND_ID]);
  assert.equal(round?.scope,'LIVE');assert.equal(round.phase,'ASSIGNED');
  assert.equal((await q("SELECT id FROM organization_rounds_v1 WHERE scope='LIVE' ORDER BY created_at DESC LIMIT 1"))[0].id,ROUND_ID);
  assert.equal((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE' FOR SHARE",[actorId])).length,1);
  const [row]=await q('SELECT revision,state_json FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[ROUND_ID]);
  const before=JSON.parse(row.state_json),state=structuredClone(before);
  const members=await q(rosterSql+' FOR SHARE OF m,u',[ROUND_ID]),rosterHash=hash(members),roster=rosterView(members);
  assert.equal(rosterHash,expectedRosterHash,'Reviewed organization roster changed');
  assert.equal(roster.find(m=>m.userId===REMOVED)?.nickname,'란x2');
  assert.equal(roster.find(m=>m.userId===APPOINTED)?.nickname,'랭비!');
  assert.deepEqual(organizationElderIds(before,roster,ORGANIZATION_ID),BEFORE_IDS,'Reviewed elder list changed');
  const nextIds=validateOrganizationElders(AFTER_IDS,roster,ORGANIZATION_ID);
  const treasuryBefore=await q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1 ORDER BY organization_id',[ROUND_ID]);
  state.elders||={};state.commanders||={};state.elders[ORGANIZATION_ID]=nextIds;state.commanders[ORGANIZATION_ID]=nextIds[0];
  state.events||=[];state.events.unshift({id:randomUUID(),kind:'ELDERS',clanId:ORGANIZATION_ID,by:'운영',names:nextIds.map(id=>roster.find(m=>m.userId===id).nickname),at:now});state.events=state.events.slice(0,80);
  assert.deepEqual(protectedState(state),protectedState(before));
  assert.equal((await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 AND revision=$3 RETURNING revision',[JSON.stringify(state),ROUND_ID,row.revision])).length,1);
  const describe=id=>({userId:id,nickname:roster.find(m=>m.userId===id).nickname});
  const receipt={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,roundId:ROUND_ID,organizationId:ORGANIZATION_ID,organizationName:'독사파',authorization:'조직 독사파 란x2 원로 해임 후 랭비! 올려',removed:describe(REMOVED),appointed:describe(APPOINTED),beforeIds:BEFORE_IDS,elderIds:nextIds,elders:nextIds.map(describe),rosterHash,protectedStateHash:hash(protectedState(before)),treasuryHash:hash(treasuryBefore),beforeRevision:Number(row.revision),afterRevision:Number(row.revision)+1,completedAt:new Date(now).toISOString(),committed:commit};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'ORGANIZATION_ELDERS_REPLACE','ORGANIZATION_ROUND',$2,$3,$4) RETURNING id",[actorId,ROUND_ID,JSON.stringify({organizationId:ORGANIZATION_ID,elders:BEFORE_IDS,commanderId:before.commanders[ORGANIZATION_ID],revision:row.revision}),JSON.stringify(receipt)]);
  receipt.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  const saved=JSON.parse((await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[ROUND_ID]))[0].state_json);
  assert.deepEqual(saved,state);assert.deepEqual(organizationElderIds(saved,roster,ORGANIZATION_ID),AFTER_IDS);
  assert.deepEqual(await q(rosterSql,[ROUND_ID]),members);
  assert.deepEqual(await q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1 ORDER BY organization_id',[ROUND_ID]),treasuryBefore);
  await q(commit?'COMMIT':'ROLLBACK');return {...receipt,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyDoksaElder(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const receipt=JSON.parse((await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0].value);
 assert.equal(receipt.actor,'CODEX_OPERATIONS');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.committed,true);
 const [row]=await q('SELECT revision,state_json FROM organization_faction_state_v1 WHERE round_id=$1',[ROUND_ID]),state=JSON.parse(row.state_json);
 const members=await q(rosterSql,[ROUND_ID]),roster=rosterView(members),ids=organizationElderIds(state,roster,ORGANIZATION_ID);
 assert.deepEqual(ids,AFTER_IDS);assert.equal(state.commanders[ORGANIZATION_ID],4965);assert.equal(hash(members),receipt.rosterHash);
 const [audit]=await q('SELECT admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.auditId]);
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'ORGANIZATION_ELDERS_REPLACE');assert.equal(audit.target_id,ROUND_ID);
 const {auditId,...logged}=receipt;assert.deepEqual(JSON.parse(audit.after_data),logged);
 return {status:'VERIFIED',operationKey:OPERATION_KEY,roundId:ROUND_ID,organizationId:ORGANIZATION_ID,auditId:receipt.auditId,revision:Number(row.revision),permissions:[REMOVED,...AFTER_IDS].map(id=>({userId:id,nickname:roster.find(m=>m.userId===id).nickname,isElder:ids.includes(id)})),rosterUnchanged:true,verifiedAt:new Date().toISOString()};
}
