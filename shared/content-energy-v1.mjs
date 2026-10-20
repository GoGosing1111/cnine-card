export const CONTENT_ENERGY_RECHARGE_MS=3*60*60*1000;
export const COOP_ENERGY_MAXIMUM=3;
export const LEGION_ENERGY_MAXIMUM=10;

// Only time below capacity accrues. Returning to full discards any overflow
// time, so spending after a long absence cannot immediately recharge again.
export function contentEnergy(record,{at=Date.now(),maximum,initial=maximum}={}){
 if(!Number.isSafeInteger(at)||at<0||!Number.isSafeInteger(maximum)||maximum<1)throw Error('Invalid content energy policy');
 const source=record??{version:1,current:initial,updatedAt:at,maximum};
 if(source.version!==1||!Number.isSafeInteger(source.current)||source.current<0||!Number.isSafeInteger(source.updatedAt)||source.updatedAt<0)throw Error('Invalid content energy balance');
 const now=Math.max(at,source.updatedAt),current=Math.min(maximum,source.current),steps=Math.floor((now-source.updatedAt)/CONTENT_ENERGY_RECHARGE_MS);
 const available=Math.min(maximum,current+steps),updatedAt=available===maximum?now:source.updatedAt+steps*CONTENT_ENERGY_RECHARGE_MS;
 return {version:1,current:available,maximum,updatedAt};
}
export function contentEnergyView(record,options){
 const energy=contentEnergy(record,options);
 return {...energy,remaining:energy.current,limit:energy.maximum,rechargeMs:CONTENT_ENERGY_RECHARGE_MS,nextRechargeAt:energy.current<energy.maximum?energy.updatedAt+CONTENT_ENERGY_RECHARGE_MS:null,serverNow:options.at??Date.now()};
}
export function contentEnergyText(view,at=Date.now()){
 if(!view)return '';
 const energy=contentEnergyView(view,{at,maximum:view.maximum});
 const seconds=energy.nextRechargeAt===null?0:Math.max(0,Math.ceil((energy.nextRechargeAt-at)/1000));
 const time=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
 return `행동력 ${energy.current} / ${energy.maximum} · ${seconds?'다음 충전 '+time:'충전 완료'} · 3시간마다 1회`;
}
