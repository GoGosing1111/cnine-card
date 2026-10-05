import { readRuntimeData, cacheRuntimeData } from './_runtime_data_cache.js';

export const PRISON_HUNGER_RULES = Object.freeze({ intervalMs: 30 * 60 * 1000, mealCoin: 10_000_000_000, visitorsOnly: true, facility: 'PRISON' });
const STATE = 'prison_hunger_v20261005', MEAL = 'prison_meals_v20261005';
const SCHEMA = 'safe_runtime_upgrade_prison_hunger_20261005', EPOCH = 'prison_hunger_started_at_20261005';
const rows = result => result?.results || [];
const sqlTime = ms => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
const time = value => Date.parse(String(value || '').includes('T') ? value : String(value || '').replace(' ', 'T') + 'Z');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{8,120}$/.test(value);
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

export function prisonHungerSchema(postgres = false) {
  const int = postgres ? 'BIGINT' : 'INTEGER';
  return [
    `CREATE TABLE IF NOT EXISTS ${STATE}(case_id TEXT PRIMARY KEY,inmate_user_id ${int} NOT NULL,
      started_at_ms ${int} NOT NULL,deadline_ms ${int} NOT NULL,last_fed_at_ms ${int} NOT NULL DEFAULT 0,
      died_at_ms ${int} NOT NULL DEFAULT 0,acknowledged_death_ms ${int} NOT NULL DEFAULT 0,meal_version INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_prison_hunger_user ON ${STATE}(inmate_user_id)`,
    `CREATE TABLE IF NOT EXISTS ${MEAL}(request_id TEXT PRIMARY KEY,attempt_token TEXT NOT NULL,case_id TEXT NOT NULL,
      inmate_user_id ${int} NOT NULL,sender_user_id ${int} NOT NULL,coin ${int} NOT NULL,
      previous_deadline_ms ${int} NOT NULL,previous_version INTEGER NOT NULL,delivered_at_ms ${int} NOT NULL)`
  ];
}

export async function ensurePrisonHungerFoundation(env, now = Date.now()) {
  const cached = readRuntimeData(env, SCHEMA);
  if (cached) return Number(cached);
  const marker = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA).first();
  if (!marker) {
    const schema = prisonHungerSchema(env.DB.dialect === 'postgres');
    if (env.DB.dialect === 'postgres') await env.DB.execSchema(schema);
    else await env.DB.batch(schema.map(sql => env.DB.prepare(sql)));
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(EPOCH, String(now)),
      env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value) VALUES(?,?)').bind(SCHEMA, '1')
    ]);
  }
  const epoch = Number((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(EPOCH).first())?.value);
  if (!Number.isSafeInteger(epoch) || epoch <= 0) fail('감옥 식사 시작 시각을 확인하지 못했습니다.', 503);
  cacheRuntimeData(env, SCHEMA, epoch, 1800000);
  return epoch;
}

// Only disciplinary prison records are eligible. Camp/death-game sentences never enter this table.
const activeCases = `SELECT c.case_id,p.user_id,p.jailed_at,p.jailed_until,h.deadline_ms,h.died_at_ms FROM user_prison_status p
  JOIN prison_release_cases_v2031 c ON c.inmate_user_id=p.user_id AND c.status='ACTIVE'
  LEFT JOIN ${STATE} h ON h.case_id=c.case_id
  WHERE p.active=1 AND p.jailed_until>?`;

