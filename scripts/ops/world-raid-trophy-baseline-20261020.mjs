import assert from 'node:assert/strict';
import {WORLD_RAID_BASELINE_KEY,WORLD_RAID_CLEAR_GOAL,worldRaidClearKey,worldRaidClearTime} from '../../functions/_world_raid_trophy.js';
import {milestoneValue} from '../../functions/_milestone_trophies.js';

export const WORLD_RAID_PROOF_SQL=`SELECT r.id,r.ends_at,p.user_id
 FROM raid_instances r JOIN raid_participants p ON p.instance_id=r.id
 JOIN raid_instance_v1293 s ON s.instance_id=r.id
 WHERE r.status='ENDED' AND r.current_hp=0 AND r.ends_at IS NOT NULL
 AND COALESCE(p.is_active,1)=1 AND p.total_power>0
 AND s.settings_json::jsonb->>'enabled'='true'
 AND s.settings_json::jsonb->>'ownerOnlyTest'='false'
 ORDER BY r.ends_at::timestamptz,r.id,p.user_id`;

export function aggregateWorldRaidProofs(rows){
 const counts=new Map();
 for(const row of rows){
  const id=Number(row.user_id),instanceId=Number(row.id),at=worldRaidClearTime(row.ends_at);
  assert.ok(Number.isSafeInteger(id)&&id>0&&Number.isSafeInteger(instanceId)&&instanceId>0);
  const value=counts.get(id)||{count:0,acquiredAt:null};
  value.count++;if(value.count===WORLD_RAID_CLEAR_GOAL)value.acquiredAt=at;
  value.lastAt=at;value.lastInstanceId=instanceId;counts.set(id,value);
 }
 return [...counts].sort((a,b)=>a[0]-b[0]);
}

export async function backfillWorldRaidTrophyBaseline(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  await db.query('SELECT pg_advisory_xact_lock(61020,5000)');
  const previous=(await db.query('SELECT value FROM app_meta WHERE key=$1',[WORLD_RAID_BASELINE_KEY])).rows[0];
  if(previous){await db.query('ROLLBACK');return {replayed:true,...JSON.parse(previous.value)};}
  const rows=(await db.query(WORLD_RAID_PROOF_SQL)).rows,counts=aggregateWorldRaidProofs(rows);
  const values=counts.map(([id,value])=>({id,key:worldRaidClearKey(id),value:JSON.stringify(value)}));
  // Live settlements seed the same full legacy count before adding the new raid.
  // Preserve any such row; competing live UPSERTs increment our inserted baseline.
  const inserted=(await db.query(`INSERT INTO app_meta(key,value)
   SELECT key,value FROM jsonb_to_recordset($1::jsonb) AS x(id BIGINT,key TEXT,value TEXT)
   ORDER BY id ON CONFLICT(key) DO NOTHING RETURNING key`,[JSON.stringify(values)])).rows.length;
  const stored=new Map((await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[values.map(v=>v.key)])).rows.map(r=>[r.key,r.value]));
  for(const [id,value] of counts)assert.ok(milestoneValue(stored.get(worldRaidClearKey(id)),WORLD_RAID_CLEAR_GOAL).count>=value.count,'Live counter must include historic clears');
  const receipt={version:1,completedAt:new Date().toISOString(),rooms:new Set(rows.map(r=>String(r.id))).size,participations:rows.length,accounts:counts.length,inserted,preserved:counts.length-inserted,qualified:counts.filter(([,v])=>v.count>=WORLD_RAID_CLEAR_GOAL).length};
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[WORLD_RAID_BASELINE_KEY,JSON.stringify(receipt)]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,...receipt};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
