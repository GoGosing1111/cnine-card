// The prepared draw always attacks a living target. Missing health increases
// damage; it is never an activation requirement or an automatic execution.
export const MERCENARY_MOON_DRAW_VERSION='20260917-moon-draw-v1';
export const isMercenaryMoonDrawSkill=skill=>skill?.mechanic==='WOUNDED_MOON_DRAW';
export const MERCENARY_MOON_DRAW_SUMMARY='적의 남은 HP와 관계없이 시전한 행동에서 바로 발도합니다. 준비만 하는 행동이 없어 표적을 놓쳐 검격이 사라지지 않습니다. 발도 뒤 다음 행동이 늦어지지 않습니다.';
export function mercenaryMoonDrawSkillText(skill){
 if(!isMercenaryMoonDrawSkill(skill))return skill;
 return {...skill,
  trigger:'자원과 재사용 대기 조건을 충족하면 생존 적 중 HP 비율이 가장 낮은 적에게 그 행동에서 바로 발도합니다. 적의 HP가 낮아질 때까지 기다리지 않습니다.',
  effect:'시전한 같은 타격 행동에서 단일 검격을 가합니다. 표적이 대상 지정 불가가 되면 같은 타격 행동에서 생존 적 중 HP 비율이 가장 낮은 적을 다시 겨눕니다. 적의 HP가 가득 차 있어도 기본 스킬 피해를 주며, 타격 순간 잃은 HP 비율에 따라 상한 내 추가 피해를 줍니다. 발도 뒤 다음 행동이 늦어지지 않습니다.',
  counterplay:'회피·회복·보호막·피해 경감이 적용됩니다. 시전자 사망·기절·침묵은 검격을 취소합니다. 처치해도 재사용 대기를 초기화하지 않습니다.',
  bossRule:'보스에게도 같은 단일 검격과 추가 피해 상한을 적용합니다. 즉사·처형 확정·최대 HP 비례 피해가 없습니다.',
  procRule:'표적 재지정은 추가 행동·자원 소모·재사용 대기를 만들지 않습니다. 검격은 한 번이며 피해 배율·비용·재사용 대기는 기존 설정을 사용합니다. 추가 타격·반격·처치로 스킬을 연쇄 발동하지 않습니다.'};
}