async function reconcile(env, userIds, now) {
  const epoch = await ensurePrisonHungerFoundation(env, now);
  const ids = [...new Set(userIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  const cases = rows(await env.DB.prepare(`${activeCases} AND p.user_id IN (${ids.map(() => '?').join(',')})`).bind(sqlTime(now), ...ids).all());
  if (!cases.length) return [];
  const statements = [];
  for (const row of cases) {
    // Existing inmates receive a full initial interval from rollout, not retroactive starvation.
    // Later admissions use their actual server admission time, even if they never open the page.
    const start = Math.max(epoch, time(row.jailed_at) || epoch);
    const deadline = row.deadline_ms == null ? start + PRISON_HUNGER_RULES.intervalMs : Number(row.deadline_ms);
    if (row.deadline_ms == null) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO ${STATE}(case_id,inmate_user_id,started_at_ms,deadline_ms) VALUES(?,?,?,?)`)
      .bind(row.case_id, row.user_id, start, deadline));
    if (deadline <= now && Number(row.died_at_ms || 0) < deadline) statements.push(env.DB.prepare(`UPDATE ${STATE} SET died_at_ms=deadline_ms WHERE case_id=? AND deadline_ms<=? AND died_at_ms<deadline_ms
      AND EXISTS(SELECT 1 FROM user_prison_status p JOIN prison_release_cases_v2031 c ON c.inmate_user_id=p.user_id
        WHERE c.case_id=? AND c.status='ACTIVE' AND p.active=1 AND p.jailed_until>?)`).bind(row.case_id, now, row.case_id, sqlTime(now)));
  }
  if (statements.length) await env.DB.batch(statements);
  return rows(await env.DB.prepare(`SELECT h.*,u.nickname AS last_sender FROM ${STATE} h
    LEFT JOIN ${MEAL} m ON m.case_id=h.case_id AND m.previous_version=h.meal_version-1
    LEFT JOIN users u ON u.id=m.sender_user_id WHERE h.case_id IN (${cases.map(() => '?').join(',')})`).bind(...cases.map(c => c.case_id)).all());
}

export function hungerPublicState(row, now = Date.now()) {
  if (!row) return null;
  const deadlineAt = Number(row.deadline_ms), diedAt = Number(row.died_at_ms || 0);
  return { caseId: row.case_id, mealVersion: Number(row.meal_version || 0), deadlineAt, lastFedAt: Number(row.last_fed_at_ms || 0), lastSender: row.last_sender || null,
    starved: deadlineAt <= now, remainingSeconds: Math.max(0, Math.ceil((deadlineAt - now) / 1000)), diedAt,
    deathPending: diedAt > Number(row.acknowledged_death_ms || 0) };
}

export async function prisonHungerRoomState(env, user, inmates, prison, now = Date.now()) {
  const states = await reconcile(env, [user.id, ...inmates.map(i => i.userId)], now);
  const byUser = new Map(states.map(row => [Number(row.inmate_user_id), hungerPublicState(row, now)]));
  return { inmates: inmates.map(inmate => ({ ...inmate, hunger: byUser.get(inmate.userId) || null })),
    hunger: prison.incarcerated && (!prison.facility || prison.facility === 'PRISON') ? byUser.get(Number(user.id)) || null : null,
    hungerRules: PRISON_HUNGER_RULES, canSendMeal: !prison.incarcerated };
}

export async function sendPrisonMeal(env, user, body, now = Date.now()) {
  const inmateId = Number(body.inmateUserId), { requestId, caseId } = body, expected = Number(body.deadlineAt), version = Number(body.mealVersion);
  if (!Number.isSafeInteger(inmateId) || inmateId < 1 || !validId(requestId) || !validId(caseId) || !Number.isSafeInteger(expected) || expected <= 0 || !Number.isSafeInteger(version) || version < 0) fail('사식 대상과 요청 번호를 다시 확인하세요.', 400);
  if (inmateId === Number(user.id)) fail('사식은 수감자 본인이 아닌 방문객만 전달할 수 있습니다.', 403);
  await ensurePrisonHungerFoundation(env, now);
  const replay = async () => {
    const prior = await env.DB.prepare(`SELECT * FROM ${MEAL} WHERE request_id=?`).bind(requestId).first();
    if (prior && (Number(prior.sender_user_id) !== Number(user.id) || Number(prior.inmate_user_id) !== inmateId || prior.case_id !== caseId || Number(prior.previous_deadline_ms) !== expected || Number(prior.previous_version) !== version)) fail('다른 사식에 사용된 요청 번호입니다.');
    return prior;
  };
  if (await replay()) return { replayed: true };
  await reconcile(env, [inmateId], now);
  const token = crypto.randomUUID(), price = PRISON_HUNGER_RULES.mealCoin, at = sqlTime(now);
  const receipt = `EXISTS(SELECT 1 FROM ${MEAL} WHERE request_id=? AND attempt_token=?)`;
  const statements = [
    // Payer first, then the admission row: release/re-admission cannot interleave with a delivery.
    env.DB.prepare(`SELECT id FROM users WHERE id=?${env.DB.dialect === 'postgres' ? ' FOR UPDATE' : ''}`).bind(user.id),
    env.DB.prepare('UPDATE user_prison_status SET active=active WHERE user_id=?').bind(inmateId),
    env.DB.prepare(`UPDATE ${STATE} SET deadline_ms=deadline_ms WHERE case_id=?`).bind(caseId),
    env.DB.prepare(`INSERT OR IGNORE INTO ${MEAL}(request_id,attempt_token,case_id,inmate_user_id,sender_user_id,coin,previous_deadline_ms,previous_version,delivered_at_ms)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${STATE} h JOIN prison_release_cases_v2031 c ON c.case_id=h.case_id
        JOIN user_prison_status p ON p.user_id=h.inmate_user_id WHERE h.case_id=? AND h.inmate_user_id=? AND h.deadline_ms=? AND h.meal_version=?
        AND c.status='ACTIVE' AND p.active=1 AND p.jailed_until>?)
      AND EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)
      AND NOT EXISTS(SELECT 1 FROM user_prison_status WHERE user_id=? AND active=1 AND jailed_until>?)
      AND NOT EXISTS(SELECT 1 FROM prison_camp_entries_v2115 WHERE user_id=? AND released_at IS NULL AND jailed_until>?)`)
      .bind(requestId, token, caseId, inmateId, user.id, price, expected, version, now, caseId, inmateId, expected, version, at, user.id, price, user.id, at, user.id, at),
    env.DB.prepare(`UPDATE users SET coin=coin-? WHERE id=? AND ${receipt}`).bind(price, user.id, requestId, token),
    env.DB.prepare(`UPDATE ${STATE} SET died_at_ms=CASE WHEN deadline_ms<=? THEN deadline_ms ELSE died_at_ms END,last_fed_at_ms=?,deadline_ms=?,meal_version=meal_version+1
      WHERE case_id=? AND ${receipt}`).bind(now, now, now + PRISON_HUNGER_RULES.intervalMs, caseId, requestId, token),
    env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
      SELECT id,?,coin,'감옥 사식 1회' FROM users WHERE id=? AND ${receipt}`).bind(-price, user.id, requestId, token)
  ];
  await env.DB.batch(statements);
  const saved = await replay();
  if (!saved) fail('수감·식사 상태가 변경됐거나 코인이 부족합니다. 현재 상태를 확인해 주세요.');
  return { replayed: saved.attempt_token !== token, deliveredAt: Number(saved.delivered_at_ms), coin: price };
}

