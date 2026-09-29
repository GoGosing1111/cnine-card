export const CLAN_WAR_ITEM_REWARDS_START = '2026-09-29T00:26:44.000Z';
export const CLAN_WAR_ITEM_REWARD_MAX = 1000000000;
export const CLAN_WAR_ITEM_REWARD_DEFAULTS = Object.freeze({roundParticipationMysticEnergy:500,roundVictoryMasterStars:1500000});
export const CLAN_WAR_ITEM_REWARD_ZERO = Object.freeze({roundParticipationMysticEnergy:0,roundVictoryMasterStars:0});
export function clanWarItemRewardRule(settings){
 return Object.fromEntries(Object.keys(CLAN_WAR_ITEM_REWARD_ZERO).map(key=>[key,Number(settings?.[key]??0)]));
}
export function validateClanWarItemRewards(candidate){
 for(const key of Object.keys(CLAN_WAR_ITEM_REWARD_ZERO))if(Object.hasOwn(candidate,key)){
  const value=candidate[key];
  if(value===null||value===''||typeof value==='boolean'||!Number.isSafeInteger(Number(value))||Number(value)<0||Number(value)>CLAN_WAR_ITEM_REWARD_MAX)
   throw Error('클랜전 추가 아이템 보상은 0~1,000,000,000개의 정수로 입력하세요.');
 }
}
export function cleanClanWarItemRewards(raw,base=CLAN_WAR_ITEM_REWARD_DEFAULTS){
 const result={};for(const key of Object.keys(CLAN_WAR_ITEM_REWARD_ZERO)){
  const value=raw[key]??base[key]??CLAN_WAR_ITEM_REWARD_DEFAULTS[key];
  result[key]=Math.max(0,Math.min(CLAN_WAR_ITEM_REWARD_MAX,Math.round(Number(value)||0)));
 }return result;
}
