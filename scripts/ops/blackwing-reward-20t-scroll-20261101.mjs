import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {validateBlackwingSettings} from '../../functions/_raid_blackwing_live.js';
import {BLACKWING_SCROLLS} from '../../shared/blackwing-clear-reward-v1.mjs';
export const OPERATION_KEY='ops:blackwing-reward20t-scroll30:20261101:v1',SETTINGS_KEY='raid_blackwing_settings_v1';
export async function readSnapshot(db,keys){const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys])).rows;return Object.fromEntries(keys.map(k=>[k,rows.find(r=>r.key===k)?.value??null]));}
export function buildRewardSettings(raw){const before=JSON.parse(raw);assert.equal(before.mode,'ON');assert.equal(before.rewardsEnabled,true);const after={...before,revision:before.revision+1,coinReward:20000000000000,enhancementScrollChance:30};validateBlackwingSettings(after);return after;}
export async function applyRewardSettings(db,{expected,releaseCommit,dryRun=false,failAfterUpdate=false}={}){
 assert.match(releaseCommit||'',/^[a-f0-9]{40}$/);
 const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
  const lock=(await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) locked',[OPERATION_KEY])).rows[0];assert.equal(lock.locked,true,'Operation is already locked');
  const duplicate=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];if(duplicate){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)};}
  await db.query('SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[SETTINGS_KEY]);const keys=Object.keys(expected),before=await readSnapshot(db,keys);assert.deepEqual(before,expected,'Settings changed since inspection');
  const next=buildRewardSettings(before[SETTINGS_KEY]);
  const items=(await db.query('SELECT code FROM inventory_items WHERE code=ANY($1::text[]) AND is_active=1 FOR SHARE',[BLACKWING_SCROLLS.map(s=>s.code)])).rows;assert.equal(items.length,2,'Both enhancement scrolls must be active');
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert(owner);
  const update=await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP::text WHERE key=$2 AND value=$3',[JSON.stringify(next),SETTINGS_KEY,before[SETTINGS_KEY]]);assert.equal(update.rowCount,1);
  if(failAfterUpdate)throw Error('INJECTED_SETTINGS_FAILURE');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',completedAt:new Date().toISOString(),releaseCommit,before:JSON.parse(before[SETTINGS_KEY]),after:next,scrollChancePercent:30,weaponChancePercent:15,armorChancePercent:15,scrollQuantity:1,startsWithNewDepartures:true,accountWrites:0,retroactiveGrants:0,messagesSent:0,preservedHashes:Object.fromEntries(keys.filter(k=>k!==SETTINGS_KEY&&k!==OPERATION_KEY).map(k=>[k,createHash('sha256').update(before[k]??'null').digest('hex')]))};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'BLACKWING_REWARD_20T_SCROLL30_20261101','SETTINGS',OPERATION_KEY,before[SETTINGS_KEY],JSON.stringify(receipt)])).rows[0];receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP::text)',[OPERATION_KEY,JSON.stringify(receipt)]);
  const after=await readSnapshot(db,keys);for(const key of keys)if(key===SETTINGS_KEY)assert.deepEqual(JSON.parse(after[key]),next);else if(key===OPERATION_KEY)assert.deepEqual(JSON.parse(after[key]),receipt);else assert.equal(after[key],before[key]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
