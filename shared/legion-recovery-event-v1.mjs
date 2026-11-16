export const LEGION_RECOVERY_EVENT=Object.freeze({
  startsAt:Date.parse('2026-11-16T11:16:00+09:00'),
  endsAt:Date.parse('2026-11-24T00:00:00+09:00'),
  label:'회복시간 50% 단축 · 11월 23일 23:59까지'
});
export const LEGION_PARTY_BASE_RECHARGE_MS=6*60*60*1000;
export const legionRecoveryActive=at=>at>=LEGION_RECOVERY_EVENT.startsAt&&at<LEGION_RECOVERY_EVENT.endsAt;
export const legionRechargeMs=(base,at)=>base/(legionRecoveryActive(at)?2:1);
export const legionRecoveryNotice=at=>legionRecoveryActive(at)?LEGION_RECOVERY_EVENT.label:'';
export function legionRechargeLabel(base,at){
  const minutes=legionRechargeMs(base,at)/60000,hours=Math.floor(minutes/60),rest=minutes%60;
  return (hours?hours+'시간':'')+(rest?(hours?' ':'')+rest+'분':'');
}
// Accrue ordinary recharge work twice as fast only inside the event window.
// Integrating across both boundaries preserves progress for offline accounts.
export function legionRechargeWork(from,to){
  const end=Math.max(from,to),{startsAt,endsAt}=LEGION_RECOVERY_EVENT;
  return end-from+Math.max(0,Math.min(end,endsAt)-Math.max(from,startsAt));
}
export function legionRechargeAt(from,work){
  if(!Number.isSafeInteger(from)||from<0||!Number.isSafeInteger(work)||work<0)throw Error('Invalid legion recharge progress');
  let at=from,left=work;const {startsAt,endsAt}=LEGION_RECOVERY_EVENT;
  if(at<startsAt){const used=Math.min(left,startsAt-at);at+=used;left-=used;}
  if(left&&at<endsAt){const used=Math.min(left,(endsAt-at)*2);at+=Math.ceil(used/2);left-=used;}
  return at+left;
}
