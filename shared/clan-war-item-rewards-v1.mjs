export const CLAN_WAR_ITEM_REWARDS_START = '2026-09-29T00:26:44.000Z';
export const CLAN_WAR_COIN_REWARDS_START = '2026-10-05T19:44:27.000Z';
export const CLAN_WAR_ITEM_REWARD_MAX = 1000000000;
export const CLAN_WAR_COIN_REWARD_MAX = 1000000000000;
export const CLAN_WAR_ITEM_REWARD_DEFAULTS = Object.freeze({roundParticipationMysticEnergy:500,roundVictoryMasterStars:1500000,roundParticipationCoin:50000000000,roundVictoryCoin:100000000000});
export const CLAN_WAR_ITEM_REWARD_ZERO = Object.freeze({roundParticipationMysticEnergy:0,roundVictoryMasterStars:0,roundParticipationCoin:0,roundVictoryCoin:0});
const maximum=key=>key.endsWith('Coin')?CLAN_WAR_COIN_REWARD_MAX:CLAN_WAR_ITEM_REWARD_MAX;
export function clanWarItemRewardRule(settings){
 return Object.fromEntries(Object.keys(CLAN_WAR_ITEM_REWARD_ZERO).map(key=>[key,Number(settings?.[key]??0)]));
}
export function validateClanWarItemRewards(candidate){
 for(const key of Object.keys(CLAN_WAR_ITEM_REWARD_ZERO))if(Object.hasOwn(candidate,key)){
  const value=candidate[key],max=maximum(key);
  if(value===null||value===''||typeof value==='boolean'||!Number.isSafeInteger(Number(value))||Number(value)<0||Number(value)>max)
   throw Error(`클랜전 회차 보상 ${key}은 0~${max.toLocaleString('ko-KR')} 범위의 정수로 입력하세요.`);
 }
}
export function cleanClanWarItemRewards(raw,base=CLAN_WAR_ITEM_REWARD_DEFAULTS){
 const result={};for(const key of Object.keys(CLAN_WAR_ITEM_REWARD_ZERO)){
  const value=raw[key]??base[key]??CLAN_WAR_ITEM_REWARD_DEFAULTS[key];
  result[key]=Math.max(0,Math.min(maximum(key),Math.round(Number(value)||0)));
 }return result;
}
