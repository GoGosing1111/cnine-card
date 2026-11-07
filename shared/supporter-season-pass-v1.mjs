export const PASS_KEY='supporter_season_pass_v1';
export const PASS_DAYS=30;
export const DAY_MS=86400000;
export const kstDay=ms=>Math.floor((ms+9*3600000)/DAY_MS);
export const dayDate=day=>new Date(day*DAY_MS).toISOString().slice(0,10);
export const passConfigKey=(month=1)=>month===1?PASS_KEY:'supporter_season_pass_month2_v1';
export const passKeyPrefix=(kind,month=1)=>`supporter_pass_${kind}${month===1?'':'_month2'}_v1:`;
export const claimKey=(userId,cycle,day,month=1)=>`${passKeyPrefix('claim',month)}${Number(userId)}:${cycle}:${day}`;
export const dailyKey=(userId,date,month=1)=>`${passKeyPrefix('daily',month)}${Number(userId)}:${date}`;
export const salesDailyKey=(userId,startsAt,date,month=1)=>`${passKeyPrefix('sales_daily',month)}${Number(userId)}:${startsAt}:${date}`;
export function emptyPass(month=1){return {version:1,revision:0,title:month===1?'리버스콜 시즌패스':'리버스콜 시즌패스 2개월차',enabled:false,days:Array.from({length:PASS_DAYS},(_,i)=>({day:i+1,rewards:[]}))};}

// Records created before monthly passes represent a purchase of the first pass.
export function purchasedPasses(record){
  if(record.passTerms)return record.passTerms;
  if(!record.endsAt)return {};
  return {1:{startsAt:record.startsAt,endsAt:record.endsAt,revokedAt:record.revokedAt}};
}
export function passSubscription(record,month,now){
  const term=purchasedPasses(record)[month];
  const purchased=!!term && term.revokedAt===null && record.revokedAt===null;
  return {startsAt:term?.startsAt??0,endsAt:term?.endsAt??0,calendarStartsAt:term?.calendarStartsAt??term?.startsAt??0,purchased,active:purchased&&term.startsAt<=now&&now<term.endsAt};
}
// Calendar days follow KST. A single paid term never creates a day-31 claim
// merely because its exact 720-hour expiry falls after midnight.
export function passCycle(subscription,now,salesStartsAt=0){
  if(!subscription.endsAt)return {cycle:null,startDay:null,currentDay:0,valid:false};
  const startsAt=salesStartsAt||subscription.calendarStartsAt||subscription.startsAt,startDay=kstDay(startsAt),currentDay=kstDay(now)-startDay+1;
  return {cycle:`${startsAt}-0`,startDay,currentDay,valid:subscription.active&&currentDay>=1&&currentDay<=PASS_DAYS};
}
// The purchase grants this edition's 30 slots. Late buyers can catch up
// throughout their own paid term without starting the next edition.
export function passWindow(subscription,now,salesStartsAt=0){
  const terms=Math.max(0,Math.floor((subscription.endsAt-subscription.startsAt)/(PASS_DAYS*DAY_MS)));
  if(!subscription.endsAt||!terms)return null;
  const startsAt=salesStartsAt||subscription.calendarStartsAt||subscription.startsAt;
  const paidStartDay=kstDay(subscription.startsAt),startDay=kstDay(startsAt),paidEndDay=Math.min(startDay+PASS_DAYS-1,paidStartDay+terms*PASS_DAYS-1);
  return {startsAt,startDay,endDay:Math.min(kstDay(now),paidEndDay),paidEndDay,...(salesStartsAt?{salesStartsAt}:{})};
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
