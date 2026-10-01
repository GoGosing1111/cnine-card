import {RANKED_REFORM_SCHEMA} from '../../functions/_ranked_reform.js';
export const RANKED_REOPEN_OPERATION='ops:ranked-reopen:20261002';
export const RANKED_OPEN_AT='2026-10-01T16:00:00.000Z';
const SETTLED_KEY='시즌 18|2026-09-26 11:15:04|2026-10-01 11:15:04';
const PREVIOUS_KEY='시즌 19|2026-10-01 11:16:41|2026-10-06 11:16:41';
const scheduleKey='ranked_reopen_schedule_v1';

// Caller owns a short BEGIN/COMMIT (or ROLLBACK for the operational dry run).
// Installing the schedule never enables ranked or resets any profile.
export async function scheduleRankedReopen(client,{releaseCommit}={}){
 if(!/^[a-f0-9]{40}$/.test(releaseCommit||''))throw Error('A verified deployed release commit is required');
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const [identity]=await q('SELECT current_database() AS database,pg_is_in_recovery() AS replica,now() AS now');
 if(identity.database!=='cnine'||identity.replica)throw Error('Wrong database');
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[RANKED_REOPEN_OPERATION]);
 if(prior)return {ok:true,decision:{state:'ALREADY_SCHEDULED'},receipt:JSON.parse(prior.value)};
 if(Date.parse(identity.now)>=Date.parse(RANKED_OPEN_AT))throw Error('Reopening deadline reached; do not install a late schedule');
 await q("SELECT key FROM app_meta WHERE key IN ('pvp_settings_v1','tier_settings_v1',$1) ORDER BY key FOR UPDATE",[scheduleKey]);
 const rows=await q("SELECT key,value FROM app_meta WHERE key IN ('pvp_settings_v1','tier_settings_v1',$1)",[scheduleKey]);
 if(rows.some(row=>row.key===scheduleKey))throw Error('A reopening schedule already exists');
 const before=JSON.parse(rows.find(row=>row.key==='pvp_settings_v1')?.value||'null'),beforeTier=JSON.parse(rows.find(row=>row.key==='tier_settings_v1')?.value||'{}');
 if(!before||before.enabled!==false||before.automaticSeasons!==false||[before.seasonName,before.startsAt,before.endsAt].join('|')!==PREVIOUS_KEY)throw Error('Paused season 19 changed');
 if(Number(before.energy?.maxEnergy)!==10||Number(before.energy?.rechargeMinutes)!==5||Number(before.energy?.costPerBattle)!==1)throw Error('Ranked energy settings changed');
 const [settlement]=await q('SELECT id,status,participant_count,reward_user_count,message_count FROM pvp_season_settlements WHERE season_key=$1',[SETTLED_KEY]);
 if(settlement?.status!=='COMPLETED')throw Error('Season 18 settlement is not completed');
 const [pending]=await q(`SELECT COUNT(*) AS count FROM pvp_season_settlement_ranks r WHERE r.settlement_id=$1 AND
 ((r.reward_coin>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='COIN' AND d.status='SENT')) OR
 (r.reward_shards>0 AND NOT EXISTS(SELECT 1 FROM pvp_season_settlement_deliveries d WHERE d.settlement_id=r.settlement_id AND d.user_id=r.user_id AND d.reward_type='SHARDS' AND d.status='SENT')))`,[settlement.id]);
 if(Number(pending.count)!==0)throw Error('Season 18 rewards are pending');
 const lease=crypto.randomUUID(),locks=await q(`INSERT INTO pvp_season_lifecycle_lock_v1671(lock_key,token,lease_until_ms,updated_at) VALUES('GLOBAL',$1,(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint+30000,sqlite_now())
 ON CONFLICT(lock_key) DO UPDATE SET token=excluded.token,lease_until_ms=excluded.lease_until_ms,updated_at=excluded.updated_at WHERE pvp_season_lifecycle_lock_v1671.lease_until_ms<=(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint RETURNING token`,[lease]);
 if(locks.length!==1)throw Error('Season lifecycle is busy');
 for(const sql of RANKED_REFORM_SCHEMA)await client.query(sql.replaceAll('INTEGER','BIGINT'));
 const next={...before,enabled:false,automaticSeasons:false,status:'10월 2일 오전 1시 개방 예정',scheduledReopenAt:RANKED_OPEN_AT,rankedReformVersion:'20261002',initialScore:1000,winScore:24,loseScore:24,seasonDurationDays:5,
  seasonDescription:'점수·편성 전투력 범위 안에서 자동 매칭됩니다. 동점 승리 +24 · 패배 -24, 방어전 점수 미반영. 행동력은 기존 방식으로 충전됩니다.'};
 const schedule={id:RANKED_REOPEN_OPERATION,status:'SCHEDULED',opensAt:RANKED_OPEN_AT,seasonName:'시즌 19',seasonDurationDays:5,resetScores:true,previousSeasonKey:PREVIOUS_KEY,requiredSettlementKey:SETTLED_KEY,releaseCommit,
  authorization:'개편안 작업하고 10월2일 오전1시에 개방. 일정 주기는 기존 시즌과 동일. PVP 용병 보정 제외. 기존 행동력 유지·버닝 횟수 증가 제외. 모두 1,000점에서 개편 시즌 시작.'};
 await q("UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key='pvp_settings_v1'",[JSON.stringify(next)]);
 await q("UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key='tier_settings_v1'",[JSON.stringify({...beforeTier,pvp:{...beforeTier.pvp,...next}})]);
 await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[scheduleKey,JSON.stringify(schedule)]);
 const receipt={status:'SCHEDULED',scheduledAt:new Date().toISOString(),operationKey:RANKED_REOPEN_OPERATION,releaseCommit,beforePvp:before,afterPvp:next,schedule,settlement,pendingRewards:0,
  preserved:['existing rewards','season 18 settlement','titles','profiles until reopening','history','mercenary combat','duo schedule','other content']};
 await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[RANKED_REOPEN_OPERATION,JSON.stringify(receipt)]);
 await q("DELETE FROM pvp_season_lifecycle_lock_v1671 WHERE lock_key='GLOBAL' AND token=$1",[lease]);
 return {ok:true,decision:{state:'APPLIED'},receipt};
}
