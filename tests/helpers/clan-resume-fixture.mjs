import {organizationFixture} from './organization-fixture.mjs';
import {__clanTest as clan,handleClan} from '../../functions/_clan.js';
import {championsSchema} from '../../functions/_clan_champions.js';
import {clanReformSchema} from '../../functions/_clan_governance.js';
import {ensureClanParticipationSchema} from '../../functions/_clan_participation.js';
import {installOrganizationFactionSchema,handleOrganizationFaction} from '../../functions/_organization_faction.js';
import {newOrganizationFactionState} from '../../functions/_organization_faction_model.js';
import {ROUND_ID} from '../../scripts/ops/clan-resume-20261025.mjs';
export async function clanResumeFixture(t){
 const f=await organizationFixture(t,{people:132});f.advance(Date.parse('2026-10-25T16:00:00+09:00')-f.clock());
 await f.pg.exec('DROP TABLE clan_members');
 await f.env.DB.execSchema([...clan.FOUNDATION_SQL,...championsSchema(),...clanReformSchema(true)].map(sql=>sql.replaceAll('INTEGER PRIMARY KEY AUTOINCREMENT','BIGSERIAL PRIMARY KEY')));
 await installOrganizationFactionSchema(f.env.DB);
 await f.pg.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
  CREATE TABLE clan_season_settlements(season_id BIGINT PRIMARY KEY,status TEXT,reward_status TEXT,champion_clan_id BIGINT,processing_token TEXT,completed_at TEXT,updated_at TEXT);
  CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT,starts_at TEXT,ends_at TEXT,settled_at TEXT);
  CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,UNIQUE(user_id,campaign_key));
  CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT);
  CREATE TABLE user_second_verifications(user_id BIGINT,provider TEXT,provider_name TEXT,verified_at TEXT);
  CREATE TABLE pvp_decks(user_id BIGINT PRIMARY KEY,card_ids TEXT);
  CREATE TABLE pvp_active_presets(user_id BIGINT PRIMARY KEY,preset_no INTEGER);
  CREATE TABLE pvp_deck_presets(user_id BIGINT,preset_no INTEGER,card_ids TEXT);
  CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL AS 'SELECT CURRENT_TIMESTAMP::text';
  CREATE FUNCTION sqlite_datetime(base TEXT,modifier TEXT DEFAULT '0 seconds') RETURNS TEXT LANGUAGE SQL AS $$ SELECT to_char((CASE WHEN base='now' THEN CURRENT_TIMESTAMP ELSE base::timestamptz END)+modifier::interval,'YYYY-MM-DD HH24:MI:SS') $$;
 `);
 await f.pg.query("UPDATE users SET nickname='란x2' WHERE id=73");
 await ensureClanParticipationSchema(f.env);
 await f.pg.query("INSERT INTO app_meta VALUES('safe_runtime_upgrade_v2121_clan_foundation_fast_gate','1','qa')");
 await f.pg.query("INSERT INTO organization_rounds_v1(id,scope,name,phase,created_at,assigned_at) VALUES($1,'LIVE','검수 클랜','ASSIGNED',$2,$2)",[ROUND_ID,f.clock()-1000]);
 const state=newOrganizationFactionState(f.clock()-1000);state.elders={};state.commanders={};state.session=null;
 let ids=Array.from({length:129},(_,i)=>i+2),position=0;
 // Keep the explicit withdrawal target in DC, mirroring the inspected account.
 ids=ids.filter(id=>id!==73);ids.push(73);
 for(let org=1;org<=8;org++){
  const people=ids.slice(position,position+(org===1?17:16));position+=people.length;
  state.formations[org]={};state.elders[org]=people.slice(0,3);if(org===8)state.elders[org][1]=73;state.commanders[org]=people[0];
  await f.pg.query('INSERT INTO clan_organizations(id,name,mark_key) VALUES($1,$2,$3)',[org,clan.OFFICIAL_CLAN_CATALOG[org-1].name,clan.OFFICIAL_CLAN_CATALOG[org-1].markKey]);
  for(const [i,id] of people.entries())await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,$2,$3,$4,$5,$6)',[ROUND_ID,id,org,i+1,1000+id,f.clock()-1000]);
  await f.pg.query('INSERT INTO organization_progress_v1(round_id,organization_id) VALUES($1,$2)',[ROUND_ID,org]);
 }
 await f.pg.query('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[ROUND_ID,JSON.stringify(state)]);
 await f.pg.query("UPDATE organization_faction_policy_v1 SET policy_json=$1 WHERE id=1",[JSON.stringify({mode:'ON',fundsPerRegion:100,upgradeCosts:[0,1000,2000,3000,4000]})]);
 await f.pg.query("INSERT INTO clan_seasons(id,season_no,phase,registration_ends_at,draft_ends_at,starts_at,ends_at) VALUES(6,3,'COMPLETE','2026-10-01','2026-10-02','2026-10-03','2026-10-12')");
 await f.pg.query("SELECT setval(pg_get_serial_sequence('clan_seasons','id'),6)");
 const settings={...clan.CLAN_ADMIN_SETTINGS_DEFAULTS,mode:'OFF',scheduleEnabled:false};
 for(const [key,value] of [['clan_settings_v1',settings],['clan_reform_v1',{enabled:true}],['clan_retirement_20261012_v1',{version:1,enabled:true,seasonId:6,transition:'FRESH_ORGANIZATIONS_PREPARATION'}],['clan_retirement_20261012_v1:completed',{status:'COMPLETED'}]])await f.pg.query('INSERT INTO app_meta VALUES($1,$2,$3)',[key,JSON.stringify(value),new Date(f.clock()).toISOString()]);
 const deps={...f.deps,authenticate:async request=>(await f.pg.query('SELECT * FROM users WHERE id=$1',[Number(request.headers.get('x-user'))])).rows[0],randomFactionSchedule:()=>0,battleSettings:async()=>({}),pvpDeckSnapshotByIds:async()=>[],cardBattlePower:()=>0,isAdminRole:u=>u.role==='OWNER',readBody:req=>req.json()};
 const call=async(path,{user=2,body,method=body?'POST':'GET',regular=false}={})=>{
  const handler=regular?handleClan:handleOrganizationFaction,response=await handler({path:path.split('?')[0],env:f.env,deps,request:new Request('https://example.test/api/'+path,{method,headers:{'x-user':String(user),'content-type':'application/json',Origin:'https://example.test'},...(body?{body:JSON.stringify(body)}:{})})});return {status:response.status,data:await response.json()};
 };
 return {...f,deps,call,organizationCall:f.call,roundId:ROUND_ID};
}
