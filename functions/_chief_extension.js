import { chiefAuthorityGuard } from './_coup_schema.js';

export const CHIEF_EXTENSION_ID = 'diim-term-extension-20261011';
export const CHIEF_EXTENSION_KEY = 'chief_extension_' + CHIEF_EXTENSION_ID;
const APPOINTMENT_KEY = 'chief_appointment_v1';
const TARGET_USER_ID = 4773;
const DAY_MS = 86400000;
const seenKey = userId => `${CHIEF_EXTENSION_KEY}:seen:${Number(userId)}`;
const parse = value => { try { return JSON.parse(value || 'null'); } catch { return null; } };
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
export async function chiefExtensionReceipt(env) {
  return parse((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(CHIEF_EXTENSION_KEY).first())?.value);
}

// One event, one extension. The receipt, current term and audit commit together.
export async function extendDiimTerm(env, admin, body) {
  if (admin?.role !== 'OWNER') fail('OWNER만 임기 연장을 실행할 수 있습니다.', 403);
  const prior = await chiefExtensionReceipt(env);
  if (prior) return { ok: true, replayed: true, receipt: prior };
  const stored = (await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(APPOINTMENT_KEY).first())?.value;
  const current = parse(stored), now = Date.now();
  if (!current?.id || Number(current.userId) !== TARGET_USER_ID
    || current.id !== body.appointmentId || current.endsAt !== body.endsAt
    || !(Date.parse(current.startsAt) <= now && Date.parse(current.endsAt) > now))
    fail('진짜디임의 현재 임기가 변경되었거나 종료되었습니다. 새로고침 후 확인하세요.');
  const receipt = {
    id: CHIEF_EXTENSION_ID, appointmentId: current.id, userId: TARGET_USER_ID,
    nickname: '진짜디임', ordinal: current.ordinal, days: 7,
    previousEndsAt: current.endsAt, endsAt: new Date(Date.parse(current.endsAt) + 7 * DAY_MS).toISOString(),
    announcedAt: new Date(now).toISOString(), appliedBy: Number(admin.id)
  };
  const next = { ...current, endsAt: receipt.endsAt, extensionId: receipt.id };
  const authority = chiefAuthorityGuard(env, current.id, TARGET_USER_ID, now), guard = crypto.randomUUID();
  try {
    await env.DB.batch([
      ...authority.before,
      env.DB.prepare(`INSERT INTO coup_atomic_guard_v2115(id,ok) SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?) THEN 1 ELSE 0 END`)
        .bind(guard, APPOINTMENT_KEY, stored, TARGET_USER_ID, CHIEF_EXTENSION_KEY),
      env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)')
        .bind(CHIEF_EXTENSION_KEY, JSON.stringify(receipt)),
      env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?')
        .bind(JSON.stringify(next), APPOINTMENT_KEY, stored),
      env.DB.prepare(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
        VALUES(?,'CHIEF_TERM_EXTEND_7D','CHIEF_APPOINTMENT',?,?,?)`)
        .bind(admin.id, current.id, stored, JSON.stringify({ appointment: next, receipt })),
      env.DB.prepare('DELETE FROM coup_atomic_guard_v2115 WHERE id=?').bind(guard), authority.after
    ]);
  } catch (error) {
    const committed = await chiefExtensionReceipt(env);
    if (committed) return { ok: true, replayed: true, receipt: committed };
    fail('임기 연장이 완료되지 않았습니다. 현재 임기와 직무 상태를 확인하고 다시 시도하세요.');
  }
  return { ok: true, replayed: false, receipt };
}

export async function chiefExtensionNotice(env, userId, requestId = '') {
  const row = await env.DB.prepare(`SELECT e.value receipt,c.value appointment,s.value seen
    FROM app_meta e LEFT JOIN app_meta c ON c.key=? LEFT JOIN app_meta s ON s.key=? WHERE e.key=?`)
    .bind(APPOINTMENT_KEY, seenKey(userId), CHIEF_EXTENSION_KEY).first();
  const receipt = parse(row?.receipt), current = parse(row?.appointment), seen = parse(row?.seen);
  if (!receipt) return { notice: null, complete: false };
  if (current?.id !== receipt.appointmentId || Number(current.userId) !== TARGET_USER_ID
    || Date.parse(current.endsAt) <= Date.now()) return { notice: null, complete: true };
  if (seen && (!requestId || seen.requestId !== requestId)) return { notice: null, complete: true };
  const { appliedBy, ...notice } = receipt;
  return { notice, complete: false };
}

// Client claims only after the art is loaded and a dialog can be displayed.
// A stable request ID permits recovery from a lost response; other tabs lose.
export async function claimChiefExtensionNotice(env, userId, body) {
  const requestId = String(body.requestId || '');
  if (body.id !== CHIEF_EXTENSION_ID || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) fail('공지 확인 요청이 올바르지 않습니다.', 400);
  const state = await chiefExtensionNotice(env, userId, requestId);
  if (!state.notice) return { show: false, ...state };
  await env.DB.prepare(`INSERT OR IGNORE INTO app_meta(key,value,updated_at)
    SELECT ?,?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM app_meta WHERE key=? AND json_extract(value,'$.id')=?
      AND CAST(json_extract(value,'$.userId') AS BIGINT)=? AND json_extract(value,'$.endsAt')>?)`)
    .bind(seenKey(userId), JSON.stringify({ requestId, shownAt: new Date().toISOString() }),
      APPOINTMENT_KEY, state.notice.appointmentId, TARGET_USER_ID, new Date().toISOString()).run();
  const saved = parse((await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(seenKey(userId)).first())?.value);
  return { show: saved?.requestId === requestId, notice: saved?.requestId === requestId ? state.notice : null, complete: true };
}
