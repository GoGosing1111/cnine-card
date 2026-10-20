// Server-only account progression. 600 ticks represent one EXP.
export const RANK_XP_MULTIPLIER=8;
export const PRE_GROWTH_MAX_RANK_TICKS=139440*600*RANK_XP_MULTIPLIER;
export const STRONG_GROWTH_START_LEVEL=185;
const totals=[0,0];
for(let level=1;level<250;level++){
  const oldCost=(4*(level-1)+64)*RANK_XP_MULTIPLIER;
  // +5 percentage points per level, beginning with 185 -> 186 at 105%.
  const cost=Math.ceil(oldCost*(20+Math.max(0,level-184))/20);
  totals[level+1]=totals[level]+cost*600;
}
export const MAX_RANK_TICKS=totals[250];
export const rankLevelTicks=level=>totals[Math.max(1,Math.min(250,Math.trunc(level)))];
export const rankNextTicks=level=>level>=250?0:rankLevelTicks(level+1)-rankLevelTicks(level);
export function levelFromTicks(value){
  const ticks=Math.max(0,Math.min(MAX_RANK_TICKS,Math.floor(Number(value)||0)));
  let low=1,high=250;
  while(low<high){
    const mid=Math.ceil((low+high)/2);
    if(totals[mid]<=ticks)low=mid;else high=mid-1;
  }
  return low;
}
export function preGrowthLevelTicks(level){
  const n=level-1;
  return (2*n*n+62*n)*600*RANK_XP_MULTIPLIER;
}
export function preGrowthLevelFromTicks(ticks){
  const xp=Math.max(0,Math.min(PRE_GROWTH_MAX_RANK_TICKS,Number(ticks)))/(600*RANK_XP_MULTIPLIER);
  return Math.min(250,1+Math.floor((-62+Math.sqrt(3844+8*xp))/4));
}
// One-time migration only: retain level and fractional progress, rounding up by
// less than one tick (1/600 EXP). Award receipts remain historical facts.
export function preserveRankProgress(ticks){
  if(!Number.isSafeInteger(ticks)||ticks<0||ticks>PRE_GROWTH_MAX_RANK_TICKS)throw Error('Invalid pre-growth rank ticks');
  const level=preGrowthLevelFromTicks(ticks);
  if(level===250)return MAX_RANK_TICKS;
  const current=BigInt(ticks-preGrowthLevelTicks(level));
  const oldRequired=BigInt(preGrowthLevelTicks(level+1)-preGrowthLevelTicks(level));
  const required=BigInt(rankNextTicks(level));
  return rankLevelTicks(level)+Number((current*required+oldRequired-1n)/oldRequired);
}
