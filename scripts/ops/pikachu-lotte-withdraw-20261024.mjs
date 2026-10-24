import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:pikachu-lotte-withdraw:20261024:v1';
export const ROUND_ID='e5421b84-8888-4027-8a36-f58d7f033ab1';
export const USER_ID=4647,CLAN_ID=6;
const ACTION='OPS_ORGANIZATION_MEMBER_WITHDRAW';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const expectedMember={round_id:ROUND_ID,user_id:String(USER_ID),organization_id:CLAN_ID,slot:17,seed_power:'1936',joined_at:'1792166775206'};
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const protectedFaction=s=>{const v=structuredClone(s);delete v.formations;return v;};

export async function verifyWithdrawal(client){
 const q=async(s,p=[])=>(await client.query(s,p)).rows;
 const r=parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(r.status,'COMPLETED');assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.operationKey,OPERATION_KEY);
 assert.equal(r.userId,USER_ID);assert.equal(r.organizationId,CLAN_ID);assert.equal(r.roundId,ROUND_ID);
 assert.equal((await q('SELECT 1 FROM organization_members_v1 WHERE round_id=$1 AND user_id=$2',[ROUND_ID,USER_ID])).length,0);
 const survey=one(await q('SELECT active,revision FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=$2',[ROUND_ID,USER_ID]));
 assert.equal(survey.active,0);assert.equal(survey.revision,r.surveyRevisionAfter);
 const state=parse(one(await q('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[ROUND_ID])).state_json);
 for(const ids of Object.values(state.formations?.[CLAN_ID]||{}))assert(!ids.some(id=>Number(id)===USER_ID));
 assert(!(state.elders?.[CLAN_ID]||[]).includes(USER_ID));assert.notEqual(Number(state.commanders?.[CLAN_ID]),USER_ID);
 assert(!Object.values(state.captains?.[CLAN_ID]||{}).some(id=>Number(id)===USER_ID));
 assert.equal((await q('SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY+':before'])).length,1);
 const audit=one(await q('SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OPERATION_KEY]));
 assert.equal(audit.id,r.auditId);const {auditId,...recorded}=r;assert.deepEqual(parse(audit.after_data),recorded);
 assert.equal(r.protectedFactionBeforeHash,r.protectedFactionAfterHash);
 return {verified:true,userId:USER_ID,nickname:'피카츄',clanName:'롯데',membershipRemoved:true,formationRemoved:true,applicationInactive:true,auditId:r.auditId};
}

// Explicit one-account maintenance. Uses the live organization's actor/round/state
// lock order; retired clan_members and historical battle/reward receipts are untouched.
export async function withdrawPikachu(client,{commit=false}={}){
 const q=async(s,p=[])=>(await client.query(s,p)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='15s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const prior=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior.length){const receipt=parse(one(prior).value),verification=await verifyWithdrawal(client);await q('ROLLBACK');return {replayed:true,additionalWrites:0,receipt,verification};}
  await q('SELECT user_id FROM organization_actors_v1 WHERE user_id=$1 FOR UPDATE',[USER_ID]);
  await q('SELECT id FROM organization_policy_v1 WHERE id=1 FOR SHARE');
  await q('SELECT id FROM organization_faction_policy_v1 WHERE id=1 FOR SHARE');
  const round=one(await q("SELECT * FROM organization_rounds_v1 WHERE scope='LIVE' FOR UPDATE"));
  assert.equal(round.id,ROUND_ID);assert.equal(round.phase,'ASSIGNED');
  const faction=one(await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[ROUND_ID]));
  const target=one(await q('SELECT id::text,nickname,status,role FROM users WHERE nickname=$1 FOR SHARE',['피카츄']));
  assert.deepEqual(target,{id:String(USER_ID),nickname:'피카츄',status:'ACTIVE',role:'USER'});
  one(await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE' FOR SHARE"));
  const roster=await q('SELECT * FROM organization_members_v1 WHERE round_id=$1 ORDER BY organization_id,slot FOR UPDATE',[ROUND_ID]);
  const member=one(roster.filter(m=>String(m.user_id)===String(USER_ID)));assert.deepEqual(member,expectedMember);
  const survey=one(await q('SELECT * FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=$2 FOR UPDATE',[ROUND_ID,USER_ID]));
  assert.equal(survey.active,1);assert.equal(survey.revision,1);
  const applicationKey='organization-join:'+ROUND_ID+':'+USER_ID;
  assert.equal((await q('SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[applicationKey])).length,0,'Join application changed; review before withdrawing');
  const state=parse(faction.state_json),next=structuredClone(state);
  assert(!(state.battles||[]).some(b=>b.status==='ACTIVE'),'Retry after active faction battles finish');
  assert(!(state.elders?.[CLAN_ID]||[]).includes(USER_ID),'Elder authority requires a reviewed removal plan');
  assert.notEqual(Number(state.commanders?.[CLAN_ID]),USER_ID);
  assert(!Object.values(state.captains?.[CLAN_ID]||{}).some(id=>Number(id)===USER_ID));
  const affected=[];
  for(const [squad,ids]of Object.entries(next.formations?.[CLAN_ID]||{})){
   if(!ids.some(id=>Number(id)===USER_ID))continue;
   assert.equal(squad,'attack5','Reviewed squad changed');
   next.formations[CLAN_ID][squad]=ids.filter(id=>Number(id)!==USER_ID);affected.push(squad);
  }
  assert.deepEqual(affected,['attack5']);
  assert.deepEqual(protectedFaction(next),protectedFaction(state));
  const at=new Date().toISOString(),now=Date.now();
  const archive={actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,round,member,survey,factionRevision:faction.revision,formationBefore:state.formations[CLAN_ID],formationAfter:next.formations[CLAN_ID],protectedFactionHash:hash(protectedFaction(state)),createdAt:at};
  one(await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY+':before',JSON.stringify(archive),at]));
  assert.equal((await q('DELETE FROM organization_members_v1 WHERE round_id=$1 AND user_id=$2 AND organization_id=$3 AND joined_at=$4 AND slot=$5 RETURNING user_id',[ROUND_ID,USER_ID,CLAN_ID,member.joined_at,member.slot])).length,1);
  // Prevent the original active recruitment survey from silently reassigning them.
  one(await q('UPDATE organization_surveys_v1 SET active=0,revision=revision+1,updated_at=$3 WHERE round_id=$1 AND user_id=$2 AND active=1 AND revision=$4 RETURNING user_id',[ROUND_ID,USER_ID,now,survey.revision]));
  const updatedFaction=one(await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 AND revision=$3 RETURNING revision,state_json',[JSON.stringify(next),ROUND_ID,faction.revision]));
  const updatedRound=one(await q('UPDATE organization_rounds_v1 SET revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING *',[ROUND_ID,round.revision]));
  assert.deepEqual(updatedRound,{...round,revision:round.revision+1});
  const afterRoster=await q('SELECT * FROM organization_members_v1 WHERE round_id=$1 ORDER BY organization_id,slot',[ROUND_ID]);
  assert.deepEqual(afterRoster,roster.filter(m=>String(m.user_id)!==String(USER_ID)));
  assert.deepEqual(parse(updatedFaction.state_json),next);
  const afterSurvey=one(await q('SELECT * FROM organization_surveys_v1 WHERE round_id=$1 AND user_id=$2',[ROUND_ID,USER_ID]));
  assert.deepEqual(afterSurvey,{...survey,active:0,revision:survey.revision+1,updated_at:String(now)});
  const receipt={actor:'CODEX_OPERATIONS',operationKey:OPERATION_KEY,status:'COMPLETED',authorization:'피카츄계정 롯데에서 탈퇴시켜',roundId:ROUND_ID,userId:USER_ID,nickname:'피카츄',organizationId:CLAN_ID,clanName:'롯데',
   memberCountBefore:roster.filter(m=>m.organization_id===CLAN_ID).length,memberCountAfter:afterRoster.filter(m=>m.organization_id===CLAN_ID).length,removedSquads:affected,surveyRevisionAfter:afterSurvey.revision,
   roundRevisionBefore:round.revision,roundRevisionAfter:updatedRound.revision,factionRevisionBefore:faction.revision,factionRevisionAfter:updatedFaction.revision,
   protectedFactionBeforeHash:hash(protectedFaction(state)),protectedFactionAfterHash:hash(protectedFaction(next)),otherMembersPreserved:true,historicalRecordsPreserved:true,economyWrites:0,notificationsSent:0,archiveKey:OPERATION_KEY+':before',completedAt:at};
  const audit=one(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OPERATION_KEY,JSON.stringify({userId:USER_ID,archiveKey:receipt.archiveKey}),JSON.stringify(receipt)]));
  receipt.auditId=audit.id;
  one(await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),at]));
  const verification=await verifyWithdrawal(client);
  await q(commit?'COMMIT':'ROLLBACK');return {replayed:false,committed:commit,receipt,verification};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}
