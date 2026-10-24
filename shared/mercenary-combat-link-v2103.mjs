import {isAwakenedOmega,AWAKENED_OMEGA_COMBAT} from './mercenary-awakened-omega-v1.mjs';
import {isEunseol,EUNSEOL_COMBAT} from './mercenary-eunseol-v1.mjs';
import {isGeneralJok,GENERAL_JOK_COMBAT} from './mercenary-general-jok-v1.mjs';
import {isPrime,PRIME_COMBAT} from './mercenary-prime-requiem-v1.mjs';
import {isZero,ZERO_COMBAT} from './mercenary-zero-v1.mjs';
import {isLeonel,LEONEL_COMBAT} from './mercenary-leonel-v1.mjs';
import {IMPERIAL_ARCHER_COMBAT,isImperialArcher} from './mercenary-kangyun-v1.mjs';
import {isJokro,JOKRO_COMBAT} from './mercenary-jokro-v1.mjs';
import {isShiranui,SHIRANUI_COMBAT} from './mercenary-shiranui-v1.mjs';
import {applyMercenaryLevelStats} from './mercenary-level-v1.mjs';
import {AZANT_CODE,AZANT_COMBAT} from './mercenary-azant-v1.mjs';
import {isValter,VALTER_COMBAT} from './mercenary-valter-v1.mjs';
import {isKairon,KAIRON_COMBAT} from './mercenary-kairon-v1.mjs';
import {isJinmu,JINMU_COMBAT} from './mercenary-jinmu-v1.mjs';
import {isHelios,HELIOS_COMBAT} from './mercenary-helios-v1.mjs';
import {mercenaryCombatRank,ssLimitedProfile,ssLimitedPvpLinkScale} from './mercenary-ss-limited-v1.mjs';
import {rearPveCurrentPolicy} from './mercenary-ss-rear-pve-v1.mjs';
import {mercenaryEquipmentPower} from './mercenary-equipment-v1.mjs';
import {mercenaryGrowthDamageCapHp} from './mercenary-growth-review-v2.mjs';
// Ordinary rank base power stays fixed; limited fighters have explicit policies.
// Combat linkage is an explicit additional
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

export function mercenaryCombatLinkText(rank,position,actor=null){
 const row=isImperialArcher(actor)?IMPERIAL_ARCHER_COMBAT.link:MERCENARY_COMBAT_LINK.ranks[rank];if(!row)return '';
 const frontText=position==='FRONT'?` 전열은 평균 최대 체력의 ${MERCENARY_COMBAT_LINK.frontRowShieldBonusPercent}% 방벽을 추가하며, PVP에서는 ${MERCENARY_COMBAT_LINK.pvpFrontRowShieldBonusByRank[rank]??MERCENARY_COMBAT_LINK.frontRowShieldBonusPercent}%를 추가합니다.`:'';
 const tier=['S','SS','SSS'].includes(rank)?` PVP에서 S·SS·SSS 상대 용병보다 등급이 높으면 전투 시작 시 등급 차이 1단계마다 연계 공격·피해 상한 100%, 연계 체력·방벽 ${MERCENARY_COMBAT_LINK.pvpTierGuardPerStep*100}%를 추가합니다. 동일 등급과 PVE에는 이 등급 차이 보정을 적용하지 않습니다.`:'';
 const pvePolicy=rearPveCurrentPolicy(actor);
 const cadence=isImperialArcher(actor)?`신궁 강윤은 자연 행동 속도 ${IMPERIAL_ARCHER_COMBAT.speedScale}배, 아군 카드 행동당 ${IMPERIAL_ARCHER_COMBAT.actionCredit}회 추가 행동하며 자기 행동마다 에너지 ${IMPERIAL_ARCHER_COMBAT.actionEnergy}를 회복합니다. PVP 기본 공격 피해는 ${IMPERIAL_ARCHER_COMBAT.pvpBasicDamageScale*100}%, 기본 공격 피해 상한은 ${IMPERIAL_ARCHER_COMBAT.basicCapScale}배, 연환 파갑 피해 상한은 ${IMPERIAL_ARCHER_COMBAT.pvpSkillCapScale}배입니다. 후열 핵심 적 한 명을 집중 공격하고 PVE에서는 천궁 멸진으로 적 전체에 화살비를 내립니다.`:actor?.code===AZANT_CODE?`아잔트는 PVE·PVP 기본 속도와 아군 카드 행동당 추가 행동량이 ${Math.round((AZANT_COMBAT.actionCredit-1)*100)}% 증가합니다(카드 4회당 용병 추가 행동 5회). 베르칸과 동일하게 PVP 기본 공격 최종 피해는 ${AZANT_COMBAT.pvpBasicDamageScale*100}%이며, 후열 우선 최대 2명 결정창 포격의 피해 상한은 기본의 ${AZANT_COMBAT.pvpSkillCapScale}배입니다. 같은 타격의 95~105% 피해 편차를 적용합니다. PVE에서는 결정창 포격과 적 전체 청옥 강림을 각각의 자원·재사용 조건에 따라 번갈아 사용합니다.`:pvePolicy?`PVE에서는 아군 카드 ${pvePolicy.regularActionsPerTurn}회, PVP에서는 ${MERCENARY_COMBAT_LINK.regularActionsPerTurn}회 행동마다 추가 행동합니다. PVE에서는 적의 기본 공격 우선 대상이 됩니다.`:`아군 카드 ${MERCENARY_COMBAT_LINK.regularActionsPerTurn}회 행동마다 추가 행동합니다.`;
 return `아군 일반 카드 5명의 평균 공격력 ${row.attackPercent}%를 최소 공격력, 평균 최대 체력 ${row.hpPercent}%를 최소 최대 체력으로 사용합니다. 전투 시작 시 평균 최대 체력 ${row.shieldPercent}%의 기본 전용 방벽을 얻습니다.${frontText} ${cadence} PVP에서 아군 일반 카드가 모두 전투 불능이면 적 일반 카드 행동마다 반격 행동을 이어갑니다. 기본 공격과 피해·회복·보호 스킬 모두 연계 공격력을 사용합니다.${tier}`;
}

