import { readRuntimeData, cacheRuntimeData } from './_runtime_data_cache.js';
import { ensureClanCampSchema } from './_clan_prison_camp.js';

export const DEATH_GAME_RULES = Object.freeze({ title: '죽음의 눈치게임', durationMs: 90000, countdownMs: 3000,
  biteIntervalMs: 700, targetBites: 24, warningMs: 650, networkGraceMs: 100, deathLockMs: 300000, maxPlayers: 4 });
const SCHEMA_KEY = 'safe_runtime_upgrade_prison_death_game_20260924_v1';
const ROUND = 'prison_death_rounds_v1', PLAYER = 'prison_death_players_v1', CONTROL = 'prison_death_control_v1', AUDIT = 'prison_death_operator_log_v1';
const rows = r => r?.results || [], changes = r => Number(r?.meta?.changes || 0);
const sqlTime = ms => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
const fail = (message, status = 400, code = 'DEATH_GAME_ERROR') => { throw Object.assign(new Error(message), { status, code }); };
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
export const canOperateDeathGame = user => user?.role === 'OWNER';

export function deathGameSchema(postgres = false) {
  const int = postgres ? 'BIGINT' : 'INTEGER';
  return [
    `CREATE TABLE IF NOT EXISTS ${ROUND}(id TEXT PRIMARY KEY,status TEXT NOT NULL,created_by ${int} NOT NULL,
      created_at_ms ${int} NOT NULL,starts_at_ms ${int} NOT NULL DEFAULT 0,ends_at_ms ${int} NOT NULL DEFAULT 0,
      timeline_json TEXT NOT NULL DEFAULT '[]',start_request_id TEXT NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS ${PLAYER}(round_id TEXT NOT NULL,user_id ${int} NOT NULL,status TEXT NOT NULL,
      joined_at_ms ${int} NOT NULL,bites INTEGER NOT NULL DEFAULT 0,last_seq INTEGER NOT NULL DEFAULT 0,
      last_bite_at_ms ${int} NOT NULL DEFAULT 0,finished_at_ms ${int} NOT NULL DEFAULT 0,
      died_at_ms ${int} NOT NULL DEFAULT 0,blocked_until_ms ${int} NOT NULL DEFAULT 0,
      PRIMARY KEY(round_id,user_id))`,
    `CREATE INDEX IF NOT EXISTS idx_prison_death_player_user ON ${PLAYER}(user_id,blocked_until_ms)`,
    `CREATE TABLE IF NOT EXISTS ${CONTROL}(slot INTEGER PRIMARY KEY,round_id TEXT NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS ${AUDIT}(request_id TEXT PRIMARY KEY,round_id TEXT NOT NULL,operator_id ${int} NOT NULL,action TEXT NOT NULL,at_ms ${int} NOT NULL)`
  ];
}

