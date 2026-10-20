export const PASS_KEY='supporter_season_pass_v1';
export const PASS_DAYS=30;
export const DAY_MS=86400000;
export const kstDay=ms=>Math.floor((ms+9*3600000)/DAY_MS);
export const dayDate=day=>new Date(day*DAY_MS).toISOString().slice(0,10);
export const claimKey=(userId,cycle,day)=>`supporter_pass_claim_v1:${Number(userId)}:${cycle}:${day}`;
export const dailyKey=(userId,date)=>`supporter_pass_daily_v1:${Number(userId)}:${date}`;
export const salesDailyKey=(userId,startsAt,date)=>`supporter_pass_sales_daily_v1:${Number(userId)}:${startsAt}:${date}`;
export function emptyPass(){return {version:1,revision:0,title:'리버스콜 시즌패스',enabled:false,days:Array.from({length:PASS_DAYS},(_,i)=>({day:i+1,rewards:[]}))};}
// Calendar days follow KST. A single paid term never creates a day-31 claim
// merely because its exact 720-hour expiry falls after midnight.
export function passCycle(subscription,now,salesStartsAt=0){
  if(!subscription.endsAt)return {cycle:null,startDay:null,currentDay:0,valid:false};
  if(salesStartsAt){
    const window=passWindow(subscription,now,salesStartsAt);
    if(!window)return {cycle:null,startDay:null,currentDay:0,valid:false};
    const index=Math.max(0,Math.min(Math.floor((kstDay(now)-window.startDay)/PASS_DAYS),Math.floor((window.paidEndDay-window.startDay)/PASS_DAYS)));
    const startDay=window.startDay+index*PASS_DAYS,currentDay=kstDay(now)-startDay+1;
    return {cycle:`${window.startsAt}-${index}`,startDay,currentDay,valid:subscription.active&&currentDay>=1&&currentDay<=PASS_DAYS&&kstDay(now)<=window.paidEndDay};
  }
  const first=kstDay(subscription.startsAt),elapsed=kstDay(now)-first;
  const terms=Math.max(0,Math.floor((subscription.endsAt-subscription.startsAt)/(PASS_DAYS*DAY_MS)));
  const index=Math.min(Math.max(0,Math.floor(elapsed/PASS_DAYS)),Math.max(0,terms-1));
  const startDay=first+index*PASS_DAYS,currentDay=kstDay(now)-startDay+1;
  return {cycle:`${subscription.startsAt}-${index}`,startDay,currentDay,valid:subscription.active&&terms>index&&currentDay>=1&&currentDay<=PASS_DAYS};
}
// Unclaimed rewards remain available throughout the same uninterrupted paid term.
// Extensions add paid calendar days; they do not discard an earlier 30-day cycle.
export function passWindow(subscription,now,salesStartsAt=0){
  const terms=Math.max(0,Math.floor((subscription.endsAt-subscription.startsAt)/(PASS_DAYS*DAY_MS)));
  if(!subscription.endsAt||!terms)return null;
  // Sales catch-up adds past days without shortening the purchased 30-day term.
  // Keep its original last eligible KST day, including the no-extra-day-31 rule.
  const paidStartDay=kstDay(subscription.startsAt),startDay=salesStartsAt?kstDay(salesStartsAt):paidStartDay,paidEndDay=paidStartDay+terms*PASS_DAYS-1;
  return {startsAt:salesStartsAt||subscription.startsAt,startDay,endDay:Math.min(kstDay(now),paidEndDay),paidEndDay,...(salesStartsAt?{salesStartsAt}:{})};
}
export function salesReceiptDay(window,receipt){
  if(!window?.salesStartsAt||typeof receipt?.cycle!=='string'||!/^\d{1,16}-\d{1,6}$/.test(receipt.cycle)||!Number.isSafeInteger(receipt.day)||receipt.day<1||receipt.day>PASS_DAYS)return null;
  const [startsAt,index]=receipt.cycle.split('-').map(Number);
  // Existing personal-calendar receipts already paid the numbered reward.
  // Map their ordinal into the shared sales calendar; never grant that slot twice.
  const firstCycle=startsAt===window.salesStartsAt?0:Math.max(0,Math.floor((kstDay(startsAt)-window.startDay)/PASS_DAYS));
  return passEntitlement(window,window.startDay+(firstCycle+index)*PASS_DAYS+receipt.day-1);
}
export function passEntitlement(window,calendarDay){
  const offset=calendarDay-window.startDay;
  if(!Number.isSafeInteger(calendarDay)||offset<0||calendarDay>window.paidEndDay)return null;
  return {cycle:`${window.startsAt}-${Math.floor(offset/PASS_DAYS)}`,day:offset%PASS_DAYS+1,date:dayDate(calendarDay),calendarDay};
}
export const passImage=value=>{const p=String(value||'').replaceAll('\\','/').replace(/^\/+/, '');return p.startsWith('assets/')&&!/[?#\x00-\x1f]/.test(p)&&!p.split('/').includes('..')?'/'+p:'';};
