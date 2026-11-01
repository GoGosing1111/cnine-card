import {LOOT_SHOP_DEFAULTS,validateLootShopPolicy} from './loot-shop-policy-v1.mjs';

export const RANKED_COIN_CODE='RANKED_COIN';
export const RANKED_COIN_IMAGE='assets/items/ranked-coin-20261101.webp';
export const RANKED_REWARD_VERSION='20261101-v1';
export const RANKED_TIER_IDS=Object.freeze(['challenger','grandmaster','master','diamond','platinum','gold','silver','bronze']);
export const RANKED_TIER_NAMES=Object.freeze(['챌린저','그랜드마스터','마스터','다이아','플래티넘','골드','실버','브론즈']);
export const rankedTierReward=(tierId,mode='PVP')=>{
 const index=RANKED_TIER_IDS.indexOf(tierId);
 return index<0?{coin:0,rankedCoins:0}:{coin:(mode==='DUO'?30:50)*1e12/2**index,rankedCoins:Math.floor(3000/2**index)};
};
export const RANKED_SHOP_DEFAULTS={revision:0,salesEnabled:false,products:[]};
export function validateRankedShopPolicy(raw){
 const checked=validateLootShopPolicy({...raw,rewardsEnabled:false,sources:structuredClone(LOOT_SHOP_DEFAULTS.sources)});
 const {sources,rewardsEnabled,...policy}=checked;
 // Exchange currency cannot itself be an exchange reward.
 if(policy.products.some(p=>p.items?.some(i=>i.code===RANKED_COIN_CODE)))throw Object.assign(new Error('랭크전 코인은 상점 보상으로 등록할 수 없습니다.'),{code:'JOINT_RANKED_CONFIG',status:400});
 return policy;
}
export function withRankedTierRewards(settings,mode){
 const next=structuredClone(settings);
 for(const tier of [...next.tiers,next.challengerTier||next.challenger]){
  const reward=rankedTierReward(tier.id,mode);tier.rewardCoin=reward.coin;tier.rewardRankedCoins=reward.rankedCoins;
 }
 next.rankedRewardVersion=RANKED_REWARD_VERSION;
 return next;
}
