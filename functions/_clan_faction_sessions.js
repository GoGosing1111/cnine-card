import {FACTION_SESSION_RULES as R, factionPolicy, factionTime as time, factionDayKey, createFactionDay, factionSessionRewards} from '../shared/clan-faction-sessions-v1.mjs';
import {newFactionState, advanceFactionState, finishFactionBattle, factionEvent, upgradeFactionCooldowns} from './_clan_faction_model.js';
import {readRuntimeData, cacheRuntimeData} from './_runtime_data_cache.js';

const SCHEMA = 'clan_faction_sessions_schema_20260921_v1';
const rows = result => result?.results || [];
const p = (env, sql, ...values) => env.DB.prepare(sql).bind(...values);
export function factionSessionSchema(postgres = false) {
  const int = postgres ? 'BIGINT' : 'INTEGER';
  return [
    'CREATE TABLE IF NOT EXISTS clan_faction_days_v1(day_key TEXT PRIMARY KEY, schedule_json TEXT NOT NULL)',
    `CREATE TABLE IF NOT EXISTS clan_faction_session_owners_v1(session_key TEXT PRIMARY KEY,season_id ${int} NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS clan_faction_sessions_v1(session_key TEXT PRIMARY KEY,season_id ${int} NOT NULL,status TEXT NOT NULL,starts_ms ${int} NOT NULL,ends_ms ${int} NOT NULL,closed_ms ${int} NOT NULL,snapshot_json TEXT NOT NULL,recipient_count INTEGER NOT NULL,reward_count INTEGER NOT NULL CHECK(reward_count=recipient_count))`,
    'CREATE INDEX IF NOT EXISTS idx_faction_sessions_season ON clan_faction_sessions_v1(season_id,ends_ms)',
  ];
}
export async function ensureFactionSessionSchema(env) {
  if (readRuntimeData(env, SCHEMA)) return;
  const marker = await p(env, 'SELECT value FROM app_meta WHERE key=?', SCHEMA).first();
  if (!marker) {
    // This independent gate also runs on databases that already have the old foundation marker.
    const schema = factionSessionSchema(env.DB.dialect === 'postgres');
    if (env.DB.dialect === 'postgres') await env.DB.execSchema(schema);
    else await env.DB.batch(schema.map(sql => env.DB.prepare(sql)));
    await p(env, 'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING', SCHEMA, '1').run();
  }
  if (env.DB.dialect === 'postgres') {
    const required = {users:['coin'], user_message_rewards:['reward_amount'], user_message_reward_claim_receipts_v1222:['reward_amount','balance_before','balance_after'], coin_logs:['change_amount','balance_after']};
    const columns = rows(await p(env, "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN ('users','user_message_rewards','user_message_reward_claim_receipts_v1222','coin_logs')").all());
    for (const [table, names] of Object.entries(required)) for (const name of names)
      if (!columns.some(c => c.table_name === table && c.column_name === name && c.data_type === 'bigint'))
        throw Error(`FACTION_REWARD_BIGINT_REQUIRED:${table}.${name}`);
  }
  cacheRuntimeData(env, SCHEMA, true, 1800000);
}
async function scheduleFor(env, now, deps) {
  const key = factionDayKey(now);
  const cacheKey = `faction-day:${key}`;
  const cached = readRuntimeData(env, cacheKey);
  if (cached) return structuredClone(cached);
  let row = await p(env, 'SELECT schedule_json FROM clan_faction_days_v1 WHERE day_key=?', key).first();
  if (!row) {
    await p(env, 'INSERT INTO clan_faction_days_v1(day_key,schedule_json) VALUES(?,?) ON CONFLICT(day_key) DO NOTHING', key, JSON.stringify(createFactionDay(key, deps.randomFactionSchedule))).run();
    row = await p(env, 'SELECT schedule_json FROM clan_faction_days_v1 WHERE day_key=?', key).first();
  }
  const schedule = JSON.parse(row.schedule_json);
  // Only immutable published schedules are cached, never game state or rewards.
  cacheRuntimeData(env, cacheKey, schedule, 86400000);
  return structuredClone(schedule);
}
export function factionTerritoryBlockSql(env) {
  const due = env.DB.dialect === 'postgres'
    ? 'CAST(starts_at AS timestamptz)<=CAST(? AS timestamptz)'
    : 'julianday(starts_at)<=julianday(?)';
  return `(status='ACTIVE' OR (status='PREPARING' AND ${due}))`;
}
function closeBattles(state, at, reason) {
  for (const battle of [...state.battles]) if (battle.status === 'ACTIVE')
    finishFactionBattle(state, battle, battle.defender, reason, at);
}
function interruptionAt(wars, session, now) {
  let cutoff = Infinity;
  for (const war of wars) {
    const start = Number.isFinite(time(war.starts_at)) ? time(war.starts_at) : now;
    const end = ['ACTIVE','PREPARING'].includes(war.status) ? Infinity : time(war.settled_at || war.ends_at);
    if (start <= now && start < session.endsAt && end > session.startsAt)
      cutoff = Math.min(cutoff, Math.max(start, session.startsAt));
  }
  return cutoff;
}
function territoryIntervals(wars, now) {
  const intervals = wars.map(w => ({
    start:Number.isFinite(time(w.starts_at)) ? time(w.starts_at) : now,
    end:['ACTIVE','PREPARING'].includes(w.status) ? Infinity : time(w.settled_at || w.ends_at),
  })).filter(w => w.start <= now && w.end > w.start).sort((a,b) => a.start-b.start);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end,interval.end);
    else merged.push({...interval});
  }
  return merged;
}
function freezeFactionTimers(state, pauseAt, duration) {
  for (const battle of state.battles) if (battle.status === 'ACTIVE' && battle.endsAt > pauseAt) battle.endsAt += duration;
  for (const district of state.districts) if (district.protectedUntil > pauseAt) district.protectedUntil += duration;
  for (const field of ['squadReady','targetReady','strikeReady'])
    for (const key of Object.keys(state[field])) if (state[field][key] > pauseAt) state[field][key] += duration;
}
function reconcilePauses(state, wars, now, endAt) {
  const session = state.session;
  let cursor = session.lastResumedAt ?? session.startsAt;
  const intervals = territoryIntervals(wars,now);
  if (session.status === 'PAUSED' && !intervals.some(w => w.start <= session.pausedAt && w.end > session.pausedAt))
    throw Object.assign(Error('중단된 세력전의 영토전 종료 기록을 확인하지 못했습니다.'),{status:409});
  for (const war of intervals) {
    if (war.end <= cursor) continue;
    const pauseAt = session.status === 'PAUSED' ? session.pausedAt : Math.max(war.start,cursor);
    if (pauseAt >= session.endsAt || pauseAt >= endAt) break;
    if (session.status !== 'PAUSED') {
      advanceFactionState(state,pauseAt,endAt);
      session.status = 'PAUSED'; session.pausedAt = pauseAt;
      session.pauses ||= []; session.pauses.push({startsAt:pauseAt,endsAt:null});
      factionEvent(state,{id:`pause:${session.key}:${pauseAt}`,kind:'SESSION_PAUSED',at:pauseAt});
    }
    if (war.end > now || war.end >= endAt) break;
    const duration = war.end-session.pausedAt;
    freezeFactionTimers(state,session.pausedAt,duration);
    session.endsAt += duration;
    session.pausedTotalMs = (session.pausedTotalMs || 0)+duration;
    session.pauses.at(-1).endsAt = war.end;
    session.lastResumedAt = war.end; delete session.pausedAt;
    session.status = 'ACTIVE'; cursor = war.end;
    factionEvent(state,{id:`resume:${session.key}:${war.end}`,kind:'SESSION_RESUMED',at:war.end});
  }
  const slot = state.sessionPlan?.find(s => s.key === session.key);
  if (slot && (slot.endsAt !== session.endsAt || slot.status !== session.status)) { slot.plannedEndsAt ??= slot.endsAt; slot.endsAt = session.endsAt; slot.status = session.status; }
  if (session.status === 'ACTIVE') advanceFactionState(state,now,endAt);
}
function closeSession(state, session, at, reason, roster, policy) {
  closeBattles(state, at, reason);
  const payable = reason === 'SESSION_END' || (reason === 'TERRITORY_WAR' && policy.interruption === 'SETTLE');
  const result = factionSessionRewards(state.districts, roster, session.participants || [], policy,session.participantClans);
  const snapshot = {...session, status:payable ? 'SETTLED' : 'CANCELLED', closedAt:at, reason,
    holdings:result.holdings, recipients:payable ? result.recipients : [],
    districts:state.districts.map(d => ({id:d.id,owner:d.owner})), recipientPolicy:policy.recipients};
  state.session = {...snapshot};
  state.sessionHistory = [snapshot, ...(state.sessionHistory || [])].slice(0, 8);
  const slot = state.sessionPlan?.find(s => s.key === session.key); if (slot) slot.status = snapshot.status;
  factionEvent(state, {id:`session:${session.key}`,kind:'SESSION_END',at,reason,recipients:snapshot.recipients.length});
  return snapshot;
}
function sessionView(state, schedule, now, season, blocked) {
  const current = state.session;
  const active = !blocked && season.phase === 'ACTIVE' && current?.status === 'ACTIVE' && current.startsAt <= now && now < current.endsAt;
  const upcoming = state.sessionPlan?.find(s => s.status === 'SCHEDULED' && s.startsAt > now);
  return {enabled:true, active, blockedByTerritory:blocked,
    state:blocked ? 'TERRITORY_WAR' : active ? 'ACTIVE' : upcoming || state.sessionQueue?.length ? 'WAITING' : 'CLOSED',
    current:current ? {key:current.key,dayKey:current.dayKey,ordinal:current.ordinal,startsAt:current.startsAt,endsAt:current.endsAt,status:current.status,reason:current.reason,
      pausedAt:current.pausedAt || null,remainingMs:Math.max(0,current.endsAt-(current.pausedAt || now)),pausedTotalMs:current.pausedTotalMs || 0,deferred:Boolean(current.deferred)} : null,
    schedule:state.sessionPlan || schedule, nextStartsAt:upcoming?.startsAt || null,
    queue:(state.sessionQueue || []).map(s=>({key:s.key,dayKey:s.dayKey,ordinal:s.ordinal,status:'QUEUED'})),
    history:(state.sessionHistory || []).map(({participants, participantClans, districts, recipients, ...snapshot}) => ({...snapshot,recipientCount:recipients.length})), rules:R};
}
function settlementStatements(env, season, token, snapshot) {
  const key = `faction-session:${snapshot.key}`, statements = [];
  for (const recipient of snapshot.recipients) {
    const body = `${snapshot.dayKey} 세력전 ${snapshot.ordinal}회차 종료 시 ${recipient.territories}개 영토를 점령했습니다. 회차 보상 ${recipient.amount.toLocaleString('ko-KR')} 코인을 수령하세요.`;
    statements.push(p(env, `INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key)
      SELECT ?,'SYSTEM',?,?,'COIN_REWARD',? FROM clan_faction_state WHERE season_id=? AND last_action=?`,
      recipient.userId,'세력전 점령 보상',body,key,season.id,token));
    statements.push(p(env, `INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount)
      SELECT m.id,m.user_id,'COIN',? FROM user_messages m JOIN clan_faction_state f ON f.season_id=? AND f.last_action=?
      WHERE m.campaign_key=? AND m.user_id=?`,recipient.amount,season.id,token,key,recipient.userId));
  }
  // The CHECK constraint rolls back the state and all messages if a recipient/reward insert was lost.
  statements.push(p(env, `INSERT INTO clan_faction_sessions_v1(session_key,season_id,status,starts_ms,ends_ms,closed_ms,snapshot_json,recipient_count,reward_count)
    SELECT ?,?,?,?,?,?,?,?,(SELECT COUNT(*) FROM user_message_rewards r JOIN user_messages m ON m.id=r.message_id WHERE m.campaign_key=?)
    FROM clan_faction_state WHERE season_id=? AND last_action=?`,
    snapshot.key,season.id,snapshot.status,snapshot.startsAt,snapshot.endsAt,snapshot.closedAt,JSON.stringify(snapshot),snapshot.recipients.length,key,season.id,token));
  return statements;
}

