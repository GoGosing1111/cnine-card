import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {coupSchema} from '../functions/_coup_schema.js';
import {assignCoupCommander,COUP_COMMAND_OPERATION,COUP_TARGET_ROUND,COUP_EXPECTED_APPOINTMENT} from '../scripts/ops/coup-diim-commander-20261002.mjs';
const releaseCommit='a'.repeat(40);
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$; CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT DEFAULT 77); CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);");
 for(const sql of coupSchema(true))await db.exec(sql);
 await db.exec("INSERT INTO users(id,nickname,status,role) VALUES(1,'owner','ACTIVE','OWNER'),(4773,'진짜디임','ACTIVE','USER'),(4977,'하이희야♡','ACTIVE','USER')");
 await db.query("INSERT INTO app_meta(key,value) VALUES('chief_appointment_v1',$1),('coup_settings_v2115',$2)",[JSON.stringify({id:COUP_EXPECTED_APPOINTMENT,userId:4977,endsAt:new Date(Date.now()+86400000).toISOString()}),JSON.stringify({enabled:true,battleMinutes:180})]);
 const settings={enabled:true,battleMinutes:180,trialMinutes:60,attackCooldownSeconds:30,siegeHp:15000000,other:'preserve'};
 await db.query("INSERT INTO coup_rounds_v2115(id,status,chief_user_id,appointment_id,chief_name,settings_json,created_at,chief_hp,rebel_hp,max_hp) VALUES($1,'RECRUITING',4977,$2,'하이희야♡',$3,1,15000000,15000000,15000000)",[COUP_TARGET_ROUND,COUP_EXPECTED_APPOINTMENT,JSON.stringify(settings)]);
 let failAudit=false;
 const client={query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT current_database()'))return{rows:[{database:'cnine',replica:false}]};
  if(failAudit&&sql.startsWith('INSERT INTO admin_logs'))throw Error('AUDIT_FAILURE');
  return db.query(sql,args);
 }};
 const transaction=async(commit=true)=>{await db.exec('BEGIN');try{const r=await assignCoupCommander(client,{releaseCommit});await db.exec(commit?'COMMIT':'ROLLBACK');return r;}catch(e){await db.exec('ROLLBACK');throw e;}};
 return{db,transaction,settings,failAudit:()=>{failAudit=true;}};
}
test('commander assignment dry-run, exact user/round, preservation and idempotent audit',async t=>{
 const f=await fixture(t);
 const before=(await f.db.query('SELECT * FROM coup_rounds_v2115')).rows[0];
 const dry=await f.transaction(false);assert.equal(dry.receipt.commanderId,4773);assert.equal(dry.receipt.enrolled,false);
 assert.deepEqual((await f.db.query('SELECT * FROM coup_rounds_v2115')).rows[0],before);
 assert.equal((await f.db.query('SELECT * FROM admin_logs')).rows.length,0);
 const first=await f.transaction();assert.equal(first.changed,true);assert.equal(first.receipt.after.other,'preserve');
 const after=(await f.db.query('SELECT * FROM coup_rounds_v2115')).rows[0];
 assert.equal(after.chief_hp,before.chief_hp);assert.equal(after.rebel_hp,before.rebel_hp);assert.equal(after.status,'RECRUITING');
 assert.equal(after.starts_at,null);assert.equal(after.revision,1);
 assert.deepEqual(JSON.parse(after.settings_json),{...f.settings,rebelCommand:{roundId:COUP_TARGET_ROUND,userId:4773}});
 assert.equal((await f.db.query('SELECT * FROM coup_participants_v2115')).rows.length,0);
 assert.equal((await f.db.query('SELECT * FROM admin_logs')).rows.length,1);
 const replay=await f.transaction();assert.equal(replay.changed,false);assert.equal(replay.receipt.auditId,first.receipt.auditId);
 assert.equal((await f.db.query('SELECT * FROM admin_logs')).rows.length,1);
 assert.ok((await f.db.query('SELECT coin FROM users')).rows.every(r=>Number(r.coin)===77));
});
test('assignment rejects changed identity, live rounds and opposite-side membership; failed audit rolls back',async t=>{
 const f=await fixture(t);
 await f.db.exec("UPDATE users SET nickname='other' WHERE id=4773");
 await assert.rejects(f.transaction(),/identity/);
 await f.db.exec("UPDATE users SET nickname='진짜디임' WHERE id=4773; UPDATE coup_rounds_v2115 SET status='ACTIVE'");
 await assert.rejects(f.transaction(),/state/);
 await f.db.exec("UPDATE coup_rounds_v2115 SET status='RECRUITING'");
 await f.db.query("INSERT INTO coup_participants_v2115(round_id,user_id,side,deck_snapshot,loadout_bonus_json,deck_power,joined_at) VALUES($1,4773,'CHIEF','[]','{}',1,1)",[COUP_TARGET_ROUND]);
 await assert.rejects(f.transaction(),/other side/);
 await f.db.exec("DELETE FROM coup_participants_v2115");
 f.failAudit();await assert.rejects(f.transaction(),/AUDIT_FAILURE/);
 assert.equal((await f.db.query('SELECT revision FROM coup_rounds_v2115')).rows[0].revision,0);
 assert.equal((await f.db.query('SELECT value FROM app_meta WHERE key=$1',[COUP_COMMAND_OPERATION])).rows.length,0);
});
