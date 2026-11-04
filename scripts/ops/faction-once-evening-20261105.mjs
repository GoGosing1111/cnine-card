import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EVENING_FACTION_RULES as RULES,CLAN_RESUMPTION_STATE_KEY,createResumedFactionDay,activeClanResumption} from '../../shared/clan-resumption-v1.mjs';
import {factionDayKey} from '../../shared/clan-faction-sessions-v1.mjs';
export const OP='ops:faction-once-evening:20261105:v1';
export const ACTION='OPS_FACTION_ONCE_EVENING';
export const ROUND='e5421b84-8888-4027-8a36-f58d7f033ab1';
export const DAY='2026-11-05';
export const AUTHORIZATION=['1일 1회로 변경하고 오후 4시 ~ 오후 11:59분 사이 1회 열리도록 개편함','2시간으로 단축','아니다 코인 5조 마별 5000만개로'];
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const qFor=db=>async(sql,args=[])=>(await db.query(sql,args)).rows;
export async function inspectEvening(db,{lock=false}={}){
 const q=qFor(db),suffix=lock?' FOR UPDATE':'';
 const round=one(await q('SELECT * FROM organization_rounds_v1 WHERE id=$1'+suffix,[ROUND]));
 const policy=one(await q('SELECT * FROM organization_faction_policy_v1 WHERE id=1'+(lock?' FOR SHARE':'')));
 const state=one(await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1'+suffix,[ROUND]));
 const meta=one(await q('SELECT key,value FROM app_meta WHERE key=$1'+suffix,[CLAN_RESUMPTION_STATE_KEY]));
 const days=await q('SELECT * FROM organization_faction_days_v1 WHERE round_id=$1 AND day_key >= $2 ORDER BY day_key'+suffix,[ROUND,DAY]);
 const receipt=(await q('SELECT value FROM app_meta WHERE key=$1',[OP]))[0];
 const history=await q('SELECT session_key,snapshot_json FROM organization_faction_settlements_v1 WHERE round_id=$1 ORDER BY session_key',[ROUND]);
 return {round,policy,state,meta,days,history,receipt:receipt?JSON.parse(receipt.value):null};
}
export function planEvening(before,{now=Date.now(),random}={}){
 assert.equal(factionDayKey(now),DAY,'Re-review the effective day before proceeding');
 assert(now<Date.parse(DAY+'T16:00:00+09:00'),'Only change the future, unopened evening schedule');
 const state=JSON.parse(before.state.state_json),resumption=JSON.parse(before.meta.value);
 assert(activeClanResumption(resumption,now));assert.deepEqual(state.resumption,resumption);
 assert.equal(before.round.scope,'LIVE');assert.equal(before.round.phase,'ASSIGNED');assert.equal(JSON.parse(before.policy.policy_json).mode,'ON');
 assert(!resumption.factionSchedule,'A faction schedule revision already exists; inspect it');
 assert(!['ACTIVE','PAUSED'].includes(state.session?.status),'Preserve the active session');assert(!state.battles.some(b=>b.status==='ACTIVE'));assert.equal(state.sessionQueue.length,0);
 assert(!before.history.some(h=>h.session_key.slice(0,10)>=DAY),'Do not replay a completed day');
 assert(before.days.every(d=>JSON.parse(d.schedule_json).every(s=>s.startsAt>now)),'Only unpublished-start future slots may change');
 const release={...resumption,factionSchedule:{version:RULES.version,effectiveAt:now,operationKey:OP}};
 const keys=[...new Set([DAY,factionDayKey(now+86400000),...before.days.map(d=>d.day_key)])].sort();
 const days=keys.map(day_key=>({round_id:ROUND,day_key,schedule_json:JSON.stringify(createResumedFactionDay(day_key,release,random))}));
 assert(days.every(d=>JSON.parse(d.schedule_json).length===1));
 return {operationKey:OP,authorization:AUTHORIZATION,createdAt:now,release,days,rules:RULES,
  expected:{resumption:hash(before.meta.value),policy:hash(before.policy),days:hash(before.days)},beforeDays:before.days};
}
export async function verifyEvening(db,receipt,{exact=false}={}){
 assert.equal(receipt.operationKey,OP);assert.deepEqual(receipt.rules,RULES);assert.deepEqual(receipt.authorization,AUTHORIZATION);
 const current=await inspectEvening(db),state=JSON.parse(current.state.state_json);
 assert.deepEqual(current.receipt,receipt);assert.deepEqual(JSON.parse(current.meta.value),receipt.release);assert.deepEqual(state.resumption,receipt.release);
 for(const day of receipt.days)assert.deepEqual(current.days.find(d=>d.day_key===day.day_key),day);
 if(exact){assert.equal(hash(current.state.state_json),receipt.afterStateHash);assert.equal(hash(current.history),receipt.historyHash);assert.equal(hash(current.policy),receipt.policyHash);}
 const logs=await qFor(db)('SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]);
 const log=one(logs);assert.equal(String(log.id),receipt.auditId);const recorded=typeof log.after_data==='string'?JSON.parse(log.after_data):log.after_data;
 const {auditId,...withoutId}=receipt;assert.deepEqual(recorded,withoutId);
 return {verified:true,revision:Number(current.state.revision),pendingDays:receipt.days.length,dailyCount:RULES.dailyCount,durationMs:RULES.durationMs,coin:RULES.coinPerRecipient,masterStars:RULES.masterStarsPerRecipient,oldHistoryPreserved:hash(current.history)===receipt.historyHash};
}
export async function applyEvening(db,plan,{commit=false}={}){
 const q=qFor(db),prior=await q('SELECT value FROM app_meta WHERE key=$1',[OP]);
 if(prior.length){const receipt=JSON.parse(one(prior).value);return {replayed:true,committed:true,receipt,verification:await verifyEvening(db,receipt)};}
 assert.equal(plan?.operationKey,OP);assert.deepEqual(plan.rules,RULES);assert.deepEqual(plan.authorization,AUTHORIZATION);
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const duplicate=await q('SELECT value FROM app_meta WHERE key=$1',[OP]);if(duplicate.length){const receipt=JSON.parse(one(duplicate).value),verification=await verifyEvening(db,receipt);await q('ROLLBACK');return {replayed:true,committed:true,receipt,verification};}
  const before=await inspectEvening(db,{lock:true});
  assert.equal(hash(before.meta.value),plan.expected.resumption,'Resumption changed');assert.equal(hash(before.policy),plan.expected.policy,'Policy changed');assert.equal(hash(before.days),plan.expected.days,'Published schedule changed');
  planEvening(before,{now:plan.createdAt,random:()=>0});
  const now=Number(one(await q('SELECT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)*1000 AS now')).now);
  assert.equal(factionDayKey(now),DAY);assert(now<Date.parse(DAY+'T16:00:00+09:00'),'Future-only migration window closed');
  const owner=one(await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(COALESCE(status,'ACTIVE'))='ACTIVE' ORDER BY id LIMIT 1"));
  const state=JSON.parse(before.state.state_json),next=structuredClone(state);
  next.resumption=plan.release;next.scheduleVersion=RULES.version;next.sessionDay=DAY;next.sessionPlan=JSON.parse(one(plan.days.filter(d=>d.day_key===DAY)).schedule_json).map(s=>({...s,status:'SCHEDULED'}));
  for(const day of plan.days){
   const slots=JSON.parse(day.schedule_json);assert.equal(slots.length,1);const slot=slots[0],offset=(slot.startsAt-Date.parse(day.day_key+'T16:00:00+09:00'))/60000;
   assert.deepEqual(slots,createResumedFactionDay(day.day_key,plan.release,()=>offset),'Plan must match the approved time window');
   await q('INSERT INTO organization_faction_days_v1(round_id,day_key,schedule_json) VALUES($1,$2,$3) ON CONFLICT(round_id,day_key) DO UPDATE SET schedule_json=excluded.schedule_json',[ROUND,day.day_key,day.schedule_json]);
  }
  assert.equal((await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(plan.release),CLAN_RESUMPTION_STATE_KEY,before.meta.value])).length,1);
  const updated=one(await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2 AND state_json=$3 RETURNING revision',[JSON.stringify(next),ROUND,before.state.state_json]));
  const preserved=structuredClone(next);for(const key of ['resumption','scheduleVersion','sessionDay','sessionPlan'])preserved[key]=state[key];assert.deepEqual(preserved,state);
  const receipt={operationKey:OP,authorization:AUTHORIZATION,status:'COMPLETED',completedAt:new Date(now).toISOString(),rules:RULES,release:plan.release,days:plan.days,beforeDays:before.days,previousResumption:state.resumption,previousStateRevision:Number(before.state.revision),revision:Number(updated.revision),beforeStateHash:hash(before.state.state_json),afterStateHash:hash(JSON.stringify(next)),historyHash:hash(before.history),policyHash:hash(before.policy),accountWrites:0,messagesSent:0,settlementsReplayed:0};
  const audit=one(await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text',[owner.id,ACTION,'ORGANIZATION_FACTION',OP,JSON.stringify({state:before.state,resumption:before.meta,days:before.days}),JSON.stringify(receipt)]));receipt.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OP,JSON.stringify(receipt)]);
  const verification=await verifyEvening(db,receipt,{exact:true});await q(commit?'COMMIT':'ROLLBACK');return {committed:commit,replayed:false,receipt,verification};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
