// Matchup-only combat policy. Never write these bonuses into equipment, rank,
// income or persistent cityPower, and never use a disguise's displayed role.
export const CITY_GANG_COUNTER=Object.freeze({powerPercent:30,policeDefeatDamage:40});
export const CITY_GANG_COUNTER_DESCRIPTION=`경찰 상대 한정: 갱단 전투력 +${CITY_GANG_COUNTER.powerPercent}% · 경찰 승진 전투력 무효 · 승리 시 도시 체력 피해 ${CITY_GANG_COUNTER.policeDefeatDamage}`;
export function cityCombatMatchup(attacker,defender,basePower=100000){
  const states=[attacker,defender],powers=states.map(s=>s?.cityPower||basePower);
  const gangIndex=attacker?.role==='GANG'&&defender?.role==='POLICE'?0:attacker?.role==='POLICE'&&defender?.role==='GANG'?1:-1;
  let counter=null;
  if(gangIndex!==-1){
    const policeIndex=1-gangIndex,gangPowerBonus=Math.floor(powers[gangIndex]*CITY_GANG_COUNTER.powerPercent/100);
    const policeRankPowerIgnored=Math.min(powers[policeIndex]-1,Math.max(0,states[policeIndex].policePowerBonus||0));
    powers[gangIndex]+=gangPowerBonus;powers[policeIndex]-=policeRankPowerIgnored;
    counter={version:1,gangSide:gangIndex===0?'A':'B',powerPercent:CITY_GANG_COUNTER.powerPercent,gangPowerBonus,policeRankPowerIgnored};
  }
  return {attackerPower:powers[0],defenderPower:powers[1],counter};
}
export function cityCombatDamage(winner,loser,normalDamage){
  return winner?.role==='GANG'&&loser?.role==='POLICE'?CITY_GANG_COUNTER.policeDefeatDamage:normalDamage;
}
