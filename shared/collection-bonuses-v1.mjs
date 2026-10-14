// Pets contribute while equipped; each owned trophy type contributes once.
export const REWARD_BONUS_LABELS=Object.freeze({dropPercent:'드랍률 증가',accountXpPercent:'계정 경험치 보너스',coinPercent:'코인 보너스'});
export const ZERO_REWARD_BONUSES=Object.freeze({dropPercent:0,accountXpPercent:0,coinPercent:0});
export const REWARD_BONUS_HELP='펫 장착 효과와 서로 다른 트로피 보유 효과를 합산합니다. 같은 트로피의 중복 수량은 합산하지 않습니다. 드랍은 기본 확률에 비례하며 최대 100%, 경험치는 계정 레벨에 적용됩니다. 코인은 전투·원정 보상에 적용되며 메시지·쿠폰·환급·거래·시즌 순위 보상은 제외합니다. 기존 보상 한도를 유지합니다.';
export function validateRewardBonuses(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!==Object.keys(ZERO_REWARD_BONUSES).sort().join(','))throw Error('드랍률·계정 경험치·코인 보너스를 모두 입력해 주세요.');
  const out={};
  for(const key of Object.keys(ZERO_REWARD_BONUSES)){
    const value=raw[key];
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000||Math.abs(value*100-Math.round(value*100))>1e-7)throw Error('보너스는 0~1000% 범위에서 소수 둘째 자리까지 입력해 주세요.');
    out[key]=Math.round(value*100)/100;
  }
  return out;
}
export const hasRewardBonuses=bonuses=>Object.keys(ZERO_REWARD_BONUSES).some(key=>Number(bonuses?.[key])>0);
export function sumRewardBonuses(rows){
  return Object.fromEntries(Object.keys(ZERO_REWARD_BONUSES).map(key=>[key,rows.reduce((sum,row)=>sum+Math.round(Number(row?.[key]||0)*100),0)/100]));
}
export function rewardBonusDescription(bonuses){
  return Object.entries(REWARD_BONUS_LABELS).map(([key,label])=>`${label} +${Number(bonuses?.[key]||0)}%`).join(' · ');
}
export function rewardAmountWithBonus(value,percent=0,cap=Number.MAX_SAFE_INTEGER){
  const base=Math.min(cap,Math.max(0,Math.floor(Number(value)||0)));
  if(!Number.isSafeInteger(base)||!Number.isSafeInteger(cap)||cap<0||!Number.isFinite(percent)||percent<0)throw Error('Invalid reward bonus amount');
  const total=BigInt(base)*(10000n+BigInt(Math.round(percent*100)))/10000n;
  return Number(total>BigInt(cap)?BigInt(cap):total);
}
export function rewardDropWithBonus(chance,percent=0){
  const base=Number(chance),bonus=Number(percent);
  if(!Number.isFinite(base)||!Number.isFinite(bonus))return 0;
  return Math.min(100,Math.max(0,base)*(1+Math.max(0,bonus)/100));
}
