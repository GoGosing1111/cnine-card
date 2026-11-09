const DAY = 86400000;
const WEEK = 7 * DAY;
export const DRAFT_NOTICE_MS = 30 * 60000;
export const DRAFT_PREP_MS = 5 * 60000;
export const DRAFT_LIMIT = 150;
export const draftKeyPrefix = 'territory_draft_v1:';
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

export function nextDraftSlot(cfg, now=Date.now()) {
  const policy=cfg.autoOpen;
  if (!policy || !['ONCE','WEEKLY'].includes(policy.kind)) return null;
  const first=Date.parse(policy.battleAt);
  if (!Number.isFinite(first)) return null;
  const battle=policy.kind==='WEEKLY' ? first+Math.max(0,Math.ceil((now-first)/WEEK))*WEEK : first;
  if(now>=battle) return null;
  return {key:'territory_auto_open_v1:'+new Date(battle).toISOString(),battleAt:new Date(battle).toISOString(),
    noticeAt:new Date(battle-DRAFT_NOTICE_MS).toISOString(),formationAt:new Date(battle-DRAFT_PREP_MS).toISOString()};
}
export function scheduledSlot(cfg,now=Date.now()) {
  const slot=nextDraftSlot(cfg,now);
  return slot&&now>=Date.parse(slot.noticeAt)?slot:null;
}
export const scheduledRoundKey=id=>'territory_scheduled_battle_v1:'+id;
