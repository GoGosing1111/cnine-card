import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {rankedUtcMs,rankedSqlUtc,RANKED_REFORM_VERSION} from '../shared/ranked-reform-v1.mjs';
export const RANKED_REOPEN_KEY='ranked_reopen_schedule_v1';
const keyOf=s=>[s.seasonName,s.startsAt||'',s.endsAt||''].join('|');
const pendingRewards=`EXISTS(SELECT 1 FROM pvp_season_settlement_ranks r JOIN pvp_season_settlements s ON s.id=r.settlement_id WHERE s.season_key=? AND
 ((r.reward_coin>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='COIN' AND d.status='SENT')) OR
 (r.reward_shards>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='SHARDS' AND d.status='SENT'))))`;

// Both the minute cron and the first request at/after opening use this transaction.
// No browser, local scheduler, or active player is required for the cron path.
export async function reopenRankedIfDue(env,{now=Date.now()}={}){
 const q=(sql,...args)=>env.DB.prepare(sql).bind(...args);
 const scheduleRow=await q('SELECT value FROM app_meta WHERE key=?',RANKED_REOPEN_KEY).first();
 if(!scheduleRow)return {changed:false,state:'NOT_SCHEDULED'};
 const schedule=JSON.parse(scheduleRow.value),opens=rankedUtcMs(schedule.opensAt);
 if(schedule.status!=='SCHEDULED')return {changed:false,state:schedule.status};
 if(!Number.isFinite(opens))throw Error('Invalid ranked reopening time');
 if(now<opens)return {changed:false,state:'WAITING',opensAt:schedule.opensAt};
 const ends=opens+Number(schedule.seasonDurationDays)*86400000;
 if(!(ends>now)||schedule.seasonDurationDays!==5||schedule.resetScores!==true)throw Error('Invalid or expired ranked reopening schedule');
 const [settingsRow,tierRow]=await Promise.all([q("SELECT value FROM app_meta WHERE key='pvp_settings_v1'").first(),q("SELECT value FROM app_meta WHERE key='tier_settings_v1'").first()]);
 const before=JSON.parse(settingsRow?.value||'null'),tier=JSON.parse(tierRow?.value||'{}');
 if(!before||before.enabled!==false||before.automaticSeasons!==false||keyOf(before)!==schedule.previousSeasonKey||before.scheduledReopenAt!==schedule.opensAt)throw Error('Ranked settings changed after schedule approval');
 const next={...before,enabled:true,automaticSeasons:true,status:'진행 중',seasonName:schedule.seasonName,startsAt:rankedSqlUtc(opens),endsAt:rankedSqlUtc(ends),seasonDurationDays:5,scheduledReopenAt:null,rankedReformVersion:RANKED_REFORM_VERSION};
 const lease=crypto.randomUUID(),acquired=await q(`INSERT INTO pvp_season_lifecycle_lock_v1671(lock_key,token,lease_until_ms,updated_at) VALUES('GLOBAL',?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(lock_key) DO UPDATE SET token=excluded.token,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP WHERE pvp_season_lifecycle_lock_v1671.lease_until_ms<=?`,lease,now+30000,now).run();
 if(Number(acquired?.meta?.changes)!==1)return {changed:false,state:'LIFECYCLE_BUSY'};
 const token=crypto.randomUUID(),receipt={...schedule,status:'COMPLETED',openedAt:new Date(now).toISOString(),startsAt:next.startsAt,endsAt:next.endsAt,profileArchiveKey:schedule.id};
 try{
  await env.DB.batch([
   ...(env.DB.dialect==='postgres'?[q("SELECT key FROM app_meta WHERE key IN ('pvp_settings_v1','tier_settings_v1',?) ORDER BY key FOR UPDATE",RANKED_REOPEN_KEY)]:[]),
   jointGuard(env.DB,token,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key='pvp_settings_v1' AND value=?)
    AND EXISTS(SELECT 1 FROM pvp_season_lifecycle_lock_v1671 WHERE lock_key='GLOBAL' AND token=?)
    AND EXISTS(SELECT 1 FROM pvp_season_settlements WHERE season_key=? AND status='COMPLETED') AND NOT ${pendingRewards}
    AND CURRENT_TIMESTAMP>=? AND CURRENT_TIMESTAMP<?${tierRow?" AND EXISTS(SELECT 1 FROM app_meta WHERE key='tier_settings_v1' AND value=?)":''}`,[RANKED_REOPEN_KEY,scheduleRow.value,settingsRow.value,lease,schedule.requiredSettlementKey,schedule.requiredSettlementKey,rankedSqlUtc(opens),rankedSqlUtc(ends),...(tierRow?[tierRow.value]:[])]),
   q('INSERT INTO ranked_reform_profile_archive_v1(operation_key,user_id,season_score,highest_score,wins,losses,updated_at) SELECT ?,user_id,season_score,highest_score,wins,losses,updated_at FROM pvp_profiles',schedule.id),
   q('UPDATE pvp_profiles SET season_score=?,highest_score=?,wins=0,losses=0,updated_at=CURRENT_TIMESTAMP',Number(next.initialScore),Number(next.initialScore)),
   q("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='pvp_settings_v1'",JSON.stringify(next)),
   ...(tierRow?[q("UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='tier_settings_v1' AND value=?",JSON.stringify({...tier,pvp:{...(tier.pvp||{}),...next}}),tierRow.value)]:[]),
   q('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(receipt),RANKED_REOPEN_KEY),
   jointGuardEnd(env.DB,token)
  ]);
  return {changed:true,state:'COMPLETED',settings:next,startsAt:next.startsAt,endsAt:next.endsAt};
 }catch(error){
  const current=await q('SELECT value FROM app_meta WHERE key=?',RANKED_REOPEN_KEY).first();
  if(JSON.parse(current?.value||'{}').status==='COMPLETED')return {changed:false,state:'COMPLETED'};
  throw error;
 }finally{await q("DELETE FROM pvp_season_lifecycle_lock_v1671 WHERE lock_key='GLOBAL' AND token=?",lease).run();}
}
