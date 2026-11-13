export const EXTREME_BURNING_META_KEY='extreme_burning_event_settings_v1';
export const EXTREME_PULSE_KEY='extreme_burning_legion_pulses_v1';
export const EXTREME_DURATIONS=Object.freeze([10,30,...Array.from({length:24},(_,n)=>(n+1)*60)]);
export const canManageExtreme=user=>Number(user?.id)===1&&user?.nickname==='핑크빛유두'&&user?.role==='OWNER';

export function defaultExtremeBurningSettings(){
  return {mode:'EXTREME',theme:'EXTREME',enabled:false,generation:0,activatedAt:null,endsAt:null,updatedAt:null,
    durationMinutes:60,title:'리버스콜 익스트림 버닝이 발동되었습니다',battleRewardMultiplier:100,dropIncreasePercent:100,
    pveMaxEnergy:30,pvpMaxEnergy:null,rechargeMinutes:1,apocalypseMaxEnergy:10,apocalypseRechargeMinutes:5,duplicateShardMultiplier:1,packDiscountPercent:0,equipmentBoxDiscountPercent:0};
}
export function extremeSettings(raw={},now=Date.now()){
  if(!raw||typeof raw!=='object')raw={};
  const defaults=defaultExtremeBurningSettings(),multiplier=Number(raw.battleRewardMultiplier);
  return {...defaults,enabled:raw.enabled===true&&Date.parse(raw.activatedAt)<=now&&Date.parse(raw.endsAt)>now,
    generation:Number.isSafeInteger(raw.generation)?raw.generation:0,activatedAt:raw.activatedAt||null,endsAt:raw.endsAt||null,updatedAt:raw.updatedAt||null,
    durationMinutes:EXTREME_DURATIONS.includes(raw.durationMinutes)?raw.durationMinutes:defaults.durationMinutes,
    battleRewardMultiplier:Number.isFinite(multiplier)&&multiplier>=1&&multiplier<=1000?multiplier:defaults.battleRewardMultiplier};
}
