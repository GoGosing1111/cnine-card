// Rank base power stays fixed. Combat linkage is an explicit additional
// ability, frozen from this side's five ordinary fighters at battle start.
export const MERCENARY_COMBAT_LINK=Object.freeze({
 version:2144,regularActionsPerTurn:1,
 // v2119: 전열(FRONT) 용병은 전열 카드가 무너지는 순간 바로 표적이 되어
 // 원거리 용병보다 훨씬 일찍 쓰러진다(실측: 전투 진행률 73~76% vs 93~97%).
 // 등급별 방벽에 이 비율을 더해 전열에 서는 대가를 보전한다.
 frontRowShieldBonusPercent:60,
 pvpFrontRowShieldBonusByRank:Object.freeze({S:20,SS:40,SSS:60}),
 pvpTierGuardPerStep:5,
 ranks:Object.freeze(Object.fromEntries([
  ['C',60,60,80],['B',75,70,100],['A',90,80,120],['S',120,90,150],['SS',160,120,200],['SSS',220,150,280],
 ].map(([rank,attackPercent,shieldPercent,hpPercent])=>[rank,Object.freeze({attackPercent,shieldPercent,hpPercent})])))
});

export function mercenaryCombatLinkText(rank,position){
 const row=MERCENARY_COMBAT_LINK.ranks[rank];if(!row)return '';
 const frontText=position==='FRONT'?` 전열은 평균 최대 체력의 ${MERCENARY_COMBAT_LINK.frontRowShieldBonusPercent}% 방벽을 추가하며, PVP에서는 ${MERCENARY_COMBAT_LINK.pvpFrontRowShieldBonusByRank[rank]??MERCENARY_COMBAT_LINK.frontRowShieldBonusPercent}%를 추가합니다.`:'';
 const tier=['S','SS','SSS'].includes(rank)?` PVP에서 S·SS·SSS 상대 용병보다 등급이 높으면 전투 시작 시 등급 차이 1단계마다 연계 공격·피해 상한 100%, 연계 체력·방벽 ${MERCENARY_COMBAT_LINK.pvpTierGuardPerStep*100}%를 추가합니다. 동일 등급과 PVE에는 이 등급 차이 보정을 적용하지 않습니다.`:'';
 return `아군 일반 카드 5명의 평균 공격력 ${row.attackPercent}%를 최소 공격력, 평균 최대 체력 ${row.hpPercent}%를 최소 최대 체력으로 사용합니다. 전투 시작 시 평균 최대 체력 ${row.shieldPercent}%의 기본 전용 방벽을 얻습니다.${frontText} 아군 카드 ${MERCENARY_COMBAT_LINK.regularActionsPerTurn}회 행동마다 추가 행동합니다. PVP에서 아군 일반 카드가 모두 전투 불능이면 적 일반 카드 행동마다 반격 행동을 이어갑니다. 기본 공격과 피해·회복·보호 스킬 모두 연계 공격력을 사용합니다.${tier}`;
}

// Frozen at entry, only between released upper ranks. Never rewrites a winner,
// scales ordinary cards, changes base power, or grants extra actor actions.
export function mercenaryPvpTierGuard(actor,teams){
 const ranks=['S','SS','SSS'],rank=ranks.indexOf(actor.rank);
 if(actor.battleMode!=='PVP'||!actor.isMercenary||actor.statMode!=='RANK_FIXED'||rank<0)return 1;
 const opponents=teams.flat().filter(other=>other.side!==actor.side&&other.isMercenary&&other.statMode==='RANK_FIXED'&&other.battleMode==='PVP'&&other.alive!==false&&other.hp>0&&ranks.includes(other.rank));
 if(opponents.length!==1&&!actor.ownerId)return 1;
 if(!opponents.length)return 1;
 const gap=Math.max(0,rank-Math.max(...opponents.map(other=>ranks.indexOf(other.rank))));
 return 1+gap*MERCENARY_COMBAT_LINK.pvpTierGuardPerStep;
}

export const mercenaryEffectiveAttack=actor=>Math.max(Number(actor.attack)||0,actor.isMercenary?Number(actor.mercenaryLink?.attackFloor)||0:0);
export const mercenaryPvpTierOffense=actor=>actor.isMercenary&&actor.battleMode==='PVP'?Math.max(1,Number(actor.mercenaryLink?.tierOffense)||1):1;
// Tier durability must not increase the incoming hit budget by the same factor;
// otherwise a lower-rank capped skill erases the entire defensive correction.
export const mercenaryDamageCapHp=target=>(target.maxHp+(target.isMercenary?Number(target.mercenaryLink?.openingShield)||0:0))/(target.isMercenary?Math.max(1,Number(target.mercenaryLink?.tierGuard)||1):1);

export function applyMercenaryCombatLink(teams){
 const formations=teams.flatMap(team=>team.some(c=>c.ownerId)?[...new Set(team.map(c=>c.ownerId))].map(ownerId=>team.filter(c=>c.ownerId===ownerId)):[team]);
 for(const team of formations){
  const cards=team.filter(c=>!c.isMercenary&&!c.isMonster&&!c.isBattleSuit&&c.actorKind!=='BATTLE_SUIT');
  if(cards.length!==5)continue;
  const averageAttack=cards.reduce((sum,c)=>sum+c.attack,0)/5,averageHp=cards.reduce((sum,c)=>sum+c.maxHp,0)/5;
  if(!Number.isFinite(averageAttack)||!Number.isFinite(averageHp)||averageAttack<=0||averageHp<=0)continue;
  for(const m of team.filter(c=>c.isMercenary&&c.statMode==='RANK_FIXED')){
   const rule=MERCENARY_COMBAT_LINK.ranks[m.rank];if(!rule||m.alive===false||m.hp<=0||m.mercenaryLink?.version===MERCENARY_COMBAT_LINK.version)continue;
   const healthRatio=Math.max(0,Math.min(1,m.hp/m.maxHp)),tierGuard=mercenaryPvpTierGuard(m,teams),tierOffense=1+(tierGuard-1)/MERCENARY_COMBAT_LINK.pvpTierGuardPerStep;
   const attackFloor=Math.round(averageAttack*rule.attackPercent/100*tierOffense);
   const hpFloor=Math.round(averageHp*rule.hpPercent/100*tierGuard);
   const frontBonus=m.battleMode==='PVP'?(MERCENARY_COMBAT_LINK.pvpFrontRowShieldBonusByRank[m.rank]??MERCENARY_COMBAT_LINK.frontRowShieldBonusPercent):MERCENARY_COMBAT_LINK.frontRowShieldBonusPercent;
   const shieldPercent=rule.shieldPercent+(m.position==='FRONT'?frontBonus:0);
   const openingShield=Math.round(averageHp*shieldPercent/100*healthRatio*tierGuard);
   if(!Number.isSafeInteger(attackFloor)||!Number.isSafeInteger(hpFloor)||!Number.isSafeInteger(openingShield))throw Error('INVALID_MERCENARY_COMBAT_LINK');
   m.maxHp=Math.max(m.maxHp,hpFloor);m.hp=Math.round(m.maxHp*healthRatio);
   m.mercenaryLink={version:MERCENARY_COMBAT_LINK.version,attackFloor,hpFloor,openingShield,tierGuard,tierOffense};
   m.shield+=openingShield;m.maxShield=Math.max(m.maxShield,m.shield);
  }
 }
}
