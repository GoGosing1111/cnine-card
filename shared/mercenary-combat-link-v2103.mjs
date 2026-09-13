// Rank base power stays fixed. Combat linkage is an explicit additional
// ability, frozen from this side's five ordinary fighters at battle start.
export const MERCENARY_COMBAT_LINK=Object.freeze({
 version:2105,regularActionsPerTurn:1,
 ranks:Object.freeze(Object.fromEntries([
  ['C',60,60,80],['B',75,70,100],['A',90,80,120],['S',120,90,150],['SS',160,120,200],['SSS',220,150,280],
 ].map(([rank,attackPercent,shieldPercent,hpPercent])=>[rank,Object.freeze({attackPercent,shieldPercent,hpPercent})])))
});

export function mercenaryCombatLinkText(rank){
 const row=MERCENARY_COMBAT_LINK.ranks[rank];if(!row)return '';
 return `아군 일반 카드 5명의 평균 공격력 ${row.attackPercent}%를 최소 공격력, 평균 최대 체력 ${row.hpPercent}%를 최소 최대 체력으로 사용합니다. 전투 시작 시 평균 최대 체력 ${row.shieldPercent}%의 전용 방벽을 얻습니다. 아군 카드 ${MERCENARY_COMBAT_LINK.regularActionsPerTurn}회 행동마다 추가 행동합니다. 기본 공격과 피해·회복·보호 스킬 모두 연계 공격력을 사용합니다.`;
}

export const mercenaryEffectiveAttack=actor=>Math.max(Number(actor.attack)||0,actor.isMercenary?Number(actor.mercenaryLink?.attackFloor)||0:0);
export const mercenaryDamageCapHp=target=>target.maxHp+(target.isMercenary?Number(target.mercenaryLink?.openingShield)||0:0);

export function applyMercenaryCombatLink(teams){
 for(const team of teams){
  const cards=team.filter(c=>!c.isMercenary&&!c.isMonster&&!c.isBattleSuit&&c.actorKind!=='BATTLE_SUIT');
  if(cards.length!==5)continue;
  const averageAttack=cards.reduce((sum,c)=>sum+c.attack,0)/5,averageHp=cards.reduce((sum,c)=>sum+c.maxHp,0)/5;
  if(!Number.isFinite(averageAttack)||!Number.isFinite(averageHp)||averageAttack<=0||averageHp<=0)continue;
  for(const m of team.filter(c=>c.isMercenary&&c.statMode==='RANK_FIXED')){
   const rule=MERCENARY_COMBAT_LINK.ranks[m.rank];if(!rule||m.alive===false||m.hp<=0||m.mercenaryLink?.version===MERCENARY_COMBAT_LINK.version)continue;
   const healthRatio=Math.max(0,Math.min(1,m.hp/m.maxHp)),attackFloor=Math.round(averageAttack*rule.attackPercent/100);
   const hpFloor=Math.round(averageHp*rule.hpPercent/100),openingShield=Math.round(averageHp*rule.shieldPercent/100*healthRatio);
   if(!Number.isSafeInteger(attackFloor)||!Number.isSafeInteger(hpFloor)||!Number.isSafeInteger(openingShield))throw Error('INVALID_MERCENARY_COMBAT_LINK');
   m.maxHp=Math.max(m.maxHp,hpFloor);m.hp=Math.round(m.maxHp*healthRatio);
   m.mercenaryLink={version:MERCENARY_COMBAT_LINK.version,attackFloor,hpFloor,openingShield};
   m.shield+=openingShield;m.maxShield=Math.max(m.maxShield,m.shield);
  }
 }
}
