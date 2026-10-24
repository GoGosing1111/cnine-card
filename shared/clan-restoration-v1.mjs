// User instruction, 2026-10-25 KST: restore the competitions, lock every schedule.
// A saved ON mode or an old client must not reopen a competition or recruitment.
export const CLAN_RESTORATION = Object.freeze({
  version:'20261025-restored-locked',
  effectiveAt:Date.parse('2026-10-25T00:00:00+09:00'),
  regularScheduleLocked:true,championsScheduleLocked:true,factionScheduleLocked:true,
  registrationLocked:true,pointsIncluded:false,
  factionDailyCount:2,factionDurationMs:3*3600000,
  message:'클랜전 보완 및 새 모집 방식 검토 중입니다. 모든 클랜전·챔피언스리그·세력전 일정이 잠겨 있습니다.',
});
export const clanRestorationActive=(now=Date.now())=>now>=CLAN_RESTORATION.effectiveAt;
export const clanRestorationState=(now=Date.now())=>clanRestorationActive(now)?{...CLAN_RESTORATION,restored:true,scheduleLocked:true}:null;
export function lockedFactionSessions(rules){
  return {active:false,enabled:false,scheduleLocked:true,state:'SCHEDULE_LOCKED',schedule:[],history:[],current:null,nextStartsAt:null,
    rules:{...rules,dailyCount:2,durationMs:3*3600000},recipientPolicy:'PARTICIPANTS',mapPolicy:'KEEP',pointsIncluded:false,
    scheduleLabel:'매일 2회 랜덤 · 회차당 3시간',message:CLAN_RESTORATION.message};
}
