import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cleanCoreRaidSettings} from '../../functions/_raid_core_protocol.js';
import {validateLichSettings} from '../../functions/_raid_lich_live.js';
import {validateMadaraSettings} from '../../functions/_raid_madara_live.js';
import {validateLootShopPolicy,upgradeLootShopPolicy} from '../../shared/loot-shop-policy-v1.mjs';
export const OPERATION_KEY='ops:raid-rewards:20261028:v1';
export const SETTINGS_KEYS=['raid_core_protocol_settings_v2024','raid_lich_settings_v1','raid_madara_settings_v1','loot_shop_policy_v1'];
export const PRESERVED_KEYS=['raid_core_choice_rewards_v1','reward_reveal_policy_v1:LICH','reward_reveal_policy_v1:MADARA','raid_settings_v1','raid_weekly_boss_settings_v2141','raid_blackwing_settings_v1'];
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function buildRaidRewardSettings(raw){
 const next=Object.fromEntries(SETTINGS_KEYS.map(k=>[k,JSON.parse(raw[k])]));
 const [core,lich,madara,loot]=SETTINGS_KEYS.map(k=>next[k]);
 assert.equal(core.mode,'ON');assert.equal(core.rewardLocked,false);assert.equal(lich.mode,'ON');assert.equal(madara.mode,'ON');assert.equal(madara.rewardsEnabled,true);assert.equal(loot.rewardsEnabled,true);
 core.rewardCoin=100000000000;core.weeklyRewardLimit=3;
 Object.assign(lich,{coinReward:200000000000,pigCoinReward:100,petEssenceEnabled:true,petEssenceReward:5,masterStarReward:0,weeklyRewardLimit:3,revision:lich.revision+1});
 Object.assign(madara,{coinReward:200000000000,pigCoinReward:100,petEssenceReward:5,masterStarReward:2000000,weeklyRewardLimit:3,revision:madara.revision+1});
 const pig=loot.sources.find(s=>s.code==='CORE_RAID');assert.equal(pig.enabled,true);pig.amount=100;pig.weeklyLimit=300;loot.revision++;
 assert.equal(cleanCoreRaidSettings(core).rewardCoin,100000000000);assert.equal(validateLichSettings(lich).weeklyRewardLimit,3);assert.equal(validateLichSettings(lich).pigCoinReward,100);
 assert.equal(validateMadaraSettings(madara).pigCoinReward,100);validateLootShopPolicy(upgradeLootShopPolicy(loot));
 return next;
}
export async function readRaidRewardSnapshot(db){
 const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS_KEYS.concat(PRESERVED_KEYS)])).rows;
 assert.equal(rows.length,SETTINGS_KEYS.length+PRESERVED_KEYS.length);
 return Object.fromEntries(rows.map(r=>[r.key,r.value]));
}
export async function applyRaidRewards20261028(db,{expected,releaseCommit,dryRun=false,failAfter=0}={}){
 assert.match(releaseCommit||'',/^[a-f0-9]{40}$/);
 // Completed invocations take a SELECT-only path and never reset counters.
 const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 if(prior)return {replayed:true,receipt:JSON.parse(prior.value)};
 await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const duplicate=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(duplicate){await db.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)};}
  const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[SETTINGS_KEYS.concat(PRESERVED_KEYS)])).rows;
  const before=Object.fromEntries(rows.map(r=>[r.key,r.value]));assert.deepEqual(before,expected,'Settings changed since preflight');
  const next=buildRaidRewardSettings(before);
  for(const k of PRESERVED_KEYS.slice(0,3))assert.equal(JSON.parse(before[k]).enabled,true,'Additional reward must remain enabled');
  const tables=(await db.query("SELECT to_regclass('pig_coin_wallets_v1') wallet,to_regclass('pig_coin_ledger_v1') ledger")).rows[0];assert(tables.wallet&&tables.ledger);
  const owner=(await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert(owner);
  let writes=0;
  for(const key of SETTINGS_KEYS){const r=await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP::text WHERE key=$2 AND value=$3',[JSON.stringify(next[key]),key,before[key]]);assert.equal(r.rowCount,1);if(++writes===failAfter)throw Error('INJECTED_SETTINGS_FAILURE');}
  const after=await readRaidRewardSnapshot(db);
  for(const key of SETTINGS_KEYS)assert.deepEqual(JSON.parse(after[key]),next[key]);
  for(const key of PRESERVED_KEYS)assert.equal(after[key],before[key]);
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',completedAt:new Date().toISOString(),releaseCommit,settings:next,preservedHashes:Object.fromEntries(PRESERVED_KEYS.map(k=>[k,digest(before[k])])),previousWeeklyCountsPreserved:true,accountWrites:0,retroactiveGrants:0,noticePublished:false};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'RAID_REWARDS_20261028','SETTINGS',OPERATION_KEY,JSON.stringify(Object.fromEntries(SETTINGS_KEYS.map(k=>[k,JSON.parse(before[k])]))),JSON.stringify(receipt)])).rows[0];receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP::text)',[OPERATION_KEY,JSON.stringify(receipt)]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,receipt};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
