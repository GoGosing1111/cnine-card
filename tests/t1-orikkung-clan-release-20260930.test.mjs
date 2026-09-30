import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {releaseT1OrikkungAndAdmitThree,OPERATION_KEY,TARGETS,T1_ORIKKUNG_CATALOG,EXPECTED_EFFECTS} from '../scripts/ops/t1-orikkung-clan-release-20260930.mjs';

const PLAN={version:1,allocation:'BALANCED_EIGHT_CLANS_V1',seasonId:6,startsAt:'2026-09-29T12:26:49.107Z',participantCount:140,
 quotas:{1:18,2:17,3:17,4:17,5:17,6:18,7:18,8:18},operationId:'ops:clan-balanced-redraft:season6:20260929:v1'};
const ENDS='2099-10-11T13:00:00Z';

async function fixture(){
 const pg=new PGlite();
 await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint DEFAULT 100);
 INSERT INTO users(id,nickname,status,role) VALUES(1,'Owner','ACTIVE','OWNER');
 CREATE TABLE user_second_verifications(user_id bigint,provider text);
 CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text,max_members int,ends_at text);
 INSERT INTO clan_seasons VALUES(6,3,'ACTIVE',22,'${ENDS}');
 CREATE TABLE clan_organizations(id bigint PRIMARY KEY,name text,is_active int);
 INSERT INTO clan_organizations VALUES(2,'삼성',1),(3,'T1',1),(4,'한화',1);
 CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint,score bigint);
 INSERT INTO clan_season_teams VALUES(6,2,2000,22),(6,3,3000,33),(6,4,4000,44);
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
 CREATE TABLE avatar_catalog_v1(code text PRIMARY KEY,serial text UNIQUE,name text,call_sign text,role_label text,description text,
 lobby_image text,lobby_mobile_image text,equipment_image text,accent text,acquisition_type text,coin_price bigint,source_label text,
 source_detail text,effect_type text,effect_value numeric,is_active int,is_public int,sale_enabled int,sort_order int,version int DEFAULT 1);
 CREATE TABLE avatar_effect_options_v1(avatar_code text,option_order int,effect_type text,effect_value numeric);
 CREATE TABLE avatar_user_ownership_v1(user_id bigint,avatar_code text,source_type text,source_ref text,acquired_at text,expires_at text,PRIMARY KEY(user_id,avatar_code));
 CREATE TABLE avatar_user_loadout_v1(user_id bigint,avatar_code text);
 INSERT INTO avatar_user_loadout_v1 VALUES(4913,'OLD_AVATAR');
 `);
 for(const target of TARGETS){
  await pg.query("INSERT INTO users(id,nickname,status,role) VALUES($1,$2,'ACTIVE','USER')",[target.userId,target.nickname]);
  await pg.query("INSERT INTO user_second_verifications VALUES($1,'PLAYDK')",[target.userId]);
  await pg.query("INSERT INTO pvp_decks VALUES($1,'[1,2,3,4,5]')",[target.userId]);
 }
 for(const [clanId,start] of [[2,2000],[3,3000],[4,4000]])for(let i=0;i<17;i++){
  await pg.query("INSERT INTO users(id,nickname,status,role) VALUES($1,$2,'ACTIVE','USER')",[start+i,'Existing '+(start+i)]);
  await pg.query("INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(6,$1,$2,$3)",[clanId,start+i,i?'MEMBER':'MASTER']);
 }
 await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['clan_redraft_v20260916:6',JSON.stringify(PLAN)]);
 const source={...T1_ORIKKUNG_CATALOG,code:'FM_DIMWOOS',serial:'A-21',name:'한복 디임2'};
 await pg.query('INSERT INTO avatar_catalog_v1('+Object.keys(source).join(',')+',version) VALUES('+Object.keys(source).map((_,i)=>'$'+(i+1)).join(',')+',3)',Object.values(source));
 for(const e of EXPECTED_EFFECTS)await pg.query("INSERT INTO avatar_effect_options_v1 VALUES('FM_DIMWOOS',$1,$2,$3)",[e.option_order,e.effect_type,e.effect_value]);
 let failure=null;
 const db={dialect:'postgres',enqueue:fn=>fn(),client:{async query({text,values=[]}){
  if(failure==='audit'&&text.includes("'OPS_T1_ORIKKUNG_CLAN_RELEASE'"))throw Error('Injected audit failure');
  const result=await pg.query(text,values);
  if(failure==='grant'&&text.startsWith('INSERT INTO avatar_user_ownership_v1'))return {rows:[]};
  return result;
 }}};
 const snapshot=async()=>{
  const result={};for(const [table,order] of [['app_meta','key'],['admin_logs','id'],['clan_members','user_id'],['clan_draft_pool','user_id'],['avatar_catalog_v1','code'],['avatar_effect_options_v1','avatar_code,option_order'],['avatar_user_ownership_v1','user_id,avatar_code'],['users','id'],['avatar_user_loadout_v1','user_id'],['clan_season_teams','clan_id']])result[table]=(await pg.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
  return result;
 };
 const expectedT1RecipientIds=Array.from({length:17},(_,i)=>3000+i);
 return {pg,db,snapshot,options:{expectedRedraft:JSON.stringify(PLAN),expectedSeasonEndsAt:ENDS,expectedT1RecipientIds,expectedSourceVersion:3},fail:kind=>{failure=kind},close:()=>pg.close()};
}

test('clan admissions, exact T1 grant, copied options, dry-run and replay remain atomic',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();
  const dry=await releaseT1OrikkungAndAdmitThree(f.db,{...f.options,dryRun:true});
  assert.equal(dry.rolledBack,true);assert.equal(dry.granted,18);assert.deepEqual(await f.snapshot(),before);
  const result=await releaseT1OrikkungAndAdmitThree(f.db,f.options);
  assert.equal(result.admissions.length,3);assert.equal(result.granted,18);assert.deepEqual(result.effects,EXPECTED_EFFECTS);
  assert.equal(result.expiresAt,'2099-10-11 13:00:00');
  const after=await f.snapshot();
  for(const t of TARGETS){assert.equal(Number(after.clan_members.find(m=>Number(m.user_id)===t.userId).clan_id),t.clanId);assert.equal(Number(after.clan_draft_pool.find(m=>Number(m.user_id)===t.userId).drafted_clan_id),t.clanId)}
  assert.equal(after.clan_members.length,before.clan_members.length+3);
  assert.deepEqual(after.users,before.users);assert.deepEqual(after.avatar_user_loadout_v1,before.avatar_user_loadout_v1);
  assert.deepEqual(after.clan_season_teams,before.clan_season_teams);
  assert.equal(after.avatar_user_ownership_v1.length,18);
  assert.ok(after.avatar_user_ownership_v1.every(o=>o.avatar_code===T1_ORIKKUNG_CATALOG.code&&o.expires_at===result.expiresAt&&o.source_ref===OPERATION_KEY));
  assert.equal(after.avatar_catalog_v1.find(a=>a.code===T1_ORIKKUNG_CATALOG.code).serial,'A-30');
  const plan=JSON.parse(after.app_meta.find(m=>m.key==='clan_redraft_v20260916:6').value);
  assert.deepEqual(plan.quotas,PLAN.quotas);
  for(const t of TARGETS)assert.equal(plan.activeRosterOverrides[t.clanId].maxMembers,18);
  for(const path of [T1_ORIKKUNG_CATALOG.lobby_image,T1_ORIKKUNG_CATALOG.lobby_mobile_image,T1_ORIKKUNG_CATALOG.equipment_image])assert.ok((await readFile(new URL('../'+path,import.meta.url))).length>0);
  assert.equal((await releaseT1OrikkungAndAdmitThree(f.db,f.options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.close()}
});

test('third account deck validation failure rolls back earlier assignments and capacity',async()=>{
 const f=await fixture();try{
  await f.pg.exec("UPDATE pvp_decks SET card_ids='[]' WHERE user_id=5393");const before=await f.snapshot();
  await assert.rejects(releaseT1OrikkungAndAdmitThree(f.db,f.options),/덱 5장/);assert.deepEqual(await f.snapshot(),before);
 }finally{await f.close()}
});

for(const failure of ['grant','audit'])test(`${failure} failure rolls back admissions, avatar catalog, ownership and receipt`,async()=>{
 const f=await fixture();try{const before=await f.snapshot();f.fail(failure);await assert.rejects(releaseT1OrikkungAndAdmitThree(f.db,f.options));assert.deepEqual(await f.snapshot(),before)}finally{await f.close()}
});

test('changed reviewed roster, source version and season end stop the release',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();
  await assert.rejects(releaseT1OrikkungAndAdmitThree(f.db,{...f.options,expectedT1RecipientIds:Array.from({length:17},(_,i)=>3001+i)}),/roster changed/);
  await assert.rejects(releaseT1OrikkungAndAdmitThree(f.db,{...f.options,expectedSourceVersion:4}),/Reference avatar changed/);
  await assert.rejects(releaseT1OrikkungAndAdmitThree(f.db,{...f.options,expectedSeasonEndsAt:'2099-10-12T13:00:00Z'}),/season or expiry changed/);
  assert.deepEqual(await f.snapshot(),before);
 }finally{await f.close()}
});
