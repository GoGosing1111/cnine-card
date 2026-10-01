import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {admitHanwhaDiim,OPERATION_KEY} from '../scripts/ops/hanwha-diim-admission-20261001.mjs';

const PLAN={version:1,allocation:'BALANCED_EIGHT_CLANS_V1',seasonId:6,startsAt:'2026-09-29T12:26:49.107Z',participantCount:140,
 quotas:{1:18,2:17,3:17,4:17,5:17,6:18,7:18,8:18},activeRosterOverrides:{4:{maxMembers:18,operationId:'ops:prior-admission:v1'},6:{maxMembers:20,operationId:'ops:prior-lotte:v1'}}};
const END='2099-10-11T13:00:00Z';
async function fixture(){
 const pg=new PGlite();
 await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint DEFAULT 100);
 INSERT INTO users(id,nickname,status,role) VALUES(1,'핑크빛유두','ACTIVE','OWNER'),(4773,'진짜디임','ACTIVE','USER');
 CREATE TABLE user_second_verifications(user_id bigint,provider text);
 INSERT INTO user_second_verifications VALUES(4773,'PLAYDK');
 CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text,max_members int,ends_at text);
 INSERT INTO clan_seasons VALUES(6,3,'ACTIVE',22,'${END}');
 CREATE TABLE clan_organizations(id bigint PRIMARY KEY,name text,is_active int);
 INSERT INTO clan_organizations VALUES(4,'한화',1),(6,'롯데',1);
 CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint,score bigint);
 INSERT INTO clan_season_teams VALUES(6,4,8000,777),(6,6,9000,999);
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
 INSERT INTO pvp_decks VALUES(4773,'[1,2,3,4,5]');
 `);
 for(const [clanId,start,count] of [[4,8000,18],[6,9000,20]])for(let i=0;i<count;i++){
  await pg.query("INSERT INTO users(id,nickname,status,role) VALUES($1,$2,'ACTIVE','USER')",[start+i,'Existing '+(start+i)]);
  await pg.query('INSERT INTO clan_members(season_id,clan_id,user_id,member_role) VALUES(6,$1,$2,$3)',[clanId,start+i,i?'MEMBER':'MASTER']);
 }
 await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['clan_redraft_v20260916:6',JSON.stringify(PLAN)]);
 let failAudit=false;
 const db={dialect:'postgres',enqueue:fn=>fn(),client:{async query({text,values=[]}){
  if(failAudit&&text.includes("'OPS_CLAN_CAPACITY_AND_ADMISSION'"))throw Error('Injected audit failure');
  return pg.query(text,values);
 }}};
 const snapshot=async()=>{
  const result={};
  for(const [table,order] of [['app_meta','key'],['admin_logs','id'],['clan_members','user_id'],['clan_draft_pool','user_id'],['users','id'],['clan_season_teams','clan_id']])result[table]=(await pg.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
  return result;
 };
 return {pg,db,snapshot,options:{expectedRedraft:JSON.stringify(PLAN),expectedSeasonEndsAt:END},failAudit:()=>{failAudit=true;}};
}

test('one Hanwha slot and exact admission are atomic, preserve others, and replay once',async()=>{
 const f=await fixture();try{
  const before=await f.snapshot();
  const dry=await admitHanwhaDiim(f.db,{...f.options,dryRun:true});
  assert.equal(dry.rolledBack,true);assert.deepEqual(await f.snapshot(),before);
  const result=await admitHanwhaDiim(f.db,f.options),after=await f.snapshot();
  assert.equal(result.admission.userId,4773);assert.equal(result.admission.clanId,4);assert.equal(result.admission.memberCount,19);assert.equal(result.admission.maxMembers,19);
  assert.deepEqual(after.clan_members.filter(m=>m.user_id!==4773),before.clan_members);
  assert.deepEqual(after.clan_season_teams,before.clan_season_teams);assert.deepEqual(after.users,before.users);
  assert.equal(after.clan_draft_pool[0].drafted_clan_id,4);assert.equal(after.clan_draft_pool[0].status,'DRAFTED');
  const plan=JSON.parse(after.app_meta.find(x=>x.key==='clan_redraft_v20260916:6').value);
  assert.deepEqual(plan,{...PLAN,activeRosterOverrides:{...PLAN.activeRosterOverrides,4:{maxMembers:19,operationId:OPERATION_KEY}}});
  assert.equal(after.admin_logs.length,2);
  assert.equal((await admitHanwhaDiim(f.db,f.options)).replayed,true);assert.deepEqual(await f.snapshot(),after);
 }finally{await f.pg.close();}
});

test('deck validation and final audit failure roll back capacity, membership and receipts',async()=>{
 for(const failure of ['deck','audit']){
  const f=await fixture();try{
   if(failure==='deck')await f.pg.exec("UPDATE pvp_decks SET card_ids='[]' WHERE user_id=4773");else f.failAudit();
   const before=await f.snapshot();await assert.rejects(admitHanwhaDiim(f.db,f.options));assert.deepEqual(await f.snapshot(),before);
  }finally{await f.pg.close();}
 }
});

test('stale capacity plan, changed nickname and changed season fail without mutation',async()=>{
 for(const failure of ['plan','nickname','season']){
  const f=await fixture();try{
   if(failure==='nickname')await f.pg.exec("UPDATE users SET nickname='Different' WHERE id=4773");
   if(failure==='season')await f.pg.exec("UPDATE clan_seasons SET phase='CHAMPIONS' WHERE id=6");
   const options=failure==='plan'?{...f.options,expectedRedraft:'{}'}:f.options;
   const before=await f.snapshot();await assert.rejects(admitHanwhaDiim(f.db,options));assert.deepEqual(await f.snapshot(),before);
  }finally{await f.pg.close();}
 }
});
