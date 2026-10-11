import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,OPERATION_KEY,grantAdministrationStaff} from '../scripts/ops/administration-staff-grant-20261012.mjs';

async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT);
 CREATE TABLE character_titles(id BIGINT PRIMARY KEY,code TEXT UNIQUE,name TEXT,pve_power BIGINT,unlock_type TEXT,is_active INT,is_public INT,updated_at TEXT);
 CREATE TABLE user_character_titles(user_id BIGINT,title_id BIGINT,source_type TEXT,source_id TEXT,expires_at TEXT,PRIMARY KEY(user_id,title_id));
 CREATE TABLE user_title_loadout(user_id BIGINT PRIMARY KEY,title_id BIGINT,updated_at TEXT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 for(const u of TARGETS)await pg.query("INSERT INTO users VALUES($1,$2,$3,'ACTIVE')",[u.id,u.nickname,u.role]);
 await pg.exec("INSERT INTO users VALUES(9000,'일반계정','USER','ACTIVE');INSERT INTO character_titles VALUES(100,'ADMINISTRATION','행정부',0,'MANUAL',1,1,'old');INSERT INTO character_titles VALUES(101,'OTHER','기존 칭호',70000,'MANUAL',1,1,'old');INSERT INTO user_title_loadout VALUES(1,101,'old');INSERT INTO user_character_titles VALUES(1,101,'ADMIN','1',NULL);");
 let fail=()=>false;
 const q=async(sql,args=[])=>{if(fail(sql))throw Error('INJECTED_FAILURE');return (await pg.query(sql,args)).rows;};
 const transact=async()=>{await pg.exec('BEGIN');try{const result=await grantAdministrationStaff(q);await pg.exec('COMMIT');return result;}catch(e){await pg.exec('ROLLBACK');throw e;}};
 return {q,pg,transact,setFail(fn){fail=fn}};
}
test('staff grant applies 100000 power and seven permanent titles once, preserving other users and equipped titles',async t=>{
 const f=await fixture(t),first=await f.transact();assert.equal(first.granted,7);assert.equal(first.replayed,false);assert.equal(first.power,100000);
 assert.deepEqual((await f.q('SELECT user_id FROM user_character_titles WHERE title_id=100 ORDER BY user_id')).map(r=>Number(r.user_id)),TARGETS.map(t=>t.id));
 assert.equal((await f.q('SELECT title_id FROM user_title_loadout WHERE user_id=1'))[0].title_id,101);
 assert.equal(Number((await f.q('SELECT pve_power FROM character_titles WHERE id=101'))[0].pve_power),70000);
 const repeat=await f.transact();assert.equal(repeat.replayed,true);assert.deepEqual(repeat.adminLogIds,first.adminLogIds);
 assert.equal((await f.q('SELECT * FROM admin_logs')).length,8);assert.equal((await f.q('SELECT * FROM app_meta WHERE key=$1',[OPERATION_KEY])).length,1);
});
test('receipt failure rolls back power and every grant; role drift is rejected before writes',async t=>{
 const f=await fixture(t);f.setFail(sql=>sql.startsWith('INSERT INTO app_meta'));
 await assert.rejects(f.transact,/INJECTED_FAILURE/);
 assert.equal(Number((await f.q('SELECT pve_power FROM character_titles WHERE id=100'))[0].pve_power),0);
 assert.equal((await f.q('SELECT * FROM user_character_titles WHERE title_id=100')).length,0);assert.equal((await f.q('SELECT * FROM admin_logs')).length,0);
 f.setFail(()=>false);await f.q("UPDATE users SET role='USER' WHERE id=83");await assert.rejects(f.transact,/Staff roster changed/);
 assert.equal((await f.q('SELECT * FROM user_character_titles WHERE title_id=100')).length,0);
});
