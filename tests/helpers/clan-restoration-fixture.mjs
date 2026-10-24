import {DatabaseSync} from 'node:sqlite';
import {__clanTest as clan,handleClan} from '../../functions/_clan.js';
import {championsSchema} from '../../functions/_clan_champions.js';
export function clanRestorationFixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec([...clan.FOUNDATION_SQL,...championsSchema(),
  'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)',
  'CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT)',
  'CREATE TABLE user_second_verifications(user_id INTEGER,provider TEXT,provider_name TEXT,verified_at TEXT)',
  'CREATE TABLE clan_participation_progress(user_id INTEGER,season_id INTEGER,completed_attacks INTEGER,earned_points INTEGER)',
  'CREATE TABLE clan_participation_receipts(battle_id INTEGER,status TEXT,points INTEGER,base_coin INTEGER,win_bonus_coin INTEGER,milestone_coin INTEGER)',
  'CREATE TABLE clan_season_settlements(season_id INTEGER,status TEXT,champion_clan_id INTEGER,reward_status TEXT,completed_at TEXT)'].join(';'));
 sql.exec("INSERT INTO users VALUES(1,'검수 운영자','OWNER','ACTIVE'),(2,'검수 참가자','USER','ACTIVE');INSERT INTO clan_seasons(season_no,phase,registration_ends_at,draft_ends_at,starts_at,ends_at) VALUES(3,'COMPLETE','2026-10-01','2026-10-02','2026-10-03','2026-10-13');INSERT INTO clan_organizations(name,mark_key) VALUES('T1','T1'),('삼성','SAMSUNG'),('LG','LG');INSERT INTO clan_season_teams(season_id,clan_id,master_user_id,draft_position,score) VALUES(1,1,2,1,12),(1,2,1,2,9),(1,3,3,3,6);INSERT INTO clan_members(season_id,clan_id,user_id) VALUES(1,1,2);INSERT INTO clan_wars(season_id,round_no,clan_a_id,clan_b_id,status,starts_at,ends_at,score_a,score_b,winner_clan_id) VALUES(1,1001,2,3,'COMPLETED','2026-10-12T12:00:00Z','2026-10-12T14:00:00Z',20,10,2),(1,1002,1,2,'COMPLETED','2026-10-12T14:00:00Z','2026-10-12T16:00:00Z',31,24,1)");
 const settings={...clan.CLAN_ADMIN_SETTINGS_DEFAULTS,mode:'ON',scheduleEnabled:true,championsEnabled:true};
 sql.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('clan_settings_v1',JSON.stringify(settings));
 sql.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('clan_retirement_20261012_v1',JSON.stringify({version:1,seasonId:1,enabled:true,transition:'FRESH_ORGANIZATIONS_PREPARATION'}));
 sql.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('clan_retirement_20261012_v1:completed',JSON.stringify({retiredAt:'2026-10-13T01:00:00+09:00'}));
 const seeds=[{seed:1,clanId:1,name:'T1',markKey:'T1'},{seed:2,clanId:2,name:'삼성',markKey:'SAMSUNG'},{seed:3,clanId:3,name:'LG',markKey:'LG'}];
 sql.prepare("INSERT INTO clan_championships(season_id,status,seeds_json,settings_json,creation_token,semifinal_starts_at,final_starts_at,winner_clan_id,reward_status,reward_json) VALUES(1,'COMPLETED',?,?,'qa','2026-10-12T12:00:00Z','2026-10-12T14:00:00Z',1,'PENDING','[]')").run(JSON.stringify(seeds),JSON.stringify(settings));
 const reads=[];
 const DB={prepare(source){
  if(!/^\s*SELECT\b/i.test(source))throw Error('WRITE_DURING_RESTORED_READ: '+source);
  reads.push(source);
  return {bind(...values){this.values=values;return this},values:[],async first(){return sql.prepare(source).get(...this.values)||null},async all(){return {results:sql.prepare(source).all(...this.values)}},async run(){throw Error('UNEXPECTED_WRITE')}};
 },async batch(statements){return Promise.all(statements.map(s=>s.all()));}};
 const env={DB},deps={json:(data,status=200,headers={})=>Response.json(data,{status,headers}),authenticate:async request=>sql.prepare('SELECT * FROM users WHERE id=?').get(Number(request.headers.get('x-user'))),isAdminRole:u=>u.role==='OWNER'};
 const call=async(path,{user=2,method='GET'}={})=>{const response=await handleClan({path,env,deps,request:new Request('https://example.test/api/'+path,{method,headers:{'x-user':String(user)}})});return{status:response.status,data:await response.json()};};
 return {env,sql,reads,call,close:()=>sql.close()};
}
