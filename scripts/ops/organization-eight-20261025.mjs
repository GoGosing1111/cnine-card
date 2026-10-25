import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ORGANIZATIONS,allocateOrganizations} from '../../shared/organization-system-v1.mjs';
import {SQUADS,rankedOrganizationElders} from '../../shared/organization-faction-v1.mjs';
import {CLAN_RESTORATION,clanRestorationActive} from '../../shared/clan-restoration-v1.mjs';

export const OP='ops:organization-eight-balanced:20261025:v1';
export const AUTHORIZATION=['클랜 8개로 늘리고 새 가입방식 구상좀 해봐','전체 129명을 8개 클랜으로 균등 재배정하기'];
export const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const query=db=>async(sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const protectedTables=['organization_progress_v1','organization_faction_treasury_v1','organization_surveys_v1','organization_faction_days_v1','organization_faction_settlements_v1','organization_faction_ledger_v1'];
async function snapshot(q,roundId,{lock=false}={}){
 const round=one(await q('SELECT * FROM organization_rounds_v1 WHERE id=$1'+(lock?' FOR UPDATE':''),[roundId]));
 const stateRow=one(await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1'+(lock?' FOR UPDATE':''),[roundId]));
 const members=await q('SELECT m.*,u.status,s.preferred_id FROM organization_members_v1 m JOIN users u ON u.id=m.user_id LEFT JOIN organization_surveys_v1 s ON s.round_id=m.round_id AND s.user_id=m.user_id WHERE m.round_id=$1 ORDER BY m.user_id'+(lock?' FOR UPDATE OF m FOR SHARE OF u':''),[roundId]);
 const protectedHashes={};for(const table of protectedTables)protectedHashes[table]=hash(await q('SELECT * FROM '+table+' WHERE round_id=$1 ORDER BY row_to_json('+table+')::text',[roundId]));
 protectedHashes.applications=hash(await q('SELECT key,value FROM app_meta WHERE left(key,length($1))=$1 ORDER BY key',['organization-join:'+roundId+':']));
 protectedHashes.policies=hash(await q('SELECT * FROM organization_faction_policy_v1 ORDER BY id'));
 return {round,stateRow,members,protectedHashes};
}
export async function inspectEight(db,{roundId=ROUND_ID}={}){
 const q=query(db),before=await snapshot(q,roundId),rows=await q('SELECT value FROM app_meta WHERE key=$1',[OP]);
 return {before,reviewHash:hash(before),receipt:rows.length?JSON.parse(one(rows).value):null};
}
export async function verifyEight(db,{roundId=ROUND_ID}={}){
 const q=query(db),r=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OP])).value);
 assert.equal(r.status,'COMPLETED');assert.equal(r.roundId,roundId);assert.deepEqual(r.authorization,AUTHORIZATION);assert.equal(r.memberCount,129);
 const current=await snapshot(q,roundId);
 const expected=r.assignments.map(m=>[m.user_id,m.organization_id,m.slot,m.seed_power,m.joined_at]);
 const members=current.members.filter(m=>r.assignments.some(a=>a.user_id===Number(m.user_id))).map(m=>[Number(m.user_id),Number(m.organization_id),Number(m.slot),Number(m.seed_power),Number(m.joined_at)]);
 assert.deepEqual(members,expected);assert(Number(current.round.revision)>=Number(r.afterRoundRevision));
 const audit=one(await q('SELECT admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[r.auditId]));
 assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'ORGANIZATION_EXPAND_BALANCED');assert.equal(audit.target_id,roundId);
 assert.deepEqual(JSON.parse(audit.after_data),{operationKey:OP,memberCount:129,organizations:8,stats:r.stats,protectedHashes:r.before.protectedHashes,grants:0});
 return {verified:true,receipt:r,clans:ORGANIZATIONS.map(o=>({id:o.id,name:o.name,memberCount:current.members.filter(m=>Number(m.organization_id)===o.id).length,totalSeedPower:current.members.filter(m=>Number(m.organization_id)===o.id).reduce((n,m)=>n+Number(m.seed_power),0)})),protectedUnchanged:hash(current.protectedHashes)===hash(r.before.protectedHashes)};
}
export async function expandEight(db,{dryRun=true,expectedReviewHash,roundId=ROUND_ID,now=Date.now()}={}){
 const q=query(db);
 if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length)return {...await verifyEight(db,{roundId}),replayed:true,dryRun};
 await db.query('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='25s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  if((await q('SELECT key FROM app_meta WHERE key=$1',[OP])).length){const r=await verifyEight(db,{roundId});await q('ROLLBACK');return {...r,replayed:true,dryRun};}
  assert(clanRestorationActive(now)&&CLAN_RESTORATION.regularScheduleLocked&&CLAN_RESTORATION.championsScheduleLocked&&CLAN_RESTORATION.factionScheduleLocked);
  assert.deepEqual(ORGANIZATIONS.map(o=>o.id),[1,2,3,4,5,6,7,8]);
  one(await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE' FOR SHARE"));
  const before=await snapshot(q,roundId,{lock:true});assert.equal(hash(before),expectedReviewHash,'Clan state changed after review; inspect again');
  assert.equal(before.round.scope,'LIVE');assert.equal(before.round.phase,'ASSIGNED');assert.equal(before.members.length,129);
  assert(before.members.every(m=>m.status==='ACTIVE'&&Number(m.organization_id)>=1&&Number(m.organization_id)<=6));
  const previous=JSON.parse(before.stateRow.state_json);assert(!(previous.battles||[]).some(b=>b.status==='ACTIVE'));assert(!['ACTIVE','PAUSED'].includes(previous.session?.status));assert.equal(previous.sessionQueue?.length||0,0);
  const plan=allocateOrganizations(before.members.map(m=>({userId:Number(m.user_id),power:Number(m.seed_power),preferredOrganizationId:Number(m.preferred_id||m.organization_id)})),{seed:OP});
  assert.deepEqual(plan.organizations.map(o=>o.memberCount).sort((a,b)=>a-b),[16,16,16,16,16,16,16,17]);
  const byId=new Map(before.members.map(m=>[Number(m.user_id),m]));
  const assignments=plan.organizations.flatMap(o=>o.members.map(m=>({user_id:m.userId,organization_id:o.id,slot:m.slot,seed_power:m.power,joined_at:Number(byId.get(m.userId).joined_at)}))).sort((a,b)=>a.user_id-b.user_id);
  assert.equal(new Set(assignments.map(m=>m.user_id)).size,129);
  const state=structuredClone(previous);
  state.formations=Object.fromEntries(ORGANIZATIONS.map(o=>[o.id,Object.fromEntries(SQUADS.map(s=>[s.id,[]]))]));state.captains={};state.squadReady={};state.targetReady={};state.organizationVersion=3;
  for(const d of state.districts)d.defense='';
  const elders=rankedOrganizationElders(assignments.map(m=>({userId:m.user_id,clanId:m.organization_id,slot:m.slot,seedPower:m.seed_power,status:'ACTIVE'})));
  assert(elders.every(o=>o.userIds.length===3));state.elders=Object.fromEntries(elders.map(o=>[o.organizationId,o.userIds]));state.commanders=Object.fromEntries(elders.map(o=>[o.organizationId,o.userIds[0]]));
  state.events=[{id:OP,kind:'REORGANIZED',organizationCount:8,by:'운영',at:now},...(state.events||[])].slice(0,80);
  await q('DELETE FROM organization_members_v1 WHERE round_id=$1',[roundId]);
  await q('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) SELECT $1,user_id,organization_id,slot,seed_power,joined_at FROM jsonb_to_recordset($2::jsonb) AS x(user_id bigint,organization_id int,slot int,seed_power bigint,joined_at bigint)',[roundId,JSON.stringify(assignments)]);
  one(await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 AND revision=$3 RETURNING round_id',[JSON.stringify(state),roundId,before.stateRow.revision]));
  one(await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING id',[roundId,before.round.revision]));
  const current=await snapshot(q,roundId);assert.deepEqual(current.protectedHashes,before.protectedHashes);
  assert.deepEqual(state.districts.map(({defense,...d})=>d),previous.districts.map(({defense,...d})=>d));assert.deepEqual(state.battles,previous.battles);assert.deepEqual(state.session,previous.session);assert.deepEqual(state.sessionHistory,previous.sessionHistory);
  const receipt={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,roundId,completedAt:new Date(now).toISOString(),memberCount:129,grants:0,basis:'Saved server-evaluated seed_power; balanced count, then power, then wishes',before,afterRoundRevision:Number(current.round.revision),afterStateRevision:Number(current.stateRow.revision),assignments,elders,stats:plan.stats};
  const afterData={operationKey:OP,memberCount:129,organizations:8,stats:plan.stats,protectedHashes:before.protectedHashes,grants:0};
  receipt.auditId=String(one(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'ORGANIZATION_EXPAND_BALANCED','ORGANIZATION_ROUND',$1,$2,$3) RETURNING id",[roundId,JSON.stringify({reviewHash:expectedReviewHash,memberCount:129,organizations:6}),JSON.stringify(afterData)])).id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),receipt.completedAt]);
  const result=await verifyEight(db,{roundId});assert(result.protectedUnchanged);await q(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
