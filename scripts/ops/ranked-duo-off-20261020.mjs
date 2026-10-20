import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateDuoConfig} from '../../shared/ranked-duo-v1.mjs';
import {DUO_WEEKLY_POLICY_KEY,validateDuoPolicy} from '../../shared/ranked-duo-weekly-v3.mjs';

export const OPERATION_KEY='ops:ranked-duo-off:20261020:v1';
export const SEASON_ID='587a5e01-65e3-4f20-ac6e-abfd08e2c344';
const hash=value=>createHash('sha256').update(value).digest('hex');

// User-authorized shutdown of the inspected, unstarted recruitment season.
// Refuse a started/changed season rather than cancelling battles or paying rewards.
export async function turnOffDuoForReform(client,{commit=false,actorId=1}={}){
 const q=async(sql,values=[])=>(await client.query(sql,values)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  assert((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[actorId])).length,'Active OWNER required');
  // Match the policy editor lock order; season lock serializes recruitment/admission.
  const [policyRow]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[DUO_WEEKLY_POLICY_KEY]);
  assert(policyRow,'Independent duo policy required');
  const [pointer]=await q("SELECT value FROM app_meta WHERE key='ranked_duo_current_v1' FOR UPDATE");
  assert.equal(pointer?.value,SEASON_ID,'Current season changed; inspect again');
  const [season]=await q('SELECT * FROM ranked_duo_seasons_v1 WHERE id=$1 FOR UPDATE',[SEASON_ID]);
  assert.equal(season.status,'RECRUITING');assert.equal(Number(season.revision),0);
  const previousConfig=JSON.parse(season.config_json),previousPolicy=JSON.parse(policyRow.value);
  validateDuoConfig(previousConfig);validateDuoPolicy(previousPolicy);
  assert.equal(previousConfig.competitionStartedAt,null);assert.equal(previousConfig.weekly?.sequence,4);
  const [counts]=await q(`SELECT
   (SELECT COUNT(*) FROM ranked_duo_entries_v1 WHERE season_id=$1) AS participants,
   (SELECT COUNT(*) FROM ranked_duo_teams_v1 WHERE season_id=$1) AS teams,
   (SELECT COUNT(*) FROM ranked_duo_matches_v1 WHERE season_id=$1) AS matches,
   (SELECT COUNT(*) FROM ranked_duo_rewards_v3 WHERE season_id=$1) AS rewards,
   (SELECT COUNT(*) FROM ranked_duo_final_v2 WHERE season_id=$1) AS finals,
   (SELECT COUNT(*) FROM ranked_duo_trophies_v2 WHERE season_id=$1) AS trophies`,[SEASON_ID]);
  assert.equal(Number(counts.participants),Number(season.participant_count));
  for(const key of ['teams','matches','rewards','finals','trophies'])assert.equal(Number(counts[key]),0,`Unexpected ${key}; inspect again`);
  const [ranked]=await q("SELECT value FROM app_meta WHERE key='pvp_settings_v1' FOR SHARE");
  const [entriesBefore]=await q('SELECT md5(COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.user_id)::text,\'[]\')) AS hash FROM ranked_duo_entries_v1 e WHERE season_id=$1',[SEASON_ID]);
  const config={...previousConfig,visible:false,revision:previousConfig.revision+1};
  const policy={...previousPolicy,enabled:false,revision:previousPolicy.revision+1};
  validateDuoConfig(config);validateDuoPolicy(policy);
  await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(policy),DUO_WEEKLY_POLICY_KEY]);
  await q("UPDATE ranked_duo_seasons_v1 SET status='CLOSED',config_json=$1,revision=revision+1 WHERE id=$2",[JSON.stringify(config),SEASON_ID]);
  const result={operationKey:OPERATION_KEY,completedAt:new Date().toISOString(),seasonId:SEASON_ID,seasonName:config.name,status:'CLOSED',visible:false,automaticRecruitment:false,reason:'개편 준비',participantsPreserved:Number(counts.participants),teams:0,matches:0,rewardsPaid:0,trophiesIssued:0,seasonRevision:Number(season.revision)+1,policyRevision:policy.revision,entriesHash:entriesBefore.hash,normalRankedSettingsHash:hash(ranked.value),committed:commit};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'DUO_REFORM_OFF','RANKED_DUO',$2,$3,$4) RETURNING id",[actorId,SEASON_ID,JSON.stringify({season,policy:previousPolicy}),JSON.stringify({...result,config,policy})]);
  result.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(result)]);
  const [entriesAfter]=await q('SELECT md5(COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.user_id)::text,\'[]\')) AS hash FROM ranked_duo_entries_v1 e WHERE season_id=$1',[SEASON_ID]);
  assert.equal(entriesAfter.hash,entriesBefore.hash);
  assert.equal((await q("SELECT value FROM app_meta WHERE key='pvp_settings_v1'"))[0].value,ranked.value);
  await q(commit?'COMMIT':'ROLLBACK');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
