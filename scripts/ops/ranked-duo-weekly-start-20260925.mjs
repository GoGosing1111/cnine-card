import {copyRankedDuoPolicy,duoWeeklyConfig,DUO_WEEKLY_POLICY_KEY} from '../../shared/ranked-duo-weekly-v3.mjs';
export const DUO_FIRST_RECRUIT_AT='2026-09-25T13:48:25.000Z';
export const DUO_FIRST_SEASON_ID='duo-weekly-20260925-134825';
const auditKey='ops_ranked_duo_weekly_start_20260925';
// The old live worker treats this as a manual season until the weekly release
// adopts it. Existing enrollment rows and the requested opening time survive.
export async function startDuoWeeklyRecruitment(client){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SELECT pg_advisory_xact_lock(20925,134825)');
  const who=(await client.query('SELECT current_user AS role,current_database() AS db')).rows[0];
  if(who.role!=='cnine_migrator'||who.db!=='cnine')throw Error('DUO_UNEXPECTED_DATABASE');
  const receipt=(await client.query('SELECT value FROM app_meta WHERE key=$1',[auditKey])).rows[0];
  if(receipt){await client.query('COMMIT');return {alreadyApplied:true,...JSON.parse(receipt.value)};}
  const current=(await client.query("SELECT value FROM app_meta WHERE key='ranked_duo_current_v1' FOR UPDATE")).rows[0];
  if(current)throw Error('DUO_CURRENT_ALREADY_EXISTS');
  const source=(await client.query("SELECT value FROM app_meta WHERE key='pvp_settings_v1'")).rows[0];
  if(!source)throw Error('DUO_RANKED_SETTINGS_MISSING');
  const policy=copyRankedDuoPolicy(JSON.parse(source.value),DUO_FIRST_RECRUIT_AT);
  const config={...duoWeeklyConfig(policy,Date.parse(DUO_FIRST_RECRUIT_AT)),automatic:false};
  await client.query("INSERT INTO ranked_duo_seasons_v1(id,status,config_json,recruit_until,created_at) VALUES($1,'RECRUITING',$2,$3,$4)",[DUO_FIRST_SEASON_ID,JSON.stringify(config),config.startsAt,DUO_FIRST_RECRUIT_AT]);
  const audit={seasonId:DUO_FIRST_SEASON_ID,openedAt:DUO_FIRST_RECRUIT_AT,recruitUntil:config.startsAt,endsAt:config.endsAt,policy,action:'OPEN_FIRST_RECRUITMENT_AND_COPY_RANKED_POLICY'};
  for(const [key,value] of [['ranked_duo_current_v1',DUO_FIRST_SEASON_ID],[DUO_WEEKLY_POLICY_KEY,JSON.stringify(policy)],[auditKey,JSON.stringify(audit)]])
   await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[key,value]);
  await client.query('COMMIT');return audit;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
