export const BURNING_EVENT_DURATION_MINUTES = Object.freeze([30, 60, 120]);
export const BURNING_EVENT_DEFAULT_DURATION_MINUTES = 60;

export function canManageBurningEvent(user) {
  const role = String(user?.role || '').trim().toUpperCase();
  return role === 'OWNER';
}

export function isBurningEventDurationMinutes(value) {
  const duration = Number(value);
  return Number.isInteger(duration) && BURNING_EVENT_DURATION_MINUTES.includes(duration);
}

export function burningEventIsLive(settings, nowMs = Date.now()) {
  const endMs = Date.parse(String(settings?.endsAt || ''));
  const currentMs = Number(nowMs);
  return settings?.enabled === true
    && Number.isFinite(endMs)
    && Number.isFinite(currentMs)
    && endMs > currentMs;
}

export function normalizeBurningEventDurationMinutes(
  value,
  fallback = BURNING_EVENT_DEFAULT_DURATION_MINUTES
) {
  if (isBurningEventDurationMinutes(value)) return Number(value);
  if (isBurningEventDurationMinutes(fallback)) return Number(fallback);
  return BURNING_EVENT_DEFAULT_DURATION_MINUTES;
}

export function burningEventEndsAt(startAt, durationMinutes) {
  const startMs = Date.parse(String(startAt || ''));
  if (!Number.isFinite(startMs)) throw new TypeError('버닝 시작 시각이 올바르지 않습니다.');
  if (!isBurningEventDurationMinutes(durationMinutes)) {
    throw new RangeError('버닝 진행 시간은 30분, 1시간, 2시간 중 하나여야 합니다.');
  }
  return new Date(startMs + Number(durationMinutes) * 60_000).toISOString();
}

// Compare absent rows as well so concurrent first activations cannot coexist.
export async function commitBurningChange(db, snapshot, writes) {
  const conditions=[], values=[];
  for(const [key,value] of snapshot){
    conditions.push('(SELECT value FROM app_meta WHERE key=?) IS DISTINCT FROM ?');
    values.push(key,value);
  }
  // A stale snapshot attempts two identical primary keys, rolling back the entire batch.
  const guard=db.prepare("INSERT INTO app_meta(key,value) SELECT 'burning_mode_conflict','stale' FROM (SELECT 1 AS n UNION ALL SELECT 2 AS n) AS conflicts WHERE "+conditions.join(' OR ')).bind(...values);
  const lock=db.dialect==='postgres'?[db.prepare('SELECT pg_advisory_xact_lock(20261113, 1)')]:[];
  try { await db.batch([...lock,guard,...writes]); return true; }
  catch(error){
    if(/UNIQUE constraint failed: app_meta\.key|duplicate key value violates unique constraint "app_meta_pkey"/i.test(String(error?.message)))return false;
    throw error;
  }
}
