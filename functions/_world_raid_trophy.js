import {milestoneValue} from './_milestone_trophies.js';

export const WORLD_RAID_CLEAR_GOAL=5000;
export const WORLD_RAID_BASELINE_KEY='trophy_world_raid_baseline_v1';
export const worldRaidClearKey=id=>'trophy_world_raid_clear_v1:'+Number(id);
export const worldRaidReceiptKey=id=>'trophy_world_raid_room_v1:'+Number(id);
export const worldRaidClearTime=value=>{
 const raw=String(value);
 return new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(raw)?raw:raw.replace(' ','T')+'Z').toISOString();
};

// A zero-HP ended instance and its saved public-mode settings are both required.
// Old rooms whose settings were already purged cannot prove TEST exclusion.
export const WORLD_RAID_LEGACY_SQL=`WITH clears AS (
 SELECT r.id,r.ends_at,ROW_NUMBER() OVER(ORDER BY datetime(r.ends_at),r.id) ordinal
 FROM raid_instances r JOIN raid_participants p ON p.instance_id=r.id
 JOIN raid_instance_v1293 s ON s.instance_id=r.id
 WHERE p.user_id=? AND COALESCE(p.is_active,1)=1 AND p.total_power>0
 AND r.status='ENDED' AND r.current_hp=0 AND r.ends_at IS NOT NULL
 AND CAST(json_extract(s.settings_json,'$.enabled') AS TEXT) IN ('1','true')
 AND CAST(json_extract(s.settings_json,'$.ownerOnlyTest') AS TEXT) IN ('0','false'))
 SELECT COUNT(*) count,MIN(CASE WHEN ordinal=${WORLD_RAID_CLEAR_GOAL} THEN ends_at END) acquired_at FROM clears`;

async function legacyValue(env,id){
 const initialized=await env.DB.prepare("SELECT value FROM app_meta WHERE key='raid_settings_v1'").first();
 if(!initialized)return {count:0,acquiredAt:null};
 const row=await env.DB.prepare(WORLD_RAID_LEGACY_SQL).bind(id).first();
 return {count:Number(row?.count||0),acquiredAt:row?.acquired_at?worldRaidClearTime(row.acquired_at):null};
}
export async function readWorldRaidClearHonors(env,id){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(worldRaidClearKey(id)).first();
 const baseline=row?null:await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(WORLD_RAID_BASELINE_KEY).first();
 const v=row?milestoneValue(row.value,WORLD_RAID_CLEAR_GOAL):baseline?{count:0,acquiredAt:null}:await legacyValue(env,id);
 return {count:v.count>=WORLD_RAID_CLEAR_GOAL?1:0,progress:v.count,goal:WORLD_RAID_CLEAR_GOAL,acquiredAt:v.acquiredAt};
}

// These statements MUST precede the BATTLE -> ENDED update in the same batch.
// The unique room receipt serializes competing polls. A fresh token gates every
// counter write, including ON CONFLICT increments for simultaneous other raids.
export async function prepareWorldRaidClearStatements(env,{instanceId,settings,snapshot,finishedAt}){
 if(settings?.enabled!==true||settings.ownerOnlyTest!==false||snapshot?.cleared!==true||Number(snapshot.bossHp)!==0)return [];
 if(!Number.isSafeInteger(Number(instanceId))||Number(instanceId)<=0)throw Error('INVALID_WORLD_RAID_INSTANCE');
 const at=worldRaidClearTime(finishedAt),ids=[...new Set((snapshot.states||[])
  .filter(s=>Number(s.row?.totalPower)>0).map(s=>Number(s.row.userId)))].sort((a,b)=>a-b);
 if(!ids.length)return [];
 if(ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw Error('INVALID_WORLD_RAID_PARTICIPANT');
 const key=worldRaidReceiptKey(instanceId),token=crypto.randomUUID();
 const receipt=JSON.stringify({version:1,token,instanceId:Number(instanceId),finishedAt:at,participantIds:ids});
 const statements=[env.DB.prepare(`INSERT INTO app_meta(key,value)
  SELECT ?,? WHERE EXISTS(SELECT 1 FROM raid_instances WHERE id=? AND status='BATTLE')
  ON CONFLICT(key) DO NOTHING`).bind(key,receipt,instanceId)];
 const baseline=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(WORLD_RAID_BASELINE_KEY).first();
 for(const id of ids){
  let before={count:0,acquiredAt:null};
  if(!baseline){
   const stored=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(worldRaidClearKey(id)).first();
   if(!stored)before=await legacyValue(env,id);
  }
  const initial=JSON.stringify({count:before.count+1,acquiredAt:before.acquiredAt||(before.count+1>=WORLD_RAID_CLEAR_GOAL?at:null),lastAt:at,lastInstanceId:Number(instanceId)});
  statements.push(env.DB.prepare(`INSERT INTO app_meta(key,value)
   SELECT ?,? WHERE EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)
   ON CONFLICT(key) DO UPDATE SET value=json_object(
    'count',CAST(json_extract(app_meta.value,'$.count') AS BIGINT)+1,
    'acquiredAt',COALESCE(json_extract(app_meta.value,'$.acquiredAt'),CASE WHEN CAST(json_extract(app_meta.value,'$.count') AS BIGINT)+1>=${WORLD_RAID_CLEAR_GOAL} THEN ? ELSE NULL END),
    'lastAt',?,'lastInstanceId',?)`)
   .bind(worldRaidClearKey(id),initial,key,receipt,at,at,Number(instanceId)));
 }
 return statements;
}
