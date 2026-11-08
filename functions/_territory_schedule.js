const DAY = 86400000;
const WEEK = 7 * DAY;
export function schedulePolicy(input) {
  if (!input || input.kind === 'MANUAL') return {kind:'MANUAL', battleAt:null};
  if (!['ONCE','WEEKLY'].includes(input.kind) || typeof input.battleAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:00(\.000)?)?(Z|\+09:00)$/.test(input.battleAt)) {
    throw new Error('자동 개전 방식과 한국시간 개전 일시를 확인하세요.');
  }
  const at = Date.parse(input.battleAt);
  const local=at+(input.battleAt.endsWith('+09:00')?9*3600000:0);
  if (!Number.isFinite(at)||new Date(local).toISOString().slice(0,16)!==input.battleAt.slice(0,16)) throw new Error('개전 일시를 확인하세요.');
  return {kind:input.kind,battleAt:new Date(at).toISOString()};
}

export function scheduledSlot(cfg, now=Date.now()) {
  const policy=cfg.autoOpen;
  if (!policy || !['ONCE','WEEKLY'].includes(policy.kind)) return null;
  const first=Date.parse(policy.battleAt);
  if (!Number.isFinite(first)) return null;
  const battle=policy.kind==='WEEKLY' ? first+Math.max(0,Math.ceil((now-first)/WEEK))*WEEK : first;
  const formation=battle-Number(cfg.preparationMinutes||0)*60000;
  const opening=formation-Number(cfg.recruitmentHours||3)*3600000;
  // A missed entire registration window never creates a stale or empty round.
  if(now<opening || now>=battle) return null;
  return {key:'territory_auto_open_v1:'+new Date(battle).toISOString(),battleAt:new Date(battle).toISOString(),
    formationAt:new Date(formation).toISOString()};
}
export const scheduledRoundKey=id=>'territory_scheduled_battle_v1:'+id;
