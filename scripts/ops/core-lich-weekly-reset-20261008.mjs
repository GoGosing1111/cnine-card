import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pigCoinRewardWeek} from '../../shared/loot-shop-policy-v1.mjs';

export const OPERATION_KEY='ops:core-lich-weekly-reset:20261008:v1';
export const AUTHORIZED_WEEK='2026-10-05';
const CORE_RECEIPTS='raid_core_reward_receipts_v2024',CORE_WEEKLY='raid_core_weekly_rewards_v2112';
const CONFIG_KEYS=['raid_core_protocol_settings_v2024','raid_core_choice_rewards_v1','loot_shop_policy_v1','raid_lich_settings_v1'];
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const qFor=client=>async(sql,args=[])=>(await client.query(sql,args)).rows;
const args=week=>[week.weekKey,week.startsAt.slice(0,19),week.resetsAt.slice(0,19)];
const paidThisWeek="status='COMPLETED' AND (response_json::jsonb->>'rewardWeekKey'=$1 OR(response_json::jsonb->>'rewardWeekKey' IS NULL AND REPLACE(updated_at,' ','T')>=$2 AND REPLACE(updated_at,' ','T')<$3))";
const lichPrefix=week=>'raid_lich_weekly_v1:'+week.weekKey+':%';
async function legacyLich(q,week){return q(`SELECT DISTINCT l.user_id::text,l.reference_id FROM inventory_logs l JOIN raid_lich_rooms_v1 r ON r.room_id=l.reference_id
 WHERE l.item_code='PET_ESSENCE' AND l.reference_type='LICH_RAID_CLEAR' AND l.change_amount>0
 AND r.state_json::jsonb->>'clearRewardSettlement' IS NULL
 AND (r.state_json::jsonb->>'finishedAt')::bigint >=$1 AND (r.state_json::jsonb->>'finishedAt')::bigint <$2`,[Date.parse(week.startsAt),Date.parse(week.resetsAt)]);}
