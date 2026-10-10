import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
export const CITY_TOP_GOAL=25,LICH_CLEAR_GOAL=1000;
export const LICH_LEGACY_BASELINE_KEY='trophy_lich_legacy_baseline_v1';
export const cityTopKey=id=>'trophy_city_top_v1:'+Number(id);
export const lichClearKey=id=>'trophy_lich_clear_v1:'+Number(id);
export function milestoneValue(raw,goal){
  if(raw==null)return {count:0,acquiredAt:null};
  const value=JSON.parse(raw);
  if(!Number.isSafeInteger(value.count)||value.count<0||value.count>=goal&&!value.acquiredAt)throw Error('INVALID_TROPHY_MILESTONE');
  return value;
}
const honor=(value,goal)=>({count:value.count>=goal?1:0,progress:value.count,goal,acquiredAt:value.acquiredAt||null});
export async function readCityTopHonors(env,id){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(cityTopKey(id)).first();
  return honor(milestoneValue(row?.value,CITY_TOP_GOAL),CITY_TOP_GOAL);
}
// Finished room snapshots are the legacy proof, including clears with no weekly
// payout. The participant snapshot survives a later departure from the room.
export const LICH_CLEAR_HONORS_SQL=`WITH clears AS (
 SELECT r.room_id,CAST(json_extract(r.state_json,'$.finishedAt') AS BIGINT) finished_at,
 ROW_NUMBER() OVER (ORDER BY CAST(json_extract(r.state_json,'$.finishedAt') AS BIGINT),r.room_id) ordinal
 FROM raid_lich_rooms_v1 r WHERE r.status='CLEAR' AND json_extract(r.state_json,'$.releaseMode')='ON'
 AND CAST(json_extract(r.state_json,'$.finishedAt') AS BIGINT)>0 AND (
 json_extract(json_extract(json_extract(r.state_json,'$.clearRewardSettlement'),'$.weeklyByUser'),?) IS NOT NULL
 OR EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(json_extract(r.state_json,'$.petEssenceSettlement'),'$.participantIds'),'[]')) m WHERE CAST(m.value AS TEXT)=?)
 OR EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(r.state_json,'$.members'),'[]')) m WHERE CAST(json_extract(m.value,'$.id') AS TEXT)=?)))
 SELECT COUNT(*) count,MIN(CASE WHEN ordinal=${LICH_CLEAR_GOAL} THEN finished_at END) first_at FROM clears`;
async function legacyLichValue(env,id){
  // The one-time baseline includes every verifiable historic participant.
  // Thereafter an absent account row means zero, without parsing raid replays.
  const baseline=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LICH_LEGACY_BASELINE_KEY).first();
  if(baseline)return {count:0,acquiredAt:null};
  const initialized=await env.DB.prepare("SELECT value FROM app_meta WHERE key='raid_lich_settings_v1'").first();
  if(!initialized)return {count:0,acquiredAt:null};
  const value=await env.DB.prepare(LICH_CLEAR_HONORS_SQL).bind('$.'+Number(id),String(id),String(id)).first();
  return {count:Number(value?.count||0),acquiredAt:value?.first_at?new Date(Number(value.first_at)).toISOString():null};
}
export async function readLichClearHonors(env,id){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(lichClearKey(id)).first();
  return honor(row?milestoneValue(row.value,LICH_CLEAR_GOAL):await legacyLichValue(env,id),LICH_CLEAR_GOAL);
}
export async function prepareLichClearMilestone(env,row,room,plan){
  if(row.status!=='ACTIVE'||room.status!=='CLEAR'||room.releaseMode!=='ON')return;
  const at=new Date(room.finishedAt).toISOString();
  for(const member of [...room.members].sort((a,b)=>Number(a.id)-Number(b.id))){
    const key=lichClearKey(member.id),stored=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first(),raw=stored?.value??null;
    const before=raw===null?await legacyLichValue(env,member.id):milestoneValue(raw,LICH_CLEAR_GOAL),count=before.count+1;
    const value=JSON.stringify({count,acquiredAt:before.acquiredAt||(count>=LICH_CLEAR_GOAL?at:null),lastAt:at,lastRoomId:room.id});
    const token=crypto.randomUUID();plan.counters.push({key,raw});
    plan.statements.push(raw===null
      ?env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,value)
      :env.DB.prepare('UPDATE app_meta SET value=? WHERE key=? AND value=?').bind(value,key,raw),
      jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,value]),jointGuardEnd(env.DB,token));
  }
}
