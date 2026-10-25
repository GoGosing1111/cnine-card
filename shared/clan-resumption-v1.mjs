// Explicitly released by an audited receipt; a saved ON value cannot release it.
export const CLAN_RESUMPTION_KEY='ops:clan-resume:20261025:v1';
export const CLAN_RESUMPTION_STATE_KEY='clan_resumption_v1';
export const CLAN_RESUMPTION_VERSION='20261025-eight-clan-resumed';
export const CLAN_RESUMPTION_AVAILABLE_AT=Date.parse('2026-10-25T15:30:00+09:00');
export const RESUMED_CLAN_RULES=Object.freeze({
 weekdays:Object.freeze([2,3,4,6]),startHour:21,durationMinutes:60,
 regularLabel:'화·수·목·토 21:00~22:00 (한국시간)',
 factionDailyCount:1,factionDurationMs:3*3600000,requiredTerritories:4,pointsPerSession:1,
 factionLabel:'매일 1회 랜덤 · 회차당 3시간',registrationLocked:true,championsScheduleLocked:true,
});
export function activeClanResumption(value,now=Date.now()){
 return value?.version===CLAN_RESUMPTION_VERSION&&value.enabled===true&&Number.isSafeInteger(value.effectiveAt)
  &&value.effectiveAt>=CLAN_RESUMPTION_AVAILABLE_AT&&value.effectiveAt<=now&&Number.isSafeInteger(value.seasonId)&&value.seasonId>0&&typeof value.roundId==='string'?value:null;
}
export const CLAN_WED_SAT_SUN_SCHEDULE=Object.freeze({version:'20261025-wed-sat-sun',firstStartsAt:'2026-10-28T12:00:00.000Z'});
export const CLAN_WED_SAT_SUN_RULES=Object.freeze({...RESUMED_CLAN_RULES,weekdays:Object.freeze([3,6,0]),regularLabel:'수·토·일 21:00~22:00 (한국시간)'});
export function regularClanRules(resumption){return resumption?.regularSchedule?.version===CLAN_WED_SAT_SUN_SCHEDULE.version&&resumption.regularSchedule.firstStartsAt===CLAN_WED_SAT_SUN_SCHEDULE.firstStartsAt?CLAN_WED_SAT_SUN_RULES:RESUMED_CLAN_RULES;}
export function resumedClanSettings(settings,resumption){return {...settings,scheduleEnabled:true,openDays:[...regularClanRules(resumption).weekdays],warOpenTime:'21:00',warDurationMinutes:60,maxMembers:25,maxParticipants:200};}
export function resumedFactionRules(base,resumption){return {...base,version:CLAN_RESUMPTION_VERSION,dailyCount:1,durationMs:3*3600000,requiredTerritories:4,pointsPerSession:1,regularSeasonId:resumption.seasonId,resumedAt:resumption.effectiveAt};}
function randomInteger(limit){let value;const ceiling=Math.floor(4294967296/limit)*limit;do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=ceiling);return value%limit;}
// The release day draws only a future full window. Once persisted, never reroll.
export function createResumedFactionDay(dayKey,resumption,random=randomInteger){
 const start=Date.parse(dayKey+'T00:00:00+09:00');
 if(!Number.isSafeInteger(start)||start+86400000<=resumption.effectiveAt)return [];
 const first=Math.max(0,Math.ceil((resumption.effectiveAt+5*60000-start)/60000)),last=21*60;
 if(first>last)return [];
 const width=last-first+1,index=random(width);
 if(!Number.isInteger(index)||index<0||index>=width)throw Error('INVALID_FACTION_RANDOM');
 const startsAt=start+(first+index)*60000;
 return [{key:dayKey+':resumed-1',dayKey,ordinal:1,startsAt,endsAt:startsAt+3*3600000,scheduleVersion:CLAN_RESUMPTION_VERSION}];
}
