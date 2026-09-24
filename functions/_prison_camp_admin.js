import { ensureClanCampSchema, clanCampProbeTime } from './_clan_prison_camp.js';

export const CAMP_ADMIN_LIMITS = Object.freeze({ minMinutes: 1, maxMinutes: 10080 });
const sqlTime = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const ownerOnly = user => { if (user?.role !== 'OWNER') fail('포로수용소 관리는 OWNER 운영자만 할 수 있습니다.', 403); };
const userIdOf = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) fail('유저를 다시 선택하세요.'); return id; };
const receiptKey = id => `prison_camp_admin:v1:${id}`;
const activeCamp = `SELECT 1 FROM prison_camp_entries_v2115 WHERE user_id=? AND released_at IS NULL AND jailed_until>?`;
const activePrison = `SELECT 1 FROM user_prison_status WHERE user_id=? AND active=1 AND jailed_until>?`;

export async function adminCampState(env, owner, rawUserId, now = Date.now()) {
  ownerOnly(owner);
  const userId = userIdOf(rawUserId);
  await ensureClanCampSchema(env);
  const user = await env.DB.prepare('SELECT id,nickname,status FROM users WHERE id=?').bind(userId).first();
  if (!user) fail('유저를 찾을 수 없습니다.', 404);
  const [camps, prison] = await Promise.all([
    env.DB.prepare(`SELECT event_id,season_id,source_type,title,reason,jailed_at,jailed_until FROM prison_camp_entries_v2115
      WHERE user_id=? AND released_at IS NULL AND jailed_until>? ORDER BY jailed_until DESC`).bind(userId, clanCampProbeTime(now)).all(),
    env.DB.prepare(`SELECT reason,jailed_until FROM user_prison_status WHERE user_id=? AND active=1 AND jailed_until>?`).bind(userId, clanCampProbeTime(now)).first()
  ]);
  return { user: { ...user, id: Number(user.id) }, limits: CAMP_ADMIN_LIMITS, serverNow: now, prison: prison || null,
    camps: (camps.results || []).map(c => ({ eventId: c.event_id, seasonId: Number(c.season_id), sourceType: c.source_type,
      title: c.title, reason: c.reason, jailedAt: c.jailed_at, jailedUntil: c.jailed_until,
      canRelease: c.source_type === 'ADMIN', remainingSeconds: Math.max(0, Math.ceil((Date.parse(c.jailed_until.replace(' ', 'T') + 'Z') - now) / 1000)) })) };
}

function readInput(body, owner) {
  const userId = userIdOf(body.userId), action = body.action;
  if (!['JAIL', 'RELEASE'].includes(action)) fail('지원하지 않는 수용소 명령입니다.');
  if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId)) fail('요청 번호를 확인하세요.');
  const nickname = typeof body.expectedNickname === 'string' ? body.expectedNickname : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!nickname || nickname.length > 100) fail('대상 닉네임을 다시 확인하세요.');
  if (!reason || reason.length > 200) fail('처리 사유를 1~200자로 입력하세요.');
  const durationMinutes = Number(body.durationMinutes);
  if (action === 'JAIL' && (!Number.isInteger(durationMinutes) || durationMinutes < CAMP_ADMIN_LIMITS.minMinutes || durationMinutes > CAMP_ADMIN_LIMITS.maxMinutes)) fail('수감 시간은 1~10,080분(7일) 사이의 정수로 입력하세요.');
  const eventId = action === 'JAIL' ? `admin:${body.requestId}` : String(body.eventId || '');
  if (action === 'RELEASE' && !/^admin:[a-zA-Z0-9_-]{16,80}$/.test(eventId)) fail('CMS에서 수감한 기록을 선택하세요.');
  return { operatorId: Number(owner.id), action, userId, nickname, reason, eventId, ...(action === 'JAIL' ? { durationMinutes } : {}) };
}

