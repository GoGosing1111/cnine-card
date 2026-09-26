import {validateMercenaryCms} from './mercenary-cms-model-v1.mjs';

// User-authorized operating proposal, applied once through the OWNER CMS.
// Never imported by the runtime or catalog seed: future draft edits stay drafts.
export const MERCENARY_SKILL_BALANCE_V2097 = Object.freeze([
  ['MS-001','DUEL_OATH',1.4,5,25],
  ['MS-008','OBSERVED_SHIELD_BREAK',1.7,5,30],
  ['MS-009','DANCING_TARGET_VOLLEY',2.4,7,35],
  ['MS-010','WOUNDED_MOON_DRAW',1.55,6,35],
  ['MS-011','FRONT_STAND_FAST',1.5,6,35],
  ['MS-022','THORN_RECOIL_SEAL',1.8,5,30],
  ['MS-036','ABYSS_SHIELD_ECHO',2,6,40],
  ['MS-037','PLATINUM_FOCUS_LOCK',1.8,7,35],
  ['MS-040','DISTRIBUTED_CORAL_VOLLEY',2.1,6,30],
  ['MS-021','RIFT_MARK_DETONATION',2.4,7,45],
  ['MS-003','INTERCEPT_ONE_HIT',0,5,20],
  ['MS-004','LOCKED_THREAT_SHOT',2.1,5,30],
  ['MS-006','BREAK_ARMOR_WINDOW',1.45,5,30],
  ['MS-005','SAME_TARGET_CALIBRATION',2.1,6,30],
  ['MS-013','NEXT_BASIC_ORDER',0,6,35],
  ['MS-015','INFILTRATE_DELAYED_VENOM',1.8,5,30],
  ['MS-016','FRONT_OFFENSE_VEIL',0,6,30],
  ['MS-018','CLEANSE_THEN_MEND',1.8,6,35],
  ['MS-023','MELEE_PARRY_RIPOSTE',1.25,5,25],
  ['MS-025','UNDISTURBED_FIRST_SHOT',1.8,8,35],
  ['MS-027','ADVANCE_SUPPRESSION',1.55,5,30],
  ['MS-028','FRONT_SHARED_BARRIER',1.4,6,35],
  ['MS-032','FINISHER_WITH_RELOAD',1.6,5,35],
  ['MS-038','INTERRUPT_WINDUP',1.2,5,30],
  ['MS-042','REPEAT_OFFENDER_RESTRAINT',1.35,5,25],
  ['MS-043','TWO_BEAT_FOLLOWUP',2,6,30],
].map(([id,mechanic,damageRatio,cooldownTurns,cost])=>Object.freeze({id,mechanic,balance:Object.freeze({damageRatio,cooldownTurns,cost})})));

export function applyMercenaryBalanceV2097(document,catalog) {
  const result=structuredClone(document);
  if(result.skills.filter(s=>!['MS-044','MS-045','MS-046','MS-047','MS-048','MS-049','MS-050','MS-051','MS-055'].includes(s.id)).length!==MERCENARY_SKILL_BALANCE_V2097.length)throw Error('스킬 목록 변경: 초안을 다시 검수하세요.');
  for(const proposal of MERCENARY_SKILL_BALANCE_V2097){
    const skill=result.skills.find(s=>s.id===proposal.id);
    if(!skill||skill.mechanic!==proposal.mechanic)throw Error(`${proposal.id}: 기존 스킬 기믹을 확인하세요.`);
    skill.balance={...proposal.balance};skill.review='REVIEWED';
  }
  return validateMercenaryCms(result,catalog);
}
