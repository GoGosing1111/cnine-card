import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {admitThreeClanMembers,ADMISSION_KEY,TARGETS} from '../scripts/ops/clan-three-admissions-20260930.mjs';

const PLAN={version:1,allocation:'BALANCED_EIGHT_CLANS_V1',seasonId:6,startsAt:'2026-09-29T12:26:49.107Z',participantCount:140,
 quotas:{1:18,2:17,3:17,4:17,5:17,6:18,7:18,8:18},operationId:'ops:clan-balanced-redraft:season6:20260929:v1'};
const ENDS='2099-10-11T13:00:00Z';
const EFFECTS=[{option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},{option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},
 {option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},{option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}];
async function fixture(){
 const pg=new PGlite();
 await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint DEFAULT 100);
 INSERT INTO users(id,nickname,status,role) VALUES(1,'Owner','ACTIVE','OWNER'),(23,'하이희야','ACTIVE','USER');
 CREATE TABLE user_second_verifications(user_id bigint,provider text);
 CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text,max_members int,ends_at text);
 INSERT INTO clan_seasons VALUES(6,3,'ACTIVE',22,'${ENDS}');
 CREATE TABLE clan_organizations(id bigint PRIMARY KEY,name text,is_active int);
 INSERT INTO clan_organizations VALUES(6,'롯데',1),(5,'LG',1);
 CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint,score bigint);
 INSERT INTO clan_season_teams VALUES(6,6,8000,777),(6,5,9000,999);
 CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,member_role text,preferred_role text,draft_pick_no int,
 contribution_score bigint DEFAULT 0,battle_wins int DEFAULT 0,battle_losses int DEFAULT 0,joined_at text,updated_at text,PRIMARY KEY(season_id,user_id));
 CREATE TABLE clan_draft_pool(season_id bigint,user_id bigint,candidate_key text,preferred_role text,activity_window text,deck_snapshot text,status text,
 drafted_clan_id bigint,pick_no int,registered_at text,updated_at text,total_score bigint DEFAULT 0,PRIMARY KEY(season_id,user_id),UNIQUE(season_id,candidate_key));
 CREATE TABLE clan_wars(id bigint,season_id bigint);
 CREATE TABLE clan_war_battles(season_id bigint,attacker_user_id bigint,defender_user_id bigint,status text);
 CREATE TABLE clan_war_reservation_locks(user_id bigint,war_id bigint,expires_at text);
 CREATE TABLE pvp_decks(user_id bigint,card_ids text);
 CREATE TABLE pvp_deck_presets(user_id bigint,preset_no int,card_ids text);
 CREATE TABLE pvp_active_presets(user_id bigint,preset_no int);
 CREATE TABLE avatar_catalog_v1(code text PRIMARY KEY,is_active int,is_public int);
 CREATE TABLE avatar_effect_options_v1(avatar_code text,option_order int,effect_type text,effect_value numeric);
 CREATE TABLE avatar_user_ownership_v1(user_id bigint,avatar_code text,source_type text,source_ref text,acquired_at text,expires_at text,PRIMARY KEY(user_id,avatar_code));
 CREATE TABLE avatar_user_loadout_v1(user_id bigint,avatar_code text);
 INSERT INTO avatar_user_loadout_v1 VALUES(4977,'OLD_AVATAR');
 INSERT INTO avatar_user_ownership_v1 VALUES(23,'LOTTE_JOEUN','EVENT','original','2026-09-29','2099-10-11 13:00:00');
 INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(6,6,23,'MEMBER');
 `);
 for(const target of TARGETS){
  await pg.query("INSERT INTO users(id,nickname,status,role) VALUES($1,$2,'ACTIVE','USER')",[target.userId,target.nickname]);
  await pg.query("INSERT INTO user_second_verifications VALUES($1,'PLAYDK')",[target.userId]);
  await pg.query("INSERT INTO pvp_decks VALUES($1,'[1,2,3,4,5]')",[target.userId]);
 }
 for(const [clanId,start] of [[6,8000],[5,9000]])for(let i=0;i<17;i++){
  await pg.query("INSERT INTO users(id,nickname,status,role) VALUES($1,$2,'ACTIVE','USER')",[start+i,'Existing '+(start+i)]);
  await pg.query("INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(6,$1,$2,$3)",[clanId,start+i,i?'MEMBER':'MASTER']);
 }
 await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['clan_redraft_v20260916:6',JSON.stringify(PLAN)]);
 for(const [clanId,key] of [[6,'ops:lotte-joeun-bongsoon-season-grant:20260930:v1'],[5,'ops:avatar-lg-hi-heeya-clan-season:20260930:v1']]){
  await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify({status:'COMPLETED',result:{seasonId:6,clan:{id:clanId},expiresAt:'2099-10-11 13:00:00',effects:EFFECTS}})]);
 }
 for(const code of new Set(TARGETS.flatMap(t=>t.codes))){
  await pg.query('INSERT INTO avatar_catalog_v1 VALUES($1,1,1)',[code]);
  for(const e of EFFECTS)await pg.query('INSERT INTO avatar_effect_options_v1 VALUES($1,$2,$3,$4)',[code,e.option_order,e.effect_type,e.effect_value]);
 }
 let failure=null;
 const db={dialect:'postgres',enqueue:fn=>fn(),client:{async query({text,values=[]}){
  if(failure==='audit'&&text.includes("'OPS_CLAN_ADMISSIONS_AND_SEASON_GRANTS'"))throw Error('Injected final audit failure');
  const result=await pg.query(text,values);
  if(failure==='grant'&&text.startsWith('INSERT INTO avatar_user_ownership_v1')&&values.includes('LG_HI_HEEYA'))return {rows:[]};
  return result;
 }}};
 const snapshot=async()=>{
  const result={};
  for(const [table,order] of [['app_meta','key'],['admin_logs','id'],['clan_members','user_id'],['clan_draft_pool','user_id'],['avatar_user_ownership_v1','user_id,avatar_code'],['users','id'],['avatar_user_loadout_v1','user_id'],['clan_season_teams','clan_id']])result[table]=(await pg.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
  return result;
 };
 return {pg,db,snapshot,options:{expectedRedraft:JSON.stringify(PLAN),expectedSeasonEndsAt:ENDS},fail:kind=>{failure=kind;},close:()=>pg.close()};
}

test('three exact admissions, five season grants, dry-run rollback and replay preserve existing state',async()=>{
 const f=await fixture();
 try{
  const before=await f.snapshot();
  const dry=await admitThreeClanMembers(f.db,{...f.options,dryRun:true});
  assert.equal(dry.rolledBack,true);assert.equal(dry.grants.length,5);assert.deepEqual(await f.snapshot(),before);
  const result=await admitThreeClanMembers(f.db,f.options);
  assert.equal(result.admissions.length,3);assert.equal(result.grants.length,5);assert.equal(result.expiresAt,'2099-10-11 13:00:00');
  const after=await f.snapshot();
  assert.equal(after.clan_members.length,before.clan_members.length+3);
  assert.equal(Number(after.clan_members.find(m=>Number(m.user_id)===23).clan_id),6);
  for(const t of TARGETS){assert.equal(Number(after.clan_members.find(m=>Number(m.user_id)===t.userId).clan_id),t.clanId);assert.equal(Number(after.clan_draft_pool.find(m=>Number(m.user_id)===t.userId).drafted_clan_id),t.clanId);}
  assert.deepEqual(after.users,before.users);assert.deepEqual(after.avatar_user_loadout_v1,before.avatar_user_loadout_v1);
  const plan=JSON.parse(after.app_meta.find(m=>m.key==='clan_redraft_v20260916:6').value);
  assert.deepEqual(plan.quotas,PLAN.quotas);assert.equal(plan.activeRosterOverrides[6].maxMembers,20);assert.equal(plan.activeRosterOverrides[5].maxMembers,18);
  assert.equal(after.admin_logs.length,4);assert.equal(after.avatar_user_ownership_v1.filter(r=>r.source_ref===ADMISSION_KEY).length,5);
  assert.equal((await admitThreeClanMembers(f.db,f.options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.close();}
});

test('third account deck failure rolls back earlier admissions and capacity changes',async()=>{
 const f=await fixture();try{
  await f.pg.exec("UPDATE pvp_decks SET card_ids='[]' WHERE user_id=4977");const before=await f.snapshot();
  await assert.rejects(admitThreeClanMembers(f.db,f.options),/덱 5장/);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.close();}
});
for(const failure of ['grant','audit'])test(`late ${failure} failure rolls back memberships, capacity, ownership and all receipts`,async()=>{
 const f=await fixture();try{const before=await f.snapshot();f.fail(failure);await assert.rejects(admitThreeClanMembers(f.db,f.options));assert.deepEqual(await f.snapshot(),before);}finally{await f.close();}
});
test('changed capacity plan or season end fails before any mutation is committed',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();
  await assert.rejects(admitThreeClanMembers(f.db,{...f.options,expectedRedraft:f.options.expectedRedraft+' '}),/plan changed/);
  await assert.rejects(admitThreeClanMembers(f.db,{...f.options,expectedSeasonEndsAt:'2099-10-12T13:00:00Z'}),/expiry changed/);
  assert.deepEqual(await f.snapshot(),before);
 }finally{await f.close();}
});
