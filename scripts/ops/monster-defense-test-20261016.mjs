import assert from 'node:assert/strict';
import {DEFENSE_KEY,defaultDefenseSettings,validateDefenseSettings} from '../../shared/monster-defense-v1.mjs';
export const OPERATION_KEY='ops:monster-defense-test:20261016:v1';
// A one-time TEST registration. Existing difficulty/tester edits are preserved;
// the row, audit and receipt share a transaction. No account assets are written.
export async function registerDefenseTest(db,{expectedRevision=null,commit=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(prior){await db.query('ROLLBACK');return {...JSON.parse(prior.value),committed:true,replayed:true};}
  const row=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[DEFENSE_KEY])).rows[0],before=row?JSON.parse(row.value):null;
  assert.equal(before?.revision??null,expectedRevision,'Defense CMS changed; inspect again');
  const owner=(await db.query("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(COALESCE(status,'ACTIVE'))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner,'Active OWNER required');
  const policy=before?validateDefenseSettings(before):defaultDefenseSettings(),now=new Date().toISOString();
  const next={...before,...policy,mode:'TEST',revision:policy.revision+1,rewardsEnabled:false,updatedAt:now,updatedBy:Number(owner.id),audit:[{requestId:OPERATION_KEY,actorId:Number(owner.id),revision:policy.revision+1,createdAt:now},...(before?.audit||[])].slice(0,50)};
  const changed=row?await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify(next),DEFENSE_KEY,row.value]):await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',[DEFENSE_KEY,JSON.stringify(next)]);
  assert.equal(changed.rowCount,1,'Defense compare-and-swap failed');
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_MONSTER_DEFENSE_TEST','MONSTER_DEFENSE',OPERATION_KEY,JSON.stringify(before),JSON.stringify(next)])).rows[0];
  const receipt={operationKey:OPERATION_KEY,revision:next.revision,previousRevision:before?.revision??null,mode:next.mode,testUserCount:next.testUserIds.length,rewardsEnabled:false,auditId:audit.id,completedAt:now};
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await db.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
