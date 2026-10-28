import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleWarChat,chatMembers,chatGate} from '../functions/_war_chat.js';
import {CLAN_RESUMPTION_VERSION} from '../shared/clan-resumption-v1.mjs';
test('production PostgreSQL adapter: roster queries, session leases, CAS and audit rollback',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());let fault=false;
 const DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;if(fault&&sql.includes('INSERT INTO admin_logs'))throw Error('Injected audit failure');let r;try{r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);}catch(e){console.log('PG SQL FAILURE',sql,e.message);throw e;}return {...r,rowCount:r.affectedRows??r.rows.length};}}),env={DB};
 await pg.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,banned_until TEXT);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id BIGINT,expires_at TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);CREATE TABLE clan_seasons(id BIGINT PRIMARY KEY,phase TEXT,ends_at TEXT);CREATE TABLE clan_members(season_id BIGINT,user_id BIGINT,clan_id BIGINT);CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT,ends_at TEXT);CREATE TABLE territory_war_v3_users(round_id BIGINT,user_id BIGINT,side TEXT,status TEXT);CREATE TABLE organization_rounds_v1(id TEXT PRIMARY KEY,scope TEXT,phase TEXT);CREATE TABLE organization_members_v1(round_id TEXT,user_id BIGINT,organization_id INTEGER);CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL AS $$SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')$$;CREATE FUNCTION sqlite_datetime(base TEXT,modifier TEXT DEFAULT NULL) RETURNS TEXT LANGUAGE SQL AS $$SELECT CASE WHEN base='now' THEN to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') ELSE base END$$;`);
 await pg.exec("INSERT INTO users VALUES(1,'OWNER','OWNER','ACTIVE',NULL),(2,'아군','USER','ACTIVE',NULL),(3,'다른 편','USER','ACTIVE',NULL);INSERT INTO clan_seasons VALUES(12,'ACTIVE','2099-01-01');INSERT INTO clan_members VALUES(12,2,1),(12,3,2);INSERT INTO territory_war_v3_rounds VALUES(86,'ACTIVE','2099-01-01');INSERT INTO territory_war_v3_users VALUES(86,2,'A','ACTIVE'),(86,3,'B','ACTIVE');INSERT INTO organization_rounds_v1 VALUES('qa-round','LIVE','ASSIGNED');INSERT INTO organization_members_v1 VALUES('qa-round',2,1),('qa-round',3,2);");
 await pg.query('INSERT INTO app_meta VALUES($1,$2,NULL)',['clan_resumption_v1',JSON.stringify({version:CLAN_RESUMPTION_VERSION,enabled:true,effectiveAt:Date.parse('2026-10-25T15:30:00+09:00'),seasonId:12,roundId:'qa-round'})]);
 const session='b'.repeat(64);await pg.query('INSERT INTO sessions VALUES($1,2,$2)',[session,'2099-01-01']);
 const call=async(body)=>{const r=await handleWarChat({path:'admin/war-chat',request:new Request('https://game.test/api/admin/war-chat',{method:body?'POST':'GET',headers:{origin:'https://game.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,deps:{authenticate:async()=>({id:1,role:'OWNER',status:'ACTIVE'})}});return {status:r.status,...await r.json()};};
 for(const [i,kind] of ['clan','territory','faction'].entries())assert.equal((await call({kind,enabled:true,revision:i})).status,200);
 for(const [kind,room] of [['clan','war-chat:clan:12:1'],['territory','war-chat:territory:86:A'],['faction','war-chat:faction:qa-round:1']]){
  assert.deepEqual((await chatMembers(env,kind,{userId:2})).map(x=>x.room),[room]);const gate=await chatGate(env,room,[session]);assert.deepEqual(gate.members.map(x=>x.userId),[2]);assert.equal(gate.sessions.length,1);
 }
 assert.equal((await call({kind:'clan',enabled:false,revision:0})).status,409);
 fault=true;assert.equal((await call({kind:'clan',enabled:false,revision:3})).status,503);fault=false;
 assert.equal((await call()).settings.revision,3);assert.equal((await call()).settings.clan,true);assert.equal((await pg.query('SELECT count(*) n FROM admin_logs')).rows[0].n,3);
 await pg.exec("UPDATE users SET banned_until='2099-01-01' WHERE id=2");assert.equal((await chatMembers(env,'territory',{userId:2})).length,0);
});
