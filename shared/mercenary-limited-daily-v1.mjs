export const LIMITED_DAILY_CAP=3000;
const DAY_MS=86400000,KST_OFFSET=9*3600000;
export function limitedDailyStatus(used=0,now=Date.now()){
 const time=Number(now),day=new Date(time+KST_OFFSET).toISOString().slice(0,10);
 if(used!==null&&(!Number.isSafeInteger(used)||used<0))throw Error('일일 개봉 내역을 확인할 수 없습니다.');
 return {day,timeZone:'Asia/Seoul',limit:LIMITED_DAILY_CAP,used,remaining:used===null?null:Math.max(0,LIMITED_DAILY_CAP-used),resetsAt:new Date(Math.floor((time+KST_OFFSET)/DAY_MS)*DAY_MS+DAY_MS-KST_OFFSET).toISOString()};
}
export function limitedDailyLimitError(remaining=0){
 return Object.assign(Error('리미티드 용병팩은 계정당 하루 3,000개까지 개봉할 수 있습니다. 오늘 남은 수량: '+remaining.toLocaleString('ko-KR')+'개. 매일 한국 시간 00:00에 초기화됩니다.'),{code:'MERCENARY_LIMITED_DAILY_LIMIT',status:409,terminal:true});
}
export function assertLimitedDailyCapacity(daily,count,now=Date.now()){
 // An expired view cannot block the new day. The server always rechecks at payment.
 if(daily&&Number.isSafeInteger(daily.remaining)&&Date.parse(daily.resetsAt)>Number(now)&&count>daily.remaining)throw limitedDailyLimitError(daily.remaining);
}