// Frozen at entry, only between released upper ranks. Never rewrites a winner,
// scales ordinary cards, changes base power, or grants extra actor actions.
export function mercenaryPvpTierGuard(actor,teams){
 const ranks=['S','SS','SSS'],rank=ranks.indexOf(mercenaryCombatRank(actor));
 if(actor.battleMode!=='PVP'||!actor.isMercenary||actor.statMode!=='RANK_FIXED'||rank<0)return 1;
 const opponents=teams.flat().filter(other=>other.side!==actor.side&&other.isMercenary&&other.statMode==='RANK_FIXED'&&other.battleMode==='PVP'&&other.alive!==false&&other.hp>0&&ranks.includes(mercenaryCombatRank(other)));
 if(opponents.length!==1&&!actor.ownerId)return 1;
 if(!opponents.length)return 1;
 const gap=Math.max(0,rank-Math.max(...opponents.map(other=>ranks.indexOf(mercenaryCombatRank(other)))));
 return 1+gap*MERCENARY_COMBAT_LINK.pvpTierGuardPerStep;
}

export const mercenaryEffectiveAttack=actor=>Math.max(Number(actor.attack)||0,actor.isMercenary?Number(actor.mercenaryLink?.attackFloor)||0:0);
export const mercenaryPvpTierOffense=actor=>actor.isMercenary&&actor.battleMode==='PVP'?Math.max(1,Number(actor.mercenaryLink?.tierOffense)||1):1;
// Tier durability must not increase the incoming hit budget by the same factor;
// otherwise a lower-rank capped skill erases the entire defensive correction.
export const mercenaryDamageCapHp=target=>(mercenaryGrowthDamageCapHp(target)+(target.isMercenary?Number(target.mercenaryLink?.openingShield)||0:0))/(target.isMercenary?Math.max(1,Number(target.mercenaryLink?.tierGuard)||1):1);

