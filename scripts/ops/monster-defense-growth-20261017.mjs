import assert from 'node:assert/strict';
import {DEFENSE_KEY,validateDefenseSettings} from '../../shared/monster-defense-v1.mjs';
import {defaultDefenseGrowth} from '../../shared/monster-defense-growth-v2.mjs';
export const OPERATION_KEY='ops:monster-defense-growth:20261017:v2';
export async function registerDefenseGrowth(db,{expectedRevision,commit=false}={}){
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(prior){await db.query('ROLLBACK');return {...JSON.parse(prior.value),committed:true,replayed:true};}
  const row=(await db.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[DEFENSE_KEY])).rows[0];
  assert(row,'Existing defense TEST registration required');const before=JSON.parse(row.value);
  assert.equal(before.revision,expectedRevision,'Defense CMS changed; inspect again');
  const owner=(await db.query("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(COALESCE(status,'ACTIVE'))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner,'Active OWNER required');
  // A newer OWNER growth policy wins. Never overwrite it on deployment or retry.
  const now=new Date().toISOString(),next=before.growth?before:{...before,growth:defaultDefenseGrowth(),revision:before.revision+1,updatedAt:now,updatedBy:Number(owner.id),audit:[{requestId:OPERATION_KEY,actorId:Number(owner.id),revision:before.revision+1,createdAt:now},...(before.audit||[])].slice(0,50)};
  validateDefenseSettings(next);
  if(!before.growth){const changed=await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify(next),DEFENSE_KEY,row.value]);assert.equal(changed.rowCount,1,'Defense compare-and-swap failed');}
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_DEFENSE_ROGUELIKE','MONSTER_DEFENSE',OPERATION_KEY,JSON.stringify(before),JSON.stringify(next)])).rows[0];
  const receipt={operationKey:OPERATION_KEY,revision:next.revision,previousRevision:before.revision,mode:next.mode,testUserCount:next.testUserIds.length,rewardsEnabled:false,preservedOwnerGrowth:!!before.growth,auditId:audit.id,completedAt:now};
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await db.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
