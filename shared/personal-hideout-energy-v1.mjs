import {legionRechargeWork,legionRechargeAt,legionRechargeMs,LEGION_PARTY_BASE_RECHARGE_MS as INTERVAL} from './legion-hunt-energy-v1.mjs';
export const HIDEOUT_PARTY_ENERGY_KEY=id=>'personal_hideout_party_energy_v1:'+Number(id);
export function hideoutPartyEnergy(record,{at,maximum,deadline=null,pulses=[],generation=0}={}){
 if(!Number.isSafeInteger(at)||at<0||!Number.isInteger(maximum)||maximum<1||maximum>7)throw Error('Invalid hideout party energy policy');
 let state=record?{...record}:{version:1,current:deadline===null?maximum:0,maximum,updatedAt:deadline===null?at:Math.max(0,Number(deadline)-INTERVAL),generation:Number(generation||0)};
 if(state.version!==1||!Number.isSafeInteger(state.current)||state.current<0||!Number.isSafeInteger(state.updatedAt)||state.updatedAt<0||!Number.isSafeInteger(state.generation)||state.generation<0)throw Error('Invalid hideout party energy');
 const recover=clock=>{
  const now=Math.max(clock,state.updatedAt),steps=Math.floor(legionRechargeWork(state.updatedAt,now)/INTERVAL);
  state.current=Math.min(maximum,state.current+steps);state.updatedAt=state.current===maximum?now:legionRechargeAt(state.updatedAt,steps*INTERVAL);
 };
 for(const pulse of pulses){if(pulse.generation<=state.generation||pulse.at>at)continue;recover(pulse.at);state.current=Math.min(maximum,state.current+1);if(state.current===maximum)state.updatedAt=Math.max(state.updatedAt,pulse.at);state.generation=pulse.generation;}
 recover(at);state.maximum=maximum;
 return {...state,remaining:state.current,limit:maximum,nextRechargeAt:state.current<maximum?legionRechargeAt(state.updatedAt,INTERVAL):null,rechargeMs:legionRechargeMs(INTERVAL,at),serverNow:at};
}
