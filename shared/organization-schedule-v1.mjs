import {factionDayKey,factionDayStart,createFactionDay} from './clan-faction-sessions-v1.mjs';
import {clanRestorationActive,CLAN_RESTORATION} from './clan-restoration-v1.mjs';
import {ORGANIZATION_SESSION_RULES} from './organization-faction-v1.mjs';
import {createResumedFactionDay} from './clan-resumption-v1.mjs';
export const ORGANIZATION_FIXED_SCHEDULE = Object.freeze({
 version:'20261023-fixed-evenings',effectiveAt:Date.parse('2026-10-23T00:00:00+09:00'),
 timeZone:'Asia/Seoul',weekdays:[0,2,4,6],startHour:20,endHour:22,
 label:'화·목·토·일 20:00~22:00 (한국시간)'
});
export const ORGANIZATION_FIXED_RULES=Object.freeze({...ORGANIZATION_SESSION_RULES,version:ORGANIZATION_FIXED_SCHEDULE.version,dailyCount:1,durationMs:2*60*60*1000});
export function createOrganizationFactionDay(dayKey,random,resumption){
 if(resumption)return createResumedFactionDay(dayKey,resumption,random);
 if(clanRestorationActive(factionDayStart(dayKey)))return createFactionDay(dayKey,random).map(slot=>({...slot,scheduleVersion:CLAN_RESTORATION.version}));
 return factionDayStart(dayKey)>=ORGANIZATION_FIXED_SCHEDULE.effectiveAt?createOrganizationDay(dayKey):createFactionDay(dayKey,random);
}
export function createOrganizationDay(dayKey){
 const start=factionDayStart(dayKey),weekday=new Date(start+9*3600000).getUTCDay();
 if(!ORGANIZATION_FIXED_SCHEDULE.weekdays.includes(weekday))return [];
 return [{key:dayKey+':fixed-20',dayKey,ordinal:1,startsAt:start+20*3600000,endsAt:start+22*3600000,scheduleVersion:ORGANIZATION_FIXED_SCHEDULE.version}];
}
export function nextOrganizationStart(now){
 const start=factionDayStart(factionDayKey(now));
 for(let i=0;i<=7;i++){const slot=createOrganizationDay(factionDayKey(start+i*86400000))[0];if(slot&&slot.startsAt>now)return slot.startsAt;}
 return null;
}
