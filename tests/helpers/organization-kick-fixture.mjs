import {organizationFixture} from './organization-fixture.mjs';
import {installOrganizationFactionSchema} from '../../functions/_organization_faction.js';
import {newOrganizationFactionState} from '../../functions/_organization_faction_model.js';
import {CLAN_RESUMPTION_STATE_KEY,CLAN_RESUMPTION_VERSION,CLAN_RESUMPTION_AVAILABLE_AT} from '../../shared/clan-resumption-v1.mjs';

export async function organizationKickFixture(t,{resumed=true}={}){
 const f=await organizationFixture(t,{people:10}),roundId=await f.prepare({survey:false});
 f.advance(Date.parse('2026-10-29T07:00:00Z')-f.clock());
 await installOrganizationFactionSchema(f.env.DB);
 await f.pg.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE qa_wallets(user_id bigint,balance bigint);INSERT INTO qa_wallets VALUES(5,9999999999999);
 CREATE TABLE territory_war_v3_rounds(id bigint,status text,starts_at text,ends_at text,settled_at text);
 ALTER TABLE clan_members ADD COLUMN season_id bigint,ADD COLUMN member_role text,ADD COLUMN joined_at text DEFAULT '2026-10-29',ADD COLUMN draft_pick_no integer;
 CREATE UNIQUE INDEX kick_member_key ON clan_members(season_id,user_id);
 DELETE FROM clan_members;
 CREATE TABLE clan_seasons(id bigint PRIMARY KEY,phase text,ends_at text);
 INSERT INTO clan_seasons VALUES(5,'ACTIVE','2099-01-01');
 CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint);
 CREATE TABLE clan_executives(season_id bigint,clan_id bigint,user_id bigint);
 CREATE TABLE clan_draft_pool(season_id bigint,user_id bigint,status text,drafted_clan_id bigint,pick_no integer,updated_at text);
 CREATE TABLE clan_wars(id bigint,season_id bigint,clan_a_id bigint,clan_b_id bigint,status text);
 INSERT INTO clan_wars VALUES(9,5,1,2,'COMPLETED');
 CREATE TABLE clan_war_battles(season_id bigint,status text,attacker_user_id bigint,defender_user_id bigint);
 CREATE TABLE clan_war_reservation_locks(war_id bigint,user_id bigint,expires_at text);
 CREATE TABLE clan_faction_state(season_id bigint,revision integer,state_json text);
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT CURRENT_TIMESTAMP::text$$;`);
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='ASSIGNED',assigned_at=$2,scope=$3 WHERE id=$1",[roundId,f.clock()-1000,resumed?'LIVE':'TEST']);
 for(const [user,org,slot] of [[2,1,1],[3,1,2],[4,2,1],[5,1,3],[6,1,4],[7,2,2]]){
  await f.pg.query('INSERT INTO organization_members_v1 VALUES($1,$2,$3,$4,1000,$5)',[roundId,user,org,slot,f.clock()]);
  await f.pg.query("INSERT INTO clan_members VALUES($1,$2,5,'MEMBER','2026-10-29',$3)",[user,org,slot]);
 }
 for(let org=1;org<=8;org++)await f.pg.query('INSERT INTO organization_progress_v1(round_id,organization_id,points) VALUES($1,$2,50)',[roundId,org]);
 await f.pg.query("INSERT INTO organization_surveys_v1(round_id,user_id,preferred_id,updated_at,answers_json) VALUES($1,5,1,$2,'{}')",[roundId,f.clock()]);
 await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['organization-join:'+roundId+':5',JSON.stringify({userId:5,organizationId:1,status:'APPROVED',revision:2,message:'kept',updatedAt:f.clock()})]);
 const state=newOrganizationFactionState(f.clock());state.elders={1:[2,3],2:[4]};state.formations={1:{attack1:[5,6],defense1:[5]},2:{attack1:[7]}};state.captains={1:{attack1:5},2:{attack1:7}};state.districts[0].owner=1;state.districts[0].defense='defense1';
 state.history=[{kind:'KEPT',userId:5}];state.session={key:'prior-session',status:'SETTLED',participants:[5]};
 await f.pg.query('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2)',[roundId,JSON.stringify(state)]);
 await f.pg.query('INSERT INTO clan_faction_state VALUES(5,0,$1)',[JSON.stringify(state)]);
 await f.pg.exec("INSERT INTO clan_draft_pool VALUES(5,5,'DRAFTED',1,3,NULL);INSERT INTO clan_executives VALUES(5,1,2),(5,1,3)");
 if(resumed)await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[CLAN_RESUMPTION_STATE_KEY,JSON.stringify({version:CLAN_RESUMPTION_VERSION,enabled:true,effectiveAt:CLAN_RESUMPTION_AVAILABLE_AT,seasonId:5,roundId})]);
 const body={roundId,revision:0,targetUserId:5,joinedAt:f.clock(),confirmation:'KICK_CLAN_MEMBER'};
 const kick=(patch={},user=2)=>f.post('organization/member/kick',{...body,...patch},{user});
 const overview=(user=2)=>f.call('organization/overview?roundId='+roundId,{user});
 const faction=async()=>JSON.parse((await f.pg.query('SELECT state_json FROM organization_faction_state_v1 WHERE round_id=$1',[roundId])).rows[0].state_json);
 const changeFaction=async work=>{const s=await faction();work(s);await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1 WHERE round_id=$2',[JSON.stringify(s),roundId]);};
 const snapshot=async()=>{const result={};for(const table of ['organization_members_v1','organization_surveys_v1','organization_rounds_v1','organization_faction_state_v1','organization_receipts_v1','clan_members','clan_draft_pool','clan_faction_state','clan_executives','admin_logs','app_meta','qa_wallets'])result[table]=(await f.pg.query('SELECT * FROM '+table)).rows;return result;};
 return {...f,roundId,body,kick,overview,faction,changeFaction,snapshot};
}