export async function syncFactionSessions(env, season, deps = {}) {
  const policy = factionPolicy(deps.factionSessionPolicy);
  if (!policy) return null; // OFF means zero schema, schedule, reward or account writes.
  const settings = await p(env,"SELECT value FROM app_meta WHERE key='clan_settings_v1'").first();
  if(JSON.parse(settings?.value || '{}').mode!=='ON')throw Object.assign(Error('세력전 회차 운영은 공개 모드에서만 가능합니다.'),{status:503});
  await ensureFactionSessionSchema(env);
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = deps.now ? deps.now() : Date.now();
    if (now < policy.effectiveAt) return null;
    const schedule = await scheduleFor(env, now, deps);
    const fresh = await p(env, 'SELECT * FROM clan_seasons WHERE id=?',season.id).first();
    if (fresh) season = fresh;
    const endAt = time(season.ends_at);
    let [row, warsResult, rosterResult, ownersResult] = await Promise.all([
      p(env, 'SELECT * FROM clan_faction_state WHERE season_id=?',season.id).first(),
      p(env, "SELECT id,status,starts_at,ends_at,settled_at FROM territory_war_v3_rounds WHERE status IN ('ACTIVE','PREPARING') OR id IN (SELECT id FROM territory_war_v3_rounds WHERE status='FINISHED' ORDER BY id DESC LIMIT 32)").all(),
      p(env, 'SELECT user_id,clan_id FROM clan_members WHERE season_id=? ORDER BY user_id',season.id).all(),
      p(env, 'SELECT session_key,season_id FROM clan_faction_session_owners_v1 WHERE session_key IN (?,?)',...schedule.map(s=>s.key)).all(),
    ]);
    if (!row) {
      await p(env, 'INSERT INTO clan_faction_state(season_id,state_json) VALUES(?,?) ON CONFLICT(season_id) DO NOTHING',season.id,JSON.stringify(newFactionState(Math.min(now,endAt)))).run();
      row = await p(env, 'SELECT * FROM clan_faction_state WHERE season_id=?',season.id).first();
    }
    const wars = rows(warsResult), activeWars = wars.filter(w => w.status === 'ACTIVE' || (w.status === 'PREPARING' && time(w.starts_at) <= now)).length;
    const roster = rows(rosterResult).map(m => ({userId:Number(m.user_id),clanId:Number(m.clan_id)}));
    const state = upgradeFactionCooldowns(JSON.parse(row.state_json)), settlements = [], opened = [], owners = rows(ownersResult);
    if (!state.taxDisabledAt) {
      advanceFactionState(state, Math.min(now,policy.effectiveAt), endAt);
      state.taxDisabledAt = policy.effectiveAt;
      closeBattles(state,Math.min(now,policy.effectiveAt),'SESSION_MIGRATION');
    }
    const resumable = policy.interruption === 'PAUSE' && ['ACTIVE','PAUSED'].includes(state.session?.status);
    if (resumable) reconcilePauses(state,wars,now,endAt);
    else advanceFactionState(state,now,endAt);
    if (['ACTIVE','PAUSED'].includes(state.session?.status)) {
      const session = state.session, interrupted = interruptionAt(wars,session,now);
      if (!resumable && interrupted < session.endsAt) settlements.push(closeSession(state,session,interrupted,'TERRITORY_WAR',roster,policy));
      else if (endAt < session.endsAt && endAt <= now) settlements.push(closeSession(state,session,endAt,'SEASON_END',roster,policy));
      else if (session.status === 'ACTIVE' && session.endsAt <= now) settlements.push(closeSession(state,session,session.endsAt,'SESSION_END',roster,policy));
      else if (season.phase !== 'ACTIVE' || now >= endAt) settlements.push(closeSession(state,session,Math.min(now,endAt),'SEASON_END',roster,policy));
    }
    state.sessionQueue ||= [];
    const busy = () => ['ACTIVE','PAUSED'].includes(state.session?.status);
    const overlaps = slot => busy() || state.sessionQueue.length || (state.session?.key !== slot.key && state.session?.closedAt > slot.startsAt);
    const queueSlot = slot => {
      slot.status='QUEUED';slot.reason='PREVIOUS_SESSION';
      if (!state.sessionQueue.some(s=>s.key===slot.key)) state.sessionQueue.push({...slot,plannedStartsAt:slot.startsAt,plannedEndsAt:slot.endsAt});
      state.sessionQueue.sort((a,b)=>a.plannedStartsAt-b.plannedStartsAt);
    };
    const openSlot = slot => {
      if (policy.mapPolicy === 'RESET') {
        state.districts = newFactionState(now).districts;
        state.squadReady = {}; state.targetReady = {}; state.strikeReady = {};
      }
      state.session = {...slot,status:'ACTIVE',participants:[],participantClans:{}};
      const displayed=state.sessionPlan?.find(s=>s.key===slot.key);
      if(displayed)Object.assign(displayed,slot,{status:'ACTIVE'});
      if(!owners.some(o=>o.session_key===slot.key))opened.push(slot.key);
      factionEvent(state,{id:`start:${slot.key}`,kind:'SESSION_START',at:slot.startsAt});
    };
    if (state.sessionDay !== factionDayKey(now)) {
      // Preserve yesterday's deferred second round even if no request arrived at its scheduled start.
      if(policy.overlap==='DEFER' && season.phase==='ACTIVE')for(const slot of state.sessionPlan || [])
        if(slot.status==='SCHEDULED' && slot.startsAt<=now && slot.startsAt>=policy.effectiveAt && overlaps(slot))queueSlot(slot);
      state.sessionDay = factionDayKey(now);
      state.sessionPlan = schedule.map(s => ({...s,status:'SCHEDULED'}));
    }
    for (const slot of state.sessionPlan) {
      if (slot.status !== 'SCHEDULED') continue;
      if(owners.some(o=>o.session_key===slot.key&&Number(o.season_id)!==Number(season.id))){slot.status='SKIPPED';slot.reason='ALREADY_USED';continue;}
      if (slot.startsAt < policy.effectiveAt || slot.endsAt > endAt || season.phase !== 'ACTIVE') {
        slot.status = 'SKIPPED'; slot.reason = 'UNAVAILABLE_WINDOW'; continue;
      }
      if (slot.startsAt > now) continue;
      if (overlaps(slot)) {
        if(policy.overlap==='DEFER')queueSlot(slot);
        else{slot.status='SKIPPED';slot.reason='PREVIOUS_SESSION';}
        continue;
      }
      if (slot.endsAt <= now) {
        slot.status='SKIPPED';slot.reason='UNAVAILABLE_WINDOW';continue;
      }
      if (activeWars || interruptionAt(wars,slot,now) < slot.endsAt) {
        slot.status = 'SKIPPED'; slot.reason = 'TERRITORY_WAR'; continue;
      }
      openSlot(slot);
    }
    if(season.phase!=='ACTIVE' || now>=endAt)state.sessionQueue=[];
    while(!busy() && !activeWars && state.sessionQueue.length){
      const queued=state.sessionQueue.shift(),displayed=state.sessionPlan.find(s=>s.key===queued.key);
      const owner=await p(env,'SELECT season_id FROM clan_faction_session_owners_v1 WHERE session_key=?',queued.key).first();
      if(owner || now+R.durationMs>endAt){
        if(displayed){displayed.status='SKIPPED';displayed.reason=owner?'ALREADY_USED':'SEASON_END';}
        continue;
      }
      // Deferred windows start only after the preceding close, and always receive a fresh full 3h.
      openSlot({...queued,startsAt:now,endsAt:now+R.durationMs,deferred:true});
    }
    const view = sessionView(state,schedule,now,season,activeWars > 0);
    if (JSON.stringify(state) === row.state_json) return {row:{...row,state},view,policy};
    const token = crypto.randomUUID();
    // Roster fingerprint and state revision protect a delayed close against transfers and combat races.
    const rosterGuard = roster.length ? ` AND (SELECT COUNT(*) FROM clan_members WHERE season_id=?)=? AND NOT EXISTS(SELECT 1 FROM clan_members WHERE season_id=? AND NOT (${roster.map(() => '(user_id=? AND clan_id=?)').join(' OR ')}))` : ' AND NOT EXISTS(SELECT 1 FROM clan_members WHERE season_id=?)';
    const rosterValues = roster.length ? [season.id,roster.length,season.id,...roster.flatMap(m=>[m.userId,m.clanId])] : [season.id];
    const updates = [p(env, `UPDATE clan_faction_state SET state_json=?,revision=revision+1,last_action=? WHERE season_id=? AND revision=?
      AND EXISTS(SELECT 1 FROM clan_seasons WHERE id=? AND phase=? AND ends_at=?)
      AND (SELECT COUNT(*) FROM territory_war_v3_rounds WHERE ${factionTerritoryBlockSql(env)})=?${rosterGuard}`,
      JSON.stringify(state),token,season.id,row.revision,season.id,season.phase,season.ends_at,new Date(now).toISOString(),activeWars,...rosterValues),
      ...opened.map(key=>p(env,'INSERT INTO clan_faction_session_owners_v1(session_key,season_id) SELECT ?,? FROM clan_faction_state WHERE season_id=? AND last_action=?',key,season.id,season.id,token)),
      ...settlements.flatMap(snapshot=>settlementStatements(env,season,token,snapshot))];
    let result;
    try { result = await env.DB.batch(updates); }
    catch (error) {
      // Another season can claim the same global slot while this transaction waits.
      // The unique owner key rolls everything back; re-read instead of opening twice.
      if (/clan_faction_session_owners_v1/.test(error.message) && /unique|duplicate/i.test(error.message)) continue;
      throw error;
    }
    if (Number(result[0]?.meta?.changes) > 0) return {row:{...row,revision:Number(row.revision)+1,state},view,policy};
  }
  throw Object.assign(Error('세력전 종료 집계 중입니다. 잠시 후 다시 확인하세요.'),{status:409});
}

