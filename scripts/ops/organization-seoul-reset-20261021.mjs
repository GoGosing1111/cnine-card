import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ORGANIZATION_DISTRICTS} from '../../shared/organization-faction-v1.mjs';
import {restrictOrganizationDistricts} from '../../functions/_organization_faction_model.js';

export const OPERATION_KEY='ops:organization-seoul-reset:20261021:v1';
export const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function resetOrganizationSeoul(client,{apply=false,roundId=ROUND_ID,actorId=1,now=Date.now(),allowTest=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='25s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.roundId,roundId);await q('ROLLBACK');return {...receipt.summary,replayed:true,applied:false};}
  assert.equal(ORGANIZATION_DISTRICTS.length,25);assert(ORGANIZATION_DISTRICTS.every(d=>d.area==='SEOUL'));
  // Same policy -> round -> state lock order as the API and scheduler.
  const [policy]=await q('SELECT * FROM organization_faction_policy_v1 WHERE id=1 FOR UPDATE');assert(policy);
  const [round]=await q('SELECT * FROM organization_rounds_v1 WHERE id=$1 FOR UPDATE',[roundId]);
  assert.equal(round?.scope,allowTest?'TEST':'LIVE');assert.equal(round.phase,'ASSIGNED');
  const [latest]=await q('SELECT id FROM organization_rounds_v1 WHERE scope=$1 ORDER BY created_at DESC LIMIT 1',[round.scope]);assert.equal(latest.id,roundId);
  assert((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE' FOR SHARE",[actorId])).length);
  const [row]=await q('SELECT revision,state_json FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[roundId]);assert(row);
  const protectedRows=async()=>({
   policy:await q('SELECT * FROM organization_faction_policy_v1 WHERE id=1'),
   round:await q('SELECT * FROM organization_rounds_v1 WHERE id=$1',[roundId]),
   members:await q('SELECT * FROM organization_members_v1 WHERE round_id=$1 ORDER BY user_id',[roundId]),
   progress:await q('SELECT * FROM organization_progress_v1 WHERE round_id=$1 ORDER BY organization_id',[roundId]),
   treasury:await q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1 ORDER BY organization_id',[roundId]),
   ledger:await q('SELECT * FROM organization_faction_ledger_v1 WHERE round_id=$1 ORDER BY id',[roundId]),
   settlements:await q('SELECT * FROM organization_faction_settlements_v1 WHERE round_id=$1 ORDER BY session_key',[roundId]),
   schedule:await q('SELECT * FROM organization_faction_days_v1 WHERE round_id=$1 ORDER BY day_key',[roundId])
  });
  const before=JSON.parse(row.state_json),unchanged=await protectedRows(),backup={state:before,stateRevision:Number(row.revision),...unchanged},backupHash=hash(backup);
  const state=structuredClone(before),cancelled=state.battles.filter(b=>b.status==='ACTIVE').map(b=>b.id);
  // Cancel instead of resolving battles: no capture, victory, reward or late strike.
  for(const b of state.battles)if(b.status==='ACTIVE')Object.assign(b,{status:'CANCELLED',reason:'MAP_RESET',endedAt:now,winner:0});
  restrictOrganizationDistricts(state,now);
  for(const d of state.districts)Object.assign(d,{owner:0,protectedUntil:0,defense:'',taxAt:now,taxRemainder:0});
  state.squadReady={};state.targetReady={};state.strikeReady={};
  state.mapReset={key:OPERATION_KEY,at:now,scope:'SEOUL',districtCount:25};
  state.events.unshift({id:OPERATION_KEY,kind:'MAP_RESET',by:'운영',at:now});state.events=state.events.slice(0,80);
  const mutable=new Set(['districts','retiredDistricts','districtScope','battles','events','squadReady','targetReady','strikeReady','mapReset']);
  for(const key of Object.keys(before))if(!mutable.has(key))assert.deepEqual(state[key],before[key],key+' must be preserved');
  await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2',[JSON.stringify(state),roundId]);
  const summary={operationKey:OPERATION_KEY,roundId,completedAt:new Date(now).toISOString(),beforeRevision:Number(row.revision),afterRevision:Number(row.revision)+1,beforeDistricts:before.districts.length,beforeOccupied:before.districts.filter(d=>d.owner).length,afterDistricts:25,afterOccupied:0,retiredDistricts:state.retiredDistricts?.length||0,cancelledBattles:cancelled,backupHash,preservedHash:hash(unchanged),policyMode:JSON.parse(policy.policy_json).mode};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[actorId,'ORGANIZATION_SEOUL_RESET','ORGANIZATION_ROUND',roundId,JSON.stringify({backupHash,districts:summary.beforeDistricts,occupied:summary.beforeOccupied}),JSON.stringify(summary)]);summary.adminLogId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify({status:'COMPLETED',roundId,summary,backup}),summary.completedAt]);
  assert.deepEqual(await protectedRows(),unchanged);
  const [saved]=await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[roundId]);assert.deepEqual(JSON.parse(saved.state_json),state);
  assert(state.districts.every(d=>d.owner===0&&d.protectedUntil===0&&d.defense===''));assert(!state.battles.some(b=>b.status==='ACTIVE'));
  await q(apply?'COMMIT':'ROLLBACK');return {...summary,replayed:false,applied:apply};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
