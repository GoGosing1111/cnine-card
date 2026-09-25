// One-time user-authorized operation, never imported by a request route.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pigCoinRewardWeek} from '../../shared/loot-shop-policy-v1.mjs';

export const OPERATION_KEY='ops:core-raid-weekly-reset:20260925:v1';
export const AUTHORIZED_WEEK='2026-09-21';
const RECEIPTS='raid_core_reward_receipts_v2024',WEEKLY='raid_core_weekly_rewards_v2112';
const CONFIG_KEYS=['raid_core_protocol_settings_v2024','raid_core_choice_rewards_v1','loot_shop_policy_v1'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const weekArgs=week=>[week.weekKey,week.startsAt.slice(0,19),week.resetsAt.slice(0,19)];
const paidThisWeek="status='COMPLETED' AND (response_json::jsonb->>'rewardWeekKey'=$1 OR (response_json::jsonb->>'rewardWeekKey' IS NULL AND REPLACE(updated_at,' ','T')>=$2 AND REPLACE(updated_at,' ','T')<$3))";
const configs=async client=>(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[CONFIG_KEYS])).rows;

export async function inspectCoreWeeklyReset(client,{at=Date.now()}={}){
  const week=pigCoinRewardWeek(at),settings=await configs(client);
  const rows=(await client.query(`SELECT user_id::text,room_id,response_json FROM ${RECEIPTS} WHERE ${paidThisWeek}`,weekArgs(week))).rows;
  const counters=(await client.query(`SELECT user_id::text,reward_count,last_request_id FROM ${WEEKLY} WHERE week_key=$1`,[week.weekKey])).rows;
  const before=new Set([...rows.map(row=>row.user_id),...counters.filter(row=>Number(row.reward_count)>0).map(row=>row.user_id)]);
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  const choice=JSON.parse(settings.find(row=>row.key==='raid_core_choice_rewards_v1')?.value||'{}');
  return {week,operationKey:OPERATION_KEY,affectedUsers:before.size,completedReceipts:rows.length,unresetReceipts:rows.filter(row=>!JSON.parse(row.response_json).weeklyRewardReset?.operationKey).length,positiveCounters:counters.filter(row=>Number(row.reward_count)>0).length,counterTotal:counters.reduce((sum,row)=>sum+Number(row.reward_count),0),cmsDigest:digest(settings),choiceSettings:{enabled:choice.enabled,revision:choice.revision,minimum:choice.minimum,enabledEntries:choice.entries?.filter(row=>row.enabled).length||0},receipt:prior?JSON.parse(prior.value):null};
}

export async function resetCoreWeeklyRewards(client,{commit=false,at=Date.now()}={}){
  const week=pigCoinRewardWeek(at);assert.equal(week.weekKey,AUTHORIZED_WEEK,'This operation is authorized for the 2026-09-21 week only');
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY])).rows[0];
    if(prior){const saved=JSON.parse(prior.value);assert.equal(saved.status,'COMPLETED');await client.query('ROLLBACK');return {...saved,replayed:true};}
    // Core settlement locks the same account first, then its receipt and quota.
    // Lock all accounts in ID order before the snapshot so a concurrent clear
    // either finishes before this reset or consumes a fresh slot afterward.
    const accounts=(await client.query('SELECT id FROM users ORDER BY id FOR UPDATE')).rows;
    const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' ORDER BY id LIMIT 1")).rows[0];assert(owner,'An OWNER is required for the audit');
    const settings=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[CONFIG_KEYS])).rows;
    const before=await inspectCoreWeeklyReset(client,{at});
    const receipts=(await client.query(`SELECT * FROM ${RECEIPTS} WHERE ${paidThisWeek} ORDER BY user_id,room_id FOR UPDATE`,weekArgs(week))).rows;
    const counters=(await client.query(`SELECT * FROM ${WEEKLY} WHERE week_key=$1 ORDER BY user_id FOR UPDATE`,[week.weekKey])).rows;
    const reset={operationKey:OPERATION_KEY,weekKey:week.weekKey,resetAt:new Date(at).toISOString()};
    const marked=await client.query(`UPDATE ${RECEIPTS} SET response_json=(response_json::jsonb || jsonb_build_object('weeklyRewardReset',$4::jsonb))::text WHERE ${paidThisWeek} AND response_json::jsonb#>>'{weeklyRewardReset,operationKey}' IS NULL RETURNING user_id,room_id`,[...weekArgs(week),JSON.stringify(reset)]);
    const cleared=await client.query(`UPDATE ${WEEKLY} SET reward_count=0,last_request_id=$2 WHERE week_key=$1 RETURNING user_id`,[week.weekKey,OPERATION_KEY]);
    const after=await inspectCoreWeeklyReset(client,{at});
    assert.equal(after.unresetReceipts,0);assert.equal(after.positiveCounters,0);assert.equal(after.counterTotal,0);assert.equal(after.completedReceipts,before.completedReceipts);
    assert.equal(after.cmsDigest,digest(settings),'CMS settings changed during reset');
    const record={status:'COMPLETED',operationKey:OPERATION_KEY,weekKey:week.weekKey,resetAt:reset.resetAt,totalAccounts:accounts.length,affectedUsers:before.affectedUsers,markedReceipts:marked.rows.length,resetCounters:cleared.rows.length,weeklyRewardLimit:3,existingRewardReceiptsPreserved:true,existingBalancesPreserved:true,corePigCoinWeeklyQuotaReset:true,cmsDigest:before.cmsDigest,cmsUnchanged:true};
    const audit=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'CORE_RAID_WEEKLY_REWARD_RESET','ALL_USERS',week.weekKey,JSON.stringify({authorization:'전체유저 이번주 붕괴코어 보상받은거 리셋해서 0부터 다시 깰수있게',operationKey:OPERATION_KEY,receipts,counters,cmsDigest:before.cmsDigest}),JSON.stringify(record)])).rows[0];assert(audit,'Audit insert missing');record.adminLogId=String(audit.id);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(record),reset.resetAt]);
    await client.query(commit?'COMMIT':'ROLLBACK');return {...record,committed:commit,replayed:false};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