export async function acknowledgePrisonStarvation(env, user, body, now = Date.now()) {
  if (!validId(body.caseId) || !Number.isSafeInteger(body.diedAt) || body.diedAt <= 0) fail('사망 기록을 다시 확인하세요.', 400);
  await reconcile(env, [user.id], now);
  await env.DB.prepare(`UPDATE ${STATE} SET acknowledged_death_ms=died_at_ms WHERE case_id=? AND inmate_user_id=? AND died_at_ms=?
    AND EXISTS(SELECT 1 FROM prison_release_cases_v2031 c JOIN user_prison_status p ON p.user_id=c.inmate_user_id
      WHERE c.case_id=? AND c.status='ACTIVE' AND p.active=1 AND p.jailed_until>?)`)
    .bind(body.caseId, user.id, body.diedAt, body.caseId, sqlTime(now)).run();
}

export async function handlePrisonHunger({ path, request, env, deps }) {
  if (!['prison/meal', 'prison/hunger/ack'].includes(path)) return null;
  const user = await deps.authenticate(request, env);
  if (!user) return deps.json({ error: '로그인이 필요합니다.' }, 401);
  if (request.method !== 'POST') return deps.json({ error: 'POST 요청을 사용하세요.' }, 405);
  try {
    const prison = await deps.prisonStatusForUser(env, user.id);
    if (path === 'prison/meal' && prison.incarcerated) fail('수감 중에는 다른 수감자에게 사식을 보낼 수 없습니다.', 403);
    if (path === 'prison/hunger/ack' && (!prison.incarcerated || (prison.facility && prison.facility !== 'PRISON'))) fail('일반 감옥 수감 기록이 없습니다.');
    const body = await deps.readBody(request);
    const result = path === 'prison/meal' ? await sendPrisonMeal(env, user, body) : await acknowledgePrisonStarvation(env, user, body);
    return deps.json({ ok: true, ...result, state: await deps.prisonRoomState(env, user) });
  } catch (error) {
    return deps.json({ error: error.status ? error.message : '사식 처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.' }, error.status || 500);
  }
}
