import {contentEnergy,CONTENT_ENERGY_RECHARGE_MS as BASE} from './content-energy-v1.mjs';
const november25Event=Object.freeze({
  startsAt:Date.parse('2026-11-16T11:16:00+09:00'),
  endsAt:Date.parse('2026-11-26T00:00:00+09:00'),
  label:'회복시간 50% 단축 · 11월 25일 23:59까지'
});
export const LEGION_RECOVERY_EVENT=Object.freeze({
  startsAt:Date.parse('2026-11-27T18:20:00+09:00'),
  endsAt:Date.parse('2026-11-30T00:00:00+09:00'),
  label:'회복시간 50% 단축 · 11월 29일 23:59까지'
});
// Chronological, non-overlapping windows. Stored progress can span the gap.
const recoveryEvents=[november25Event,LEGION_RECOVERY_EVENT];
export const LEGION_PARTY_BASE_RECHARGE_MS=6*60*60*1000;
export const legionRecoveryEventAt=at=>recoveryEvents.find(event=>at>=event.startsAt&&at<event.endsAt)??null;
export const legionRecoveryActive=at=>legionRecoveryEventAt(at)!==null;
export const legionRechargeMs=(base,at)=>base/(legionRecoveryActive(at)?2:1);
export const legionRecoveryNotice=at=>legionRecoveryEventAt(at)?.label??'';
export function legionRechargeLabel(base,at){
  const minutes=legionRechargeMs(base,at)/60000,hours=Math.floor(minutes/60),rest=minutes%60;
  return (hours?hours+'시간':'')+(rest?(hours?' ':'')+rest+'분':'');
}
// Each millisecond in an event earns one extra millisecond of recharge.
export function legionRechargeWork(from,to){
  const end=Math.max(from,to);
  let work=end-from;
  for(const {startsAt,endsAt} of recoveryEvents){
    work+=Math.max(0,Math.min(end,endsAt)-Math.max(from,startsAt));
  }
  return work;
}
export function legionRechargeAt(from,work){
  if(!Number.isSafeInteger(from)||from<0||!Number.isSafeInteger(work)||work<0)throw Error('Invalid legion recharge progress');
  let at=from,left=work;
  for(const {startsAt,endsAt} of recoveryEvents){
    if(at>=endsAt)continue;
    const normal=Math.max(0,startsAt-at);
    if(left<=normal)return at+left;
    at+=normal;
    left-=normal;
    const bonusWork=(endsAt-at)*2;
    if(left<=bonusWork)return at+Math.ceil(left/2);
    left-=bonusWork;
    at=endsAt;
  }
  return at+left;
}


const DAY=24*60*60*1000,KST=9*60*60*1000;

export function legionHuntEnergyBalance(record,{at=Date.now(),...options}={}){
  // Validate the persisted state before applying the daily reset.
  const valid=contentEnergy(record,{...options,at}),maximum=valid.maximum;
  const midnight=Math.floor((at+KST)/DAY)*DAY-KST;
  if(record&&record.updatedAt<midnight)return contentEnergy(null,{at,maximum});
  const source=record??valid,now=Math.max(at,source.updatedAt);
  const steps=Math.floor(legionRechargeWork(source.updatedAt,now)/BASE);
  const current=Math.min(maximum,Math.min(maximum,source.current)+steps);
  return {version:1,current,maximum,updatedAt:current===maximum?now:legionRechargeAt(source.updatedAt,steps*BASE)};
}
export function legionHuntEnergyView(record,{at=Date.now(),...options}={}){
  const milliseconds=typeof at==='number'?Math.floor(at):at;
  const energy=legionHuntEnergyBalance(record,{...options,at:milliseconds});
  return {...energy,remaining:energy.current,limit:energy.maximum,rechargeMs:legionRechargeMs(BASE,milliseconds),
    nextRechargeAt:energy.current<energy.maximum?legionRechargeAt(energy.updatedAt,BASE):null,serverNow:milliseconds,
    recoveryEvent:legionRecoveryEventAt(milliseconds)};
}

export function legionHuntEnergyText(view,at=Date.now()){
  if(!view)return '';
  const energy=legionHuntEnergyView(view,{at,maximum:view.maximum});
  const seconds=energy.nextRechargeAt===null?0:Math.max(0,Math.ceil((energy.nextRechargeAt-energy.serverNow)/1000));
  const time=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  const notice=legionRecoveryNotice(energy.serverNow);
  return `행동력 ${energy.current} / ${energy.maximum} · ${seconds?'다음 충전 '+time:'충전 완료'} · ${legionRechargeLabel(BASE,energy.serverNow)}마다 1회 · 매일 0시 최대 회복${notice?' · '+notice:''}`;
}
