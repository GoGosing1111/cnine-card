import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {defaultCitySettings} from '../shared/jokgak-city-settings-v1.mjs';
import {applyCityCareer,CITY_CAREER_OPERATION} from '../scripts/ops/jokgak-city-career-20261010.mjs';
test('career activation preserves operator OFF, all unrelated settings and assets; audit failure rolls back and replay is idempotent',async t=>{
 const sql=new PGlite();t.after(()=>sql.close());await sql.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMP);CREATE TABLE users(id BIGINT,role TEXT,status TEXT);CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');");
 const p=defaultCitySettings();p.mode='OFF';p.revision=10;p.life.meal.price=1234;delete p.career;
 const key='jokgak_city_settings_v1',now=Date.parse('2026-10-10T01:10:00Z');await sql.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[key,JSON.stringify(p)]);await sql.exec("INSERT INTO app_meta(key,value) VALUES('jokgak_city_life_v1:1','preserved raw assets')");
 let fail=false;const client={query:(text,values)=>{if(fail&&text.startsWith('INSERT INTO admin_logs'))throw Error('INJECTED');return text==='SELECT current_database() db,pg_is_in_recovery() recovery'?{rows:[{db:'cnine',recovery:false}]}:text.startsWith('SELECT pg_advisory_xact_lock')?{rows:[]}:sql.query(text,values);}};
 const read=async (k=key)=>(await sql.query('SELECT value FROM app_meta WHERE key=$1',[k])).rows[0]?.value;
 assert.equal((await applyCityCareer(client,{now})).dryRun,true);assert.deepEqual(JSON.parse(await read()),p);fail=true;await assert.rejects(applyCityCareer(client,{apply:true,now}),/INJECTED/);fail=false;assert.deepEqual(JSON.parse(await read()),p);assert.equal(await read(CITY_CAREER_OPERATION),undefined);
 const r=await applyCityCareer(client,{apply:true,now});assert.equal(r.mode,'OFF');assert.equal(r.revision,11);assert.equal(r.career.startedAt,now);assert.equal(r.career.enabled,true);const next=JSON.parse(await read());assert.equal(next.life.meal.price,1234);assert.deepEqual(next.roles,p.roles);assert.deepEqual(next.rules,p.rules);assert.deepEqual(next.cash,p.cash);assert.equal(await read('jokgak_city_life_v1:1'),'preserved raw assets');assert.equal((await applyCityCareer(client,{apply:true,now:now+1000})).replayed,true);assert.equal((await sql.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n,1);
});
