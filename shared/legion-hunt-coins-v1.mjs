// Approved per-expedition ceilings, inclusive of every coin bonus. New regions
// remain governed by their existing OFF/TEST/ON and individual entry switches.
export const LEGION_COIN_REVISION=1;
export const LEGION_COIN_CAPS=Object.freeze({
  island:Object.freeze({normal:1_000_000_000,hard:2_000_000_000,nightmare:3_000_000_000,inferno:5_000_000_000}),
  regions:Object.freeze({normal:5_000_000_000,hard:7_000_000_000,nightmare:10_000_000_000,inferno:15_000_000_000,calamity:30_000_000_000})
});
const REFERENCES={
  island:{normal:653,hard:653,nightmare:689,inferno:725},
  coast:{normal:663,hard:663,nightmare:699,inferno:735,calamity:735},
  viscera:{normal:663,hard:663,nightmare:699,inferno:735,calamity:735},
  desert:{normal:661,hard:661,nightmare:697,inferno:733,calamity:733},
  theatre:{normal:661,hard:661,nightmare:697,inferno:733,calamity:733},
  sky:{normal:661,hard:661,nightmare:697,inferno:733,calamity:733}
};
export function legionCoinPolicy(regionId,difficulty){
  const referenceUnits=REFERENCES[regionId||'island']?.[difficulty];
  if(!referenceUnits)throw Error('HUNT_COIN_POLICY');
  return {revision:LEGION_COIN_REVISION,cap:LEGION_COIN_CAPS[regionId?'regions':'island'][difficulty],referenceUnits};
}
export function createLegionCoins(regionId,difficulty,{live=false,bonusPercent=0,martialLaw=false}={}){
  if(!Number.isFinite(bonusPercent)||bonusPercent<0)throw Error('HUNT_COIN_BONUS');
  // 100000 is the denominator: 0.01% bonuses and the independent ×0.9 event
  // both remain exact. Only the final cumulative entitlement is rounded down.
  const multiplier=(10000+Math.round(bonusPercent*100))*(martialLaw?9:10);
  if(!Number.isSafeInteger(multiplier))throw Error('HUNT_COIN_BONUS');
  return {...legionCoinPolicy(regionId,difficulty),live,eligible:false,multiplier,units:0,throughSeq:0,paid:0};
}
export function legionCoinTotal(coins,units=coins.units){
  if(!Number.isSafeInteger(units)||units<0)throw Error('HUNT_COIN_UNITS');
  const amount=BigInt(coins.cap)*BigInt(coins.multiplier)*BigInt(units)/(BigInt(coins.referenceUnits)*100000n);
  return Number(amount>BigInt(coins.cap)?BigInt(coins.cap):amount);
}
export function advanceLegionCoins(coins,state){
  if(!coins)return {coins:null,delta:0}; // Pre-release sessions never back-pay.
  let units=coins.units;
  for(const event of state.timeline){
    if(event.seq>coins.throughSeq&&event.seq<=state.lastAck&&event.huntKill===true)units+=event.boss?5:event.elite?3:1;
  }
  const paid=coins.live&&coins.eligible?legionCoinTotal(coins,units):0;
  if(paid<coins.paid)throw Error('HUNT_COIN_RECEIPT');
  return {coins:{...coins,units,throughSeq:Math.max(coins.throughSeq,state.lastAck),paid},delta:paid-coins.paid};
}
export function legionCoinSummary(coins,delta=0){
  return {coinDelta:delta,earnedCoins:coins?.paid||0,coinCap:coins?.cap||0,coinEligible:coins?.eligible===true,coinLive:coins?.live===true};
}
