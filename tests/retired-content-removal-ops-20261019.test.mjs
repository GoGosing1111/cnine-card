import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {OPERATION_KEY,SETTINGS_KEYS,removalState,removeRetiredContent,verifyRetiredContentRemoval} from '../scripts/ops/remove-retired-content-20261019.mjs';
const release={commit:'e'.repeat(40),retiredRoutesVerified:true};
async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE FUNCTION pg_advisory_xact_lock(bigint) RETURNS void LANGUAGE SQL AS $$SELECT$$;
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT);INSERT INTO users VALUES(1,'OWNER','ACTIVE',123),(2,'USER','ACTIVE',456);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT);INSERT INTO cnine_user_inventory VALUES(2,'REWARD',9);
 CREATE TABLE coin_logs(id BIGINT,reason TEXT);INSERT INTO coin_logs VALUES(1,'MONSTER_SIEGE_FINAL_REWARD');
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT sqlite_now());
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE monster_siege_actions(request_id TEXT PRIMARY KEY,result_json TEXT);INSERT INTO monster_siege_actions VALUES('attack','large replay');
 CREATE TABLE monster_siege_ai_actions(id BIGSERIAL PRIMARY KEY,result_json TEXT);INSERT INTO monster_siege_ai_actions(result_json) VALUES('AI attack');
 CREATE TABLE monster_siege_events(id BIGINT,status TEXT);INSERT INTO monster_siege_events VALUES(1,'FAILED');
 CREATE TABLE monster_siege_users(user_id BIGINT,attacks BIGINT);INSERT INTO monster_siege_users VALUES(2,6);
 CREATE TABLE monster_siege_rewards(user_id BIGINT,claimed_at TEXT);INSERT INTO monster_siege_rewards VALUES(2,'paid');
 CREATE TABLE monster_siege_participation_bonus_v1(user_id BIGINT,amount BIGINT);INSERT INTO monster_siege_participation_bonus_v1 VALUES(2,30000000);
 CREATE TABLE monster_siege_ai_state(id BIGINT);INSERT INTO monster_siege_ai_state VALUES(1);`);
 for(const key of [...SETTINGS_KEYS,'keep-other-setting'])await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify({enabled:true})]);
 const client={query:(sql,args=[])=>pg.query(sql,args)};
 const protectedAccounts=async()=>({users:(await pg.query('SELECT * FROM users ORDER BY id')).rows,inventory:(await pg.query('SELECT * FROM cnine_user_inventory')).rows,coinLogs:(await pg.query('SELECT * FROM coin_logs')).rows,other:(await pg.query("SELECT value FROM app_meta WHERE key='keep-other-setting'")).rows});
 return {pg,client,protectedAccounts};
}
test('log purge and settings removal roll back on failure and dry-run; commit preserves accounts and rewards; replay does nothing',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());const before=await removalState(f.client),accounts=await f.protectedAccounts();
 await assert.rejects(removeRetiredContent(f.client,{release:null}),/deployed/);
 const fault={query(sql,args){if(sql.startsWith('INSERT INTO admin_logs'))throw Error('injected audit failure');return f.client.query(sql,args);}};
 await assert.rejects(removeRetiredContent(fault,{commit:true,release}),/injected/);
 assert.deepEqual(await removalState(f.client),before);assert.deepEqual(await f.protectedAccounts(),accounts);
 const dry=await removeRetiredContent(f.client,{release});assert.equal(dry.dryRun,true);
 assert.deepEqual(await removalState(f.client),before);
 assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,0);
 const applied=await removeRetiredContent(f.client,{commit:true,release});assert.deepEqual(applied.logs.map(r=>r.deleted),[1,1]);assert.equal(applied.removedSettings.length,3);
 assert.deepEqual(await f.protectedAccounts(),accounts);assert.equal((await verifyRetiredContentRemoval(f.client)).protectedRecordsVerified,true);
 const replay=await removeRetiredContent(f.client,{commit:true,release});assert.equal(replay.replayed,true);assert.equal(replay.auditId,applied.auditId);
 assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
});
test('active siege or foreign-key dependency prevents removal without cascading',async t=>{
 const f=await fixture();t.after(()=>f.pg.close());await f.pg.exec("UPDATE monster_siege_events SET status='ACTIVE'");
 await assert.rejects(removeRetiredContent(f.client,{commit:true,release}),/Active siege/);
 await f.pg.exec("UPDATE monster_siege_events SET status='FAILED';CREATE TABLE must_preserve(ref TEXT REFERENCES monster_siege_actions(request_id));INSERT INTO must_preserve VALUES('attack');");
 await assert.rejects(removeRetiredContent(f.client,{commit:true,release}),/dependent/);
 assert.equal((await f.pg.query('SELECT * FROM monster_siege_actions')).rows.length,1);
 assert.equal((await f.pg.query('SELECT * FROM must_preserve')).rows.length,1);
});
