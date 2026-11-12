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
export function resumedClanSettings(settings,resumption){return {...settings,championsEnabled:true,scheduleEnabled:true,openDays:[...regularClanRules(resumption).weekdays],warOpenTime:'21:00',warDurationMinutes:60,maxMembers:25,maxParticipants:200};}
export const EVENING_FACTION_RULES=Object.freeze({version:'20261105-evening-once',dailyCount:1,durationMs:2*3600000,startMinute:16*60,endMinute:23*60+59,coinPerRecipient:5000000000000,masterStarsPerRecipient:50000000});
export function eveningFactionPolicy(resumption,now=Date.now()){
 const value=resumption?.factionSchedule;
 return value?.version===EVENING_FACTION_RULES.version&&Number.isSafeInteger(value.effectiveAt)&&value.effectiveAt>=Date.parse('2026-11-05T00:00:00+09:00')&&value.effectiveAt<=now?value:null;
}
export function resumedFactionRules(base,resumption,now=Date.now()){return {...base,version:CLAN_RESUMPTION_VERSION,dailyCount:1,durationMs:3*3600000,requiredTerritories:4,pointsPerSession:1,regularSeasonId:resumption.seasonId,resumedAt:resumption.effectiveAt,...(eveningFactionPolicy(resumption,now)?EVENING_FACTION_RULES:{})};}
const FACTION_WEEKDAYS=[2,3,5];
export const FACTION_WEEK_FROM='2026-11-10';

export function clanCalendarPhase(calendar,now){
 if(now<calendar.elderClosesAt)return 'OPEN';
 if(now<calendar.startsAt)return 'MEMBERS';
 if(now<calendar.endsAt)return 'COMPETITION';
 return 'FINISHED';
}

// Both playoff matches use the last complete Korean evening inside the season.
export function clanPlayoffTimes(calendar){
 const day=86400000,hour=3600000;
 const midnight=Math.floor((calendar.endsAt+9*hour)/day)*day-9*hour;
 let semifinal=midnight+21*hour;
 if(semifinal+2*hour>calendar.endsAt)semifinal-=day;
 return {regularEndsAt:semifinal-hour,semifinal,final:semifinal+hour};
}
export function factionDayPermitted(dayKey) {
 return dayKey<FACTION_WEEK_FROM||FACTION_WEEKDAYS.includes(new Date(dayKey+'T12:00:00Z').getUTCDay());
}
export function nextFactionDay(dayKey) {
 const day=Date.parse(dayKey+'T00:00:00Z');
 for(let offset=1;offset<=7;offset++){
  const candidate=new Date(day+offset*86400000).toISOString().slice(0,10);
  if(factionDayPermitted(candidate))return candidate;
 }
}
export const resumedFactionLabel=(resumption,now=Date.now())=>eveningFactionPolicy(resumption,now)?(now>=Date.parse(FACTION_WEEK_FROM+'T00:00:00+09:00')?'화·수·금 랜덤 1회 · 16:00~23:59 · 회차당 2시간':'매일 랜덤 1회 · 16:00~23:59 · 회차당 2시간'):RESUMED_CLAN_RULES.factionLabel;
function randomInteger(limit){let value;const ceiling=Math.floor(4294967296/limit)*limit;do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=ceiling);return value%limit;}
// The release day draws only a future full window. Once persisted, never reroll.
export function createResumedFactionDay(dayKey,resumption,random=randomInteger){
 const start=Date.parse(dayKey+'T00:00:00+09:00');
 if(!factionDayPermitted(dayKey)||!Number.isSafeInteger(start)||start+86400000<=resumption.effectiveAt)return [];
 const evening=eveningFactionPolicy(resumption,start+86400000-1),rule=evening?EVENING_FACTION_RULES:null;
 const first=Math.max(rule?.startMinute||0,Math.ceil((Math.max(resumption.effectiveAt,evening?.effectiveAt||0)+5*60000-start)/60000)),last=rule?rule.endMinute-rule.durationMs/60000:21*60;
 if(first>last)return [];
 const width=last-first+1,index=random(width);
 if(!Number.isInteger(index)||index<0||index>=width)throw Error('INVALID_FACTION_RANDOM');
 const startsAt=start+(first+index)*60000;
 return [{key:dayKey+':resumed-1',dayKey,ordinal:1,startsAt,endsAt:startsAt+(rule?.durationMs||3*3600000),scheduleVersion:rule?.version||CLAN_RESUMPTION_VERSION,...(rule?{hardEndsAt:start+rule.endMinute*60000}:{})}];
}
