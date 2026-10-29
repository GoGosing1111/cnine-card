import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateBlackwingSettings} from '../../functions/_raid_blackwing_live.js';
import {validateCoreRewardPolicy} from '../../shared/core-raid-reward-policy-v1.mjs';
export const OPERATION_KEY='ops:blackwing-live-rewards:20261029:v1';
export const KEYS={blackwing:'raid_blackwing_settings_v1',choice:'reward_reveal_policy_v1:BLACKWING',varsen:'raid_madara_settings_v1',varsenChoice:'reward_reveal_policy_v1:MADARA'};
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function buildBlackwingRelease(raw){
 const before=JSON.parse(raw[KEYS.blackwing]),source=JSON.parse(raw[KEYS.varsen]),choice=validateCoreRewardPolicy(JSON.parse(raw[KEYS.varsenChoice]));
 assert.equal(before.mode,'TEST');assert.equal(raw[KEYS.choice],null);assert.equal(source.mode,'ON');assert.equal(source.rewardsEnabled,true);assert.equal(choice.enabled,true);
 const next={...before,mode:'ON',rewardsEnabled:true,revision:before.revision+1};
 for(const key of ['weeklyRewardLimit','coinReward','pigCoinReward','masterStarReward','petEssenceReward'])next[key]=source[key];
 validateBlackwingSettings(next);return {[KEYS.blackwing]:next,[KEYS.choice]:{...choice,revision:1},[KEYS.varsen]:{...source,entryTicketCost:0,testEntryFree:true,revision:source.revision+1}};
}
export async function readSnapshot(db,keys){const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys])).rows;return Object.fromEntries(keys.map(k=>[k,rows.find(r=>r.key===k)?.value??null]));}
export async function applyBlackwingRelease(db,{expected,releaseCommit,dryRun=false,failAfter=0}={}){
 assert.match(releaseCommit||'',/^[a-f0-9]{40}$/);
 const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const duplicate=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];if(duplicate){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)};}
  const keys=Object.keys(expected);await db.query('SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[keys]);
  const before=await readSnapshot(db,keys);assert.deepEqual(before,expected,'Settings changed since preflight');const plan=buildBlackwingRelease(before);
  const items=['PET_ESSENCE','MASTER_STAR',...plan[KEYS.choice].entries.filter(e=>e.enabled).map(e=>e.rewardRef)];const active=(await db.query('SELECT code FROM inventory_items WHERE code=ANY($1::text[]) AND is_active=1 FOR SHARE',[items])).rows;assert.equal(active.length,new Set(items).size);
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
  let writes=0;for(const [key,value]of Object.entries(plan)){
   const result=before[key]===null?await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP::text)',[key,JSON.stringify(value)]):await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP::text WHERE key=$2 AND value=$3',[JSON.stringify(value),key,before[key]]);assert.equal(result.rowCount,1);if(++writes===failAfter)throw Error('INJECTED_SETTINGS_FAILURE');
  }
  const after=await readSnapshot(db,keys);for(const k of keys)if(plan[k])assert.deepEqual(JSON.parse(after[k]),plan[k]);else assert.equal(after[k],before[k]);
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',completedAt:new Date().toISOString(),releaseCommit,settings:plan,freeEntry:['CORE','LICH','MADARA','BLACKWING'],preservedHashes:Object.fromEntries(keys.filter(k=>!plan[k]).map(k=>[k,hash(before[k])])),accountWrites:0,retroactiveGrants:0,messagesSent:0};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'BLACKWING_LIVE_REWARDS_20261029','SETTINGS',OPERATION_KEY,JSON.stringify(Object.fromEntries(Object.keys(plan).map(key=>[key,before[key]===null?null:JSON.parse(before[key])]))),JSON.stringify(receipt)])).rows[0];receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP::text)',[OPERATION_KEY,JSON.stringify(receipt)]);await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
