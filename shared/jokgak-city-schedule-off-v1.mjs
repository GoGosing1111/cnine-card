export const CITY_OFF_SCHEDULE_KEY='jokgak_city_scheduled_off_v1';
export const emptyCityOffSchedule=()=>({revision:0,pending:null,lastRun:null});
export const seoulDateTimeInput=at=>Number.isFinite(at)?new Date(at+9*3600000).toISOString().slice(0,16):'';
export function parseSeoulDateTimeInput(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('예약 날짜와 시간을 입력하세요.');
 const at=Date.parse(value+':00+09:00');
 if(!Number.isSafeInteger(at)||seoulDateTimeInput(at)!==value)throw Error('올바른 한국시간 날짜와 시간을 입력하세요.');
 return at;
}
export const formatCityOffTime=at=>seoulDateTimeInput(at).replace('T',' ')+' KST';
