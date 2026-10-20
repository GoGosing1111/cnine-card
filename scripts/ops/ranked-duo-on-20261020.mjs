import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DUO_WEEKLY_POLICY_KEY,validateDuoPolicy} from '../../shared/ranked-duo-weekly-v3.mjs';
import {DUO_RANDOM_MODE} from '../../shared/ranked-duo-random-v4.mjs';

export const OPERATION_KEY='ops:ranked-duo-on:20261020:v1';
export const CLOSED_SEASON_ID='587a5e01-65e3-4f20-ac6e-abfd08e2c344';
const hash=value=>createHash('sha256').update(value).digest('hex');

// Explicit user restart authorization, following the shipped random-duo release.
// Only enable the independent policy; the deployed scheduler creates the next
// 24-hour recruitment / 7-day battle season and prepares its private tables.
export async function turnOnRandomDuo(client,{commit=false,actorId=1}={}){
 const q=async(sql,values=[])=>(await client.query(sql,values)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const [database]=await q('SELECT current_database() AS name,pg_is_in_recovery() AS replica');
  assert.equal(database.name,'cnine');assert.equal(database.replica,false);
  assert((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[actorId])).length,'Active OWNER required');
  const [policyRow]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[DUO_WEEKLY_POLICY_KEY]);
  assert(policyRow,'Independent duo policy required');
  const [pointer]=await q("SELECT value FROM app_meta WHERE key='ranked_duo_current_v1' FOR UPDATE");
  assert.equal(pointer?.value,CLOSED_SEASON_ID,'Current season changed; inspect again');
  const [season]=await q('SELECT * FROM ranked_duo_seasons_v1 WHERE id=$1 FOR SHARE',[CLOSED_SEASON_ID]);
  assert.equal(season.status,'CLOSED');assert.equal(Number(season.revision),1);
  const previousConfig=JSON.parse(season.config_json),previousPolicy=JSON.parse(policyRow.value);
  assert.equal(previousConfig.visible,false);assert.equal(previousConfig.competitionStartedAt,null);
  assert.equal(previousConfig.weekly?.sequence,4);assert.equal(previousPolicy.enabled,false);assert.equal(previousPolicy.revision,2);
  validateDuoPolicy(previousPolicy);
  const [entries]=await q("SELECT COUNT(*) AS count,md5(COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.user_id)::text,'[]')) AS hash FROM ranked_duo_entries_v1 e WHERE season_id=$1",[CLOSED_SEASON_ID]);
  assert.equal(Number(entries.count),73);assert.equal(entries.hash,'9bf21c8160b0bb31adc6b06618ad0332');
  const [ranked]=await q("SELECT value FROM app_meta WHERE key='pvp_settings_v1'");
  const policy={...previousPolicy,enabled:true,matchmaking:DUO_RANDOM_MODE,revision:previousPolicy.revision+1};
  validateDuoPolicy(policy);
  const {enabled,matchmaking,revision,...economy}=policy;
  const {enabled:oldEnabled,matchmaking:oldMatchmaking,revision:oldRevision,...oldEconomy}=previousPolicy;
  assert.deepEqual(economy,oldEconomy);
  await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(policy),DUO_WEEKLY_POLICY_KEY]);
  const result={operationKey:OPERATION_KEY,completedAt:new Date().toISOString(),automaticRecruitment:true,matchmaking:DUO_RANDOM_MODE,scoreScope:'INITIATOR',policyRevision:policy.revision,previousSeasonId:CLOSED_SEASON_ID,previousSeasonStatus:season.status,participantsPreserved:Number(entries.count),entriesHash:entries.hash,economyHash:hash(JSON.stringify(economy)),previousSeasonHash:hash(JSON.stringify(season)),normalRankedSettingsHash:hash(ranked.value),recruitHours:24,battleDays:7,committed:commit};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'DUO_RANDOM_ON','RANKED_DUO',$2,$3,$4) RETURNING id",[actorId,CLOSED_SEASON_ID,JSON.stringify({policy:previousPolicy}),JSON.stringify({...result,policy})]);
  result.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(result)]);
  assert.equal(hash(JSON.stringify((await q('SELECT * FROM ranked_duo_seasons_v1 WHERE id=$1',[CLOSED_SEASON_ID]))[0])),result.previousSeasonHash);
  await q(commit?'COMMIT':'ROLLBACK');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
