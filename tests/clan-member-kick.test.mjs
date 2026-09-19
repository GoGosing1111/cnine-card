import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {kickClanMember} from '../functions/_clan_member_kick.js';

async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE admin_logs(admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
 CREATE TABLE users(id bigint PRIMARY KEY,nickname text);INSERT INTO users VALUES(1,'클랜장'),(2,'클랜원'),(3,'다른 클랜장');
 CREATE TABLE clan_seasons(id bigint PRIMARY KEY,season_no int,phase text);INSERT INTO clan_seasons VALUES(5,2,'ACTIVE');
 CREATE TABLE clan_season_teams(season_id bigint,clan_id bigint,master_user_id bigint);INSERT INTO clan_season_teams VALUES(5,8,1),(5,7,3);
 CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,member_role text,joined_at text,PRIMARY KEY(season_id,user_id));
 INSERT INTO clan_members VALUES(5,8,1,'MASTER','2026-09-16'),(5,8,2,'MEMBER','2026-09-17'),(5,7,3,'MASTER','2026-09-16');
 CREATE TABLE clan_draft_pool(season_id bigint,user_id bigint,status text,drafted_clan_id bigint,pick_no int,updated_at text);INSERT INTO clan_draft_pool VALUES(5,2,'DRAFTED',8,12,NULL);
 CREATE TABLE clan_wars(id bigint,season_id bigint,clan_a_id bigint,clan_b_id bigint,status text);INSERT INTO clan_wars VALUES(68,5,8,7,'COMPLETED');
 CREATE TABLE clan_war_battles(season_id bigint,status text,attacker_user_id bigint,defender_user_id bigint);
 CREATE TABLE clan_war_reservation_locks(war_id bigint,user_id bigint,expires_at text);
 CREATE TABLE clan_faction_state(season_id bigint,revision int,state_json text,last_action text);
 `);
 const faction={formations:{8:{a:[1,2],b:[2]},7:{a:[3]}},captains:{8:{a:2},7:{a:3}},battles:[],pools:{8:12345}};
 await pg.query('INSERT INTO clan_faction_state VALUES(5,4,$1,\'old\')',[JSON.stringify(faction)]);
 let failAudit=false;const client={async query(input){const text=typeof input==='string'?input:input.text;if(failAudit&&text.includes('INSERT INTO admin_logs'))throw Error('injected audit failure');return pg.query(text,typeof input==='string'?[]:input.values||[]);}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
 const body={seasonId:5,targetUserId:2,joinedAt:'2026-09-17',requestId:'kick-test-request-0001',confirmation:'KICK_CLAN_MEMBER'};
 return {pg,body,faction,call:(patch={},actor=1)=>kickClanMember(env,{id:actor,role:'USER'},{...body,...patch}),failAudit:()=>{failAudit=true;},close:()=>pg.close()};
}

test('master kick atomically removes membership, withdraws draft and cleans faction; replay is harmless',async()=>{
 const f=await fixture();try{
  const result=await f.call();assert.equal(result.memberCount,1);assert.equal(result.replayed,false);
  const pool=(await f.pg.query('SELECT * FROM clan_draft_pool')).rows[0];assert.equal(pool.status,'WITHDRAWN');assert.equal(pool.drafted_clan_id,null);
  const row=(await f.pg.query('SELECT * FROM clan_faction_state')).rows[0],state=JSON.parse(row.state_json);assert.equal(row.revision,5);assert.deepEqual(state.formations['8'],{a:[1],b:[]});assert.deepEqual(state.captains['8'],{});assert.deepEqual(state.formations['7'],f.faction.formations['7']);assert.equal(state.pools['8'],12345);
  assert.equal((await f.call()).replayed,true);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
  await assert.rejects(f.call({targetUserId:3}),/다른 클랜원/);
 }finally{await f.close();}
});

test('non-master, foreign master, self, stale membership and season cannot remove anyone',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.call({},3),/같은 클랜/);
  await assert.rejects(f.call({targetUserId:1},2),/클랜장만/);
  await assert.rejects(f.call({targetUserId:1}),/자신/);
  await assert.rejects(f.call({joinedAt:'stale'}),/가입 정보/);
  await assert.rejects(f.call({seasonId:4}),/시즌/);
  await assert.rejects(f.call({confirmation:''}),/확인/);
  assert.equal((await f.pg.query('SELECT * FROM clan_members')).rows.length,3);
  assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,0);
 }finally{await f.close();}
});

test('battle, reservation, phase and active faction participants are protected',async()=>{
 const f=await fixture();try{
  for(const phase of ['DRAFT','CHAMPIONS','SETTLEMENT','COMPLETE']){await f.pg.query('UPDATE clan_seasons SET phase=$1',[phase]);await assert.rejects(f.call(),/정규 시즌/);}
  await f.pg.exec("UPDATE clan_seasons SET phase='ACTIVE';UPDATE clan_wars SET status='ACTIVE'");await assert.rejects(f.call(),/클랜전 진행/);
  await f.pg.exec("UPDATE clan_wars SET status='COMPLETED';INSERT INTO clan_war_battles VALUES(5,'RESOLVING',3,2)");await assert.rejects(f.call(),/전투가 끝난/);
  await f.pg.exec("DELETE FROM clan_war_battles;INSERT INTO clan_war_reservation_locks VALUES(68,2,'2999-01-01')");await assert.rejects(f.call(),/전투 예약/);
  await f.pg.exec('DELETE FROM clan_war_reservation_locks');await f.pg.query('UPDATE clan_faction_state SET state_json=$1',[JSON.stringify({...f.faction,battles:[{status:'ACTIVE',attackers:[2],defenders:[3]}]})]);await assert.rejects(f.call(),/세력전 교전/);
  assert.equal((await f.pg.query('SELECT * FROM clan_members')).rows.length,3);
 }finally{await f.close();}
});

test('audit failure rolls back member, draft, faction and receipt together',async()=>{
 const f=await fixture();try{f.failAudit();await assert.rejects(f.call(),/injected audit/);assert.equal((await f.pg.query('SELECT * FROM clan_members')).rows.length,3);assert.equal((await f.pg.query('SELECT status FROM clan_draft_pool')).rows[0].status,'DRAFTED');assert.equal((await f.pg.query('SELECT revision FROM clan_faction_state')).rows[0].revision,4);assert.equal((await f.pg.query('SELECT * FROM app_meta')).rows.length,0);}finally{await f.close();}
});

test('expired faction battle waiting for lazy reconciliation no longer blocks removal',async()=>{
 const f=await fixture();try{await f.pg.query('UPDATE clan_faction_state SET state_json=$1',[JSON.stringify({...f.faction,battles:[{status:'ACTIVE',endsAt:1,attackers:[2],defenders:[3]}]})]);assert.equal((await f.call()).ok,true);}finally{await f.close();}
});

test('an old dialog cannot kick a user who left and rejoined; old successful replay does not kick them again',async()=>{
 const f=await fixture();try{await f.call();await f.pg.exec("INSERT INTO clan_members VALUES(5,8,2,'MEMBER','2026-09-19');UPDATE clan_draft_pool SET status='DRAFTED',drafted_clan_id=8");assert.equal((await f.call()).replayed,true);await assert.rejects(f.call({requestId:'another-request-0001'}),/가입 정보/);assert.equal((await f.pg.query('SELECT * FROM clan_members WHERE user_id=2')).rows.length,1);}finally{await f.close();}
});
