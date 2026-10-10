export const PASS_KEY='supporter_season_pass_v1';
export const PASS_DAYS=30;
export const DAY_MS=86400000;
export const kstDay=ms=>Math.floor((ms+9*3600000)/DAY_MS);
export const dayDate=day=>new Date(day*DAY_MS).toISOString().slice(0,10);
export const claimKey=(userId,cycle,day)=>`supporter_pass_claim_v1:${Number(userId)}:${cycle}:${day}`;
export const dailyKey=(userId,date)=>`supporter_pass_daily_v1:${Number(userId)}:${date}`;
export function emptyPass(){return {version:1,revision:0,title:'숲켓몬 시즌패스',enabled:false,days:Array.from({length:PASS_DAYS},(_,i)=>({day:i+1,rewards:[]}))};}
// Calendar days follow KST. A single paid term never creates a day-31 claim
// merely because its exact 720-hour expiry falls after midnight.
export function passCycle(subscription,now){
  if(!subscription.endsAt)return {cycle:null,startDay:null,currentDay:0,valid:false};
  const first=kstDay(subscription.startsAt),elapsed=kstDay(now)-first;
  const terms=Math.max(0,Math.floor((subscription.endsAt-subscription.startsAt)/(PASS_DAYS*DAY_MS)));
  const index=Math.min(Math.max(0,Math.floor(elapsed/PASS_DAYS)),Math.max(0,terms-1));
  const startDay=first+index*PASS_DAYS,currentDay=kstDay(now)-startDay+1;
  return {cycle:`${subscription.startsAt}-${index}`,startDay,currentDay,valid:subscription.active&&terms>index&&currentDay>=1&&currentDay<=PASS_DAYS};
}
export const passImage=value=>{const p=String(value||'').replaceAll('\\','/').replace(/^\/+/, '');return p.startsWith('assets/')&&!/[?#\x00-\x1f]/.test(p)&&!p.split('/').includes('..')?'/'+p:'';};
