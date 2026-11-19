import {RAZAK_COMBAT,RAZAK_SKILLS} from './mercenary-razak-v1.mjs';

export const BLUE_GEAR_MECHANIC='BLUE_GEAR_STRIKE';
export const BLUE_GEAR_EVENT='MERCENARY_BLUE_GEAR_STRIKE';
// 2026-11-20: the Kargen report authorizes a Joeun-only PVE increase.
// Keep the shared PVP/other Blue Gear budgets and all entry stats unchanged.
export const BLUE_JOEUN_PVE=Object.freeze({code:'V-705',version:1,damageScale:2,cooldownTurns:2,cost:20});
// Collection and growth use SS. Entry stats, cadence and PVP damage budgets
// follow Razak; Joeun has the explicit PVE exception below.
const roster=[
 ['V-701','hiheeya','하이희야','권총','RANGED','RANGED','ricochet','황금 도탄','accelerator','극광 가속탄'],
 ['V-702','bongsoon','나무늘봉순','검·방패','VANGUARD','MELEE','crescent','청월 올려베기','aegis','이지스 브레이크'],
 ['V-703','diim','디임','바주카','RANGED','RANGED','sunburst','일점 작렬포','singularity','특이점 박격포'],
 ['V-704','sudaeng','수댕','창','VANGUARD','MELEE','tidelance','쇄도하는 해류창','maelstrom','용오름 낙창'],
 ['V-705','joeun','조은','소총 의무병','SNIPER','RANGED','refraction','프리즘 관통사격','skyline','오로라 좌표포격']
];
function attack(id,name,visualMode,reference,targetRule){
 return Object.freeze({id,name,visualMode,mechanic:BLUE_GEAR_MECHANIC,ready:true,targetRule,
  targetCount:reference.targetCount,target:reference.target,balance:reference.balance});
}
export const BLUE_GEAR=Object.freeze(Object.fromEntries(roster.map(([code,id,name,weapon,role,attackStyle,first,firstName,second,secondName],i)=>{
 const one=attack('MS-'+(701+i*2),firstName,first,RAZAK_SKILLS[0],'weakest');
 const two=attack('MS-'+(702+i*2),secondName,second,RAZAK_SKILLS[1],'back');
 // Fold the three-cast PVE budget (4.4 + 5.6 + 7) into the existing two
 // animations. The area cast shares its damage among the targets actually hit.
 const pairBudget=RAZAK_SKILLS.reduce((sum,s)=>sum+s.balance.damageRatio,0)*2/RAZAK_SKILLS.length;
 const area=Object.freeze({...two,targetRule:'all',target:'적 전체',targetCount:null,
  balance:Object.freeze({...two.balance,damageRatio:pairBudget-one.balance.damageRatio})});
 return [code,Object.freeze({code,id,name,weapon,role,position:'MIDDLE',attackStyle,rank:'SS',edition:'BLUE_GEAR_LIMITED',
  variantId:'blue-gear-'+id,basePower:RAZAK_COMBAT.basePower,scale:RAZAK_COMBAT.statScale,
  actionCredit:RAZAK_COMBAT.actionCredit,actionEnergy:RAZAK_COMBAT.actionEnergy,speedScale:RAZAK_COMBAT.speedScale,
  basicCapScale:RAZAK_COMBAT.basicCapScale,pvpSkillCapScale:RAZAK_COMBAT.pvpSkillCapScale,link:RAZAK_COMBAT.link,
  skills:Object.freeze([one,two]),pveSkills:Object.freeze([one,area].map(skill=>code===BLUE_JOEUN_PVE.code?
   Object.freeze({...skill,balance:Object.freeze({...skill.balance,damageRatio:skill.balance.damageRatio*BLUE_JOEUN_PVE.damageScale,
    cooldownTurns:BLUE_JOEUN_PVE.cooldownTurns,cost:BLUE_JOEUN_PVE.cost})}):skill))})];
})));

export const isBlueGear=actor=>actor?.isMercenary===true&&Object.hasOwn(BLUE_GEAR,actor.code||actor.cardId);
export const blueGearProfile=code=>Object.hasOwn(BLUE_GEAR,code)?BLUE_GEAR[code]:null;
export const blueGearSkills=(profile,mode)=>mode==='PVE'?profile.pveSkills:profile.skills;
// The trusted profile selects targets and base damage; its resolver must also
// retain the skill bonus already learned by the canonical level builder.
export function blueJoeunPveSkillGrowth(actor){
 if(!isBlueGear(actor)||(actor.code||actor.cardId)!==BLUE_JOEUN_PVE.code||actor.battleMode!=='PVE'||!actor.mercenaryLevelApplied||actor.mercenaryLevel?.version!==2)return 1;
 return 1+Math.max(0,Math.min(100,Number(actor.mercenaryGrowth?.total?.skillPowerPercent)||0))/100;
}
export const BLUE_GEAR_DESCRIPTION='기본 전투력 100만. 라자크와 같은 전투 등급으로 고유·장비 능력치 2.4배, 자연 행동 속도 4배, 아군 카드 행동당 추가 행동 4회, 받는 피해 60% 경감을 적용합니다. 두 공격은 에너지 25와 공통 재사용 3행동을 사용합니다. 두 번째 기술은 PvP에서 후열 한 명을, PvE에서 적 전체를 공격합니다.';
export const blueGearDescription=code=>code===BLUE_JOEUN_PVE.code?
 '기본 전투력 100만. 고유·장비 능력치 2.4배, 자연 행동 속도 4배, 아군 카드 행동당 추가 행동 4회, 받는 피해 60% 경감. PvE 기술 기본 피해는 프리즘 관통사격 880%, 오로라 좌표포격 총 1,386.67%이며 돌파의 기술 피해 보너스를 추가 적용합니다. 두 기술은 에너지 20·공통 재사용 2행동입니다. 좌표포격의 총 피해는 살아 있는 적 전체에 나눠 적용합니다. PvP는 기존 피해·에너지 25·공통 재사용 3행동을 유지합니다.':BLUE_GEAR_DESCRIPTION;
export function blueGearDeploymentSnapshot(code,mode='PVP'){
 const p=blueGearProfile(code);if(!p)return null;
 return {code:p.code,name:p.name,variantId:p.variantId,rank:p.rank,edition:p.edition,actorKind:'MERCENARY',
  position:p.position,role:p.role,attackStyle:p.attackStyle,basicTarget:'LOW_HP_ENEMY',statMode:'RANK_FIXED',level:1,
  basePower:p.basePower,skills:structuredClone(blueGearSkills(p,mode)),pendingSkillIds:[],blueGearPolicyVersion:1};
}
