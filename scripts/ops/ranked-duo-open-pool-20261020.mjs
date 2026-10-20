import {createHash} from 'node:crypto';
import {validateDuoConfig} from '../../shared/ranked-duo-v1.mjs';
import {validateDuoPolicy,DUO_WEEKLY_POLICY_KEY} from '../../shared/ranked-duo-weekly-v3.mjs';

export const OPERATION_KEY='ops:ranked-duo-open-pool:20261020:v1';
export const SEASON_ID='4e49efa4-7a36-4848-ac85-7ca6606b5b6f';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const economy=config=>Object.fromEntries(['energy','score','rewards','tiers','challenger','mercenaryWeights'].map(key=>[key,config[key]]));
const entriesSql="SELECT COUNT(*) AS count,md5(COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.user_id)::text,'[]')) AS hash FROM ranked_duo_entries_v1 e WHERE season_id=$1";

// This operation only opens the already configured, unplayed season. It never
// bulk-enrolls other accounts or issues battles, energy, coins or rewards.
export async function openRankedDuoPool(client,{commit=false,now=Date.now(),expectedSeasonId=SEASON_ID}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query('SELECT pg_advisory_xact_lock(20261020,1426)');
  const [identity]=await q('SELECT current_user AS role,current_database() AS db');
  if(identity.role!=='cnine_migrator'||identity.db!=='cnine')throw Error('DUO_UNEXPECTED_DATABASE');
  const [receipt]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(receipt){await client.query('ROLLBACK');return {alreadyApplied:true,...JSON.parse(receipt.value)};}
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
  if(!owner)throw Error('DUO_OWNER_NOT_ACTIVE');
  const [policyRow]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[DUO_WEEKLY_POLICY_KEY]);
  const [pointer]=await q("SELECT value FROM app_meta WHERE key='ranked_duo_current_v1' FOR UPDATE");
  if(pointer?.value!==expectedSeasonId)throw Error('DUO_CURRENT_CHANGED');
  const [season]=await q('SELECT * FROM ranked_duo_seasons_v1 WHERE id=$1 FOR UPDATE',[expectedSeasonId]);
  const beforePolicy=validateDuoPolicy(JSON.parse(policyRow?.value||'null')),beforeConfig=validateDuoConfig(JSON.parse(season.config_json));
  if(!beforePolicy.enabled||beforePolicy.matchmaking!=='RANDOM_ASYNC'||beforePolicy.revision!==3||beforePolicy.entryMode!=='ENROLLMENT')throw Error('DUO_POLICY_CHANGED');
  if(season.status!=='RECRUITING'||!beforeConfig.visible||beforeConfig.matchmaking!=='RANDOM_ASYNC'||beforeConfig.competitionStartedAt||beforeConfig.weekly?.sequence!==5)throw Error('DUO_SEASON_CHANGED');
  const [{n:matches}]=await q('SELECT COUNT(*) AS n FROM ranked_duo_matches_v1 WHERE season_id=$1',[season.id]);
  if(Number(matches))throw Error('DUO_ALREADY_PLAYED');
  const [beforeEntries]=await q(entriesSql,[season.id]);
  if(Number(beforeEntries.count)!==Number(season.participant_count))throw Error('DUO_ENTRY_COUNT_MISMATCH');
  const [normalRanked]=await q("SELECT value FROM app_meta WHERE key='pvp_settings_v1'");
  if(!normalRanked)throw Error('DUO_RANKED_SETTINGS_MISSING');
  const policy=validateDuoPolicy({...beforePolicy,entryMode:'RANKED_POOL',revision:beforePolicy.revision+1});
  const startsAt=new Date(now).toISOString(),endsAt=new Date(now+7*86400000).toISOString();
  const config=validateDuoConfig({...beforeConfig,entryMode:'RANKED_POOL',recruitHours:0,startsAt,endsAt,competitionStartedAt:startsAt,revision:beforeConfig.revision+1,
   rankedSeason:{...beforeConfig.rankedSeason,startsAt,endsAt},weekly:{...beforeConfig.weekly,policyRevision:policy.revision}});
  if(digest(economy(beforeConfig))!==digest(economy(config))||digest(economy(beforePolicy))!==digest(economy(policy)))throw Error('DUO_ECONOMY_CHANGED');
  await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(policy),DUO_WEEKLY_POLICY_KEY]);
  await client.query("UPDATE ranked_duo_seasons_v1 SET status='ACTIVE',config_json=$1,recruit_until=NULL,revision=revision+1 WHERE id=$2",[JSON.stringify(config),season.id]);
  const [afterEntries]=await q(entriesSql,[season.id]);
  if(JSON.stringify(afterEntries)!==JSON.stringify(beforeEntries))throw Error('DUO_ENTRIES_CHANGED');
  const [afterNormalRanked]=await q("SELECT value FROM app_meta WHERE key='pvp_settings_v1'");
  if(digest(normalRanked)!==digest(afterNormalRanked))throw Error('DUO_NORMAL_RANKED_CHANGED');
  const result={operationKey:OPERATION_KEY,appliedAt:startsAt,seasonId:season.id,status:'ACTIVE',entryMode:'RANKED_POOL',matchmaking:'RANDOM_ASYNC',scoreScope:'INITIATOR',
   startsAt,endsAt,policyRevision:policy.revision,preservedEntries:Number(beforeEntries.count),entriesHash:beforeEntries.hash,
   economyHash:digest(economy(config)),normalRankedHash:digest(normalRanked),battlesCreated:0,rewardsIssued:0};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'DUO_OPEN_RANKED_POOL','RANKED_DUO',$1,$2,$3) RETURNING id",
   [season.id,JSON.stringify({policy:beforePolicy,status:season.status,config:beforeConfig}),JSON.stringify(result)]);
  result.auditId=String(audit.id);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(result)]);
  await client.query(commit?'COMMIT':'ROLLBACK');
  return {...result,dryRun:!commit};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
