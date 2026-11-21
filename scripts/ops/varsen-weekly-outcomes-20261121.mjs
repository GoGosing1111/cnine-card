import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const operationKey='ops:varsen:restore-weekly-raid-outcomes:20261121:v1';
const action='RESTORE_VARSEN_WEEKLY_RAID_OUTCOMES';
const table='raid_madara_rooms_v1';
const raidFailures=['PARTY_DEAD','STRAIN','ENRAGE','FIRE_BREACH','DPS_TIMEOUT','MECHANIC_TIMEOUT'];

// Read the combat engine's terminal event. The leave time may fall in a later quest week.
export async function planRoomRepairs(db){
  const {rows}=await db.query(`
    WITH cancelled AS MATERIALIZED (
      SELECT room_id, version, state_json::jsonb AS s, md5(state_json) AS raw_hash
      FROM ${table} WHERE status='CANCELLED'
    )
    SELECT r.room_id, r.version::text, r.raw_hash,
      CASE WHEN event->>'code'='VICTORY' THEN 'CLEAR' ELSE 'FAILED' END AS outcome,
      event->>'code' AS reason,(event->>'at')::bigint::text AS ended_at,
      (s->>'finishedAt')::bigint::text AS left_at,
      md5((s - 'status' - 'finishedAt')::text) AS rest_hash
    FROM cancelled r
    CROSS JOIN LATERAL (
      SELECT (array_agg(e))[1] AS event
      FROM jsonb_array_elements(s->'events') e WHERE e->>'type'='MADARA_RESULT'
      HAVING COUNT(*)=1
    ) terminal
    WHERE s->>'status'='CANCELLED' AND s->>'releaseMode'='ON'
      AND (s->>'startedAt')::bigint>0 AND (event->>'at')::bigint BETWEEN (s->>'startedAt')::bigint AND (s->>'finishedAt')::bigint
      AND jsonb_array_length(s->'initialMembers')>0 AND jsonb_array_length(s->'members')>0
      AND NOT EXISTS (SELECT FROM jsonb_array_elements(s->'members') m WHERE m->>'left' IS DISTINCT FROM 'true')
      AND ((event->>'code'='VICTORY' AND event->>'winner'='A' AND s->'failure'->>'code' IS NULL)
        OR (event->>'code'=ANY($1::text[]) AND event->>'winner'='B' AND s->'failure'->>'code'=event->>'code'))
    ORDER BY r.room_id`,[raidFailures]);
  return rows;
}

export const planHash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
export async function readReceipt(db){
  const {rows}=await db.query('SELECT value FROM app_meta WHERE key=$1',[operationKey]);
  return rows.length?JSON.parse(rows[0].value):null;
}
const records=`jsonb_to_recordset($1::jsonb) AS p(room_id text,version bigint,raw_hash text,outcome text,ended_at bigint,rest_hash text)`;

export async function verifyRoomRepairs(db,rows){
  const {rows:[summary]}=await db.query(`
    SELECT COUNT(r.room_id)::int AS found,
      COUNT(*) FILTER(WHERE r.status=p.outcome AND r.state_json::jsonb->>'status'=p.outcome
        AND (r.state_json::jsonb->>'finishedAt')::bigint=p.ended_at AND r.version=p.version+1
        AND md5((r.state_json::jsonb - 'status' - 'finishedAt')::text)=p.rest_hash)::int AS verified
    FROM ${records} LEFT JOIN ${table} r ON r.room_id=p.room_id`,[JSON.stringify(rows)]);
  assert.equal(summary.found,rows.length);
  assert.equal(summary.verified,rows.length,'Room result, time, revision or preserved state mismatch');
  return summary;
}

export async function repairRooms(db,{reviewed,commit=false,checkpoint=()=>{}}){
  const completed=await readReceipt(db);
  if(completed)return {replayed:true,receipt:completed};
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query("SET LOCAL statement_timeout='30s'");
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[operationKey]);
    const replay=await readReceipt(db);
    if(replay){await db.query('ROLLBACK');return {replayed:true,receipt:replay};}
    const rows=await planRoomRepairs(db);
    assert(rows.length>0,'No evidenced room outcomes to restore');
    assert.equal(planHash(rows),reviewed,'Repair candidates changed since review');
    const updated=await db.query(`
      UPDATE ${table} r SET status=p.outcome,version=r.version+1,
        state_json=jsonb_set(jsonb_set(r.state_json::jsonb,'{status}',to_jsonb(p.outcome)),
          '{finishedAt}',to_jsonb(p.ended_at))::text
      FROM ${records} WHERE r.room_id=p.room_id AND r.status='CANCELLED'
        AND r.version=p.version AND md5(r.state_json)=p.raw_hash`,[JSON.stringify(rows)]);
    assert.equal(updated.rowCount,rows.length);
    const verified=await verifyRoomRepairs(db,rows);
    await checkpoint('rooms');
    const {rows:[owner]}=await db.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");
    assert(owner);
    const payload={key:operationKey,reviewed,rooms:rows.length,clears:rows.filter(r=>r.outcome==='CLEAR').length,losses:rows.filter(r=>r.outcome==='FAILED').length};
    const {rows:[audit]}=await db.query(
      "INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'RAID_ROOM',$3,$4,$5) RETURNING id::text",
      [owner.id,action,operationKey,JSON.stringify({oldStatus:'CANCELLED',reviewed}),JSON.stringify(payload)]);
    await checkpoint('audit');
    const receipt={...payload,auditId:audit.id,completedAt:new Date().toISOString(),results:rows.map(({room_id,outcome,reason,ended_at,left_at})=>({room_id,outcome,reason,ended_at,left_at}))};
    await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[operationKey,JSON.stringify(receipt)]);
    await checkpoint('receipt');
    await db.query(commit?'COMMIT':'ROLLBACK');
    return {committed:commit,verified,receipt};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
