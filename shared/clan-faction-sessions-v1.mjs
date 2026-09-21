// User approved live activation on 2026-09-22; keep the cutover immutable on redeploy.
export const FACTION_SESSION_RELEASE = Object.freeze({
  enabled: true,
  effectiveAt: '2026-09-22T01:15:00+09:00',
  recipients: 'PARTICIPANTS', // User confirmed: participating members each receive 300억.
  interruption: 'PAUSE', // Freeze remaining play time and resume after territory war.
  overlap: 'DEFER', // User confirmed: the following round gets a full three hours afterward.
  mapPolicy: 'KEEP', // User confirmed: retain ownership and formations across rounds.
});
export const FACTION_SESSION_RULES = Object.freeze({
  version: '20260921-sessions-v1', timeZone: 'Asia/Seoul',
  dailyCount: 2, durationMs: 3 * 3600000,
  requiredTerritories: 4, coinPerRecipient: 30000000000,
});
const MINUTE = 60000, DAY = 86400000, KST = 9 * 3600000;
export const factionTime = value => typeof value === 'number' ? value : Date.parse(/Z$|[+]\d\d:\d\d$/.test(String(value)) ? value : String(value).replace(' ', 'T') + 'Z');
export const factionDayKey = now => new Date(now + KST).toISOString().slice(0, 10);
export function factionDayStart(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw Error('INVALID_FACTION_DAY');
  const time = Date.parse(key + 'T00:00:00+09:00');
  if (!Number.isFinite(time) || factionDayKey(time) !== key) throw Error('INVALID_FACTION_DAY');
  return time;
}
export function factionPolicy(candidate = FACTION_SESSION_RELEASE) {
  if (!candidate.enabled) return null;
  const effectiveAt = factionTime(candidate.effectiveAt);
  if (!Number.isSafeInteger(effectiveAt) || !['ALL_MEMBERS', 'PARTICIPANTS', 'CLAN_TOTAL'].includes(candidate.recipients)
    || !['CANCEL', 'SETTLE', 'PAUSE'].includes(candidate.interruption) || !['RESET', 'KEEP'].includes(candidate.mapPolicy)
    || (candidate.interruption === 'PAUSE' && !['DEFER','SKIP'].includes(candidate.overlap)))
    throw Error('FACTION_SESSION_RELEASE_NOT_APPROVED');
  return {...candidate, effectiveAt};
}
function randomInteger(limit) {
  const ceiling = Math.floor(4294967296 / limit) * limit;
  let value;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= ceiling);
  return value % limit;
}
// Uniform over every non-overlapping pair of minute-aligned 3h windows in a KST day.
// Generated once and persisted: reads/retries never reroll a published schedule.
export function createFactionDay(key, random = randomInteger) {
  const start = factionDayStart(key), minutes = FACTION_SESSION_RULES.durationMs / MINUTE;
  const width = DAY / MINUTE - 2 * minutes + 1;
  const choices = width * (width + 1) / 2;
  let index = random(choices), first = 0;
  if (!Number.isInteger(index) || index < 0 || index >= choices) throw Error('INVALID_FACTION_RANDOM');
  while (index >= width - first) { index -= width - first; first++; }
  return [first, first + minutes + index].map((minute, i) => ({
    key: `${key}:${i + 1}`, dayKey: key, ordinal: i + 1,
    startsAt: start + minute * MINUTE, endsAt: start + minute * MINUTE + FACTION_SESSION_RULES.durationMs,
  }));
}
export function factionSessionRewards(districts, roster, participants, policy, participantClans) {
  const holdings = {};
  for (const district of districts) if (district.owner) holdings[district.owner] = (holdings[district.owner] || 0) + 1;
  const eligible = Object.entries(holdings).filter(([, count]) => count >= FACTION_SESSION_RULES.requiredTerritories);
  const recipients = [], seen = new Set();
  for (const [clan, territories] of eligible) {
    const members = roster.filter(m => Number(m.clanId) === Number(clan)
      && (policy.recipients !== 'PARTICIPANTS' || (participants.includes(Number(m.userId))
        && (!participantClans || Number(participantClans[m.userId]) === Number(clan))))).sort((a,b) => a.userId - b.userId);
    members.forEach((member, i) => {
      const userId = Number(member.userId);
      if (!Number.isSafeInteger(userId) || userId <= 0 || seen.has(userId)) throw Error('INVALID_FACTION_RECIPIENT');
      seen.add(userId);
      const coin = FACTION_SESSION_RULES.coinPerRecipient;
      recipients.push({userId, clanId: Number(clan), territories,
        amount: policy.recipients === 'CLAN_TOTAL' ? Math.floor(coin / members.length) + (i < coin % members.length ? 1 : 0) : coin});
    });
  }
  return {holdings, recipients};
}
