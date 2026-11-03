import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {jointInventoryChange} from './_joint_transactions.js';
import {DAILY_COMBAT_QUESTS,QUEST_COMBAT_POLICY_KEY} from '../shared/quest-command-v1.mjs';
export {DAILY_COMBAT_QUESTS,QUEST_COMBAT_POLICY_KEY};
const SCHEMA='quest_combat_schema_20261103_v1';
export const DAILY_COMBAT_SCHEMA=[`CREATE TABLE IF NOT EXISTS quest_daily_combat_claims_v1(user_id BIGINT NOT NULL,quest_date TEXT NOT NULL,quest_id TEXT NOT NULL,claim_token TEXT NOT NULL UNIQUE,status TEXT NOT NULL CHECK(status IN ('PENDING','COMPLETED')),progress BIGINT NOT NULL,coin BIGINT NOT NULL,master_stars BIGINT NOT NULL,policy_version BIGINT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,quest_date,quest_id))`];
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status})};
const sqlDate=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
export function questDay(now=Date.now()){
 const day=new Date(now+9*3600000).toISOString().slice(0,10),startMs=Date.parse(day+'T00:00:00+09:00'),endMs=startMs+86400000;
 return {key:day,start:sqlDate(startMs),end:sqlDate(endMs),resetsAt:new Date(endMs).toISOString(),startMs,endMs};
}
export async function ensureCombatQuestSchema(env){
 if(readRuntimeData(env,SCHEMA))return;
 const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA).first();
 if(!marker){
  if(env.DB.execSchema)await env.DB.execSchema(DAILY_COMBAT_SCHEMA);else await env.DB.batch(DAILY_COMBAT_SCHEMA.map(sql=>env.DB.prepare(sql)));
  await ensureJointAtomicSchema(env);
  await env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(SCHEMA,'1').run();
 }
 cacheRuntimeData(env,SCHEMA,true);
}
export async function combatQuestPolicy(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(QUEST_COMBAT_POLICY_KEY).first();
 let value;try{value=JSON.parse(row?.value||'{}')}catch{value={}}
 return {raw:row?.value||'',value,enabled:value.version===1&&value.enabled===true};
}
const range=column=>`REPLACE(SUBSTR(${column},1,19),'T',' ')>=? AND REPLACE(SUBSTR(${column},1,19),'T',' ')<?`;
async function count(env,sql,args){
 try{return {count:Number((await env.DB.prepare(sql).bind(...args).first())?.c||0),available:true}}
 catch(error){if(/no such table|relation .* does not exist/i.test(String(error.message)))return {count:0,available:false};throw error;}
}
export async function extraWeeklyRaidCounts(env,user,period){
 const start=Date.parse(period.start.replace(' ','T')+'Z'),end=Date.parse(period.end.replace(' ','T')+'Z');
 const results=await Promise.all(['raid_lich_rooms_v1','raid_madara_rooms_v1','raid_blackwing_rooms_v1'].map(table=>{
  if(env.DB.dialect==='postgres')return count(env,`SELECT COUNT(*) c FROM ${table} r
   CROSS JOIN LATERAL jsonb_to_record(r.state_json::jsonb) AS s("releaseMode" text,"startedAt" bigint,"finishedAt" bigint,failure jsonb,"questParticipants" jsonb,"initialMembers" jsonb,members jsonb,"clearRewards" jsonb,"clearRewardSettlement" jsonb)
   WHERE r.status IN ('CLEAR','FAILED') AND (r.state_json::jsonb->>'finishedAt')::bigint>=? AND (r.state_json::jsonb->>'finishedAt')::bigint<? AND s."releaseMode"='ON' AND s."startedAt">0
   AND COALESCE(s.failure->>'code','') NOT IN ('MEMBER_LEFT','HOST_CANCELLED','LOBBY_EXPIRED')
   AND (EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(s."questParticipants",s."initialMembers",'[]'::jsonb)) AS participant(id) WHERE participant.id=?)
    OR s."clearRewards"->? IS NOT NULL OR s."clearRewardSettlement"->'weeklyByUser'->? IS NOT NULL
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(s.members,'[]'::jsonb)) AS member(value) WHERE member.value->>'id'=?))`,[start,end,String(user.id),String(user.id),String(user.id),String(user.id)]);
  // Frozen participants and clear settlement maps survive post-result departures.
  const sql=`SELECT COUNT(*) c FROM ${table} r WHERE status IN ('CLEAR','FAILED')
   AND json_extract(state_json,'$.releaseMode')='ON' AND CAST(json_extract(state_json,'$.startedAt') AS BIGINT)>0
   AND CAST(json_extract(state_json,'$.finishedAt') AS BIGINT)>=? AND CAST(json_extract(state_json,'$.finishedAt') AS BIGINT)<?
   AND COALESCE(json_extract(json_extract(state_json,'$.failure'),'$.code'),'') NOT IN ('MEMBER_LEFT','HOST_CANCELLED','LOBBY_EXPIRED')
   AND (EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(state_json,'$.questParticipants'),json_extract(state_json,'$.initialMembers'),'[]')) m WHERE CAST(m.value AS TEXT)=?)
    OR json_extract(json_extract(state_json,'$.clearRewards'),?) IS NOT NULL
    OR json_extract(json_extract(json_extract(state_json,'$.clearRewardSettlement'),'$.weeklyByUser'),?) IS NOT NULL
    OR EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(state_json,'$.members'),'[]')) m WHERE CAST(json_extract(m.value,'$.id') AS TEXT)=?))`;
  return count(env,sql,[start,end,String(user.id),'$.'+Number(user.id),'$.'+Number(user.id),String(user.id)]);
 }));
 return {count:results.reduce((n,r)=>n+r.count,0),available:results.some(r=>r.available)};
}
export async function dailyCombatCounts(env,user,period){
 const queries={
  RANKED:[`SELECT COUNT(*) c FROM ranked_fight_receipts_v1 WHERE user_id=? AND ${range('created_at')}`,[user.id,period.start,period.end]],
  DUO_RANKED:[`SELECT COUNT(*) c FROM ranked_duo_matches_v1 WHERE user_id=? AND status='COMPLETED' AND ${range('completed_at')}`,[user.id,period.start,period.end]],
  WORLD_RAID:[`SELECT COUNT(DISTINCT r.id) c FROM raid_instances r JOIN raid_participants p ON p.instance_id=r.id JOIN raid_instance_v1293 s ON s.instance_id=r.id
    WHERE p.user_id=? AND COALESCE(p.is_active,1)=1 AND p.total_power>0 AND COALESCE(p.total_damage,0)>0 AND r.status='ENDED' AND NOT EXISTS(SELECT 1 FROM raid_room_cancellations c WHERE c.instance_id=r.id) AND ${range('r.ends_at')}
    AND CAST(json_extract(s.settings_json,'$.enabled') AS TEXT) IN ('1','true') AND CAST(json_extract(s.settings_json,'$.ownerOnlyTest') AS TEXT) IN ('0','false')`,[user.id,period.start,period.end]]
 };
 return Object.fromEntries(await Promise.all(Object.entries(queries).map(async([id,[sql,args]])=>[id,await count(env,sql,args)])));
}
export async function dailyCombatStatus(env,user,{now=Date.now(),blocked=false}={}){
 const period=questDay(now),[policy,counts,receipts]=await Promise.all([combatQuestPolicy(env),dailyCombatCounts(env,user,questDay(now)),env.DB.prepare("SELECT quest_id FROM quest_daily_combat_claims_v1 WHERE user_id=? AND quest_date=? AND status='COMPLETED'").bind(user.id,period.key).all()]);
 return DAILY_COMBAT_QUESTS.map(q=>({...q,...counts[q.id],enabled:policy.enabled,blocked,claimed:receipts.results.some(r=>r.quest_id===q.id),resetsAt:period.resetsAt,delivery:'DIRECT',rewards:[{type:'COIN',label:'코인',amount:q.coin},{type:'MASTER_STAR',label:'마스터의 별',amount:q.masterStars}]}));
}
export async function claimDailyCombatQuest(env,user,questId,deps){
 const q=DAILY_COMBAT_QUESTS.find(q=>q.id===questId);if(!q)fail('지원하지 않는 일일 전투 퀘스트입니다.',400);
 const period=questDay(deps.now?.()),DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
 const receipt=()=>p("SELECT claim_token,coin,master_stars FROM quest_daily_combat_claims_v1 WHERE user_id=? AND quest_date=? AND quest_id=? AND status='COMPLETED'",user.id,period.key,q.id).first();
 const replay=await receipt();if(replay)return {ok:true,replayed:true,delivery:'DIRECT',rewardCoin:Number(replay.coin),masterStars:Number(replay.master_stars)};
 const [policy,daily,identity]=await Promise.all([combatQuestPolicy(env),deps.dailySettings(env),p("SELECT provider_user_id FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK'",user.id).first()]);
 if(!identity||deps.excluded(user,daily))fail('PLAY DK 2차 인증 및 퀘스트 이용 상태를 확인하세요.',403);
 if(!policy.enabled)fail('일일 전투 퀘스트 지급을 준비하고 있습니다.');
 const progress=(await dailyCombatCounts(env,user,period))[q.id];if(!progress.available||progress.count<q.target)fail('아직 퀘스트 목표를 달성하지 못했습니다.');
 if(questDay(deps.now?.()).key!==period.key)fail('새 날짜가 시작되었습니다. 기록을 다시 확인하세요.');
 const token=crypto.randomUUID(),reference=`daily-combat:${period.key}:${q.id}`,now=sqlDate(deps.now?.()??Date.now());
 try{
  await DB.batch([
   ...(DB.dialect==='postgres'?[p('SELECT id FROM users WHERE id=? FOR UPDATE',user.id),p('SELECT key FROM app_meta WHERE key=? FOR SHARE',QUEST_COMBAT_POLICY_KEY),p("SELECT user_id FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK' FOR SHARE",user.id)]:[]),
   jointGuard(DB,token,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM user_second_verifications WHERE user_id=? AND provider='PLAYDK' AND provider_user_id=?)
    AND NOT EXISTS(SELECT 1 FROM quest_daily_combat_claims_v1 WHERE user_id=? AND quest_date=? AND quest_id=?)
    AND CURRENT_TIMESTAMP>=? AND CURRENT_TIMESTAMP<? AND EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=9223372036854775807-?)`,[QUEST_COMBAT_POLICY_KEY,policy.raw,user.id,identity.provider_user_id,user.id,period.key,q.id,period.start,period.end,user.id,q.coin]),
   p("INSERT INTO quest_daily_combat_claims_v1(user_id,quest_date,quest_id,claim_token,status,progress,coin,master_stars,policy_version,created_at) VALUES(?,?,?,?,'PENDING',?,?,?,1,?)",user.id,period.key,q.id,token,progress.count,q.coin,q.masterStars,now),
   p('UPDATE users SET coin=coin+? WHERE id=?',q.coin,user.id),
   p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',q.coin,reference,user.id),
   ...jointInventoryChange(DB,user.id,'MASTER_STAR',q.masterStars,'일일 전투 퀘스트 · '+q.title,reference),
   p("UPDATE quest_daily_combat_claims_v1 SET status='COMPLETED' WHERE claim_token=?",token),jointGuardEnd(DB,token)
  ]);
 }catch(error){const saved=await receipt();if(saved)return {ok:true,replayed:true,delivery:'DIRECT',rewardCoin:Number(saved.coin),masterStars:Number(saved.master_stars)};throw error;}
 return {ok:true,replayed:false,delivery:'DIRECT',rewardCoin:q.coin,masterStars:q.masterStars};
}
