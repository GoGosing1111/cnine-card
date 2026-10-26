export const STOCK_SCHEDULE_KEY='mercenary_stock_schedule_v1';
export const STOCK_SCHEDULE_VERSION='20261026-v1';
export const STOCK_SCHEDULE_MAX_LIMIT=1000000;
export const STOCK_SCHEDULE_MAX_PENDING=32;
export const stockScheduleDate=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'medium',hour12:false}).format(new Date(value));
export function stockScheduleKstToIso(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))throw Error('예약 날짜와 시간을 입력하세요.');
 const date=new Date(value+'+09:00');
 if(!Number.isFinite(date.getTime())||new Date(date.getTime()+9*3600000).toISOString().slice(0,16)!==value.slice(0,16))throw Error('올바른 한국시간을 입력하세요.');
 return date.toISOString();
}
export const stockScheduleInitial=()=>({version:1,revision:1,schedules:[]});
export const stockScheduleNext=doc=>doc.schedules.filter(s=>s.status==='SCHEDULED').sort((a,b)=>a.executeAt.localeCompare(b.executeAt)||a.id.localeCompare(b.id));
export function trimStockScheduleHistory(schedules){
 const completed=schedules.filter(s=>s.status!=='SCHEDULED').sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt))).slice(0,50);
 return [...schedules.filter(s=>s.status==='SCHEDULED'),...completed];
}
