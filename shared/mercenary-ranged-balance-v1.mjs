// Correct only sniper preparation and skills that spend multiple actor turns firing.
// Weapon labels alone never grant a blanket attack or speed multiplier.
export const MERCENARY_RANGED_BALANCE_VERSION='20260917-ranged-v3';
// PVP-only skill budget. Basic attacks, stats, action cadence and PVE retain
// their existing values. Each factor also scales the per-impact damage cap.
export const MERCENARY_SS_RANGED_PVP_SCALE=Object.freeze({
 LOCKED_THREAT_SHOT:.86,DANCING_TARGET_VOLLEY:.81,FINISHER_WITH_RELOAD:.82,
 ABYSS_SHIELD_ECHO:.82,PLATINUM_FOCUS_LOCK:.84,DISTRIBUTED_CORAL_VOLLEY:.84,TWO_BEAT_FOLLOWUP:.77,
});
export function rangedMercenaryPvpScale(actor,skill){
 return actor?.battleMode==='PVP'&&actor.rank==='SS'&&isRangedMercenarySkill(actor,skill)?MERCENARY_SS_RANGED_PVP_SCALE[skill.mechanic]??1:1;
}
export const rangedMercenaryPvpRule=skill=>MERCENARY_SS_RANGED_PVP_SCALE[skill?.mechanic]<1?`SS등급의 해당 원거리 스킬은 PVP에서 피해량과 피해 상한에 ${Math.round(MERCENARY_SS_RANGED_PVP_SCALE[skill.mechanic]*100)}%를 적용합니다. 기본 공격·PVE·비용·재사용 대기는 유지합니다.`:'';
const SNIPER=new Set(['LOCKED_THREAT_SHOT','OBSERVED_SHIELD_BREAK','ABYSS_SHIELD_ECHO','FINISHER_WITH_RELOAD']);
const SEQUENTIAL=new Set(['SAME_TARGET_CALIBRATION','DANCING_TARGET_VOLLEY','PLATINUM_FOCUS_LOCK','DISTRIBUTED_CORAL_VOLLEY','TWO_BEAT_FOLLOWUP']);
export const MERCENARY_RANGED_RULES=Object.freeze({
 LOCKED_THREAT_SHOT:'후열의 핵심 위협을 현재 행동에서 조준하고 한 발로 타격합니다.',
 OBSERVED_SHIELD_BREAK:'보호막 유무와 관계없이 파쇄 보너스를 포함한 한 발을 현재 행동에서 가합니다.',
 ABYSS_SHIELD_ECHO:'두 발을 한 행동에서 발사합니다. 초탄이 빗나가도 후속탄이 나가고 보호막 흡수량과 무관하게 추적 보너스가 적용됩니다.',
 FINISHER_WITH_RELOAD:'현재 행동에서 사격하며 적의 남은 HP와 관계없이 마무리 보너스를 적용합니다. 사격 뒤 재장전 행동 지연이 없습니다.',
 SAME_TARGET_CALIBRATION:'준비만 하는 행동 없이 바로 초탄을 발사하고 다음 두 행동에서 한 발씩 이어갑니다. 초탄이 빗나가도 계속 발사하며 마지막 탄에는 교정 보너스를 적용합니다.',
 DANCING_TARGET_VOLLEY:'현재 행동부터 한 행동에 한 발씩 세 발을 발사합니다. 각 탄은 직전 표적 외 가장 약화된 생존 적을 우선하며 적이 하나면 같은 적을 겨눕니다.',
 PLATINUM_FOCUS_LOCK:'현재 행동부터 한 행동에 한 발씩 세 발을 발사합니다. 명중한 표적의 다음 공격 스킬을 약화하며 전탄 명중을 요구하지 않습니다.',
 DISTRIBUTED_CORAL_VOLLEY:'준비만 하는 행동 없이 최대 세 적에게 한 행동에 한 발씩 화살을 나눕니다. 단일 적에는 한 발로 전체 피해를 전달합니다.',
 TWO_BEAT_FOLLOWUP:'현재 행동에서 초탄, 다음 행동에서 후속탄을 발사합니다. 초탄이 빗나가도 후속탄이 나가며 사격 뒤 재장전 행동 지연이 없습니다.',
});
export const MERCENARY_RANGED_SUMMARY='S등급 이상 저격수의 준비·재장전 지연과 다단 사격의 빈 준비 행동·후속탄 취소를 스킬별로 보정합니다. 다단 사격은 한 행동에 한 발씩 진행하며 피해 배율·비용·재사용 대기는 기존 설정을 사용합니다.';
export function rangedMercenaryProfile(actor,skill){
 if(!['S','SS','SSS'].includes(actor?.rank)||actor?.attackStyle!=='RANGED')return null;
 if(actor.role==='SNIPER'&&SNIPER.has(skill?.mechanic))return 'SNIPER';
 if(SEQUENTIAL.has(skill?.mechanic))return 'SEQUENTIAL';
 return null;
}
export const rangedMercenarySkillScope=skill=>SNIPER.has(skill?.mechanic)?'S등급 이상 · 총기 저격수':SEQUENTIAL.has(skill?.mechanic)?'S등급 이상 · 다단 사격 무기':null;
export const isRangedMercenarySkill=(actor,skill)=>rangedMercenaryProfile(actor,skill)!==null;
export function rangedMercenarySkillText(skill,actor){
 const profile=rangedMercenaryProfile(actor,skill);if(!profile)return skill;
 return {...skill,trigger:profile==='SNIPER'?'자원과 재사용 대기 조건을 충족하면 현재 행동에서 바로 발사합니다.':'자원과 재사용 대기 조건을 충족하면 바로 초탄을 발사하고 이후 행동에서 후속탄을 이어갑니다.',
  effect:MERCENARY_RANGED_RULES[skill.mechanic]+(actor.rank==='SS'&&rangedMercenaryPvpRule(skill)?' '+rangedMercenaryPvpRule(skill):''),
  counterplay:'회피·보호막·피해 경감은 적용됩니다. 사망·기절·침묵은 발동을 막거나 진행 중인 연사를 취소합니다.',
  bossRule:profile==='SNIPER'?'PVP에서 한 행동에 발사하는 탄들은 기존 피해 상한을 나누어 사용합니다. 보스에게도 기존 피해 상한·면역을 적용합니다.':'각 행동의 사격에 기존 피해 상한을 적용합니다. 보스 면역과 피해 경감은 유지합니다.',
  procRule:'후속탄은 추가 행동·자원 회복·추가 스킬 발동을 만들지 않습니다. 비용과 재사용 대기는 스킬 1회당 한 번 적용하며 남은 탄은 생존 표적을 다시 지정합니다.'};
}
