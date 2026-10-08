import {mercenaryAttackStyle} from './mercenary-attack-style-v1.mjs';
import {SS_LIMITED_COMBAT} from './mercenary-ss-limited-v1.mjs';
import {NURSE_CODES,NURSE_MECHANIC} from './mercenary-nurse-healers-v1.mjs';

// Captured when a new server loadout is created. Missing policy means a saved
// battle from before this adjustment; replay must retain its original cadence.
export const SS_REAR_PVE_POLICY=Object.freeze({version:1,regularActionsPerTurn:2,nurseBudgetPercent:75,nurseMaxTargetHpPercent:10});
export function isSsRearPveMercenary(actor){
 return actor?.rank==='SS'&&!Object.hasOwn(SS_LIMITED_COMBAT,actor.code)&&
  ['REAR','BACK','MIDDLE'].includes(actor.position)&&
  (NURSE_CODES.includes(actor.code)||mercenaryAttackStyle(actor)==='RANGED');
}
export function ssRearPveSnapshot(actor){
 return isSsRearPveMercenary(actor)?{pveRearCadence:{...SS_REAR_PVE_POLICY}}:{};
}
export function ssRearPveInterval(actor,fallback=1){
 return actor?.battleMode==='PVE'&&actor.statMode==='RANK_FIXED'&&isSsRearPveMercenary(actor)&&
  actor.pveRearCadence?.version===SS_REAR_PVE_POLICY.version?
  SS_REAR_PVE_POLICY.regularActionsPerTurn:fallback;
}
export function ssRearPveHealing(actor){
 return NURSE_CODES.includes(actor?.code)&&ssRearPveInterval(actor)===2?SS_REAR_PVE_POLICY:null;
}
export function ssRearPveSkillText(skill,actor){
 if(!isSsRearPveMercenary(actor)||!NURSE_CODES.includes(actor.code)||skill?.mechanic!==NURSE_MECHANIC)return skill;
 const b=skill.balance;
 return {...skill,pveBalance:{...b,damageRatio:b.damageRatio*SS_REAR_PVE_POLICY.nurseBudgetPercent/100},
  effect:`생존 일반 카드와 용병에게 균등 회복합니다. PVE 총 회복량은 공격력의 ${Math.round(b.damageRatio*SS_REAR_PVE_POLICY.nurseBudgetPercent)}%, 대상별 1회 최대 체력 ${SS_REAR_PVE_POLICY.nurseMaxTargetHpPercent}%입니다. PVP는 공격력의 ${Math.round(b.damageRatio*100)}%, 대상별 최대 체력 15%입니다. 회복 억제는 상한 적용 후 반영하며 초과 회복은 재분배하지 않습니다. 재사용 ${b.cooldownTurns} 용병 행동, 자원 ${b.cost}.`,
  bossRule:'PVE와 PVP에 각각 표시된 회복 예산·상한을 적용합니다. 배틀슈트와 호송 목표물은 제외하며 정화·보호막·추가 피해를 부여하지 않습니다.'};
}
