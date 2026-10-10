import assert from 'node:assert/strict';
import {LICH_LEGACY_BASELINE_KEY,LICH_CLEAR_GOAL,lichClearKey,milestoneValue} from '../../functions/_milestone_trophies.js';

// Parse each completed replay once on the server, returning only the small
// immutable participant proof. No combat log or private inventory is exported.
export const LEGACY_PROOF_SQL=`WITH rooms AS MATERIALIZED (
 SELECT room_id,state_json::jsonb AS state FROM raid_lich_rooms_v1 WHERE status='CLEAR'
) SELECT room_id,CAST(state->>'finishedAt' AS BIGINT) AS finished_at,
 state->'clearRewardSettlement'->'weeklyByUser' AS weekly,
 state->'petEssenceSettlement'->'participantIds' AS paid,
 state->'members' AS members
 FROM rooms WHERE state->>'releaseMode'='ON' AND CAST(state->>'finishedAt' AS BIGINT)>0
 ORDER BY finished_at,room_id`;

export function aggregateLichProofs(rooms){
 const counts=new Map();
 for(const room of rooms){
  const at=Number(room.finished_at);assert.ok(Number.isSafeInteger(at)&&at>0);
  const ids=new Set([...Object.keys(room.weekly||{}),...(room.paid||[]).map(String),...(room.members||[]).map(m=>String(m.id))]);
  for(const id of ids){
   assert.match(id,/^[1-9]\d*$/);assert.ok(Number.isSafeInteger(Number(id)));
   const v=counts.get(Number(id))||{count:0,acquiredAt:null};v.count++;
   if(v.count===LICH_CLEAR_GOAL)v.acquiredAt=new Date(at).toISOString();
   v.lastAt=new Date(at).toISOString();v.lastRoomId=room.room_id;counts.set(Number(id),v);
  }
 }
 return [...counts].sort((a,b)=>a[0]-b[0]);
}

export async function backfillLichTrophyBaseline(db,{dryRun=false}={}){
 await db.query('BEGIN');
 try{
  // Existing live settlements insert the same account key first. DO NOTHING
  // preserves their complete lifetime count; their CAS retries if we win first.
  await db.query('SELECT pg_advisory_xact_lock(61011,1000)');
  const previous=(await db.query('SELECT value FROM app_meta WHERE key=$1',[LICH_LEGACY_BASELINE_KEY])).rows[0];
  if(previous){await db.query('ROLLBACK');return {replayed:true,...JSON.parse(previous.value)};}
  const rooms=(await db.query(LEGACY_PROOF_SQL)).rows,counts=aggregateLichProofs(rooms),at=new Date().toISOString();
  const values=counts.map(([id,value])=>({id,key:lichClearKey(id),value:JSON.stringify(value)}));
  const inserted=(await db.query(`INSERT INTO app_meta(key,value)
   SELECT key,value FROM jsonb_to_recordset($1::jsonb) AS x(id BIGINT,key TEXT,value TEXT)
   ORDER BY id ON CONFLICT(key) DO NOTHING RETURNING key`,[JSON.stringify(values)])).rows.length;
  const stored=new Map((await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[values.map(v=>v.key)])).rows.map(v=>[v.key,v.value]));
  for(const [id,value] of counts)assert.ok(milestoneValue(stored.get(lichClearKey(id)),LICH_CLEAR_GOAL).count>=value.count,'Existing lifetime count must include every completed room');
  const preserved=counts.length-inserted;
  const receipt={version:1,completedAt:at,rooms:rooms.length,accounts:counts.length,inserted,preserved};
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[LICH_LEGACY_BASELINE_KEY,JSON.stringify(receipt)]);
  await db.query(dryRun?'ROLLBACK':'COMMIT');return {dryRun,replayed:false,...receipt};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
