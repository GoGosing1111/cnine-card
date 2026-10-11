import {cityShift} from './jokgak-city-v1.mjs';

export const defaultCityConflict=()=>({
  riot:{enabled:true,windowMs:300000,minBattles:5},
  bounty:{enabled:true,minKills:3,selectionPercent:25,cooldownMs:600000,amounts:[3000,5000,10000]}
});
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function validateCityConflict(value=defaultCityConflict()){
  const bad=()=>{throw Object.assign(Error('폭동지역의 집계 시간·교전 횟수와 현상수배의 처치 기준·선정 확률·금액을 확인하세요.'),{status:400,code:'CITY_CONFLICT_POLICY'});};
  if(!exact(value,['riot','bounty']))bad();
  const r=value.riot,b=value.bounty;
  if(!exact(r,['enabled','windowMs','minBattles'])||typeof r.enabled!=='boolean'||!integer(r.windowMs,60000,900000)||!integer(r.minBattles,2,100))bad();
  if(!exact(b,['enabled','minKills','selectionPercent','cooldownMs','amounts'])||typeof b.enabled!=='boolean'||!integer(b.minKills,2,100)||!integer(b.selectionPercent,1,100)||!integer(b.cooldownMs,60000,3600000)||!Array.isArray(b.amounts)||b.amounts.length!==3||b.amounts.some(n=>!integer(n,1,1000000))||new Set(b.amounts).size!==3||b.amounts.some((n,i)=>i&&n<=b.amounts[i-1]))bad();
  return structuredClone(value);
}
export function validateCityConflictState(life){
  if(life.conflict==null)return;
  if(!exact(life.conflict,['TEST','ON']))throw Error('CITY_CONFLICT_STATE');
  for(const mode of ['TEST','ON']){
    const s=life.conflict[mode];if(s==null)continue;
    if(!exact(s,['epoch','kills','nextEligibleAt','bounty'])||!integer(s.epoch,0,Number.MAX_SAFE_INTEGER)||!integer(s.kills,0,1000000)||!integer(s.nextEligibleAt,0,Number.MAX_SAFE_INTEGER))throw Error('CITY_CONFLICT_STATE');
    const b=s.bounty;if(b!=null&&(!exact(b,['id','amount','issuedAt','kills'])||typeof b.id!=='string'||b.id.length>120||!integer(b.amount,1,1000000)||!integer(b.issuedAt,1,Number.MAX_SAFE_INTEGER)||!integer(b.kills,1,1000000)))throw Error('CITY_BOUNTY_STATE');
  }
}
export function cityConflictState(life,mode,now){
  if(!['TEST','ON'].includes(mode))return null;
  life.conflict??={TEST:null,ON:null};const epoch=cityShift(now).id;
  if(life.conflict[mode]?.epoch!==epoch)life.conflict[mode]={epoch,kills:0,nextEligibleAt:0,bounty:null};
  return life.conflict[mode];
}
export function applyCityConflictView(state,life,policy){
  const current=cityConflictState(life,policy.mode,life.at),rule=policy.conflict||defaultCityConflict();
  state.cityKills=current?.kills||0;
  state.bounty=rule.bounty.enabled&&current?.bounty?{...current.bounty}:null;
  return state;
}
// Independent server rolls determine selection and amount. No client field is
// accepted, and the accepted roll is saved inside the combat receipt transaction.
export function selectCityBounty(rule,kills,selectionRoll,amountRoll){
  if(!rule.enabled||kills<rule.minKills||selectionRoll>=rule.selectionPercent/100)return null;
  if(!Number.isFinite(selectionRoll)||selectionRoll<0||selectionRoll>=1||!Number.isFinite(amountRoll)||amountRoll<0||amountRoll>=1)throw Error('CITY_BOUNTY_RANDOM');
  return rule.amounts[Math.floor(amountRoll*rule.amounts.length)];
}