export async function ensureDeathGameSchema(env) {
  if (readRuntimeData(env, SCHEMA_KEY)) return;
  // Independent gate: an existing foundation marker must not skip this schema.
  await ensureClanCampSchema(env);
  if (!await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA_KEY).first()) {
    const schema = deathGameSchema(env.DB.dialect === 'postgres');
    if (env.DB.dialect === 'postgres') await env.DB.execSchema(schema);
    else await env.DB.batch(schema.map(s => env.DB.prepare(s)));
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO ${CONTROL}(slot,round_id) VALUES(1,'')`),
      env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(SCHEMA_KEY, '1')
    ]);
  }
  cacheRuntimeData(env, SCHEMA_KEY, true, 1800000);
}

export function createDeathGameTimeline(startsAt, random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) {
  const timeline = []; let at = startsAt;
  while (at < startsAt + DEATH_GAME_RULES.durationMs) {
    for (const [type, duration] of [['READING', 1000 + Math.floor(random() * 1800)], ['WARNING', DEATH_GAME_RULES.warningMs], ['WATCHING', 1100 + Math.floor(random() * 1700)]]) {
      timeline.push({ type, startsAt: at, endsAt: at + duration }); at += duration;
    }
  }
  return timeline;
}

export function deathGamePhase(round, now = Date.now()) {
  if (!round) return { type: 'CLOSED', startsAt: 0, endsAt: 0 };
  if (round.status === 'LOBBY') return { type: 'LOBBY', startsAt: 0, endsAt: 0 };
  if (round.status === 'CANCELLED') return { type: 'CANCELLED', startsAt: 0, endsAt: 0 };
  if (now >= Number(round.ends_at_ms)) return { type: 'FINISHED', startsAt: Number(round.ends_at_ms), endsAt: 0 };
  if (now < Number(round.starts_at_ms)) return { type: 'COUNTDOWN', startsAt: Number(round.starts_at_ms) - DEATH_GAME_RULES.countdownMs, endsAt: Number(round.starts_at_ms) };
  const phase = JSON.parse(round.timeline_json).find(p => now >= p.startsAt && now < p.endsAt);
  if (!phase) fail('경기 시각을 확인하지 못했습니다. 다시 연결해 주세요.', 503);
  return phase;
}

const activeRound = env => env.DB.prepare(`SELECT r.* FROM ${CONTROL} c JOIN ${ROUND} r ON r.id=c.round_id WHERE c.slot=1`).first();
// Shared locks allow simultaneous players; only operator start/end waits for them.
const roundLock = (env, id, exclusive = false) => env.DB.prepare(`SELECT id FROM ${ROUND} WHERE id=?${env.DB.dialect === 'postgres' ? exclusive ? ' FOR UPDATE' : ' FOR SHARE' : ''}`).bind(id);
const controlLock = env => env.DB.prepare(`UPDATE ${CONTROL} SET round_id=round_id WHERE slot=1`);
const isOpen = (r, now) => r && (r.status === 'LOBBY' || (r.status === 'RUNNING' && Number(r.ends_at_ms) > now));

export async function deathGameState(env, user, now = Date.now()) {
  await ensureDeathGameSchema(env);
  const round = await activeRound(env);
  if (!round) return { round: null, players: [], me: null, canOperate: canOperateDeathGame(user), serverNow: now, rules: DEATH_GAME_RULES };
  const participants = rows(await env.DB.prepare(`SELECT p.*,u.nickname FROM ${PLAYER} p JOIN users u ON u.id=p.user_id WHERE p.round_id=? AND p.status<>'LEFT'
    ORDER BY CASE WHEN p.status='FINISHED' THEN 0 WHEN p.status='DEAD' THEN 2 ELSE 1 END,p.finished_at_ms,p.bites DESC,p.joined_at_ms,p.user_id`).bind(round.id).all());
  const phase = deathGamePhase(round, now);
  const publicPlayers = participants.map(p => ({ userId: Number(p.user_id), nickname: p.nickname, status: p.status, bites: Number(p.bites),
    lastBiteAt: Number(p.last_bite_at_ms), lastSeq: Number(p.last_seq),
    finishedAt: Number(p.finished_at_ms), diedAt: Number(p.died_at_ms), blockedUntil: Number(p.blocked_until_ms) }));
  const mine = participants.find(p => Number(p.user_id) === Number(user.id));
  return { round: { id: round.id, status: phase.type === 'FINISHED' ? 'FINISHED' : round.status, startsAt: Number(round.starts_at_ms), endsAt: Number(round.ends_at_ms), phase },
    players: publicPlayers, me: mine ? { ...publicPlayers.find(p => p.userId === Number(user.id)), lastSeq: Number(mine.last_seq), nextBiteAt: Number(mine.last_bite_at_ms) + DEATH_GAME_RULES.biteIntervalMs } : null,
    canOperate: canOperateDeathGame(user), serverNow: now, rules: DEATH_GAME_RULES };
}

export async function operateDeathGame(env, user, action, body, now = Date.now()) {
  if (!canOperateDeathGame(user)) fail('OWNER 운영자만 경기를 열거나 시작할 수 있습니다.', 403);
  if (!['open', 'start', 'cancel'].includes(action) || !validId(body.requestId)) fail('운영 요청을 다시 확인하세요.');
  await ensureDeathGameSchema(env);
  const prior = await env.DB.prepare(`SELECT * FROM ${AUDIT} WHERE request_id=?`).bind(body.requestId).first();
  if (prior) {
    if (Number(prior.operator_id) !== Number(user.id) || prior.action !== action || (action !== 'open' && prior.round_id !== body.roundId)) fail('다른 명령에 사용한 요청 번호입니다.', 409);
    return deathGameState(env, user, now);
  }
  const round = await activeRound(env), id = action === 'open' ? body.requestId : body.roundId;
  if (!validId(id)) fail('경기를 다시 선택하세요.');
  if (action === 'open') {
    if (isOpen(round, now)) fail('기존 경기가 열려 있습니다. 종료 후 새 모집을 열어 주세요.', 409);
    await env.DB.batch([
      controlLock(env),
      env.DB.prepare(`INSERT OR IGNORE INTO ${ROUND}(id,status,created_by,created_at_ms)
        SELECT ?,'LOBBY',?,? WHERE NOT EXISTS(SELECT 1 FROM ${CONTROL} c JOIN ${ROUND} r ON r.id=c.round_id WHERE c.slot=1 AND (r.status='LOBBY' OR (r.status='RUNNING' AND r.ends_at_ms>?)))`).bind(id, user.id, now, now),
      env.DB.prepare(`UPDATE ${CONTROL} SET round_id=? WHERE slot=1 AND EXISTS(SELECT 1 FROM ${ROUND} WHERE id=? AND created_by=? AND status='LOBBY')`).bind(id, id, user.id),
      env.DB.prepare(`INSERT OR IGNORE INTO ${AUDIT}(request_id,round_id,operator_id,action,at_ms) SELECT ?,?,?,'open',? WHERE EXISTS(SELECT 1 FROM ${CONTROL} WHERE slot=1 AND round_id=?)`).bind(body.requestId, id, user.id, now, id)
    ]);
  } else {
    if (!round || round.id !== id) fail('현재 경기가 변경되었습니다.', 409);
    const startsAt = now + DEATH_GAME_RULES.countdownMs;
    await env.DB.batch([
      roundLock(env, id, true),
      action === 'start'
        ? env.DB.prepare(`UPDATE ${ROUND} SET status='RUNNING',starts_at_ms=?,ends_at_ms=?,timeline_json=?,start_request_id=?
            WHERE id=? AND status='LOBBY' AND (SELECT COUNT(*) FROM ${PLAYER} WHERE round_id=? AND status='WAITING')>=2`)
          .bind(startsAt, startsAt + DEATH_GAME_RULES.durationMs, JSON.stringify(createDeathGameTimeline(startsAt)), body.requestId, id, id)
        : env.DB.prepare(`UPDATE ${ROUND} SET status='CANCELLED',ends_at_ms=?,start_request_id=? WHERE id=? AND status IN ('LOBBY','RUNNING')`).bind(now, body.requestId, id),
      env.DB.prepare(`UPDATE ${PLAYER} SET status=? WHERE round_id=? AND status='WAITING' AND EXISTS(SELECT 1 FROM ${ROUND} WHERE id=? AND start_request_id=?)`)
        .bind(action === 'start' ? 'ALIVE' : 'LEFT', id, id, body.requestId),
      env.DB.prepare(`INSERT OR IGNORE INTO ${AUDIT}(request_id,round_id,operator_id,action,at_ms) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${ROUND} WHERE id=? AND start_request_id=?)`)
        .bind(body.requestId, id, user.id, action, now, id, body.requestId)
    ]);
  }
  if (!await env.DB.prepare(`SELECT 1 FROM ${AUDIT} WHERE request_id=?`).bind(body.requestId).first()) fail(action === 'start' ? '대기 중인 참가자가 2명 이상일 때 시작할 수 있습니다.' : '경기 상태가 바뀌었습니다. 다시 확인하세요.', 409);
  return deathGameState(env, user, now);
}

export async function joinDeathGame(env, user, body, leave = false, now = Date.now()) {
  await ensureDeathGameSchema(env);
  if (!validId(body.roundId)) fail('경기를 다시 선택하세요.');
  const round = await activeRound(env);
  if (!round || round.id !== body.roundId || round.status !== 'LOBBY') fail('운영자가 참가 모집을 열었을 때만 입장할 수 있습니다.', 409);
  if (!leave && body.acceptDeathPenalty !== true) fail('사망 시 숲켓몬 전체 플레이 5분 제한에 동의한 후 참가하세요.');
  const result = await env.DB.batch([
    roundLock(env, round.id, true),
    leave ? env.DB.prepare(`UPDATE ${PLAYER} SET status='LEFT' WHERE round_id=? AND user_id=? AND status='WAITING' AND EXISTS(SELECT 1 FROM ${ROUND} WHERE id=? AND status='LOBBY')`).bind(round.id, user.id, round.id)
      : env.DB.prepare(`INSERT INTO ${PLAYER}(round_id,user_id,status,joined_at_ms)
        SELECT ?,?,'WAITING',? WHERE EXISTS(SELECT 1 FROM ${ROUND} WHERE id=? AND status='LOBBY')
        AND (SELECT COUNT(*) FROM ${PLAYER} WHERE round_id=? AND status='WAITING')<?
        ON CONFLICT(round_id,user_id) DO UPDATE SET status='WAITING',joined_at_ms=excluded.joined_at_ms WHERE ${PLAYER}.status='LEFT'`)
        .bind(round.id, user.id, now, round.id, round.id, DEATH_GAME_RULES.maxPlayers)
  ]);
  if (!leave && !changes(result[1]) && !await env.DB.prepare(`SELECT 1 FROM ${PLAYER} WHERE round_id=? AND user_id=? AND status='WAITING'`).bind(round.id, user.id).first()) fail('참가 정원이 찼거나 경기가 시작되었습니다.', 409);
  return deathGameState(env, user, now);
}

export async function biteDeathGame(env, user, body, now = Date.now()) {
  await ensureDeathGameSchema(env);
  if (!validId(body.roundId) || !Number.isSafeInteger(body.seq) || body.seq < 1) fail('식사 요청 번호가 올바르지 않습니다.');
  const round = await activeRound(env);
  if (!round || round.id !== body.roundId || round.status !== 'RUNNING') fail('진행 중인 경기가 아닙니다.', 409);
  const player = await env.DB.prepare(`SELECT * FROM ${PLAYER} WHERE round_id=? AND user_id=?`).bind(round.id, user.id).first();
  if (!player) fail('이 경기의 참가자가 아닙니다.', 403);
  if (body.seq <= Number(player.last_seq)) return deathGameState(env, user, now); // lost response: never eat/kill twice
  if (body.seq !== Number(player.last_seq) + 1) fail('요청 순서가 달라졌습니다. 경기 상태를 다시 확인하세요.', 409);
  if (player.status !== 'ALIVE') return deathGameState(env, user, now);
  const phase = deathGamePhase(round, now);
  if (['COUNTDOWN', 'FINISHED', 'CANCELLED'].includes(phase.type)) fail('지금은 식사할 수 없습니다.', 409);
  if (now < Number(player.last_bite_at_ms) + DEATH_GAME_RULES.biteIntervalMs) fail('너무 빠른 입력입니다. 잠시 후 다시 시도하세요.', 429, 'DEATH_GAME_TOO_FAST');
  // Only server receipt time counts. Small, fixed grace is shared by all players;
  // the browser cannot submit a fake time, win, progress, death or cooldown.
  const dead = phase.type === 'WATCHING' && now >= phase.startsAt + DEATH_GAME_RULES.networkGraceMs;
  const bites = Number(player.bites) + (dead ? 0 : 1), finished = !dead && bites >= DEATH_GAME_RULES.targetBites;
  const status = dead ? 'DEAD' : finished ? 'FINISHED' : 'ALIVE';
  const eventId = `DEATH_GAME:${round.id}:${user.id}`;
  const updated = env.DB.prepare(`UPDATE ${PLAYER} SET status=?,bites=?,last_seq=?,last_bite_at_ms=?,finished_at_ms=?,died_at_ms=?,blocked_until_ms=?
    WHERE round_id=? AND user_id=? AND status='ALIVE' AND last_seq=?
    AND EXISTS(SELECT 1 FROM ${ROUND} WHERE id=? AND status='RUNNING' AND starts_at_ms<=? AND ends_at_ms>?)`)
    .bind(status, bites, body.seq, now, finished ? now : 0, dead ? now : 0, dead ? now + DEATH_GAME_RULES.deathLockMs : 0, round.id, user.id, body.seq - 1, round.id, now, now);
  const statements = [roundLock(env, round.id), updated];
  if (dead) statements.push(
    env.DB.prepare(`INSERT OR IGNORE INTO event_prison_camps(event_id,source_type,title,reason,jailed_at,jailed_until)
      SELECT ?,'DEATH_GAME','죽음의 눈치게임','사망하였습니다. 숲켓몬 전체 플레이가 5분간 제한됩니다.',?,?
      WHERE EXISTS(SELECT 1 FROM ${PLAYER} WHERE round_id=? AND user_id=? AND status='DEAD' AND last_seq=?)`)
      .bind(eventId, sqlTime(now), sqlTime(now + DEATH_GAME_RULES.deathLockMs), round.id, user.id, body.seq),
    env.DB.prepare(`INSERT OR IGNORE INTO event_prison_captives(event_id,user_id,member_role)
      SELECT ?,?,'PLAYER' WHERE EXISTS(SELECT 1 FROM event_prison_camps WHERE event_id=?)`).bind(eventId, user.id, eventId)
  );
  await env.DB.batch(statements);
  return deathGameState(env, user, now);
}

export function deathGameBlockedPath(path) {
  // Gameplay endpoints that normally bypass the prison gate need the same death restriction.
  return path.startsWith('prison') || path.startsWith('coup/') || path === 'user/runtime-command';
}

export async function handlePrisonDeathGame({ path, request, env, deps }) {
  const base = 'prison-death-game/', admin = 'admin/prison-death-game/';
  if (!path.startsWith(base) && !path.startsWith(admin)) return null;
  const user = await deps.authenticate(request, env);
  if (!user) return deps.json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const operatorRoute = path.startsWith(admin), action = path.slice((operatorRoute ? admin : base).length);
    if (operatorRoute && !canOperateDeathGame(user)) fail('OWNER 운영자만 이용할 수 있습니다.', 403);
    if (action === 'status' && request.method === 'GET') return deps.json(await deathGameState(env, user));
    if (request.method !== 'POST') fail('지원하지 않는 요청입니다.', 405);
    const body = await deps.readBody(request);
    if (operatorRoute) return deps.json(await operateDeathGame(env, user, action, body));
    const prison = await deps.prisonStatusForUser(env, user.id);
    if (prison.incarcerated && prison.facility !== 'CLAN_CAMP') return deps.json({ error: prison.reason || '현재 플레이가 제한되어 있습니다.', code: 'USER_INCARCERATED', prison }, 423);
    if (action === 'join' || action === 'leave') return deps.json(await joinDeathGame(env, user, body, action === 'leave'));
    if (action === 'bite') return deps.json(await biteDeathGame(env, user, body));
    fail('지원하지 않는 요청입니다.', 405);
  } catch (error) {
    if (!error.status) throw error;
    return deps.json({ error: error.message, code: error.code || 'DEATH_GAME_ERROR' }, error.status);
  }
}

export const __deathGameTest = { SCHEMA_KEY, ROUND, PLAYER, CONTROL, AUDIT };