export async function inspectRaidWeeklyReset(client,{at=Date.now()}={}){
 const q=qFor(client),week=pigCoinRewardWeek(at);
 const receipts=await q(`SELECT user_id::text,room_id,response_json FROM ${CORE_RECEIPTS} WHERE ${paidThisWeek} ORDER BY user_id,room_id`,args(week));
 const counters=await q(`SELECT user_id::text,reward_count,last_request_id FROM ${CORE_WEEKLY} WHERE week_key=$1 ORDER BY user_id`,[week.weekKey]);
 const lich=await q('SELECT key,value FROM app_meta WHERE key LIKE $1 ORDER BY key',[lichPrefix(week)]);
 const settings=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[CONFIG_KEYS]);
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const unreset=receipts.filter(r=>!JSON.parse(r.response_json).weeklyRewardReset),positive=counters.filter(r=>Number(r.reward_count)>0);
 const lichPositive=lich.filter(r=>Number(JSON.parse(r.value).count)>0);
 return {operationKey:OPERATION_KEY,week,core:{affectedUsers:new Set([...unreset.map(r=>r.user_id),...positive.map(r=>r.user_id)]).size,completedReceipts:receipts.length,unresetReceipts:unreset.length,positiveCounters:positive.length,counterTotal:counters.reduce((n,r)=>n+Number(r.reward_count),0)},
  lich:{counters:lich.length,positiveCounters:lichPositive.length,counterTotal:lich.reduce((n,r)=>n+Number(JSON.parse(r.value).count),0),legacyPaidClears:(await legacyLich(q,week)).length},cmsDigest:digest(settings),receipt:prior?JSON.parse(prior.value):null};
}
export async function verifyRaidWeeklyReset(client){
 const q=qFor(client),[saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Reset receipt missing');const r=JSON.parse(saved.value);
 assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.weekKey,AUTHORIZED_WEEK);assert.equal(r.weeklyRewardLimit,3);
 const [audit]=await q('SELECT action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[r.adminLogId]);assert.equal(audit?.action_type,'CORE_LICH_WEEKLY_REWARD_RESET');assert.equal(audit?.target_id,AUTHORIZED_WEEK);
 const {adminLogId,...record}=r;assert.deepEqual(JSON.parse(audit.after_data),record);
 const before=JSON.parse(audit.before_data);
 const [preserved]=await q(`SELECT COUNT(*)::int count FROM ${CORE_RECEIPTS} r JOIN unnest($1::bigint[],$2::text[]) old(user_id,room_id) USING(user_id,room_id)
  WHERE r.status='COMPLETED' AND r.response_json::jsonb#>>'{weeklyRewardReset,operationKey}' IS NOT NULL`,[before.coreReceipts.map(r=>r.user_id),before.coreReceipts.map(r=>r.room_id)]);assert.equal(preserved.count,before.coreReceipts.length,'Paid core receipt or reset marker lost');
 const [marked]=await q(`SELECT COUNT(*)::int count FROM ${CORE_RECEIPTS} WHERE response_json::jsonb#>>'{weeklyRewardReset,operationKey}'=$1`,[OPERATION_KEY]);assert.equal(marked.count,r.core.markedReceipts);
 return {status:'VERIFIED',operationKey:OPERATION_KEY,weekKey:r.weekKey,totalAccounts:r.totalAccounts,core:r.core,lich:r.lich,weeklyRewardLimit:3,adminLogId:r.adminLogId,resetAt:r.resetAt};
}
// Explicit one-time operation. No configuration, reward amount or historical
// completed room is reset. Read endpoints immediately see the existing counters.
export async function resetRaidWeeklyRewards(client,{commit=false,at=Date.now()}={}){
 const q=qFor(client),week=pigCoinRewardWeek(at);assert.equal(week.weekKey,AUTHORIZED_WEEK,'Only the authorized 2026-10-05 week may be reset');
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(prior){const record=JSON.parse(prior.value);await verifyRaidWeeklyReset(client);await q('ROLLBACK');return {...record,replayed:true,committed:false};}
  // Lich settlements lock their room before counters and wallets. Match that
  // order; a clear already committing finishes before this reset's snapshot.
  await q('LOCK TABLE raid_lich_rooms_v1 IN SHARE ROW EXCLUSIVE MODE');
  const accounts=await q('SELECT id,coin,card_shards,magic_crystals FROM users ORDER BY id FOR UPDATE');
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Audit owner required');
  const settings=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[CONFIG_KEYS]);assert.equal(settings.length,4,'Expected raid configuration missing');
  const before=await inspectRaidWeeklyReset(client,{at});
  // The current week starts after the weekly-counter release. If an unexpected
  // legacy payment appears, stop instead of silently leaving quota behind.
  assert.equal(before.lich.legacyPaidClears,0,'Legacy Lich rewards require separate reset handling');
  const coreReceipts=await q(`SELECT user_id::text,room_id,response_json FROM ${CORE_RECEIPTS} WHERE ${paidThisWeek} ORDER BY user_id,room_id FOR UPDATE`,args(week));
  const coreCounters=await q(`SELECT * FROM ${CORE_WEEKLY} WHERE week_key=$1 ORDER BY user_id FOR UPDATE`,[week.weekKey]);
  const lichCounters=await q('SELECT key,value FROM app_meta WHERE key LIKE $1 ORDER BY key FOR UPDATE',[lichPrefix(week)]);
  for(const row of lichCounters){assert.match(row.key,new RegExp('^raid_lich_weekly_v1:'+AUTHORIZED_WEEK+':[1-9][0-9]*$'));const count=JSON.parse(row.value).count;assert.ok(Number.isSafeInteger(count)&&count>=0&&count<=3,'Invalid Lich weekly counter');}
  const reset={operationKey:OPERATION_KEY,weekKey:week.weekKey,resetAt:new Date(at).toISOString()};
  const marked=await q(`UPDATE ${CORE_RECEIPTS} SET response_json=(response_json::jsonb || jsonb_build_object('weeklyRewardReset',$4::jsonb))::text
   WHERE ${paidThisWeek} AND response_json::jsonb->>'weeklyRewardReset' IS NULL RETURNING user_id,room_id`,[...args(week),JSON.stringify(reset)]);
  const clearedCore=await q(`UPDATE ${CORE_WEEKLY} SET reward_count=0,last_request_id=$2 WHERE week_key=$1 RETURNING user_id`,[week.weekKey,OPERATION_KEY]);
  const clearedLich=await q(`UPDATE app_meta SET value=(value::jsonb || jsonb_build_object('count',0,'token',$2::text,'weeklyRewardReset',$3::jsonb))::text,updated_at=CURRENT_TIMESTAMP WHERE key LIKE $1 RETURNING key`,[lichPrefix(week),OPERATION_KEY,JSON.stringify(reset)]);
  // Invalidate pre-reset reward plans without changing battle state. A stale
  // command retries with the new quota through the normal room CAS path.
  const activeRooms=await q("SELECT room_id,version FROM raid_lich_rooms_v1 WHERE status='ACTIVE' ORDER BY room_id");
  const invalidated=await q("UPDATE raid_lich_rooms_v1 SET version=version+1 WHERE status='ACTIVE' RETURNING room_id");assert.equal(invalidated.length,activeRooms.length);
  const after=await inspectRaidWeeklyReset(client,{at});
  assert.equal(after.core.unresetReceipts,0);assert.equal(after.core.counterTotal,0);assert.equal(after.lich.counterTotal,0);assert.equal(after.lich.legacyPaidClears,0);assert.equal(after.core.completedReceipts,before.core.completedReceipts);
  assert.equal(after.cmsDigest,digest(settings));assert.deepEqual(await q('SELECT id,coin,card_shards,magic_crystals FROM users ORDER BY id'),accounts,'Wallet changed');
  const record={status:'COMPLETED',operationKey:OPERATION_KEY,weekKey:week.weekKey,resetAt:reset.resetAt,totalAccounts:accounts.length,weeklyRewardLimit:3,
   core:{affectedUsers:before.core.affectedUsers,markedReceipts:marked.length,resetCounters:clearedCore.length,usedAfter:0,remainingAfter:3,pigCoinWeeklyQuotaReset:true},
   lich:{affectedUsers:before.lich.positiveCounters,resetCounters:clearedLich.length,usedAfter:0,remainingAfter:3,invalidatedActivePlans:invalidated.length},existingRewardsPreserved:true,completedRoomsPreserved:true,balancesPreserved:true,cmsUnchanged:true,cmsDigest:before.cmsDigest};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'CORE_LICH_WEEKLY_REWARD_RESET','ALL_USERS',week.weekKey,JSON.stringify({authorization:'전체유저 붕괴코어,리치왕 주간보상 리셋',operationKey:OPERATION_KEY,coreReceipts,coreCounters,lichCounters,activeRooms,cmsDigest:before.cmsDigest}),JSON.stringify(record)]);assert.ok(audit);record.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(record),reset.resetAt])).length,1);
  await q(commit?'COMMIT':'ROLLBACK');return {...record,replayed:false,committed:commit};
 }catch(e){await q('ROLLBACK').catch(()=>{});throw e;}
}
