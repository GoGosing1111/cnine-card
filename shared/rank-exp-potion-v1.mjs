export const RANK_POTION_DURATION_MS=60*60*1000;
export const RANK_POTION_VERSION=1;
export const RANK_POTIONS=Object.freeze([2,3].map(multiplier=>Object.freeze({
 code:`RANK_EXP_POTION_${multiplier}X_60M`,name:`계급 경험치 ${multiplier}배 물약`,subtitle:`RANK EXP ×${multiplier} · 60 MIN`,multiplier,durationMinutes:60,
 category:'EVENT',rarity:'SPECIAL',image:`assets/items/rank-exp-potions-20261020/${multiplier}x.webp`,
 description:`사용 후 60분 동안 획득하는 계급 경험치가 ${multiplier}배가 됩니다. 같은 배율은 남은 시간에 60분을 더하고, 다른 배율은 기존 효과를 새 배율 60분으로 교체합니다. 로그아웃 중에도 시간이 흐릅니다.`
})));
export function rankPotionItem(code){return RANK_POTIONS.find(item=>item.code===code)||null;}
export function rankPotionState(raw,now=Date.now()){
 if(raw?.version!==1||![2,3].includes(raw.multiplier)||!Number.isSafeInteger(raw.revision)||raw.revision<1||!Number.isFinite(Date.parse(raw.startedAt))||!Number.isFinite(Date.parse(raw.expiresAt))||Date.parse(raw.expiresAt)<=Date.parse(raw.startedAt))return {active:false,multiplier:1,revision:0,expiresAt:null};
 return {...raw,active:Date.parse(raw.startedAt)<=now&&Date.parse(raw.expiresAt)>now,remainingSeconds:Math.max(0,Math.ceil((Date.parse(raw.expiresAt)-now)/1000)),image:RANK_POTIONS.find(item=>item.multiplier===raw.multiplier).image};
}
export function nextRankPotion(previous,multiplier,now=Date.now()){
 if(![2,3].includes(multiplier)||!Number.isSafeInteger(now))throw Error('Invalid rank potion state');
 const before=rankPotionState(previous,now),extend=before.active&&before.multiplier===multiplier;
 const end=(extend?Date.parse(before.expiresAt):now)+RANK_POTION_DURATION_MS,revision=before.revision+1;
 if(!Number.isSafeInteger(revision)||!Number.isFinite(new Date(end).getTime()))throw Error('Rank potion duration limit');
 return {version:1,revision,multiplier,startedAt:extend?before.startedAt:new Date(now).toISOString(),expiresAt:new Date(end).toISOString(),action:extend?'EXTEND':before.active?'REPLACE':'START'};
}
