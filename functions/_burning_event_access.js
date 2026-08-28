export const BURNING_EVENT_OPERATOR_NICKNAME = '핑크빛유두';
export const BURNING_EVENT_DURATION_MINUTES = Object.freeze([30, 60, 120]);
export const BURNING_EVENT_DEFAULT_DURATION_MINUTES = 60;

export function normalizeBurningOperatorNickname(value = '') {
  return String(value ?? '');
}

export function canManageBurningEvent(user) {
  const role = String(user?.role || '').trim().toUpperCase();
  const nickname = normalizeBurningOperatorNickname(user?.nickname);
  return role === 'OWNER' && nickname === BURNING_EVENT_OPERATOR_NICKNAME;
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