export function applyMercenaryCombatLink(teams,{regularCardsPerOwner=5}={}){
 const formations=teams.flatMap(team=>team.some(c=>c.ownerId)?[...new Set(team.map(c=>c.ownerId))].map(ownerId=>team.filter(c=>c.ownerId===ownerId)):[team]);
 for(const team of formations){
  const cards=team.filter(c=>!c.isMercenary&&!c.isMonster&&!c.isBattleSuit&&c.actorKind!=='BATTLE_SUIT');
  if(cards.length!==regularCardsPerOwner)continue;
  const averageAttack=cards.reduce((sum,c)=>sum+c.attack,0)/cards.length,averageHp=cards.reduce((sum,c)=>sum+c.maxHp,0)/cards.length;
  if(!Number.isFinite(averageAttack)||!Number.isFinite(averageHp)||averageAttack<=0||averageHp<=0)continue;
  for(const m of team.filter(c=>c.isMercenary&&c.statMode==='RANK_FIXED')){
   const rule=isImperialArcher(m)?IMPERIAL_ARCHER_COMBAT.link:isAwakenedOmega(m)?AWAKENED_OMEGA_COMBAT.link:isEunseol(m)?EUNSEOL_COMBAT.link:isGeneralJok(m)?GENERAL_JOK_COMBAT.link:isPrime(m)?PRIME_COMBAT.link:isZero(m)?ZERO_COMBAT.link:isLeonel(m)?LEONEL_COMBAT.link:isJokro(m)?JOKRO_COMBAT.link:isValter(m)?VALTER_COMBAT.link:isHelios(m)?HELIOS_COMBAT.link:isJinmu(m)?JINMU_COMBAT.link:isKairon(m)?KAIRON_COMBAT.link:isShiranui(m)?SHIRANUI_COMBAT.link:ssLimitedProfile(m)?.link||MERCENARY_COMBAT_LINK.ranks[m.rank];if(!rule||m.alive===false||m.hp<=0||m.mercenaryLink?.version===MERCENARY_COMBAT_LINK.version)continue;
   const healthRatio=Math.max(0,Math.min(1,m.hp/m.maxHp)),tierGuard=mercenaryPvpTierGuard(m,teams),tierOffense=1+(tierGuard-1)/MERCENARY_COMBAT_LINK.pvpTierGuardPerStep;
   const matchupScale=ssLimitedPvpLinkScale(m,teams);
   let attackFloor=Math.round(averageAttack*rule.attackPercent/100*tierOffense*matchupScale);
   let hpFloor=Math.round(averageHp*rule.hpPercent/100*tierGuard*matchupScale);
   const personalGear=mercenaryEquipmentPower(m,m.battleMode)>0&&m.equipmentStats?.version===1;
   // Gear is additional to either the innate stats or the card-derived floor.
   // Otherwise strong decks would silently erase equipment and polish gains.
   if(personalGear){
    const stats=m.equipmentStats,fx=m.battleMode==='PVE'?m.equipmentEffects||{}:{};
    if(!Number.isSafeInteger(stats.attack)||stats.attack<0||!Number.isSafeInteger(stats.hp)||stats.hp<0)throw Error('INVALID_MERCENARY_EQUIPMENT_STATS');
    attackFloor=Math.round((attackFloor+stats.attack)*(1+(fx.attackPercent||0)/100));
    hpFloor=Math.round((hpFloor+stats.hp)*(1+(fx.hpPercent||0)/100));
   }
   const frontBonus=m.battleMode==='PVP'?(MERCENARY_COMBAT_LINK.pvpFrontRowShieldBonusByRank[mercenaryCombatRank(m)]??MERCENARY_COMBAT_LINK.frontRowShieldBonusPercent):MERCENARY_COMBAT_LINK.frontRowShieldBonusPercent;
   const shieldPercent=rule.shieldPercent+(m.position==='FRONT'?frontBonus:0);
   const openingShield=Math.round(averageHp*shieldPercent/100*healthRatio*tierGuard*matchupScale);
   if(!Number.isSafeInteger(attackFloor)||!Number.isSafeInteger(hpFloor)||!Number.isSafeInteger(openingShield))throw Error('INVALID_MERCENARY_COMBAT_LINK');
   const previousMaxHp=m.maxHp;
   m.maxHp=Math.max(m.maxHp,hpFloor);m.hp=Math.round(m.maxHp*healthRatio);
   if(personalGear&&m.battleMode==='PVE'&&m.equipmentEffects?.shieldPercent){
    const extra=Math.round(m.maxHp*m.equipmentEffects.shieldPercent/100)-Math.round(previousMaxHp*m.equipmentEffects.shieldPercent/100);
    m.shield+=extra;m.maxShield+=extra;
   }
   m.mercenaryLink={version:MERCENARY_COMBAT_LINK.version,attackFloor,hpFloor,openingShield,tierGuard,tierOffense,...(ssLimitedProfile(m)?{ssLimitedMatchupScale:matchupScale}:{})};
   m.shield+=openingShield;m.maxShield=Math.max(m.maxShield,m.shield);
  }
 }
 for(const actor of teams.flat())applyMercenaryLevelStats(actor);
}
