import {MERCENARY_POWER_STANDARD} from './equipment-mercenary-power-v1.mjs';

const rates=Object.freeze({C:1,B:2,A:3,S:5});
export const mercenaryGearPercent=rank=>Object.hasOwn(rates,rank)?rates[rank]:100;
export const mercenaryGearPowerCap=rank=>MERCENARY_POWER_STANDARD.basePowerByRank[rank]*mercenaryGearPercent(rank)/100;

export function rankedGearPower(rank,power){
  const rate=mercenaryGearPercent(rank);
  return rate===100?power:Math.min(Math.floor(power*rate/100),mercenaryGearPowerCap(rank));
}

export function rankedGearEffects(rank,effects){
  const rate=mercenaryGearPercent(rank);
  if(rate===100)return effects;
  return Object.fromEntries(Object.entries(effects).map(([key,value])=>[
    key,key==='echoEvery'||key==='uniqueEchoEvery'?value:Math.min(rate,Math.round(value*rate*100)/10000)
  ]));
}

// Keep all non-equipment stats. Limit how far transferred gear can raise each
// owner-card reference, even when the owner's equipment dwarfs the cards.
export function rankedGearLink(rank,withGear,withoutGear){
  const gain=Math.max(0,withGear-withoutGear);
  return withoutGear+Math.min(gain,withoutGear)*mercenaryGearPercent(rank)/100;
}

export function mercenaryGearRankText(rank){
  const percent=mercenaryGearPercent(rank);
  return percent===100?'':`${rank}등급은 캐릭터·용병 장비 효과의 ${percent}%를 받습니다. 용병 장비 전투력은 최대 +${mercenaryGearPowerCap(rank).toLocaleString('ko-KR')}, 각 장비 옵션은 최대 ${percent}% 또는 ${percent}%p입니다. 캐릭터 장비가 더하는 연계 공격력·체력·방벽은 장비 제외 기준의 ${percent}%까지입니다.`;
}
