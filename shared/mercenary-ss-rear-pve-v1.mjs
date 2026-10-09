import {mercenaryAttackStyle} from './mercenary-attack-style-v1.mjs';
import {SS_LIMITED_COMBAT} from './mercenary-ss-limited-v1.mjs';
import {NURSE_CODES,NURSE_MECHANIC} from './mercenary-nurse-healers-v1.mjs';

// Captured when a new server loadout is created. Missing policy means a saved
// battle from before this adjustment; replay must retain its original cadence.
// Keep version 1 immutable for rooms opened before the tier-order follow-up.
export const SS_REAR_PVE_POLICY_V1=Object.freeze({version:1,regularActionsPerTurn:2,nurseBudgetPercent:75,nurseMaxTargetHpPercent:10});
export const SS_REAR_PVE_POLICY=Object.freeze({version:2,regularActionsPerTurn:2,enemyBasicPriority:true,nurseBudgetPercent:75,nurseMaxTargetHpPercent:1});
// Version 3 opts newly captured ordinary S rear ranged fighters into the same
// exposure/cadence rule. Existing SS versions and unmarked S replays stay intact.
export const S_REAR_PVE_POLICY=Object.freeze({version:3,regularActionsPerTurn:2,enemyBasicPriority:true});
const policies=Object.freeze({1:SS_REAR_PVE_POLICY_V1,2:SS_REAR_PVE_POLICY,3:S_REAR_PVE_POLICY});
export function isSsRearPveMercenary(actor){
 return actor?.rank==='SS'&&!Object.hasOwn(SS_LIMITED_COMBAT,actor.code)&&
  ['REAR','BACK','MIDDLE'].includes(actor.position)&&
  (NURSE_CODES.includes(actor.code)||mercenaryAttackStyle(actor)==='RANGED');
}
export function isSRearPveMercenary(actor){
 return actor?.rank==='S'&&actor.edition!=='LIMITED'&&!Object.hasOwn(SS_LIMITED_COMBAT,actor.code)&&
  ['REAR','BACK','MIDDLE'].includes(actor.position)&&mercenaryAttackStyle(actor)==='RANGED';
}
export function rearPveCurrentPolicy(actor){
 return isSsRearPveMercenary(actor)?SS_REAR_PVE_POLICY:isSRearPveMercenary(actor)?S_REAR_PVE_POLICY:null;
}
export function ssRearPveSnapshot(actor){
 const policy=rearPveCurrentPolicy(actor);
 return policy?{pveRearCadence:{...policy}}:{};
}
export function ssRearPveInterval(actor,fallback=1){
 return ssRearPvePolicy(actor)?.regularActionsPerTurn??fallback;
}
export function ssRearPvePriorityTargets(attacker,targets){
 if(!attacker?.isMonster||attacker.battleMode==='PVP')return [];
 return targets.filter(actor=>actor.isMercenary&&actor.alive!==false&&actor.hp>0&&ssRearPvePolicy(actor)?.enemyBasicPriority===true);
}
function ssRearPvePolicy(actor){
 const version=actor?.pveRearCadence?.version;
 const eligible=version===3?isSRearPveMercenary(actor):isSsRearPveMercenary(actor);
 return actor?.battleMode==='PVE'&&actor.statMode==='RANK_FIXED'&&eligible?
  Number.isInteger(version)&&Object.hasOwn(policies,version)?policies[version]:null:null;
}
export function ssRearPveHealing(actor){
 return NURSE_CODES.includes(actor?.code)?ssRearPvePolicy(actor):null;
}
export function ssRearPveSkillText(skill,actor){
 if(!isSsRearPveMercenary(actor)||!NURSE_CODES.includes(actor.code)||skill?.mechanic!==NURSE_MECHANIC)return skill;
 const b=skill.balance;
 return {...skill,pveBalance:{...b,damageRatio:b.damageRatio*SS_REAR_PVE_POLICY.nurseBudgetPercent/100},
  effect:`생존 일반 카드와 용병에게 균등 회복합니다. PVE 총 회복량은 공격력의 ${Math.round(b.damageRatio*SS_REAR_PVE_POLICY.nurseBudgetPercent)}%, 대상별 1회 최대 체력 ${SS_REAR_PVE_POLICY.nurseMaxTargetHpPercent}%입니다. PVP는 공격력의 ${Math.round(b.damageRatio*100)}%, 대상별 최대 체력 15%입니다. 회복 억제는 상한 적용 후 반영하며 초과 회복은 재분배하지 않습니다. 재사용 ${b.cooldownTurns} 용병 행동, 자원 ${b.cost}.`,
  bossRule:'PVE와 PVP에 각각 표시된 회복 예산·상한을 적용합니다. 배틀슈트와 호송 목표물은 제외하며 정화·보호막·추가 피해를 부여하지 않습니다.'};
}
