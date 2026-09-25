import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {repairFactionPause,OPERATION_KEY,ARCHIVE_KEY,SESSION_KEY,PAUSED_AT} from '../scripts/ops/faction-pause-repair-20260925.mjs';
async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());let fail=false;
 const client={async query(sql,args){if(fail&&sql.startsWith('INSERT INTO admin_logs'))throw Error('INJECTED_AUDIT_FAILURE');const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 await pg.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT,coin BIGINT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE clan_faction_state(season_id BIGINT PRIMARY KEY,state_json TEXT,revision BIGINT,last_action TEXT);
 CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT,starts_at TEXT,settled_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 INSERT INTO users VALUES(1,'OWNER','ACTIVE',123);
 INSERT INTO territory_war_v3_rounds VALUES(58,'FINISHED','2026-09-23T14:43:50.842Z','2026-09-24 08:49:12');`);
 const state={districts:[{id:'A',owner:1}],battles:[{id:'battle',status:'ACTIVE'}],session:{key:SESSION_KEY,status:'PAUSED',pausedAt:PAUSED_AT,endsAt:PAUSED_AT+10000,participants:[1],pauses:[{startsAt:PAUSED_AT,endsAt:null}]}};
 await pg.query('INSERT INTO clan_faction_state VALUES(5,$1,38908,\'original\')',[JSON.stringify(state)]);
 await pg.query('INSERT INTO app_meta VALUES($1,$2)',[ARCHIVE_KEY,JSON.stringify({round:{id:58,status:'ACTIVE',starts_at:new Date(PAUSED_AT).toISOString(),settled_at:null}})]);
 await pg.query("INSERT INTO admin_logs(id,action_type,target_id,before_data) VALUES(35272,'TERRITORY_CLAN_RANK_RESTART','58',$1)",[JSON.stringify({archiveKey:ARCHIVE_KEY})]);
 return {pg,client,state,setFailure:v=>fail=v,read:async()=>{const r=(await pg.query('SELECT * FROM clan_faction_state WHERE season_id=5')).rows[0];return {...r,state:JSON.parse(r.state_json)}}};
}
test('audited pause backfill is metadata-only, rolls back with its audit and is idempotent',async t=>{
 const f=await fixture(t),before=await f.read();
 const preview=await repairFactionPause(f.client,{dryRun:true,expectedRevision:38908});
 assert.equal(preview.dryRun,true);assert.deepEqual(await f.read(),before);
 f.setFailure(true);await assert.rejects(repairFactionPause(f.client,{expectedRevision:38908}),/INJECTED/);
 assert.deepEqual(await f.read(),before);assert.equal((await f.pg.query('SELECT * FROM app_meta WHERE key=$1',[OPERATION_KEY+':before'])).rows.length,0);
 f.setFailure(false);const result=await repairFactionPause(f.client,{expectedRevision:38908});
 assert.equal(result.receipt.revisionAfter,38909);
 const after=await f.read();assert.deepEqual(after.state.session.pauses[0].territoryRoundIds,[58]);
 delete after.state.session.pauses[0].territoryRoundIds;assert.deepEqual(after.state,f.state);
 assert.equal((await f.pg.query('SELECT coin FROM users WHERE id=1')).rows[0].coin,123);
 assert.equal((await repairFactionPause(f.client,{expectedRevision:38908})).replayed,true);
 assert.equal(Number((await f.pg.query("SELECT count(*) n FROM admin_logs WHERE action_type='OPS_FACTION_PAUSE_REPAIR'")).rows[0].n),1);
});
test('pause backfill rejects a stale revision or archive that cannot identify the interruption',async t=>{
 const f=await fixture(t),before=await f.read();
 await assert.rejects(repairFactionPause(f.client,{expectedRevision:38907}),/revision changed/);
 await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify({round:{id:58,status:'ACTIVE',starts_at:new Date(PAUSED_AT+1).toISOString()}}),ARCHIVE_KEY]);
 await assert.rejects(repairFactionPause(f.client,{expectedRevision:38908}),/does not prove/);
 assert.deepEqual(await f.read(),before);
});