export async function reconcileFactionSessions(env, options = {}) {
  if (!factionPolicy(options.factionSessionPolicy)) return {enabled:false};
  const settings = await p(env, "SELECT value FROM app_meta WHERE key='clan_settings_v1'").first();
  if (JSON.parse(settings?.value || '{}').mode !== 'ON') return {enabled:true,mode:'DISABLED'};
  const {ensureFactionSchema} = await import('./_clan_faction.js');
  await ensureFactionSchema(env);
  await ensureFactionSessionSchema(env);
  // A new draft/season must not strand the preceding season's open settlement.
  const seasons = rows(await p(env, `SELECT s.* FROM clan_seasons s
    WHERE s.id=(SELECT id FROM clan_seasons ORDER BY season_no DESC LIMIT 1)
      OR EXISTS(SELECT 1 FROM clan_faction_session_owners_v1 o
        LEFT JOIN clan_faction_sessions_v1 done ON done.session_key=o.session_key
        WHERE o.season_id=s.id AND done.session_key IS NULL)
    ORDER BY s.season_no`).all());
  if (!seasons.length) return {enabled:true,mode:'NO_SEASON'};
  let synced;
  for (const season of seasons) synced = await syncFactionSessions(env,season,options);
  return {enabled:true,session:synced?.view || null};
}