export async function operateAdminCamp(env, owner, body = {}, now = Date.now()) {
  ownerOnly(owner);
  const input = readInput(body, owner), key = receiptKey(body.requestId), fingerprint = JSON.stringify(input);
  const readReceipt = () => env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  const resultOf = async (row, replayed) => {
    const receipt = JSON.parse(row.value);
    if (receipt.fingerprint !== fingerprint) fail('다른 명령에 사용된 요청 번호입니다. 상태를 새로 확인하세요.', 409);
    return { ok: true, replayed, result: receipt.result, state: await adminCampState(env, owner, input.userId, now) };
  };
  const prior = await readReceipt();
  if (prior) return resultOf(prior, true);
  const before = await adminCampState(env, owner, input.userId, now);
  if (before.user.nickname !== input.nickname) fail('닉네임이 변경되었습니다. 유저를 다시 선택하세요.', 409);
  const at = sqlTime(now), until = sqlTime(now + (input.durationMinutes || 0) * 60000);
  const result = { ...input, ...(input.action === 'JAIL' ? { jailedAt: at, jailedUntil: until } : { releasedAt: at }) };
  // A per-attempt token gates every write. The receipt, sentence and audit commit together;
  // a repeated request (including a lost COMMIT response) never extends or recreates a sentence.
  const value = JSON.stringify({ fingerprint, token: crypto.randomUUID(), result });
  const ownedReceipt = 'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const p = (sql, ...values) => env.DB.prepare(sql).bind(...values);
  const eligible = input.action === 'JAIL'
    ? `u.status='ACTIVE' AND NOT EXISTS(${activeCamp}) AND NOT EXISTS(${activePrison})`
    : `EXISTS(SELECT 1 FROM event_prison_captives c JOIN event_prison_camps e ON e.event_id=c.event_id
        WHERE c.user_id=u.id AND e.event_id=? AND e.source_type='ADMIN' AND c.released_at IS NULL AND e.jailed_until>?)`;
  const eligibilityArgs = input.action === 'JAIL'
    ? [input.userId, clanCampProbeTime(now), input.userId, clanCampProbeTime(now)] : [input.eventId, clanCampProbeTime(now)];
  const statements = [
    p(`SELECT id FROM users WHERE id=?${env.DB.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, input.userId),
    p(`INSERT OR IGNORE INTO app_meta(key,value) SELECT ?,? FROM users u WHERE u.id=? AND u.nickname=? AND ${eligible}`,
      key, value, input.userId, input.nickname, ...eligibilityArgs)
  ];
  if (input.action === 'RELEASE' && env.DB.dialect === 'postgres') statements.splice(1, 0,
    p('SELECT user_id FROM event_prison_captives WHERE event_id=? AND user_id=? FOR UPDATE', input.eventId, input.userId));
  if (input.action === 'JAIL') {
    statements.push(
      p(`INSERT INTO event_prison_camps(event_id,source_type,title,reason,jailed_at,jailed_until)
        SELECT ?,'ADMIN','행정부 포로수용소',?,?,? WHERE ${ownedReceipt}`, input.eventId, input.reason, at, until, key, value),
      p(`INSERT INTO event_prison_captives(event_id,user_id,member_role) SELECT ?,?,'MEMBER' WHERE ${ownedReceipt}`, input.eventId, input.userId, key, value)
    );
  } else {
    statements.push(p(`UPDATE event_prison_captives SET released_at=?,released_by=?,release_reason=?
      WHERE event_id=? AND user_id=? AND released_at IS NULL AND ${ownedReceipt}`, at, owner.id, input.reason, input.eventId, input.userId, key, value));
  }
  statements.push(p(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    SELECT ?,?,'USER',?,?,? WHERE ${ownedReceipt}`, owner.id, `PRISON_CAMP_${input.action}`, String(input.userId), JSON.stringify(before), JSON.stringify(result), key, value));
  await env.DB.batch(statements);
  const saved = await readReceipt();
  if (saved) return resultOf(saved, saved.value !== value);
  fail(input.action === 'JAIL' ? '이미 수감 중이거나 이용정지·대상 정보가 변경된 유저입니다. 상태를 새로 확인하세요.' : '이미 석방·만료되었거나 대상 정보가 변경된 수감 기록입니다. 상태를 새로 확인하세요.', 409);
}

export async function handlePrisonCampAdmin({ path, request, env, deps }) {
  if (!path.startsWith('admin/prison-camp/')) return null;
  const owner = await deps.requirePermission(request, env, 'USER_MANAGE');
  try {
    ownerOnly(owner);
    if (path === 'admin/prison-camp/status' && request.method === 'GET') return deps.json(await adminCampState(env, owner, new URL(request.url).searchParams.get('userId')));
    if (path === 'admin/prison-camp/action' && request.method === 'POST') return deps.json(await operateAdminCamp(env, owner, await deps.readBody(request)));
    return deps.json({ error: '지원하지 않는 요청입니다.' }, 405);
  } catch (error) {
    if (!error.status) throw error;
    return deps.json({ error: error.message, code: 'PRISON_CAMP_ADMIN_ERROR' }, error.status);
  }
}
