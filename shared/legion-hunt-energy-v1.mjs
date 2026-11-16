import {contentEnergy,CONTENT_ENERGY_RECHARGE_MS as BASE} from './content-energy-v1.mjs';
import {legionRechargeAt,legionRechargeWork,legionRechargeMs,legionRechargeLabel,legionRecoveryNotice,LEGION_RECOVERY_EVENT} from './legion-recovery-event-v1.mjs';

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
    recoveryEvent:legionRecoveryNotice(milliseconds)?LEGION_RECOVERY_EVENT:null};
}

export function legionHuntEnergyText(view,at=Date.now()){
  if(!view)return '';
  const energy=legionHuntEnergyView(view,{at,maximum:view.maximum});
  const seconds=energy.nextRechargeAt===null?0:Math.max(0,Math.ceil((energy.nextRechargeAt-energy.serverNow)/1000));
  const time=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  const notice=legionRecoveryNotice(energy.serverNow);
  return `행동력 ${energy.current} / ${energy.maximum} · ${seconds?'다음 충전 '+time:'충전 완료'} · ${legionRechargeLabel(BASE,energy.serverNow)}마다 1회 · 매일 0시 최대 회복${notice?' · '+notice:''}`;
}
